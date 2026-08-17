#!/usr/bin/env node

const origin = (process.env.FORGE_ORIGIN ?? "http://127.0.0.1:8799").replace(/\/$/, "");
const adminUser = process.env.FORGE_ADMIN_USER ?? "";
const adminPassword = process.env.FORGE_ADMIN_PASSWORD ?? "";
if (!adminUser || !adminPassword) throw new Error("FORGE_ADMIN_USER/FORGE_ADMIN_PASSWORD required");
const parsed = new URL(origin);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error(`local-only: ${parsed.hostname}`);

const cookies = new Map();
let csrfToken = "";
function rememberCookies(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  for (const part of raw.split(/,(?=[^;,]+=)/)) {
    const pair = part.split(";", 1)[0];
    const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  if (cookies.size) headers.set("cookie", [...cookies].map(([k,v]) => `${k}=${v}`).join("; "));
  if (csrfToken && options.method && options.method !== "GET") headers.set("x-frappe-csrf-token", csrfToken);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${origin}${path}`, { ...options, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  rememberCookies(response);
  const text = await response.text();
  let body; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body, text };
}
async function ok(path, options = {}) {
  const result = await request(path, options);
  if (!result.response.ok) throw new Error(`${options.method ?? "GET"} ${path} ${result.response.status}: ${result.text}`);
  return result.body;
}
await ok("/api/method/login", { method: "POST", body: { usr: adminUser, pwd: adminPassword } });
const boot = await ok("/api/method/metaforge.api.get_boot");
csrfToken = boot?.message?.csrf_token ?? boot?.csrf_token ?? "";

for (const name of ["Bill of Materials", "BOM Item", "Aluminium Lot", "Item"]) {
  const result = await request(`/api/resource/DocType/${encodeURIComponent(name)}`);
  console.log(`DOCTYPE_META_BEGIN ${name} status=${result.response.status}`);
  if (!result.response.ok) {
    console.log(result.text.slice(0, 3000));
    console.log(`DOCTYPE_META_END ${name}`);
    continue;
  }
  const doc = result.body?.data ?? result.body?.message ?? result.body;
  console.log(JSON.stringify({
    name: doc?.name,
    module: doc?.module,
    istable: doc?.istable,
    autoname: doc?.autoname,
    fields: (doc?.fields ?? []).map((f) => ({
      fieldname: f.fieldname,
      label: f.label,
      fieldtype: f.fieldtype,
      options: f.options,
      reqd: f.reqd,
      unique: f.unique,
      default: f.default,
    })),
  }, null, 2));
  console.log(`DOCTYPE_META_END ${name}`);
}
