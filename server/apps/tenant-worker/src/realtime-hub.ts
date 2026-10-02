import { DurableObject } from "cloudflare:workers";
import type { Actor, CanonicalDocument, JsonObject, JsonValue } from "../../../packages/contracts/src/index.js";
import { errors } from "../../../packages/core/src/index.js";
import { D1MutationStore } from "../../../packages/document-kernel/src/index.js";
import {
  D1DocumentAccessStore,
  D1MetadataStore,
  MetadataPermissionService,
} from "../../../packages/frappe-model/src/index.js";
import type { TenantEnv } from "./env.js";

export const REALTIME_CONNECT_PATH = "/api/method/frappe.realtime.connect";
export const INTERNAL_REALTIME_PUBLISH_PATH = "/internal/realtime/publish";

const MAX_REPLAY_EVENTS = 500;
const RETAIN_EVENTS = 10_000;
const MAX_ROOMS_PER_CONNECTION = 128;

export interface RealtimePublishInput {
  event?: string;
  message?: JsonValue;
  room?: string;
  user?: string;
  doctype?: string;
  docname?: string;
  task_id?: string;
}

export interface PersistedRealtimeEvent {
  sequence: number;
  event: string;
  room: string;
  message: JsonValue;
  created_at: string;
}

export interface RealtimePublishResult extends PersistedRealtimeEvent {
  delivered: number;
}

interface ConnectionState {
  tenantId: string;
  actor: Actor;
  userType: "System User" | "Website User";
  rooms: string[];
  openDocs: string[];
  resumeFrom: number;
}

interface ClientCommand {
  type?: unknown;
  doctype?: unknown;
  docname?: unknown;
  task_id?: unknown;
}

interface RealtimeEventRow {
  sequence: number;
  event: string;
  room: string;
  message_json: string;
  created_at: string;
}


/**
 * The repo's generated Workers types predate the hibernation declarations used by the
 * deployed compatibility date. Keep the compatibility shim local instead of widening
 * global types or forcing an unrelated platform-wide dependency upgrade.
 */
interface HibernationWebSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

type HibernationContext = {
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(tag?: string): WebSocket[];
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
  };
};

type WebSocketPairShape = { 0: WebSocket; 1: WebSocket };
type WebSocketPairConstructor = new () => WebSocketPairShape;
type ResponseInitWithWebSocket = ResponseInit & { webSocket: WebSocket };


/**
 * One hibernatable Durable Object per tenant.
 *
 * D1 owns durable event order/replay. The DO owns only live connections and Frappe room
 * membership. Connection state is serialized onto each WebSocket so hibernation does not
 * erase subscriptions.
 */
