/**
 * serve-proxy-cookie — TEST-ONLY infra for a REAL cookie-session E2E (P1-AUTH-01). Serves a generated
 * app's production dist and proxies /api/method + /api/resource to a real Frappe backend WITHOUT
 * injecting any Authorization header. The browser's own session cookie — set by POST
 * /api/method/login through this same proxy, exactly like a real nginx same-origin deploy — is what
 * authenticates. This is what actually proves end-user login/logout/session-expiry; serve-proxy.mjs
 * (Administrator-token injection) only proves the generated app CAN RUN, not that a real user can log
 * into it. Required env: APP_DIST, BACKEND, SITE. No TOKEN — that's the point.
 */
import { createServer } from "node:http";
import { resolve } from "node:path";
import { serveStatic } from "./static-serve.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`serve-proxy-cookie: missing required env ${name}. Refusing to start.`);
    console.error("Required: APP_DIST, BACKEND, SITE (see e2e-factory/playwright.config.ts).");
    process.exit(1);
  }
  return v;
}

const APP_DIST = resolve(requireEnv("APP_DIST"));
const BACKEND = requireEnv("BACKEND");
const SITE = requireEnv("SITE");
const PORT = Number(process.env.PORT || 4190);
const HOST = "127.0.0.1"; // loopback ONLY.

const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]);
const PROXY_PREFIXES = ["/api/method", "/api/resource"];
const PROXY_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "DELETE"]);

function collectBody(req) {
  return new Promise((res) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => res(Buffer.concat(c))); });
}

const server = createServer(async (req, res) => {
  try {
    const url = req.url || "/";
    const isProxied = PROXY_PREFIXES.some((p) => url === p || url.startsWith(p + "/") || url.startsWith(p + "?"));
    if (isProxied) {
      if (!PROXY_METHODS.has(req.method || "")) {
        res.writeHead(405, { "content-type": "text/plain" });
        res.end("method not allowed on test proxy");
        return;
      }
      // KHÔNG Authorization — chỉ forward site header + cookie/csrf THẬT của trình duyệt.
      const headers = { "X-Frappe-Site-Name": SITE, "Accept": "application/json" };
      for (const k of ["cookie", "content-type", "x-frappe-csrf-token", "x-frappe-cmd"]) {
        const v = req.headers[k];
        if (v) headers[k] = String(v);
      }
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await collectBody(req);
      const up = await fetch(BACKEND + url, { method: req.method, headers, body, redirect: "manual" });
      const buf = Buffer.from(await up.arrayBuffer());
      const outH = {};
      up.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase()) && k.toLowerCase() !== "set-cookie") outH[k] = v; });
      // fetch()/undici gộp nhiều Set-Cookie thành 1 chuỗi nếu duyệt qua forEach (sai) — getSetCookie()
      // trả mảng riêng biệt, giữ đúng nhiều cookie (sid/system_user/user_id) Frappe set khi login.
      const setCookies = typeof up.headers.getSetCookie === "function" ? up.headers.getSetCookie() : [];
      if (setCookies.length) outH["set-cookie"] = setCookies;
      res.writeHead(up.status, outH);
      res.end(buf);
      return;
    }
    if (url.startsWith("/api") || url.startsWith("/files") || url.startsWith("/private")) {
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("test proxy: path not in allowlist (/api/method, /api/resource only)");
      return;
    }
    let rel = decodeURIComponent(url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    await serveStatic(res, APP_DIST, rel);
  } catch (e) {
    console.error(`[502] ${req.method} ${req.url} → ${e.message}`);
    res.writeHead(502); res.end("proxy error: " + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`serve-proxy-cookie [TEST-ONLY, loopback, cookie-session]: ${APP_DIST} @ http://${HOST}:${PORT} → ${BACKEND} (${SITE})`);
});
