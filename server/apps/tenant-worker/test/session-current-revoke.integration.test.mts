import { env, exports } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../../packages/frappe-api/src/index.js";

const USER = "session-revoke@example.com";
const PASSWORD = "session-revoke-password";
const NOW = "2026-07-30T12:00:00.000Z";

let sid = "";
let csrf = "";
let currentSessionId = "";

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (sid) headers.set("cookie", `sid=${encodeURIComponent(sid)}`);
  const method = (init.method ?? "GET").toUpperCase();
  if (sid && method !== "GET" && method !== "HEAD" && csrf) {
    headers.set("x-frappe-csrf-token", csrf);
  }
  return exports.default.fetch(new Request(`https://tenant.test${path}`, { ...init, headers }));
}

beforeAll(async () => {
  await env.DB.prepare(
    `INSERT INTO roles(tenant_id,role,modified_at) VALUES('demo','System Manager',?1)
     ON CONFLICT(tenant_id,role) DO NOTHING`,
  ).bind(NOW).run();
  await env.DB.prepare(
    `INSERT INTO users(tenant_id,user_id,full_name,email,password_hash,language,time_zone,created_at,modified_at)
     VALUES('demo',?1,'Session Revoke',?1,?2,'en','UTC',?3,?3)
     ON CONFLICT(tenant_id,user_id) DO UPDATE SET password_hash=excluded.password_hash,enabled=1`,
  ).bind(USER, await hashPassword(PASSWORD, 1_000), NOW).run();
  await env.DB.prepare(
    `INSERT INTO user_roles(tenant_id,user_id,role) VALUES('demo',?1,'System Manager')
     ON CONFLICT DO NOTHING`,
  ).bind(USER).run();

  const login = await exports.default.fetch(new Request("https://tenant.test/api/method/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usr: USER, pwd: PASSWORD }),
  }));
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)sid=([^;]+)/);
  expect(match).not.toBeNull();
  sid = decodeURIComponent(match![1]!);
  csrf = login.headers.get("x-frappe-csrf-token") ?? "";

  const listed = await call("/api/method/metaforge.api.list_sessions?limit=10");
  expect(listed.status).toBe(200);
  const body: any = await listed.json();
  const current = body.message.sessions.find((session: any) => session.current === true);
  expect(current).toBeTruthy();
  currentSessionId = current.session_id;
});

describe("current browser session revocation", () => {
  it("rejects the duplicate revoke surface before mutation and keeps logout authoritative", async () => {
    const response = await call("/api/method/metaforge.api.revoke_session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: currentSessionId, reason: "security test" }),
    });

    expect(response.status).toBe(417);
    const body: any = await response.json();
    expect(String(body.message)).toMatch(/Use logout to revoke the current session/i);

    const row = await env.DB.prepare(
      `SELECT revoked_at FROM user_sessions
       WHERE tenant_id='demo' AND user_id=?1 AND session_id=?2`,
    ).bind(USER, currentSessionId).first<{ revoked_at: string | null }>();
    expect(row?.revoked_at).toBeNull();
  });
});
