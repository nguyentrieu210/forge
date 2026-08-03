/**
 * CFMAX-06 render/export entrypoint.
 *
 * This wrapper owns exactly one capability: the binary Frappe-compatible PDF endpoint.
 * Every other request is delegated unchanged to the existing tenant worker.
 *
 * The critical invariant is that Browser Run NEVER receives a document directly. We first
 * call the existing print-view endpoint through the existing worker, which performs the
 * canonical session, DocPerm, row-level and field-redaction checks and renders the stored
 * Print Format. Only that already-authorised HTML crosses the remote-browser seam.
 */
import platformWorker from "./index.js";
import type { TenantEnv } from "./env.js";

export * from "./index.js";

const PDF_PATH = "/api/method/frappe.utils.print_format.download_pdf";
const PRINT_VIEW_PATH = "/api/method/frappe.www.printview.get_html_and_style";
const MAX_RENDER_HTML_BYTES = 4_000_000;

export default {
  async fetch(request: Request, env: TenantEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== PDF_PATH) return platformWorker.fetch(request, env, ctx);
    return renderPdf(request, env, ctx, url);
  },

  async scheduled(controller: unknown, env: TenantEnv, ctx: ExecutionContext): Promise<void> {
    await platformWorker.scheduled(controller, env, ctx);
  },
};

async function renderPdf(
  request: Request,
  env: TenantEnv,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  if (request.method.toUpperCase() !== "GET") {
    return frappeError(405, "ValidationError", "PDF download accepts GET");
  }

  /**
   * Authorise and render through the canonical print path FIRST.
   *
   * This is deliberately an in-process Worker call rather than reimplementing permission
   * checks here. Any future change to Print Format semantics, owner/share policy, field
   * masking or workflow-sensitive permissions therefore applies to preview and PDF at the
   * same time. A denied request exits here and Browser Run is never invoked.
   */
  const printUrl = new URL(url);
  printUrl.pathname = PRINT_VIEW_PATH;
  printUrl.searchParams.delete("no_letterhead");
  const authorised = await platformWorker.fetch(new Request(printUrl.toString(), {
    method: "GET",
    headers: request.headers,
  }), env, ctx);
  if (!authorised.ok) return authorised;

  let payload: unknown;
  try {
    payload = await authorised.json();
  } catch {
    return frappeError(502, "RenderError", "Print renderer returned an invalid response");
  }
  const value = unwrapMessage(payload);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return frappeError(502, "RenderError", "Print renderer returned an invalid payload");
  }
  const record = value as Record<string, unknown>;
  const body = typeof record.html === "string" ? record.html : "";
  const style = typeof record.style === "string" ? record.style : "";
  if (!body) return frappeError(422, "RenderError", "Print renderer returned empty HTML");

  const html = selfContainedHtml(body, style);
  if (new TextEncoder().encode(html).byteLength > MAX_RENDER_HTML_BYTES) {
    return frappeError(413, "ValidationError", `Rendered print HTML exceeds ${MAX_RENDER_HTML_BYTES} bytes`);
  }

  if (!env.BROWSER) {
    return frappeError(501, "MisconfiguredError", "Server PDF rendering is not configured on this deployment");
  }

  let rendered: Response;
  try {
    rendered = await env.BROWSER.quickAction("pdf", {
      html,
      pdfOptions: {
        format: "a4",
        landscape: false,
        printBackground: true,
        preferCSSPageSize: true,
      },
    });
  } catch {
    return frappeError(502, "RenderError", "Browser Run could not render this PDF");
  }
  if (!rendered.ok || !rendered.body) {
    return frappeError(502, "RenderError", `Browser Run PDF failed with status ${rendered.status}`);
  }

  const doctype = url.searchParams.get("doctype") ?? "document";
  const name = url.searchParams.get("name") ?? "print";
  const headers = new Headers(rendered.headers);
  headers.set("content-type", "application/pdf");
  headers.set("content-disposition", `attachment; filename="${safePdfFilename(doctype, name)}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-cloudforge-render-engine", "cloudflare-browser-run");

  // Preserve session sliding/bookmark evidence produced by the canonical print request.
  for (const header of ["set-cookie", "x-d1-bookmark", "x-cloudforge-trace-id"]) {
    const value = authorised.headers.get(header);
    if (value) headers.set(header, value);
  }

  return new Response(rendered.body, { status: 200, headers });
}

/**
 * Browser Run receives raw HTML, not a URL, and a CSP that makes the render self-contained.
 *
 * That matters because a System Manager may author Print Format HTML. Without the CSP an
 * innocent-looking image/link/script tag could turn the privileged renderer into an SSRF
 * client. Document values are already escaped by renderPrintFormat; this closes the static
 * template/network side of the same boundary. Data-URI assets and inline CSS remain usable.
 */
function selfContainedHtml(body: string, style: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline';"><style>${style}</style></head><body>${body}</body></html>`;
}

function unwrapMessage(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, "message") ? record.message : value;
}

function safePdfFilename(doctype: string, name: string): string {
  const value = `${doctype}-${name}.pdf`
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/[\r\n"\\/]/g, "_")
    .slice(0, 180);
  return value || "document.pdf";
}

function frappeError(status: number, excType: string, message: string): Response {
  return new Response(JSON.stringify({ exc_type: excType, message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