export class RealtimeHub extends DurableObject<TenantEnv> {
  private publishChain: Promise<void> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: TenantEnv) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") return this.connect(request);
    if (url.pathname === "/publish" && request.method === "POST") return this.receivePublish(request);
    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      this.sendError(ws, "INVALID_MESSAGE", "Realtime commands must be JSON text");
      return;
    }
    let command: ClientCommand;
    try {
      command = JSON.parse(message) as ClientCommand;
    } catch {
      this.sendError(ws, "INVALID_JSON", "Realtime command is not valid JSON");
      return;
    }
    const state = this.stateFor(ws);
    try {
      const type = text(command.type, "type", 64);
      if (type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (type === "doctype_subscribe") {
        const doctype = text(command.doctype, "doctype", 160);
        await this.assertDoctypeRead(state, doctype);
        await this.joinRoom(ws, state, doctypeRoom(doctype));
        return;
      }
      if (type === "doctype_unsubscribe") {
        this.leaveRoom(ws, state, doctypeRoom(text(command.doctype, "doctype", 160)));
        return;
      }
      if (type === "doc_subscribe") {
        const doctype = text(command.doctype, "doctype", 160);
        const docname = text(command.docname, "docname", 320);
        await this.assertDocumentRead(state, doctype, docname);
        await this.joinRoom(ws, state, docRoom(doctype, docname));
        return;
      }
      if (type === "doc_unsubscribe") {
        const doctype = text(command.doctype, "doctype", 160);
        const docname = text(command.docname, "docname", 320);
        this.leaveRoom(ws, state, docRoom(doctype, docname));
        return;
      }
      if (type === "task_subscribe" || type === "progress_subscribe") {
        const taskId = text(command.task_id, "task_id", 320);
        await this.joinRoom(ws, state, taskRoom(taskId));
        return;
      }
      if (type === "task_unsubscribe" || type === "progress_unsubscribe") {
        this.leaveRoom(ws, state, taskRoom(text(command.task_id, "task_id", 320)));
        return;
      }
      if (type === "doc_open") {
        const doctype = text(command.doctype, "doctype", 160);
        const docname = text(command.docname, "docname", 320);
        await this.assertDocumentRead(state, doctype, docname);
        const key = documentKey(doctype, docname);
        if (!state.openDocs.includes(key)) state.openDocs.push(key);
        await this.joinRoom(ws, state, openDocRoom(doctype, docname), false);
        this.saveState(ws, state);
        this.notifyDocViewers(doctype, docname);
        return;
      }
      if (type === "doc_close") {
        const doctype = text(command.doctype, "doctype", 160);
        const docname = text(command.docname, "docname", 320);
        const key = documentKey(doctype, docname);
        state.openDocs = state.openDocs.filter((entry) => entry !== key);
        this.leaveRoom(ws, state, openDocRoom(doctype, docname), false);
        this.saveState(ws, state);
        this.notifyDocViewers(doctype, docname);
        return;
      }
      this.sendError(ws, "UNKNOWN_COMMAND", "Unsupported realtime command");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Realtime command failed";
      this.sendError(ws, "COMMAND_DENIED", detail);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const state = this.stateFor(ws);
    for (const key of state.openDocs) {
      const split = key.indexOf("\u0000");
      if (split > 0) this.notifyDocViewers(key.slice(0, split), key.slice(split + 1), ws);
    }
    // Compatibility dates >= 2026-04-07 finish the close handshake automatically.
    if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const state = this.stateFor(ws);
    for (const key of state.openDocs) {
      const split = key.indexOf("\u0000");
      if (split > 0) this.notifyDocViewers(key.slice(0, split), key.slice(split + 1), ws);
    }
  }

  private async connect(request: Request): Promise<Response> {
    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("WebSocket upgrade required", { status: 426 });
    }
    const tenantId = text(request.headers.get("x-realtime-tenant"), "tenant", 160);
    const actor = decodeActor(request.headers.get("x-realtime-actor"));
    const userTypeRaw = request.headers.get("x-realtime-user-type");
    if (userTypeRaw !== "System User" && userTypeRaw !== "Website User") {
      throw errors.authentication("Realtime user type is invalid");
    }
    const requestedResume = nonNegativeInteger(request.headers.get("x-realtime-resume-from"));
    const latest = await this.latestSequence(tenantId);
    const resumeFrom = Math.min(requestedResume, latest);

    const rooms = [userRoom(actor.user_id), "website"];
    if (userTypeRaw === "System User") rooms.push("all");
    const state: ConnectionState = {
      tenantId,
      actor,
      userType: userTypeRaw,
      rooms,
      openDocs: [],
      resumeFrom,
    };

    const Pair = (globalThis as unknown as { WebSocketPair: WebSocketPairConstructor }).WebSocketPair;
    const pair = new Pair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.hibernationContext().acceptWebSocket(server);
    this.saveState(server, state);
    server.send(JSON.stringify({
      type: "ready",
      user: actor.user_id,
      user_type: userTypeRaw,
      sequence: latest,
      resume_from: resumeFrom,
    }));
    await this.replayRooms(server, state, rooms);
    return new Response(null, { status: 101, webSocket: client } as ResponseInitWithWebSocket);
  }

  private async receivePublish(request: Request): Promise<Response> {
    const event = await request.json() as { tenant_id?: unknown; sequence?: unknown };
    const tenantId = text(event.tenant_id, "tenant_id", 160);
    const targetSequence = positiveInteger(event.sequence, "sequence");

    let delivered = 0;
    let failure: unknown;
    const run = this.publishChain.then(async () => {
      delivered = await this.flushPersistedEvents(tenantId, targetSequence);
    });
    this.publishChain = run.then(() => undefined, (error) => {
      failure = error;
    });
    await this.publishChain;
    if (failure) throw failure;
    return Response.json({ delivered });
  }

  /**
   * Broadcast from the durable D1 authority, never from request arrival order.
   *
   * Two publishers can persist sequence N and N+1 then race their DO subrequests. If
   * N+1 arrives first, this query still emits N then N+1 and advances the durable
   * watermark to N+1. The late N request becomes a no-op. Reconnect uses the same
   * sequence authority, so live delivery and replay cannot disagree about ordering.
   */
  private async flushPersistedEvents(tenantId: string, targetSequence: number): Promise<number> {
    const storage = this.hibernationContext().storage;
    let watermark = Number(await storage.get<number>("broadcast_sequence") ?? 0);
    if (!Number.isSafeInteger(watermark) || watermark < 0) watermark = 0;
    if (targetSequence <= watermark) return 0;

    let delivered = 0;
    while (watermark < targetSequence) {
      const result = await this.env.DB.prepare(
        "SELECT sequence,event,room,message_json,created_at FROM realtime_events " +
        "WHERE tenant_id=?1 AND sequence>?2 AND sequence<=?3 ORDER BY sequence ASC LIMIT 500",
      ).bind(tenantId, watermark, targetSequence).all<RealtimeEventRow>();
      const rows = result.results ?? [];
      if (!rows.length) break;

      for (const row of rows) {
        const persisted: PersistedRealtimeEvent = {
          sequence: row.sequence,
          event: row.event,
          room: row.room,
          message: JSON.parse(row.message_json) as JsonValue,
          created_at: row.created_at,
        };
        const encoded = encodeWireEvent(persisted, false);
        for (const ws of this.hibernationContext().getWebSockets()) {
          if (ws.readyState !== WebSocket.OPEN) continue;
          const state = this.stateFor(ws);
          if (state.tenantId !== tenantId || !state.rooms.includes(row.room)) continue;
          try {
            ws.send(encoded);
            delivered += 1;
          } catch {
            // A socket can close between readyState and send. Its reconnect watermark
            // recovers the event from D1; one dead peer must not block every other peer.
          }
        }
        watermark = row.sequence;
      }
      await storage.put("broadcast_sequence", watermark);
      if (rows.length < 500) break;
    }
    return delivered;
  }

  private async joinRoom(ws: WebSocket, state: ConnectionState, room: string, replay = true): Promise<void> {
    if (state.rooms.includes(room)) {
      ws.send(JSON.stringify({ type: "subscribed", room, duplicate: true }));
      return;
    }
    if (state.rooms.length >= MAX_ROOMS_PER_CONNECTION) {
      throw errors.validation("Realtime connection has too many rooms");
    }
    state.rooms.push(room);
    this.saveState(ws, state);
    ws.send(JSON.stringify({ type: "subscribed", room }));
    if (replay) await this.replayRooms(ws, state, [room]);
  }

  private leaveRoom(ws: WebSocket, state: ConnectionState, room: string, acknowledge = true): void {
    const automatic = room === userRoom(state.actor.user_id) || room === "website"
      || (state.userType === "System User" && room === "all");
    if (!automatic) state.rooms = state.rooms.filter((entry) => entry !== room);
    this.saveState(ws, state);
    if (acknowledge) ws.send(JSON.stringify({ type: "unsubscribed", room }));
  }

  private async replayRooms(ws: WebSocket, state: ConnectionState, rooms: string[]): Promise<void> {
    if (!rooms.length) return;
    const placeholders = rooms.map((_, index) => "?" + (index + 3)).join(",");
    const result = await this.env.DB.prepare(
      "SELECT sequence,event,room,message_json,created_at FROM realtime_events " +
      "WHERE tenant_id=?1 AND sequence>?2 AND room IN (" + placeholders + ") " +
      "ORDER BY sequence ASC LIMIT ?"+(rooms.length + 3),
    ).bind(state.tenantId, state.resumeFrom, ...rooms, MAX_REPLAY_EVENTS + 1)
      .all<RealtimeEventRow>();
    const rows = result.results ?? [];
    if (rows.length > MAX_REPLAY_EVENTS) {
      const latest = await this.latestSequence(state.tenantId);
      ws.send(JSON.stringify({
        type: "resync_required",
        from_sequence: state.resumeFrom,
        latest_sequence: latest,
        rooms,
      }));
      return;
    }
    for (const row of rows) {
      ws.send(encodeWireEvent({
        sequence: row.sequence,
        event: row.event,
        room: row.room,
        message: JSON.parse(row.message_json) as JsonValue,
        created_at: row.created_at,
      }, true));
    }
  }

  private async assertDoctypeRead(state: ConnectionState, doctype: string): Promise<void> {
    const permissions = this.permissions();
    await permissions.assert({
      actor: state.actor,
      tenantId: state.tenantId,
      doctype,
      action: "read",
    });
  }

  private async assertDocumentRead(state: ConnectionState, doctype: string, docname: string): Promise<void> {
    const document = await new D1MutationStore(this.env.DB).getDocument<JsonObject>(state.tenantId, doctype, docname);
    if (!document) throw errors.notFound(doctype + " " + docname + " was not found");
    if (!await this.permissions().canReadDocument(state.actor, state.tenantId, document as CanonicalDocument<JsonObject>)) {
      throw errors.permission("Document is outside the current read scope");
    }
  }

  private permissions(): MetadataPermissionService {
    return new MetadataPermissionService(
      new D1MetadataStore(this.env.DB),
      undefined,
      new D1DocumentAccessStore(this.env.DB),
    );
  }

  private notifyDocViewers(doctype: string, docname: string, exclude?: WebSocket): void {
    const key = documentKey(doctype, docname);
    const users = new Set<string>();
    const sockets: WebSocket[] = [];
    for (const ws of this.hibernationContext().getWebSockets()) {
      if (ws === exclude || ws.readyState !== WebSocket.OPEN) continue;
      const state = this.stateFor(ws);
      if (!state.openDocs.includes(key)) continue;
      users.add(state.actor.user_id);
      sockets.push(ws);
    }
    if (users.size === 1 && sockets.length === 1) return;
    const payload = JSON.stringify({
      type: "event",
      transient: true,
      event: "doc_viewers",
      room: openDocRoom(doctype, docname),
      message: { doctype, docname, users: [...users] },
    });
    for (const ws of sockets) ws.send(payload);
  }

  private async latestSequence(tenantId: string): Promise<number> {
    const row = await this.env.DB.prepare(
      "SELECT COALESCE(MAX(sequence),0) AS sequence FROM realtime_events WHERE tenant_id=?1",
    ).bind(tenantId).first<{ sequence: number }>();
    return Number(row?.sequence ?? 0);
  }

  private stateFor(ws: WebSocket): ConnectionState {
    const state = (ws as HibernationWebSocket).deserializeAttachment() as ConnectionState | null;
    if (!state?.tenantId || !state.actor?.user_id || !Array.isArray(state.rooms)) {
      throw errors.authentication("Realtime connection state is invalid");
    }
    return state;
  }

  private saveState(ws: WebSocket, state: ConnectionState): void {
    (ws as HibernationWebSocket).serializeAttachment(state);
  }

  private hibernationContext(): HibernationContext {
    return this.ctx as unknown as HibernationContext;
  }

  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "error", code, message: message.slice(0, 500) }));
    }
  }
}

