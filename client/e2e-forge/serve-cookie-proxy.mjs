/**
 * TEST-ONLY same-origin server for the browser E2E: serves the built Desk and proxies
 * `/api/method` + `/api/resource` to the Forge façade, injecting NO Authorization
 * header. The browser's own `sid` cookie — set by POST /api/method/login through this
 * same origin, exactly as an nginx deploy would — is the only credential. That is what
 * makes this a test of the cookie path rather than of token auth.
 *
 * Written rather than reusing `../e2e-factory/serve-proxy-cookie.mjs` because that one
 * forwards the upstream `content-encoding` header while `fetch()` has ALREADY decoded
 * the body. Against a backend that compresses — which `wrangler dev` does — the browser
 * then tries to gunzip plain JSON and fails with ERR_CONTENT_DECODING_FAILED, which
 * surfaces as "Lỗi kết nối" and hides the real response entirely. The same bug would
 * bite that proxy against any compressing backend; it is left untouched because its own
 * suite points at a different one.
 *
 * Required env: APP_DIST, BACKEND. Optional: PORT (default 4191).
 */
import { createServer, request as httpRequest } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, extname, normalize, sep } from "node:path";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`serve-cookie-proxy: missing required env ${name}. Refusing to start.`);
    process.exit(1);
  }
  return value;
}

const APP_DIST = resolve(requireEnv("APP_DIST"));
const BACKEND = requireEnv("BACKEND").replace(/\/$/, "");
const BACKEND_URL = new URL(BACKEND);
const PORT = Number(process.env.PORT || 4191);
// Loopback only. This server forwards cookies and must never be reachable off-host.
const HOST = "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
if (BACKEND_URL.protocol !== "http:" || !LOOPBACK_HOSTS.has(BACKEND_URL.hostname)) {
  console.error(`serve-cookie-proxy: BACKEND must be loopback http, got ${BACKEND_URL.origin}`);
  process.exit(1);
}

const PROXY_PREFIXES = ["/api/method", "/api/resource"];
const PROXY_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
/**
 * Response headers that must NOT be copied through.
 *
 * `content-encoding` and `content-length` are excluded defensively. The proxy asks
 * the local backend for identity encoding and re-measures the body it writes to the
 * browser, so forwarding upstream byte metadata would be incorrect.
 */
const DROP_RESPONSE_HEADERS = new Set([
  "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "set-cookie",
]);
const FORWARD_REQUEST_HEADERS = ["cookie", "content-type", "x-frappe-csrf-token", "accept"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function collectBody(request) {
  return new Promise((done) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => done(Buffer.concat(chunks)));
  });
}

function qaClientAddress(request) {
  const userAgent = String(request.headers["user-agent"] || "");
  // The entire authenticated browser suite shares one local tenant Worker. Bind the
  // proxy's OUTBOUND socket to a distinct loopback address per device profile so
  // Miniflare/Workers observes the same separation Cloudflare gets from real client
  // addresses. Merely setting CF-Connecting-IP is not sufficient: the local runtime
  // owns that header and can replace it with the socket peer address.
  return /Android|Mobile/i.test(userAgent) ? "127.0.0.3" : "127.0.0.2";
}

function proxyToBackend(path, method, headers, body, localAddress) {
  return new Promise((resolveRequest, rejectRequest) => {
    const target = new URL(path, `${BACKEND}/`);
    const upstream = httpRequest({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      path: `${target.pathname}${target.search}`,
      method,
      headers,
      localAddress,
    }, (upstreamResponse) => {
      const chunks = [];
      upstreamResponse.on("data", (chunk) => chunks.push(chunk));
      upstreamResponse.on("end", () => resolveRequest({
        status: upstreamResponse.statusCode ?? 502,
        headers: upstreamResponse.headers,
        body: Buffer.concat(chunks),
      }));
    });
    upstream.on("error", rejectRequest);
    if (body && body.length) upstream.write(body);
    upstream.end();
  });
}

async function serveStatic(response, pathname) {
  // Normalised and prefix-checked so a crafted path cannot escape the dist directory.
  const target = normalize(join(APP_DIST, pathname));
  if (!target.startsWith(APP_DIST + sep) && target !== APP_DIST) {
    response.writeHead(403, { "content-type": "text/plain" });
    response.end("outside dist");
    return;
  }
  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("not a file");
    const body = await readFile(target);
    response.writeHead(200, { "content-type": MIME[extname(target)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    // SPA fallback: any unknown path is a client route, so index.html must answer it or
    // a deep link (/app/Field Visit) would 404 before the router ever loads.
    const index = await readFile(join(APP_DIST, "index.html")).catch(() => null);
    if (!index) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[".html"] });
    response.end(index);
  }
}

const server = createServer(async (request, response) => {
  const url = request.url || "/";
  try {
    const proxied = PROXY_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`));
    if (proxied) {
      if (!PROXY_METHODS.has(request.method || "")) {
        response.writeHead(405, { "content-type": "text/plain" });
        response.end("method not allowed");
        return;
      }
      const headers = {};
      for (const name of FORWARD_REQUEST_HEADERS) {
        const value = request.headers[name];
        if (value) headers[name] = String(value);
      }
      // Identity encoding keeps byte ownership simple and makes the proxy agnostic to
      // Wrangler's compression choices.
      headers["accept-encoding"] = "identity";

      const body = request.method === "GET" || request.method === "HEAD" ? undefined : await collectBody(request);
      const upstream = await proxyToBackend(url, request.method, headers, body, qaClientAddress(request));

      const out = {};
      for (const [name, value] of Object.entries(upstream.headers)) {
        if (value === undefined || DROP_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
        out[name] = value;
      }
      const cookies = upstream.headers["set-cookie"];
      if (cookies) {
        const values = Array.isArray(cookies) ? cookies : [cookies];
        // `Secure` is stripped only for this loopback test origin. The façade still
        // emits the production cookie; this proxy merely makes it usable over local HTTP.
        out["set-cookie"] = values.map((cookie) => cookie.replace(/;\s*Secure/gi, ""));
      }
      response.writeHead(upstream.status, out);
      response.end(upstream.body);
      return;
    }

    if (url.startsWith("/api")) {
      // Anything else under /api is outside the allowlist: a test proxy must not be a
      // general tunnel to the backend.
      response.writeHead(403, { "content-type": "text/plain" });
      response.end("path not in allowlist (/api/method, /api/resource only)");
      return;
    }

    const pathname = decodeURIComponent(url.split("?")[0]);
    await serveStatic(response, pathname === "/" ? "/index.html" : pathname);
  } catch (error) {
    console.error(`[502] ${request.method} ${url} — ${error.message}`);
    response.writeHead(502, { "content-type": "text/plain" });
    response.end(`proxy error: ${error.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`serve-cookie-proxy [TEST-ONLY, loopback]: ${APP_DIST} @ http://${HOST}:${PORT} → ${BACKEND}`);
});
