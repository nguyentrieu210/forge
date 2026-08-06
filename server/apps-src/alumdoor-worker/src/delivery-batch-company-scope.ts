import baseWorker from "./index.js";

type WorkerEnv = Parameters<typeof baseWorker.fetch>[1];
type WorkerContext = Parameters<typeof baseWorker.fetch>[2];
type Json = Record<string, unknown>;

const SCOPED_RESOURCES = new Set(["Sales Order", "Delivery Note"]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resourceDoctype(url: URL): string {
  const decoded = decodeURIComponent(url.pathname);
  const marker = "/resource/";
  const index = decoded.indexOf(marker);
  if (index < 0) return "";
  const tail = decoded.slice(index + marker.length);
  return tail.includes("/") ? "" : tail;
}

function scopeResource(url: URL, company: string): void {
  const doctype = resourceDoctype(url);
  if (!SCOPED_RESOURCES.has(doctype)) return;
  const raw = url.searchParams.get("filters");
  const filters = raw ? JSON.parse(raw) as unknown : [];
  if (!Array.isArray(filters)) throw new Error(`${doctype}: filters không phải mảng.`);
  const declared = filters.filter((entry): entry is unknown[] => Array.isArray(entry) && entry[0] === "company");
  for (const entry of declared) {
    if (entry[1] !== "=" || text(entry[2]) !== company) {
      throw new Error(`${doctype}: truy vấn cố dùng Công ty khác Business Context.`);
    }
  }
  if (!declared.length) filters.push(["company", "=", company]);
  url.searchParams.set("filters", JSON.stringify(filters));
}

function scopedPlatform(upstream: Fetcher | undefined, company: string): Fetcher {
  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      scopeResource(url, company);
      const scoped = new Request(url.toString(), request);
      return upstream ? upstream.fetch(scoped) : globalThis.fetch(scoped);
    },
  } as Fetcher;
}

/**
 * The delivery batch is a cross-document read/write workflow. Company is an application
 * context boundary, not an optional display filter. The legacy worker method already owns
 * idempotency and Delivery Note creation; this wrapper only constrains every Sales Order /
 * Delivery Note callback to the Business Context company before delegating to that method.
 */
export async function handleCompanyScopedDeliveryBatch(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
): Promise<Response> {
  const body = await request.clone().json().catch(() => ({})) as { args?: Json };
  const company = text(body.args?.company);
  if (!company) return json({ message: "Cần chọn Công ty trên thanh ngữ cảnh trước khi xử lý giao hàng." }, 422);
  return baseWorker.fetch(request, { ...env, PLATFORM: scopedPlatform(env.PLATFORM, company) }, ctx);
}
