import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

async function runReport(body: unknown): Promise<Response> {
  return exports.default.fetch(new Request("https://query.test/api/v1/reports/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function getPrepared(jobId: string): Promise<Response> {
  return exports.default.fetch(new Request(`https://query.test/api/v1/reports/prepared/${encodeURIComponent(jobId)}`));
}

// Directly invoke the queue consumer with a hand-built batch, so the test does
// not depend on miniflare auto-delivery timing.
function deliver(body: unknown): Promise<void> {
  const batch = {
    queue: "cloudforge-prepared-reports",
    messages: [{ id: "m1", body, attempts: 1, timestamp: new Date(), ack() {}, retry() {} }],
    ackAll() {},
    retryAll() {},
  };
  return exports.default.queue(batch as never, env as never);
}

async function seedQueued(jobId: string, request: unknown): Promise<void> {
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    `INSERT INTO prepared_reports(tenant_id,job_id,report_name,actor_id,request_json,status,created_at,expires_at)
     VALUES('demo',?1,'Accounts Receivable','Administrator',?2,'queued',?3,?4)`,
  ).bind(jobId, JSON.stringify(request), now, expires).run();
}

describe("query-worker prepared report pipeline (real workerd + D1)", () => {
  it("routes a large request to prepared mode and returns a job id", async () => {
    const res = await runReport({ report: "Accounts Receivable", limit: 2000 });
    expect(res.status).toBe(202);
    const body = await res.json() as { prepared: boolean; job_id: string; status: string };
    expect(body.prepared).toBe(true);
    expect(typeof body.job_id).toBe("string");
    expect(body.status).toBe("queued");
  });

  it("consumer takes a queued job to completed and the client can read the result", async () => {
    const res = await runReport({ report: "Accounts Receivable", limit: 2000 });
    const { job_id } = await res.json() as { job_id: string };
    await deliver({ tenant_id: "demo", job_id, actor_id: "Administrator", request: { report: "Accounts Receivable", tenant_id: "demo", limit: 2000 } });
    const status = await getPrepared(job_id);
    expect(status.status).toBe(200);
    const body = await status.json() as { status: string; result: unknown; error: unknown };
    expect(body.status).toBe("completed");
    expect(body.result).not.toBeNull();
    expect(body.error).toBeNull();
  });

  it("consumer marks a failing job failed WITHOUT leaking raw error text to the client", async () => {
    const jobId = "job-fail-sanitize";
    await seedQueued(jobId, { report: "Accounts Receivable", tenant_id: "demo", limit: 2000 });
    // Deliver a message whose request names an unknown report -> the consumer's
    // compile throws; the stored/returned error must be a code only.
    await deliver({ tenant_id: "demo", job_id: jobId, actor_id: "Administrator", request: { report: "Totally Unknown Report", tenant_id: "demo", limit: 2000 } });
    const status = await getPrepared(jobId);
    const body = await status.json() as { status: string; error: { code: string; message: string } | null };
    expect(body.status).toBe("failed");
    expect(body.error?.code).toBe("VALIDATION_ERROR");
    // The raw compiler message ("Unknown report: ...") must NOT appear anywhere.
    expect(JSON.stringify(body)).not.toContain("Unknown report");
  });
});
