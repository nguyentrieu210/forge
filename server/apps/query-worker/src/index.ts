import { staticDevelopmentActor, verifyBearerJwt } from "../../../packages/auth/src/index.js";
import type { Actor, JsonObject } from "../../../packages/contracts/src/index.js";
import { asCloudForgeError, errorResponse, errors, jsonResponse, randomId, readJson } from "../../../packages/core/src/index.js";
import { PermissionService } from "../../../packages/policy/src/index.js";
import type { QueryRequest } from "../../../packages/query/src/index.js";
import { D1ReportService, parseQueryRequest } from "../../../packages/query/src/index.js";
import { FinanceQueryCompiler } from "../../../packages/query/src/finance-aging.js";

interface PreparedReportMessage {
  tenant_id: string;
  job_id: string;
  actor_id: string;
  request: QueryRequest;
}

interface QueryEnv {
  DB: D1Database;
  TENANT_ID?: string;
  AUTH_MODE?: "development" | "production";
  DEV_ACTOR_JSON?: string;
  JWT_SECRET?: string;
  JWT_ISSUER?: string;
  JWT_AUDIENCE?: string;
  REPORT_QUEUE?: Queue<PreparedReportMessage>;
}

export default {
  async fetch(request: Request, env: QueryEnv): Promise<Response> {
    const traceId = request.headers.get("x-cloudforge-trace-id") ?? randomId("trace");
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health") return jsonResponse({ ok: true, service: "query-worker" });
      // In development the tenant must be pinned by TENANT_ID; the ?tenant param
      // is only honoured in production, where authenticate() re-binds it to the
      // JWT tenant. This prevents a dev-mode instance from serving any tenant's
      // ledger via an attacker-chosen ?tenant.
      const tenantId = env.AUTH_MODE === "development"
        ? env.TENANT_ID
        : env.TENANT_ID ?? url.searchParams.get("tenant");
      if (!tenantId) throw new Error("Missing tenant context");
      const actor = await authenticate(request, env, tenantId);
      const permission = new PermissionService();

      if (request.method === "POST" && url.pathname === "/api/v1/reports/run") {
        const input = parseQueryRequest(await readJson<JsonObject>(request), tenantId);
        permission.assertReport(actor, input.report);
        const compiler = new FinanceQueryCompiler();
        const compiled = compiler.compile(input);
        if (compiled.prepared) {
          if (!env.REPORT_QUEUE) throw new Error("REPORT_QUEUE binding is missing");
          const jobId = crypto.randomUUID();
          const now = new Date();
          const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          await env.DB.prepare(
            `INSERT INTO prepared_reports(tenant_id,job_id,report_name,actor_id,request_json,status,created_at,expires_at)
             VALUES(?1,?2,?3,?4,?5,'queued',?6,?7)`,
          ).bind(tenantId, jobId, input.report, actor.user_id, JSON.stringify(input), now.toISOString(), expires.toISOString()).run();
          await env.REPORT_QUEUE.send({ tenant_id: tenantId, job_id: jobId, actor_id: actor.user_id, request: input });
          return jsonResponse({ prepared: true, report: input.report, job_id: jobId, status: "queued" }, 202);
        }
        const result = await new D1ReportService(env.DB, compiler).run(input, true);
        return jsonResponse(result, 200, { "x-cloudforge-trace-id": traceId });
      }

      const match = url.pathname.match(/^\/api\/v1\/reports\/prepared\/([^/]+)$/);
      if (request.method === "GET" && match) {
        const jobId = decodeURIComponent(match[1]!);
        const row = await env.DB.prepare(
          `SELECT job_id,report_name,actor_id,status,result_json,error_message,created_at,completed_at,expires_at
           FROM prepared_reports WHERE tenant_id=?1 AND job_id=?2`,
        ).bind(tenantId, jobId).first<{
          job_id: string; report_name: string; actor_id: string; status: string; result_json: string | null;
          error_message: string | null; created_at: string; completed_at: string | null; expires_at: string;
        }>();
        if (!row) return jsonResponse({ error: { code: "PREPARED_REPORT_NOT_FOUND" } }, 404);
        if (row.actor_id !== actor.user_id && !actor.roles.includes("System Manager")) throw errors.permission("Prepared report belongs to another user");
        permission.assertReport(actor, row.report_name);
        return jsonResponse({
          job_id: row.job_id,
          report: row.report_name,
          status: row.status,
          result: row.result_json ? JSON.parse(row.result_json) : null,
          // error_message stores only a safe error CODE (raw detail is server-logged),
          // so the client never sees raw D1/schema/binding text.
          error: row.error_message ? { code: row.error_message, message: "Prepared report execution failed" } : null,
          created_at: row.created_at,
          completed_at: row.completed_at,
          expires_at: row.expires_at,
        });
      }

      return jsonResponse({ error: { code: "ROUTE_NOT_FOUND" } }, 404);
    } catch (error) {
      return errorResponse(error, traceId);
    }
  },

  async queue(batch: MessageBatch<PreparedReportMessage>, env: QueryEnv): Promise<void> {
    for (const message of batch.messages) {
      const job = message.body;
      try {
        await env.DB.prepare(
          `UPDATE prepared_reports SET status='running', started_at=?3
           WHERE tenant_id=?1 AND job_id=?2 AND status='queued'`,
        ).bind(job.tenant_id, job.job_id, new Date().toISOString()).run();
        const result = await new D1ReportService(env.DB, new FinanceQueryCompiler()).run(job.request, true);
        await env.DB.prepare(
          `UPDATE prepared_reports SET status='completed', result_json=?3, completed_at=?4
           WHERE tenant_id=?1 AND job_id=?2`,
        ).bind(job.tenant_id, job.job_id, JSON.stringify(result), new Date().toISOString()).run();
        message.ack();
      } catch (error) {
        const normalized = asCloudForgeError(error);
        // Raw detail goes to the server log only — never into error_message, which
        // the GET endpoint returns to the client.
        console.error(JSON.stringify({
          level: "error", scope: "prepared-report", tenant_id: job.tenant_id, job_id: job.job_id,
          code: normalized.code, detail: error instanceof Error ? error.message : String(error),
        }));
        // Transient failures (D1 overload/timeouts) are retried by the queue rather
        // than marked terminally failed.
        if (normalized.retryable && message.attempts < 5) {
          message.retry({ delaySeconds: Math.min(60, 2 ** message.attempts) });
          continue;
        }
        await env.DB.prepare(
          `UPDATE prepared_reports SET status='failed', error_message=?3, completed_at=?4
           WHERE tenant_id=?1 AND job_id=?2`,
        ).bind(job.tenant_id, job.job_id, normalized.code, new Date().toISOString()).run();
        message.ack();
      }
    }
  },

  async scheduled(_controller: unknown, env: QueryEnv, ctx: ExecutionContext): Promise<void> {
    if (env.REPORT_QUEUE && env.TENANT_ID) ctx.waitUntil(reconcileStalePreparedReports(env));
  },
};