export function normalizeRealtimePublish(input: RealtimePublishInput): {
  event: string;
  message: JsonValue;
  room: string;
} {
  const taskId = optionalText(input.task_id, 320);
  let event = optionalText(input.event, 160);
  const message = input.message === undefined ? {} : jsonValue(input.message);
  if (!event) event = taskId ? "task_progress" : "global";

  let room = optionalText(input.room, 320);
  const user = optionalText(input.user, 320);
  const doctype = optionalText(input.doctype, 160);
  const docname = optionalText(input.docname, 320);

  if (event === "list_update") {
    const fromMessage = message && typeof message === "object" && !Array.isArray(message)
      ? optionalText((message as JsonObject).doctype, 160)
      : undefined;
    const target = doctype ?? fromMessage;
    if (!target) throw errors.validation("list_update requires doctype");
    room = doctypeRoom(target);
  } else if (event === "docinfo_update") {
    if (!doctype || !docname) throw errors.validation("docinfo_update requires doctype and docname");
    room = docRoom(doctype, docname);
  }

  let normalizedMessage = message;
  if (!room) {
    if (taskId) {
      room = taskRoom(taskId);
      if (normalizedMessage && typeof normalizedMessage === "object" && !Array.isArray(normalizedMessage)) {
        normalizedMessage = { ...(normalizedMessage as JsonObject), task_id: taskId };
      }
    } else if (user) {
      room = userRoom(user);
    } else if (doctype && docname) {
      room = docRoom(doctype, docname);
    } else {
      room = "all";
    }
  }
  return { event, message: normalizedMessage, room };
}

