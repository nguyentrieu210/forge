/**
 * serve-proxy — TEST-ONLY infra. Serves the PRODUCTION dist of a generated app (static) and proxies
 * only /api/method + /api/resource to a real Frappe backend (adds Authorization token + site header),
 * standing in for a same-origin nginx deploy. Required env: APP_DIST, BACKEND, TOKEN, SITE.
 *
 * SECURITY (P0-SEC-02): this process holds a live Frappe credential and forwards it to whoever can
 * reach the listening port. It MUST stay loopback-only and MUST NOT be pointed at a shared/reachable
 * host. Never run this outside a disposable test site.
 */
import { createServer } from "node:http";
import { resolve } from "node:path";
import { serveStatic } from "./static-serve.mjs";

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`serve-proxy: missing required env ${name}. Refusing to start.`);
    console.error("Required: APP_DIST, BACKEND, TOKEN, SITE (see e2e-factory/playwright.config.ts).");
    process.exit(1);
  }
  return v;
}

const APP_DIST = resolve(requireEnv("APP_DIST"));
const BACKEND = requireEnv("BACKEND");
const TOKEN = requireEnv("TOKEN");
const SITE = requireEnv("SITE");
const PORT = Number(process.env.PORT || 4180);
const HOST = "127.0.0.1"; // loopback ONLY — never bind 0.0.0.0 for a token-holding test proxy.

const HOP = new Set(["host", "connection", "content-length", "transfer-encoding", "accept-encoding"]);
const PROXY_PREFIXES = ["/api/method", "/api/resource"]; // minimum needed by e2e-factory/tests/*.spec.ts
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
      const headers = { "Authorization": `token ${TOKEN}`, "X-Frappe-Site-Name": SITE, "Accept": "application/json" };
      for (const k of ["content-type", "x-frappe-csrf-token", "x-frappe-cmd"]) {
        const v = req.headers[k];
        if (v) headers[k] = String(v);
      }
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await collectBody(req);
      const up = await fetch(BACKEND + url, { method: req.method, headers, body, redirect: "manual" });
      const buf = Buffer.from(await up.arrayBuffer());
      const outH = {};
      up.headers.forEach((v, k) => { if (!HOP.has(k.toLowerCase())) outH[k] = v; });
      res.writeHead(up.status, outH);
      res.end(buf);
      return;
    }
    if (url.startsWith("/api") || url.startsWith("/files") || url.startsWith("/private")) {
      // Outside the minimal allowlist above — explicitly refused, not silently forwarded.
      res.writeHead(403, { "content-type": "text/plain" });
      res.end("test proxy: path not in allowlist (/api/method, /api/resource only)");
      return;
    }
    // static from dist; no ext or file not found → index.html (SPA fallback).
    let rel = decodeURIComponent(url.split("?")[0]);
    if (rel === "/") rel = "/index.html";
    await serveStatic(res, APP_DIST, rel);
  } catch (e) {
    console.error(`[502] ${req.method} ${req.url} → ${e.message}`);
    res.writeHead(502); res.end("proxy error: " + e.message);
  }
});

async function assertNotUnexpectedAdministrator() {
  if (process.env.E2E_ALLOW_ADMINISTRATOR === "1") return;
  try {
    const r = await fetch(`${BACKEND}/api/method/frappe.auth.get_logged_user`, {
      headers: { Authorization: `token ${TOKEN}`, "X-Frappe-Site-Name": SITE },
    });
    const j = await r.json().catch(() => ({}));
    if (j?.message === "Administrator") {
      console.error(
        "serve-proxy: TOKEN authenticates as Administrator. This proxy injects that identity for " +
          "any request it forwards. Set E2E_ALLOW_ADMINISTRATOR=1 to acknowledge and proceed " +
          "(only for the labeled Administrator-token smoke test — prefer a disposable restricted " +
          "user for permission-sensitive E2E). Refusing to start.",
      );
      process.exit(1);
    }
  } catch {
    // Backend unreachable at startup — let the normal request path surface the error per-request.
  }
}

await assertNotUnexpectedAdministrator();
server.listen(PORT, HOST, () => {
  console.log(`serve-proxy [TEST-ONLY, loopback]: ${APP_DIST} @ http://${HOST}:${PORT} → ${BACKEND} (${SITE})`);
  console.log("  Holds a live Frappe token — do not expose this port beyond localhost.");
});
