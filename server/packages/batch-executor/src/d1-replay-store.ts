import type {
  BatchReplayClaim,
  BatchReplayScope,
  BatchReplayStore,
} from "./index.js";

interface ReplayRow {
  request_hash: string;
  status: "in_flight" | "completed" | "blocked";
  result_json: string | null;
}

/**
 * Durable tenant-scoped replay/idempotency store for commit-capable batch execution.
 *
 * Claim ownership is acquired with one INSERT OR IGNORE against the table primary key.
 * That lets concurrent identical requests race safely: exactly one insert reports a change,
 * every loser reads the row and becomes replay/in-flight/conflict according to its hash.
 *
 * release() is deliberately fail-closed. The generic executor cannot know whether a thrown
 * error happened before or after an authoritative domain side effect, so deleting a claim
 * here could turn an ambiguous response into a duplicate write on retry. Instead the claim
 * becomes `blocked`; later retries remain in-flight until an operator/domain reconciliation
 * path resolves the ambiguous execution. Domain item commands still receive stable
 * `batchId:itemId` operation ids for their own idempotency boundary.
 */
export class D1BatchReplayStore<TResult> implements BatchReplayStore<TResult> {
  private readonly db: D1Database | D1DatabaseSession;

  constructor(database: D1Database) {
    this.db = database.withSession?.("first-primary") ?? database;
  }

  async claim(scope: BatchReplayScope): Promise<BatchReplayClaim<TResult>> {
    const now = new Date().toISOString();
    const inserted = await this.db.prepare(
      `INSERT OR IGNORE INTO batch_replay_claims(
         tenant_id,idempotency_key,request_hash,status,result_json,created_at,updated_at
       ) VALUES(?1,?2,?3,'in_flight',NULL,?4,?4)`,
    ).bind(scope.tenantId, scope.idempotencyKey, scope.requestHash, now).run();

    if ((inserted.meta?.changes ?? 0) === 1) return { state: "acquired" };

    const row = await this.db.prepare(
      `SELECT request_hash,status,result_json
       FROM batch_replay_claims
       WHERE tenant_id=?1 AND idempotency_key=?2`,
    ).bind(scope.tenantId, scope.idempotencyKey).first<ReplayRow>();

    if (!row) throw new Error("Batch replay claim disappeared after conflicting insert");
    if (row.status === "completed") {
      if (!row.result_json) throw new Error("Completed batch replay claim has no result");
      return {
        state: "replay",
        requestHash: row.request_hash,
        result: JSON.parse(row.result_json) as TResult,
      };
    }
    return { state: "in_flight", requestHash: row.request_hash };
  }

  async complete(scope: BatchReplayScope, result: TResult): Promise<void> {
    const resultJson = JSON.stringify(result);
    const updated = await this.db.prepare(
      `UPDATE batch_replay_claims
       SET status='completed',result_json=?1,updated_at=?2
       WHERE tenant_id=?3 AND idempotency_key=?4 AND request_hash=?5 AND status='in_flight'`,
    ).bind(
      resultJson,
      new Date().toISOString(),
      scope.tenantId,
      scope.idempotencyKey,
      scope.requestHash,
    ).run();
    if ((updated.meta?.changes ?? 0) === 1) return;

    const row = await this.db.prepare(
      `SELECT request_hash,status,result_json
       FROM batch_replay_claims
       WHERE tenant_id=?1 AND idempotency_key=?2`,
    ).bind(scope.tenantId, scope.idempotencyKey).first<ReplayRow>();
    if (row?.request_hash === scope.requestHash && row.status === "completed" && row.result_json === resultJson) return;
    throw new Error("Batch replay claim could not be finalized consistently");
  }

  async release(scope: BatchReplayScope): Promise<void> {
    // Fail closed on ambiguous commit failure. Never delete a claim automatically.
    await this.db.prepare(
      `UPDATE batch_replay_claims
       SET status='blocked',updated_at=?1
       WHERE tenant_id=?2 AND idempotency_key=?3 AND request_hash=?4 AND status='in_flight'`,
    ).bind(
      new Date().toISOString(),
      scope.tenantId,
      scope.idempotencyKey,
      scope.requestHash,
    ).run();
  }
}