export async function publishRealtime(
  env: Pick<TenantEnv, "DB" | "REALTIME">,
  tenantId: string,
  input: RealtimePublishInput,
  now = new Date().toISOString(),
): Promise<RealtimePublishResult> {
  const normalized = normalizeRealtimePublish(input);
  const createdAt = iso(now);
  const row = await env.DB.prepare(
    "INSERT INTO realtime_events(tenant_id,event,room,message_json,created_at) " +
    "VALUES(?1,?2,?3,?4,?5) RETURNING sequence",
  ).bind(
    tenantId,
    normalized.event,
    normalized.room,
    JSON.stringify(normalized.message),
    createdAt,
  ).first<{ sequence: number }>();
  const sequence = Number(row?.sequence ?? 0);
  if (!Number.isSafeInteger(sequence) || sequence <= 0) throw errors.misconfigured("Realtime sequence allocation failed");

  if (sequence % 100 === 0) {
    await env.DB.prepare(
      "DELETE FROM realtime_events WHERE tenant_id=?1 AND sequence<?2",
    ).bind(tenantId, Math.max(0, sequence - RETAIN_EVENTS)).run();
  }

  let delivered = 0;
  if (env.REALTIME) {
    const stub = env.REALTIME.getByName(tenantId);
    const response = await stub.fetch(new Request("https://realtime.internal/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenant_id: tenantId,
        sequence,
        event: normalized.event,
        room: normalized.room,
        message: normalized.message,
        created_at: createdAt,
      }),
    }));
    if (!response.ok) throw errors.misconfigured("Realtime hub rejected a persisted event");
    const result = await response.json() as { delivered?: unknown };
    delivered = Number(result.delivered ?? 0);
  }

  return {
    sequence,
    event: normalized.event,
    room: normalized.room,
    message: normalized.message,
    created_at: createdAt,
    delivered,
  };
}

