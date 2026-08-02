
import { errorResponse, errors, jsonResponse, randomId, readJson, timingSafeEqualString } from "../../../packages/core/src/index.js";
import type { JsonObject } from "../../../packages/contracts/src/index.js";
import { requireIdentifier, requireString } from "../../../packages/contracts/src/index.js";
import { hashPassword } from "../../../packages/frappe-api/src/index.js";
import { encryptCredential, hmacHex, sha256Hex } from "../../../packages/social-commerce/src/index.js";
import {
  assertGovernedRouteMutation,
  nextRoutingVersion,
  routeAuditJson,
  ROUTE_PLANS,
  ROUTE_STATUSES,
  type GovernedTenantRoute,
  type RequestedTenantRoute,
} from "./route-governance.js";

interface ControlEnv {
  CONTROL_DB: D1Database;
  ROUTES: KVNamespace;
  CONTROL_TOKEN?: string;
  SIGNUP_DATA_KEY?: string;
  SIGNUP_LOOKUP_SECRET?: string;
}

interface TenantRouteRow {
  tenant_id: string;
  worker_name: string;
  status: (typeof ROUTE_STATUSES)[number];
  plan: (typeof ROUTE_PLANS)[number];
  routing_version: number;
}

interface RouteAuditRow {
  event_id: string;
  trace_id: string;
  actor_key: string;
  action: string;
  tenant_id: string;
  route_key: string;
  reason: string;
  before_json: string | null;
  after_json: string;
  created_at: string;
}

