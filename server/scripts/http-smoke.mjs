#!/usr/bin/env node
/**
 * HTTP smoke test against a running `wrangler dev`.
 *
 *   node scripts/http-smoke.mjs [--base http://127.0.0.1:8799] [--user x] [--password y]
 *
 * Complements the Workerd integration suite rather than repeating it. That suite
 * calls the worker through workerd's internal dispatch; this one goes over real
 * HTTP with a real cookie jar, which is the only way to exercise the parts the
 * transport owns: `Set-Cookie` parsing, cookie replay on later requests, header
 * casing, URL encoding of doctype names with spaces, and status codes as a client
 * actually observes them.
 *
 * Exits non-zero on the first failed expectation, so it can gate a deploy.
 */
import process from "node:process";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};

const BASE = argOf("base", "http://127.0.0.1:8799");
const USER = argOf("user", "dev@example.com");
const PASSWORD = argOf("password", "local-dev-password-1");
const DOCTYPE = argOf("doctype", "Field Visit");

let cookie = "";
let csrf = "";
let failures = 0;
let checks = 0;

function check(label, condition, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(path, { method = "GET", body, json = true } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  // Only sent on mutations, matching how a browser client behaves.
  if (csrf && method !== "GET" && method !== "HEAD") headers["x-frappe-csrf-token"] = csrf;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  // Captured from the real header, so a change in cookie attributes shows up here
  // rather than being assumed.
  const setCookie = response.headers.get("set-cookie");
  if (setCookie?.startsWith("sid=")) {
    const value = setCookie.slice(0, setCookie.indexOf(";"));
    cookie = value.endsWith("=Guest") ? "" : value;
  }
  const issued = response.headers.get("x-frappe-csrf-token");
  if (issued) csrf = issued;

  const text = await response.text();
  let payload = null;
  if (json && text) {
    try { payload = JSON.parse(text); } catch { payload = null; }
  }
  return { status: response.status, headers: response.headers, body: payload, text, setCookie };
}

const unwrap = (result) => (result.body && "message" in result.body ? result.body.message : result.body?.data ?? result.body);
const encoded = encodeURIComponent(DOCTYPE);

console.log(`HTTP smoke against ${BASE}`);

// ---- transport and session --------------------------------------------------
console.log("\nsession");
{
  const guest = await call("/api/method/metaforge.api.get_boot");
  check("guest is refused as PermissionError/403 with 'Login to access'",
    guest.status === 403 && guest.body?.exc_type === "PermissionError" && /login to access/i.test(String(guest.body?.message)),
    `${guest.status} ${guest.body?.exc_type}`);

  const wrong = await call("/api/method/login", { method: "POST", body: { usr: USER, pwd: "definitely-wrong" } });
  check("a wrong password is AuthenticationError/401 and sets no cookie",
    wrong.status === 401 && wrong.body?.exc_type === "AuthenticationError" && !wrong.setCookie,
    `${wrong.status} cookie=${Boolean(wrong.setCookie)}`);

  const login = await call("/api/method/login", { method: "POST", body: { usr: USER, pwd: PASSWORD } });
  check("login succeeds", login.status === 200 && unwrap(login) === "Logged In", `${login.status}`);
  check("the session cookie is HttpOnly and Secure over the wire",
    /HttpOnly/.test(login.setCookie ?? "") && /Secure/.test(login.setCookie ?? ""), login.setCookie ?? "none");
  check("a CSRF token is issued on the login response", csrf.length > 10);
}

console.log("\nboot");
{
  const boot = unwrap(await call("/api/method/metaforge.api.get_boot"));
  check("the cookie replays on a later request", boot?.user === USER, `user=${boot?.user}`);
  check("site_name is the tenant, which scopes the client cache", Boolean(boot?.site_name), `site_name=${boot?.site_name}`);
  check("the boot csrf_token matches the issued one", boot?.csrf_token === csrf);
}

console.log("\ncsrf");
{
  // Sent without the header while keeping the cookie: exactly what a cross-site
  // form can do.
  const response = await fetch(`${BASE}/api/resource/${encoded}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ subject: "No CSRF" }),
  });
  const payload = await response.json().catch(() => null);
  check("a write without the CSRF header is refused even with a valid cookie",
    response.status === 403 && payload?.exc_type === "PermissionError", `${response.status}`);
}

// ---- document lifecycle -----------------------------------------------------
console.log("\nlifecycle");
let name = "";
let modified = "";
{
  const created = await call(`/api/resource/${encoded}`, { method: "POST", body: { subject: "HTTP smoke" } });
  const doc = created.body?.data;
  check("create returns 201 with a server-allocated name", created.status === 201 && Boolean(doc?.name), `${created.status} ${doc?.name}`);
  check("owner and modified_by are the authenticated user", doc?.owner === USER && doc?.modified_by === USER);
  // The version is packed into the microseconds of `modified`; a fresh document is
  // version 1, so the token must not end in 0.
  check("the modified token carries the version", /\.\d{6}$/.test(String(doc?.modified)) && !String(doc?.modified).endsWith("000000"),
    String(doc?.modified));
  name = doc?.name ?? "";
  modified = doc?.modified ?? "";
}

if (name) {
  const stale = await call(`/api/resource/${encoded}/${encodeURIComponent(name)}`, {
    method: "PUT", body: { subject: "Stale write", modified: "2020-01-01 00:00:00.000000" },
  });
  check("a stale modified token is TimestampMismatchError/417",
    stale.status === 417 && stale.body?.exc_type === "TimestampMismatchError", `${stale.status} ${stale.body?.exc_type}`);

  const missing = await call(`/api/resource/${encoded}/${encodeURIComponent(name)}`, {
    method: "PUT", body: { subject: "No token" },
  });
  check("a missing modified token is refused, not treated as a force-write",
    missing.status === 417 && missing.body?.exc_type === "TimestampMismatchError", `${missing.status}`);

  const saved = await call(`/api/resource/${encoded}/${encodeURIComponent(name)}`, {
    method: "PUT", body: { subject: "Saved over HTTP", modified },
  });
  check("a correct modified token saves and advances the token",
    saved.status === 200 && saved.body?.data?.subject === "Saved over HTTP" && saved.body?.data?.modified !== modified,
    `${saved.status}`);
  modified = saved.body?.data?.modified ?? modified;

  const submitted = await call("/api/method/frappe.client.submit", {
    method: "POST", body: { doc: { doctype: DOCTYPE, name, modified } },
  });
  check("submit moves the document to docstatus 1", submitted.status === 200 && unwrap(submitted)?.docstatus === 1,
    `${submitted.status} docstatus=${unwrap(submitted)?.docstatus}`);
  modified = unwrap(submitted)?.modified ?? modified;

  const deleted = await call(`/api/resource/${encoded}/${encodeURIComponent(name)}`, { method: "DELETE" });
  check("a submitted document cannot be deleted", deleted.status === 417 && /submitted document cannot be deleted/i.test(String(deleted.body?.message)),
    `${deleted.status}`);
}

// ---- reads ------------------------------------------------------------------
console.log("\nreads");
{
  const bundle = unwrap(await call(`/api/method/frappe.desk.form.load.getdoctype?doctype=${encoded}&with_parent=1`));
  const doc = bundle?.docs?.find((entry) => entry.name === DOCTYPE);
  check("metadata uses frappe field names and integer flags",
    doc && doc.issingle === 0 && doc.fields.some((field) => field.reqd === 1 || field.reqd === 0),
    `found=${Boolean(doc)}`);

  const list = unwrap(await call(`/api/method/frappe.client.get_list?doctype=${encoded}&fields=%5B%22name%22%2C%22subject%22%5D`));
  check("list returns rows with frappe field names", Array.isArray(list) && list.length > 0 && !("modified_at" in (list[0] ?? {})),
    `rows=${Array.isArray(list) ? list.length : "n/a"}`);

  const csvResponse = await fetch(`${BASE}/api/method/frappe.desk.reportview.export_query?doctype=${encoded}&fields=%5B%22name%22%2C%22subject%22%5D`, {
    headers: { cookie },
  });
  const bytes = new Uint8Array(await csvResponse.arrayBuffer());
  check("CSV export is served as a download with a UTF-8 BOM",
    csvResponse.status === 200
    && /text\/csv/.test(csvResponse.headers.get("content-type") ?? "")
    && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF,
    `${csvResponse.status} ${csvResponse.headers.get("content-type")}`);
}

// ---- unimplemented and logout ----------------------------------------------
console.log("\nboundaries");
{
  const missing = await call("/api/method/frappe.desk.doctype.dashboard_chart.dashboard_chart.get?chart_name=X");
  check("an unimplemented method is 404 DoesNotExistError, never an empty success",
    missing.status === 404 && missing.body?.exc_type === "DoesNotExistError", `${missing.status}`);

  const native = await call("/api/v1/whoami");
  check("the native API is not shadowed by the facade", native.status === 200 || native.status === 401, `${native.status}`);

  const logout = await call("/api/method/logout", { method: "POST" });
  check("logout clears the cookie", logout.status === 200 && /Max-Age=0/.test(logout.setCookie ?? ""), logout.setCookie ?? "none");

  const afterLogout = await call("/api/method/metaforge.api.get_boot");
  check("the session no longer works after logout", afterLogout.status === 403, `${afterLogout.status}`);
}

console.log(`\n${failures === 0 ? "HTTP_SMOKE_PASS" : "HTTP_SMOKE_FAIL"} checks=${checks} failures=${failures}`);
process.exit(failures === 0 ? 0 : 1);