export function domainRealtimePublications(event: {
  event_type: string;
  aggregate: { doctype: string; name: string };
  aggregate_version: number;
  occurred_at: string;
}): RealtimePublishInput[] {
  const message = {
    doctype: event.aggregate.doctype,
    name: event.aggregate.name,
    event_type: event.event_type,
    version: event.aggregate_version,
    occurred_at: event.occurred_at,
  };
  return [
    { event: "list_update", message, doctype: event.aggregate.doctype },
    {
      event: "docinfo_update",
      message,
      doctype: event.aggregate.doctype,
      docname: event.aggregate.name,
    },
  ];
}

export function doctypeRoom(doctype: string): string { return "doctype:" + doctype; }
export function docRoom(doctype: string, docname: string): string { return "doc:" + doctype + "/" + docname; }
export function openDocRoom(doctype: string, docname: string): string { return "open_doc:" + doctype + "/" + docname; }
export function userRoom(user: string): string { return "user:" + user; }
export function taskRoom(taskId: string): string { return "task_progress:" + taskId; }

function encodeWireEvent(event: PersistedRealtimeEvent, replay: boolean): string {
  return JSON.stringify({
    type: "event",
    sequence: event.sequence,
    event: event.event,
    room: event.room,
    message: event.message,
    created_at: event.created_at,
    replay,
  });
}

function decodeActor(value: string | null): Actor {
  if (!value) throw errors.authentication("Realtime actor is missing");
  let parsed: unknown;
  try { parsed = JSON.parse(decodeURIComponent(value)); }
  catch { throw errors.authentication("Realtime actor is invalid"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw errors.authentication("Realtime actor is invalid");
  }
  const actor = parsed as Partial<Actor>;
  if (typeof actor.user_id !== "string" || !actor.user_id.trim() || !Array.isArray(actor.roles)
      || actor.roles.some((role) => typeof role !== "string")) {
    throw errors.authentication("Realtime actor is invalid");
  }
  return {
    user_id: actor.user_id,
    roles: [...actor.roles],
    ...(typeof actor.locale === "string" ? { locale: actor.locale } : {}),
    ...(typeof actor.timezone === "string" ? { timezone: actor.timezone } : {}),
    ...(typeof actor.impersonator_user_id === "string"
      ? { impersonator_user_id: actor.impersonator_user_id }
      : {}),
  };
}

function documentKey(doctype: string, docname: string): string { return doctype + "\u0000" + docname; }

function jsonValue(value: unknown): JsonValue {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("not json");
    return JSON.parse(encoded) as JsonValue;
  } catch {
    throw errors.validation("Realtime message must be JSON serializable");
  }
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation(field + " is required and must be at most " + max + " characters");
  }
  return value.trim();
}

function optionalText(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw errors.validation("Realtime text value is invalid");
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw errors.validation(field + " must be a positive integer");
  return parsed;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = value === null || value === undefined || value === "" ? 0 : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return 0;
  return parsed;
}

function iso(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw errors.validation("Realtime created_at must be an ISO timestamp");
  }
  return value;
}