export default {
  async fetch(request: Request, env: ControlEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/v1/public/signup") {
        // Await inside this try so validation/database failures pass through the same
        // safe error envelope as every authenticated control-plane route.
        return await createPublicSignup(request, env, traceId);
      }
      if (!env.CONTROL_TOKEN || !timingSafeEqualString(request.headers.get("authorization") ?? "", `Bearer ${env.CONTROL_TOKEN}`)) {
        return jsonResponse({ error: { code: "CONTROL_AUTH_REQUIRED" }, trace_id: traceId }, 401);
      }
      if (request.method === "POST" && url.pathname === "/v1/routes/rebuild-index") {
        const body = await readJson<JsonObject>(request, 4_000);
        const after = body.after_tenant_id === undefined ? "" : requireIdentifier(body.after_tenant_id, "after_tenant_id");
        const limitValue = body.limit === undefined ? 250 : body.limit;
        if (typeof limitValue !== "number" || !Number.isInteger(limitValue) || limitValue < 1 || limitValue > 1_000) {
          throw errors.validation("limit must be an integer from 1 to 1000");
        }
        const page = await env.CONTROL_DB.prepare(
          `SELECT tenant_id, worker_name, status, plan, routing_version
           FROM tenant_routes WHERE tenant_id>?1 ORDER BY tenant_id ASC LIMIT ?2`,
        ).bind(after, limitValue + 1).all<TenantRouteRow>();
        const rows = page.results ?? [];
        const selected = rows.slice(0, limitValue);
        for (const row of selected) {
          await env.ROUTES.put(`__tenant__:${row.tenant_id}`, JSON.stringify({
            tenant_id: row.tenant_id,
            worker_name: row.worker_name,
            status: row.status,
            plan: row.plan,
            routing_version: row.routing_version,
          }));
        }
        return jsonResponse({
          rebuilt: selected.length,
          next_after_tenant_id: rows.length > limitValue ? selected.at(-1)?.tenant_id ?? null : null,
        });
      }
      if (request.method === "GET" && url.pathname === "/v1/audit/routes") {
        const tenantId = requireIdentifier(url.searchParams.get("tenant_id"), "tenant_id");
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw === null ? 100 : Number(limitRaw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw errors.validation("limit must be an integer from 1 to 250");
        const beforeRaw = url.searchParams.get("before")?.trim() ?? "";
        if (beforeRaw && !Number.isFinite(Date.parse(beforeRaw))) throw errors.validation("before must be an ISO timestamp");
        const page = beforeRaw
          ? await env.CONTROL_DB.prepare(
            `SELECT event_id,trace_id,actor_key,action,tenant_id,route_key,reason,before_json,after_json,created_at
             FROM control_route_audit_events
             WHERE tenant_id=?1 AND created_at<?2
             ORDER BY created_at DESC,event_id DESC LIMIT ?3`,
          ).bind(tenantId, beforeRaw, limit).all<RouteAuditRow>()
          : await env.CONTROL_DB.prepare(
            `SELECT event_id,trace_id,actor_key,action,tenant_id,route_key,reason,before_json,after_json,created_at
             FROM control_route_audit_events
             WHERE tenant_id=?1
             ORDER BY created_at DESC,event_id DESC LIMIT ?2`,
          ).bind(tenantId, limit).all<RouteAuditRow>();
        return jsonResponse({
          events: (page.results ?? []).map((row) => ({
            event_id: row.event_id,
            trace_id: row.trace_id,
            actor_key: row.actor_key,
            action: row.action,
            tenant_id: row.tenant_id,
            route_key: row.route_key,
            reason: row.reason,
            before: row.before_json ? JSON.parse(row.before_json) : null,
            after: JSON.parse(row.after_json),
            created_at: row.created_at,
          })),
        });
      }
      if (request.method === "PUT" && url.pathname.startsWith("/v1/routes/")) {
        const routeKey = requireString(decodeURIComponent(url.pathname.slice("/v1/routes/".length)), "route_key", 253);
        const bodyObject = await readJson<JsonObject>(request, 16_000);
        const tenant_id = requireIdentifier(bodyObject.tenant_id, "tenant_id");
        const worker_name = requireIdentifier(bodyObject.worker_name, "worker_name");
        const status = requireString(bodyObject.status, "status", 32);
        if (!ROUTE_STATUSES.includes(status as (typeof ROUTE_STATUSES)[number])) throw errors.validation("status must be active, suspended or provisioning");
        const requestedPlan = bodyObject.plan === undefined ? undefined : requireString(bodyObject.plan, "plan", 32);
        if (requestedPlan !== undefined && !ROUTE_PLANS.includes(requestedPlan as (typeof ROUTE_PLANS)[number])) throw errors.validation("plan must be free, pro or enterprise");
        const reason = bodyObject.reason === undefined ? "" : requireString(bodyObject.reason, "reason", 500);
        const now = new Date().toISOString();

        const currentAtKey = await loadRouteByKey(env.CONTROL_DB, routeKey);
        const currentForTenant = await loadRouteByTenant(env.CONTROL_DB, tenant_id);
        const plan = (requestedPlan ?? currentForTenant?.plan ?? currentAtKey?.plan ?? "free") as (typeof ROUTE_PLANS)[number];
        const requested: RequestedTenantRoute = {
          route_key: routeKey,
          tenant_id,
          worker_name,
          status: status as (typeof ROUTE_STATUSES)[number],
          plan,
        };
        const governance = assertGovernedRouteMutation(currentAtKey, currentForTenant, requested, reason);
        if (!governance.changed) {
          return jsonResponse({ route_key: routeKey, routing_version: governance.baseline?.routing_version ?? 0, unchanged: true });
        }

        const version = nextRoutingVersion(currentAtKey, currentForTenant);
        const movedFrom = currentForTenant && currentForTenant.route_key !== routeKey ? currentForTenant.route_key : null;
        const statements: D1PreparedStatement[] = [];
        if (movedFrom) {
          statements.push(env.CONTROL_DB.prepare("DELETE FROM tenant_routes WHERE route_key=?1").bind(movedFrom));
        }
        statements.push(env.CONTROL_DB.prepare(
          `INSERT INTO tenant_routes(route_key, tenant_id, worker_name, status, plan, routing_version, modified_at)
           VALUES(?1,?2,?3,?4,?5,?6,?7)
           ON CONFLICT(route_key) DO UPDATE SET tenant_id=excluded.tenant_id, worker_name=excluded.worker_name,
           status=excluded.status, plan=excluded.plan, routing_version=excluded.routing_version, modified_at=excluded.modified_at`,
        ).bind(routeKey, tenant_id, worker_name, requested.status, plan, version, now));
        statements.push(env.CONTROL_DB.prepare(
          `INSERT INTO control_route_audit_events(
             event_id,trace_id,actor_key,action,tenant_id,route_key,reason,before_json,after_json,created_at
           ) VALUES(?1,?2,'control-token',?3,?4,?5,?6,?7,?8,?9)`,
        ).bind(
          randomId("control-audit"),
          traceId,
          governance.action,
          tenant_id,
          routeKey,
          reason.trim(),
          governance.baseline ? routeAuditJson(governance.baseline) : null,
          routeAuditJson(requested, version),
          now,
        ));
        await env.CONTROL_DB.batch(statements);

        const routeRecord = JSON.stringify({ tenant_id, worker_name, status: requested.status, plan, routing_version: version });
        if (movedFrom) {
          // D1 is authoritative; KV is the routing projection. If a KV write fails after
          // the atomic D1+audit commit, rebuild-index can repair it from the audited row.
          await env.ROUTES.delete(movedFrom);
        }
        await env.ROUTES.put(routeKey, routeRecord);
        await env.ROUTES.put(`__tenant__:${tenant_id}`, routeRecord);
        return jsonResponse({ route_key: routeKey, routing_version: version, ...(movedFrom ? { moved_from: movedFrom } : {}) });
      }
      return jsonResponse({ error: { code: "ROUTE_NOT_FOUND" } }, 404);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },
};