/**
 * Re-enqueues prepared-report jobs stuck in 'queued' — e.g. when REPORT_QUEUE.send()
 * failed after the row was inserted. Re-sending is safe because the consumer only
 * transitions rows WHERE status='queued', so a job already picked up is ignored.
 */
async function reconcileStalePreparedReports(env: QueryEnv): Promise<void> {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const stale = await env.DB.prepare(
    `SELECT job_id, actor_id, request_json FROM prepared_reports
     WHERE tenant_id=?1 AND status='queued' AND created_at < ?2 LIMIT 50`,
  ).bind(env.TENANT_ID, cutoff).all<{ job_id: string; actor_id: string; request_json: string }>();
  for (const row of stale.results ?? []) {
    await env.REPORT_QUEUE!.send({
      tenant_id: env.TENANT_ID!, job_id: row.job_id, actor_id: row.actor_id,
      request: JSON.parse(row.request_json) as QueryRequest,
    });
  }
}

async function authenticate(request: Request, env: QueryEnv, tenantId: string): Promise<Actor> {
  if (env.AUTH_MODE === "development") return staticDevelopmentActor(env.DEV_ACTOR_JSON);
  const claims = await verifyBearerJwt(request, {
    secret: requireConfig(env.JWT_SECRET, "JWT_SECRET"),
    // Mandatory in production, mirroring the gateway, to reject tokens minted
    // for another audience under a shared secret.
    issuer: requireConfig(env.JWT_ISSUER, "JWT_ISSUER"),
    audience: requireConfig(env.JWT_AUDIENCE, "JWT_AUDIENCE"),
  });
  if (claims.tenant_id !== tenantId) throw errors.authentication("Authenticated tenant does not match report tenant");
  return { user_id: claims.sub, roles: [...claims.roles] };
}

function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}
