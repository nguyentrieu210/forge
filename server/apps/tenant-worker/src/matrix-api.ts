import type { JsonObject, JsonValue } from "../../../packages/contracts/src/index.js";
import { errors, jsonResponse, readJson } from "../../../packages/core/src/index.js";

const MATRIX_READ_PATH = "/api/method/metaforge.matrix.read";
const MATRIX_ACTION_PATH = "/api/method/metaforge.matrix.action";
const MAX_BODY_BYTES = 256_000;
const NAME_PATTERN = /^[a-z][a-z0-9_.-]{2,159}$/;

export type MatrixNamedHandler = (input: JsonObject) => Promise<JsonValue>;

/**
 * Closed registry for metadata-owned Matrix sources/actions.
 *
 * Metadata may NAME a registered capability; it can never turn an arbitrary dotted
 * string into code execution. Concrete domain packages register handlers only at the
 * trusted tenant-worker composition root.
 */
export class MatrixSourceActionRegistry {
  private readonly sources = new Map<string, MatrixNamedHandler>();
  private readonly actions = new Map<string, MatrixNamedHandler>();

  registerSource(name: string, handler: MatrixNamedHandler): this {
    return this.register(this.sources, name, handler, "source");
  }

  registerAction(name: string, handler: MatrixNamedHandler): this {
    return this.register(this.actions, name, handler, "action");
  }

  async read(name: string, input: JsonObject): Promise<JsonValue> {
    return this.invoke(this.sources, name, input, "source");
  }

  async action(name: string, input: JsonObject): Promise<JsonValue> {
    return this.invoke(this.actions, name, input, "action");
  }

  private register(
    target: Map<string, MatrixNamedHandler>,
    rawName: string,
    handler: MatrixNamedHandler,
    kind: "source" | "action",
  ): this {
    const name = matrixName(rawName, kind);
    if (target.has(name)) throw errors.misconfigured(`Matrix ${kind} is registered more than once: ${name}`);
    target.set(name, handler);
    return this;
  }

  private async invoke(
    target: Map<string, MatrixNamedHandler>,
    rawName: string,
    input: JsonObject,
    kind: "source" | "action",
  ): Promise<JsonValue> {
    const name = matrixName(rawName, kind);
    const handler = target.get(name);
    if (!handler) throw errors.notFound(`Matrix ${kind} is not registered: ${name}`);
    return await handler(input);
  }
}

export interface MatrixApiContext {
  traceId: string;
  registry: MatrixSourceActionRegistry;
}

export function isMatrixApiPath(pathname: string): boolean {
  return pathname === MATRIX_READ_PATH || pathname === MATRIX_ACTION_PATH;
}

export function isMatrixFrappePath(pathname: string): boolean {
  return isMatrixApiPath(pathname);
}

export async function routeMatrixApi(
  request: Request,
  url: URL,
  context: MatrixApiContext,
): Promise<Response | null> {
  if (!isMatrixApiPath(url.pathname)) return null;
  const read = url.pathname === MATRIX_READ_PATH;
  const method = request.method.toUpperCase();
  if ((read && method !== "GET") || (!read && method !== "POST")) {
    const allow = read ? "GET" : "POST";
    return jsonResponse(
      { error: { code: "METHOD_NOT_ALLOWED", message: `Matrix ${read ? "read" : "action"} requires ${allow}` } },
      405,
      { allow, "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
    );
  }

  const args = read
    ? Object.fromEntries(url.searchParams.entries()) as JsonObject
    : unwrapArgs(await readJson<JsonObject>(request, MAX_BODY_BYTES));
  const key = requiredText(read ? args.source : args.action, read ? "source" : "action");
  const input = objectInput(args.input);
  rejectTenantSelector(input);
  const message = read
    ? await context.registry.read(key, input)
    : await context.registry.action(key, input);
  return jsonResponse(
    { message },
    200,
    { "cache-control": "private, no-store", "x-cloudforge-trace-id": context.traceId },
  );
}

function unwrapArgs(body: JsonObject): JsonObject {
  if (body.args === undefined) return body;
  const parsed = typeof body.args === "string" ? parseJson(body.args, "args") : body.args;
  if (!isObject(parsed)) throw errors.validation("Matrix args must be an object");
  return parsed;
}

function objectInput(value: JsonValue | undefined): JsonObject {
  if (value === undefined || value === null || value === "") return {};
  const parsed = typeof value === "string" ? parseJson(value, "input") : value;
  if (!isObject(parsed)) throw errors.validation("Matrix input must be an object");
  return parsed;
}

function rejectTenantSelector(input: JsonObject): void {
  if (Object.hasOwn(input, "tenant_id") || Object.hasOwn(input, "tenantId")) {
    throw errors.validation("Matrix tenant scope is controlled by the authenticated server context");
  }
}

function matrixName(value: unknown, kind: string): string {
  const name = requiredText(value, kind);
  if (!NAME_PATTERN.test(name)) throw errors.validation(`Matrix ${kind} name is invalid`);
  return name;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || normalized.length > 160) throw errors.validation(`${field} is required and must be at most 160 characters`);
  return normalized;
}

function parseJson(value: string, field: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw errors.validation(`${field} must contain valid JSON`); }
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
