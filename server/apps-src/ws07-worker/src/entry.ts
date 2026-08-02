import baseWorker from "./index.js";

interface Env {
  PLATFORM?: Fetcher;
}

interface ValidatorSubject {
  doctype: string;
  name: string;
  action: string;
  payload: Record<string, unknown>;
}

interface ActorIdentity {
  user_id: string;
  roles: string[];
}

const deny = (message: string) => new Response(JSON.stringify({ message }), {
  status: 422,
  headers: { "content-type": "application/json" },
});

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function actorIdentity(request: Request): ActorIdentity {
  const encoded = request.headers.get("x-cloudforge-identity") ?? "";
  if (!encoded) return { user_id: "", roles: [] };
  try {
    const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const raw = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const identity = JSON.parse(raw) as { actor?: { user_id?: unknown; roles?: unknown } };
    return {
      user_id: typeof identity.actor?.user_id === "string" ? identity.actor.user_id : "",
      roles: Array.isArray(identity.actor?.roles)
        ? identity.actor.roles.filter((role): role is string => typeof role === "string")
        : [],
    };
  } catch {
    return { user_id: "", roles: [] };
  }
}

function platformCaller(request: Request, env: Env): (path: string) => Promise<Response> {
  const callback = request.headers.get("x-cloudforge-callback");
  if (!callback) throw new Error("Nền tảng không cấp callback cho WS07 scope validator.");
  const base = callback.replace(/\/$/, "");
  const forwarded: Record<string, string> = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return async (path: string) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, { headers: forwarded });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function readRecord(call: (path: string) => Promise<Response>, doctype: string, name: string): Promise<Record<string, unknown> | null> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((await response.json()) as { data?: Record<string, unknown> }).data ?? null;
}

async function mergedDocument(request: Request, env: Env, subject: ValidatorSubject): Promise<Record<string, unknown>> {
  if (!subject.name || subject.action === "create" || subject.action === "insert") return { ...subject.payload };
  const current = await readRecord(platformCaller(request, env), subject.doctype, subject.name);
  return { ...(current ?? {}), ...subject.payload };
}

function elevated(roles: string[], managerRole: string): boolean {
  return roles.includes("Administrator") || roles.includes("System Manager") || roles.includes(managerRole);
}

async function technicianUser(call: (path: string) => Promise<Response>, technician: string): Promise<string> {
  if (!technician) return "";
  const record = await readRecord(call, "Service Technician", technician);
  return text(record?.user);
}

async function serviceOrderActorAllowed(request: Request, env: Env, actor: ActorIdentity, doc: Record<string, unknown>): Promise<string | null> {
  if (elevated(actor.roles, "Maintenance Manager") || !actor.roles.includes("Maintenance Technician")) return null;
  const assigned = await technicianUser(platformCaller(request, env), text(doc.technician));
  if (!assigned || assigned !== actor.user_id) return "Lệnh dịch vụ chỉ kỹ thuật viên được phân công mới được cập nhật.";
  return null;
}

async function warrantyActorAllowed(request: Request, env: Env, actor: ActorIdentity, doc: Record<string, unknown>): Promise<string | null> {
  if (elevated(actor.roles, "Maintenance Manager") || !actor.roles.includes("Maintenance Technician")) return null;
  const serviceOrder = text(doc.service_order);
  if (!serviceOrder) return "Yêu cầu bảo hành phải liên kết Lệnh dịch vụ trước khi kỹ thuật viên cập nhật.";
  const call = platformCaller(request, env);
  const order = await readRecord(call, "Service Order", serviceOrder);
  const assigned = await technicianUser(call, text(order?.technician));
  if (!assigned || assigned !== actor.user_id) return "Yêu cầu bảo hành chỉ kỹ thuật viên của Lệnh dịch vụ liên quan mới được cập nhật.";
  return null;
}

function projectTaskActorAllowed(actor: ActorIdentity, doc: Record<string, unknown>): string | null {
  if (elevated(actor.roles, "Project Manager") || !actor.roles.includes("Project User")) return null;
  if (text(doc.assignee) !== actor.user_id) return "Công việc dự án chỉ người được giao việc mới được cập nhật.";
  return null;
}

function supportTicketActorAllowed(actor: ActorIdentity, doc: Record<string, unknown>): string | null {
  if (elevated(actor.roles, "Support Manager") || !actor.roles.includes("Support User")) return null;
  const assignee = text(doc.assignee);
  if (assignee && assignee !== actor.user_id) return "Phiếu hỗ trợ chỉ agent được phân công mới được cập nhật.";
  if (!["", "Mới", "Hủy"].includes(text(doc.workflow_state)) && !assignee) return "Phiếu hỗ trợ phải được phân công trước khi agent cập nhật.";
  return null;
}

async function scopeViolation(request: Request, env: Env, actor: ActorIdentity, subject: ValidatorSubject, doc: Record<string, unknown>): Promise<string | null> {
  switch (subject.doctype) {
    case "Service Order": return serviceOrderActorAllowed(request, env, actor, doc);
    case "Warranty Claim": return warrantyActorAllowed(request, env, actor, doc);
    case "Project Task": return projectTaskActorAllowed(actor, doc);
    case "Support Ticket": return supportTicketActorAllowed(actor, doc);
    default: return null;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/hooks/validate" || request.method !== "POST") return baseWorker.fetch(request, env);

    const actor = actorIdentity(request);
    if (!actor.user_id) return deny("WS07 validator không nhận được danh tính người dùng đã xác thực.");

    let subject: ValidatorSubject;
    try {
      const body = await request.clone().json() as Partial<ValidatorSubject>;
      if (!body || typeof body.doctype !== "string" || typeof body.name !== "string" || typeof body.action !== "string" || !body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
        return deny("WS07 scope validator: payload không hợp lệ.");
      }
      subject = body as ValidatorSubject;
    } catch {
      return deny("WS07 scope validator: JSON không hợp lệ.");
    }

    try {
      const doc = await mergedDocument(request, env, subject);
      const violation = await scopeViolation(request, env, actor, subject, doc);
      if (violation) return deny(violation);
      return baseWorker.fetch(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "WS07 scope validator không thể kiểm tra thay đổi.";
      return new Response(JSON.stringify({ message }), { status: 503, headers: { "content-type": "application/json" } });
    }
  },
};