async function loadRouteByKey(db: D1Database, routeKey: string): Promise<GovernedTenantRoute | null> {
  return db.prepare(
    `SELECT route_key,tenant_id,worker_name,status,plan,routing_version
     FROM tenant_routes WHERE route_key=?1`,
  ).bind(routeKey).first<GovernedTenantRoute>();
}

async function loadRouteByTenant(db: D1Database, tenantId: string): Promise<GovernedTenantRoute | null> {
  return db.prepare(
    `SELECT route_key,tenant_id,worker_name,status,plan,routing_version
     FROM tenant_routes WHERE tenant_id=?1`,
  ).bind(tenantId).first<GovernedTenantRoute>();
}

export async function createPublicSignup(request: Request, env: ControlEnv, traceId = randomId("trace")): Promise<Response> {
  if (!env.SIGNUP_DATA_KEY || !env.SIGNUP_LOOKUP_SECRET) {
    return jsonResponse({ error: { code: "SIGNUP_NOT_CONFIGURED", message: "Đăng ký tạm thời chưa sẵn sàng." }, trace_id: traceId }, 503);
  }
  const body = await readJson<JsonObject>(request, 12_000);
  // Honeypot: browsers never show this field. Answer generically so a bot cannot tune
  // itself by learning which anti-abuse check it hit.
  if (typeof body.website === "string" && body.website.trim()) {
    return jsonResponse({ signup_id: randomId("signup"), status: "pending_verification" }, 202);
  }

  const shopName = normalizeShopName(body.shop_name);
  const email = normalizeEmail(body.email);
  const password = requireString(body.password, "password", 256);
  if (password.length < 8) throw errors.validation("Mật khẩu phải có ít nhất 8 ký tự");
  if (body.accepted_terms !== true) throw errors.validation("Bạn cần đồng ý Điều khoản và Chính sách quyền riêng tư");
  const desiredSlug = normalizeSlug(body.desired_slug, shopName);
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 60_000).toISOString();
  // Email is low-entropy PII, so a plain digest would be reversible by dictionary attack
  // after a database leak. Use the operator-held lookup secret for both lookup hashes.
  const emailHash = await hmacHex(env.SIGNUP_LOOKUP_SECRET, `email:${email}`);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  const ipHash = await hmacHex(env.SIGNUP_LOOKUP_SECRET, ip);
  const emailCount = await env.CONTROL_DB.prepare(
    "SELECT COUNT(*) AS total FROM signup_verifications WHERE email_hash=?1 AND created_at>=?2",
  ).bind(emailHash, since).first<{ total: number }>();
  const ipCount = await env.CONTROL_DB.prepare(
    "SELECT COUNT(*) AS total FROM signup_verifications WHERE ip_hash=?1 AND created_at>=?2",
  ).bind(ipHash, since).first<{ total: number }>();
  if ((emailCount?.total ?? 0) >= 3 || (ipCount?.total ?? 0) >= 10) {
    return jsonResponse({ error: { code: "SIGNUP_RATE_LIMITED", message: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." }, trace_id: traceId }, 429);
  }
  const routeExists = await env.CONTROL_DB.prepare("SELECT tenant_id FROM tenant_routes WHERE route_key=?1")
    .bind(`${desiredSlug}.kairo.vn`).first<{ tenant_id: string }>();
  if (routeExists) throw errors.exists("Tên miền shop đã được sử dụng");
  // The partial unique index cannot compare against the current clock. Retire expired
  // rows first, otherwise an expired request still blocks the slug at INSERT forever.
  await env.CONTROL_DB.prepare(
    "UPDATE signup_verifications SET status='expired' WHERE desired_slug=?1 AND status='pending_verification' AND expires_at<=?2",
  ).bind(desiredSlug, now.toISOString()).run();
  const pendingSlug = await env.CONTROL_DB.prepare(
    "SELECT signup_id FROM signup_verifications WHERE desired_slug=?1 AND status='pending_verification' AND expires_at>?2",
  ).bind(desiredSlug, now.toISOString()).first<{ signup_id: string }>();
  if (pendingSlug) throw errors.exists("Tên miền shop đang chờ xác minh");

  const signupId = randomId("signup");
  const verificationToken = randomToken();
  const passwordHash = await hashPassword(password);
  const consentedAt = now.toISOString();
  const encryptedPayload = await encryptCredential(JSON.stringify({
    shop_name: shopName,
    owner_email: email,
    desired_slug: desiredSlug,
    password_hash: passwordHash,
    consented_at: consentedAt,
  }), env.SIGNUP_DATA_KEY, `signup:${signupId}`);
  const expiresAt = new Date(now.getTime() + 30 * 60_000).toISOString();
  await env.CONTROL_DB.prepare(
    `INSERT INTO signup_verifications(
       signup_id,email_hash,ip_hash,token_hash,desired_slug,signup_payload_ciphertext,status,expires_at,created_at
     ) VALUES(?1,?2,?3,?4,?5,?6,'pending_verification',?7,?8)`,
  ).bind(signupId, emailHash, ipHash, await sha256Hex(verificationToken), desiredSlug, encryptedPayload, expiresAt, consentedAt).run();

  // The one-time token deliberately never goes back to the browser. The email-delivery
  // adapter consumes it in the next provisioning slice; returning it here would turn
  // "verify the mailbox" into "press a button in the same unverified session".
  return jsonResponse({
    signup_id: signupId,
    status: "pending_verification",
    desired_hostname: `${desiredSlug}.kairo.vn`,
    verification_delivery: "pending_email_service",
  }, 202);
}

function normalizeShopName(value: unknown): string {
  const name = requireString(value, "shop_name", 120).replace(/\s+/g, " ").trim();
  if (name.length < 2) throw errors.validation("Tên shop phải có ít nhất 2 ký tự");
  return name;
}

function normalizeEmail(value: unknown): string {
  const email = requireString(value, "email", 254).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw errors.validation("Email không hợp lệ");
  return email;
}

function normalizeSlug(value: unknown, shopName: string): string {
  const source = typeof value === "string" && value.trim() ? value : shopName;
  const slug = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug)) throw errors.validation("Tên miền shop phải dài 3–48 ký tự, chỉ gồm chữ thường, số và dấu gạch ngang");
  if (["www", "api", "admin", "control", "social-ingress", "edu", "hrm", "chotdon"].includes(slug)) throw errors.validation("Tên miền shop này được dành riêng");
  return slug;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
