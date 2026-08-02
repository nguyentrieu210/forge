import type { JsonObject, MutationReceipt } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { MigrationPlan, MigrationPlannedRow, MigrationRunState } from "./index.js";
import { transitionMigrationState, type MigrationReconciliationMetric } from "./index.js";
import {
  advanceMigrationCheckpoint,
  type MigrationCheckpoint,
  type MigrationDuplicateAction,
  type MigrationRowOutcome,
} from "./execution.js";

export interface MigrationRunRecord {
  run_id: string;
  plan_id: string;
  manifest_id: string | null;
  source_id: string;
  source_kind: MigrationPlan["source_kind"];
  source_fingerprint: string;
  target_doctype: string;
  duplicate_policy: MigrationPlan["duplicate_policy"];
  key_field: string | null;
  mapping: Record<string, string | null>;
  state: MigrationRunState;
  started_by: string;
  created_at: string;
  modified_at: string;
  completed_at: string | null;
}

export type MigrationJournalRowStatus = "reserved" | "applying" | "imported" | "updated" | "skipped" | "failed";

export interface MigrationJournalRow {
  row_key: string;
  source_row_number: number;
  row_fingerprint: string;
  target_doctype: string;
  target_name: string | null;
  intended_action: MigrationDuplicateAction;
  status: MigrationJournalRowStatus;
  command_id: string | null;
  command_payload_hash: string | null;
  document: JsonObject | null;
  error: string | null;
  attempt_count: number;
  created_at: string;
  modified_at: string;
  staging_purged_at: string | null;
}

interface RunRow {
  run_id: string; plan_id: string; manifest_id: string | null; source_id: string; source_kind: MigrationPlan["source_kind"];
  source_fingerprint: string; target_doctype: string; duplicate_policy: MigrationPlan["duplicate_policy"];
  key_field: string | null; mapping_json: string; state: MigrationRunState; started_by: string;
  created_at: string; modified_at: string; completed_at: string | null;
}

interface JournalDbRow {
  row_key: string; source_row_number: number; row_fingerprint: string; target_doctype: string; target_name: string | null;
  intended_action: MigrationDuplicateAction; status: MigrationJournalRowStatus; command_id: string | null;
  command_payload_hash: string | null; document_json: string | null; error_text: string | null; attempt_count: number;
  created_at: string; modified_at: string; staging_purged_at: string | null;
}

interface ReceiptDbRow {
  command_id: string; tenant_id: string; actor_user_id: string; doctype: string; name: string;
  aggregate_version: number; payload_hash: string; committed_at: string; result_json: string;
}

/**
 * Durable WS13 journal. This store never writes business documents or ledgers.
 * It records migration intent and links it to the document kernel's mutation receipt.
 */
export class D1MigrationJournal {
  private readonly writer: D1Database | D1DatabaseSession;

  constructor(private readonly db: D1Database) {
    this.writer = db.withSession?.("first-primary") ?? db;
  }

  async ensureRun(
    tenantId: string,
    plan: MigrationPlan,
    actor: string,
    now: string,
    manifestId?: string,
  ): Promise<MigrationRunRecord> {
    const existing = await this.getRunByPlanId(tenantId, plan.plan_id);
    if (existing) {
      assertRunMatches(existing, plan);
      return existing;
    }
    const runId = plan.plan_id;
    await this.writer.prepare(
      `INSERT INTO migration_runs(
        tenant_id,run_id,plan_id,manifest_id,source_id,source_kind,source_fingerprint,target_doctype,
        duplicate_policy,key_field,mapping_json,state,started_by,created_at,modified_at,completed_at
      ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'draft',?12,?13,?13,NULL)`,
    ).bind(
      tenantId, runId, plan.plan_id, manifestId?.trim() || null, plan.source_id, plan.source_kind,
      plan.source_fingerprint, plan.target_doctype, plan.duplicate_policy, plan.key_field,
      JSON.stringify(plan.mapping), actor, now,
    ).run();
    const created = await this.getRun(tenantId, runId);
    if (!created) throw errors.database("Migration run was not readable after insert");
    return created;
  }

  async getRun(tenantId: string, runId: string): Promise<MigrationRunRecord | null> {
    const row = await this.writer.prepare(
      `SELECT run_id,plan_id,manifest_id,source_id,source_kind,source_fingerprint,target_doctype,
              duplicate_policy,key_field,mapping_json,state,started_by,created_at,modified_at,completed_at
       FROM migration_runs WHERE tenant_id=?1 AND run_id=?2`,
    ).bind(tenantId, runId).first<RunRow>();
    return row ? runRecord(row) : null;
  }

  async transitionRun(tenantId: string, runId: string, next: MigrationRunState, now: string): Promise<MigrationRunRecord> {
    const current = await this.getRun(tenantId, runId);
    if (!current) throw errors.notFound("Migration run not found");
    transitionMigrationState(current.state, next);
    const completedAt = next === "completed" || next === "cancelled" ? now : current.completed_at;
    const result = await this.writer.prepare(
      `UPDATE migration_runs SET state=?3,modified_at=?4,completed_at=?5
       WHERE tenant_id=?1 AND run_id=?2 AND state=?6`,
    ).bind(tenantId, runId, next, now, completedAt, current.state).run();
    if ((result.meta?.changes ?? 0) !== 1) throw errors.version();
    return (await this.getRun(tenantId, runId))!;
  }

  async reserveRow(
    tenantId: string,
    runId: string,
    row: MigrationPlannedRow,
    intendedAction: MigrationDuplicateAction,
    targetName: string | null,
    now: string,
  ): Promise<MigrationJournalRow> {
    if (["create", "update", "skip"].includes(intendedAction) && !targetName?.trim()) {
      throw errors.validation(`Migration ${intendedAction} requires stable target_name before reservation`);
    }
    await this.writer.prepare(
      `INSERT INTO migration_row_receipts(
        tenant_id,run_id,row_key,source_row_number,row_fingerprint,target_doctype,target_name,intended_action,status,
        command_id,command_payload_hash,document_json,error_text,attempt_count,created_at,modified_at,staging_purged_at
      ) VALUES(?1,?2,?3,?4,?5,(SELECT target_doctype FROM migration_runs WHERE tenant_id=?1 AND run_id=?2),?6,?7,'reserved',NULL,NULL,?8,NULL,0,?9,?9,NULL)
      ON CONFLICT(tenant_id,run_id,row_key) DO NOTHING`,
    ).bind(tenantId, runId, row.row_key, row.row_number, row.fingerprint, targetName?.trim() || null, intendedAction, JSON.stringify(row.document), now).run();
    const reserved = await this.getRow(tenantId, runId, row.row_key);
    if (!reserved) throw errors.database("Migration row was not readable after reservation");
    if (reserved.row_fingerprint !== row.fingerprint || reserved.intended_action !== intendedAction || reserved.target_name !== (targetName?.trim() || null)) {
      throw errors.idempotency();
    }
    return reserved;
  }

  async recordPreflightFailure(
    tenantId: string,
    runId: string,
    row: MigrationPlannedRow,
    error: string,
    now: string,
  ): Promise<MigrationJournalRow> {
    const existing = await this.getRow(tenantId, runId, row.row_key);
    if (!existing) {
      await this.writer.prepare(
        `INSERT INTO migration_row_receipts(
          tenant_id,run_id,row_key,source_row_number,row_fingerprint,target_doctype,target_name,intended_action,status,
          command_id,command_payload_hash,document_json,error_text,attempt_count,created_at,modified_at,staging_purged_at
        ) VALUES(?1,?2,?3,?4,?5,(SELECT target_doctype FROM migration_runs WHERE tenant_id=?1 AND run_id=?2),NULL,'error','failed',NULL,NULL,?6,?7,0,?8,?8,NULL)`,
      ).bind(tenantId, runId, row.row_key, row.row_number, row.fingerprint, JSON.stringify(row.document), boundedError(error), now).run();
    } else {
      if (existing.row_fingerprint !== row.fingerprint) throw errors.idempotency();
      await this.writer.prepare(
        `UPDATE migration_row_receipts SET status='failed',error_text=?4,modified_at=?5
         WHERE tenant_id=?1 AND run_id=?2 AND row_key=?3 AND status NOT IN ('imported','updated','skipped')`,
      ).bind(tenantId, runId, row.row_key, boundedError(error), now).run();
    }
    return (await this.getRow(tenantId, runId, row.row_key))!;
  }

  async markApplying(
    tenantId: string,
    runId: string,
    rowKey: string,
    commandId: string,
    payloadHash: string,
    now: string,
  ): Promise<MigrationJournalRow> {
    if (!commandId.trim()) throw errors.validation("Migration command_id is required");
    if (!/^[a-f0-9]{64}$/.test(payloadHash)) throw errors.validation("Migration command payload hash must be SHA-256 hex");
    const current = await this.requireRow(tenantId, runId, rowKey);
    if (current.status === "applying") {
      if (current.command_id !== commandId || current.command_payload_hash !== payloadHash) throw errors.idempotency();
      return current;
    }
    if (!["reserved", "failed"].includes(current.status)) {
      throw errors.lifecycle(`Migration row cannot start applying from ${current.status}`);
    }
    if (current.intended_action !== "create" && current.intended_action !== "update") {
      throw errors.lifecycle(`Migration ${current.intended_action} row does not execute a document command`);
    }
    const result = await this.writer.prepare(
      `UPDATE migration_row_receipts
       SET status='applying',command_id=?4,command_payload_hash=?5,error_text=NULL,
           attempt_count=attempt_count+1,modified_at=?6
       WHERE tenant_id=?1 AND run_id=?2 AND row_key=?3 AND status IN ('reserved','failed')`,
    ).bind(tenantId, runId, rowKey, commandId, payloadHash, now).run();
    if ((result.meta?.changes ?? 0) !== 1) throw errors.version();
    return (await this.getRow(tenantId, runId, rowKey))!;
  }

  async recordOutcome(
    tenantId: string,
    runId: string,
    outcome: MigrationRowOutcome,
    now: string,
  ): Promise<MigrationJournalRow> {
    const current = await this.requireRow(tenantId, runId, outcome.row_key);
    if (current.row_fingerprint !== outcome.fingerprint) throw errors.idempotency();
    if (outcome.target_name?.trim() && current.target_name && current.target_name !== outcome.target_name.trim()) throw errors.idempotency();
    const status = outcome.status;
    if ((status === "imported" || status === "updated") && current.status !== "applying") {
      throw errors.lifecycle(`Migration row cannot become ${status} from ${current.status}`);
    }
    if (status === "skipped" && current.intended_action !== "skip") {
      throw errors.lifecycle("Only a skip reservation can be recorded as skipped");
    }
    const targetName = outcome.target_name?.trim() || current.target_name;
    const result = await this.writer.prepare(
      `UPDATE migration_row_receipts
       SET status=?4,target_name=?5,error_text=?6,modified_at=?7
       WHERE tenant_id=?1 AND run_id=?2 AND row_key=?3`,
    ).bind(tenantId, runId, outcome.row_key, status, targetName, outcome.error ? boundedError(outcome.error) : null, now).run();
    if ((result.meta?.changes ?? 0) !== 1) throw errors.version();
    return (await this.getRow(tenantId, runId, outcome.row_key))!;
  }

  async getRow(tenantId: string, runId: string, rowKey: string): Promise<MigrationJournalRow | null> {
    const row = await this.writer.prepare(
      `SELECT row_key,source_row_number,row_fingerprint,target_doctype,target_name,intended_action,status,
              command_id,command_payload_hash,document_json,error_text,attempt_count,created_at,modified_at,staging_purged_at
       FROM migration_row_receipts WHERE tenant_id=?1 AND run_id=?2 AND row_key=?3`,
    ).bind(tenantId, runId, rowKey).first<JournalDbRow>();
    return row ? journalRow(row) : null;
  }

  async listRows(tenantId: string, runId: string): Promise<MigrationJournalRow[]> {
    const result = await this.writer.prepare(
      `SELECT row_key,source_row_number,row_fingerprint,target_doctype,target_name,intended_action,status,
              command_id,command_payload_hash,document_json,error_text,attempt_count,created_at,modified_at,staging_purged_at
       FROM migration_row_receipts WHERE tenant_id=?1 AND run_id=?2 ORDER BY source_row_number,row_key`,
    ).bind(tenantId, runId).all<JournalDbRow>();
    return (result.results ?? []).map(journalRow);
  }

  /**
   * Recovers an uncertain `applying` row from the kernel receipt. No receipt means the row
   * remains unresolved; callers must not silently convert that absence into a retry.
   */
  async recoverApplyingRow(
    tenantId: string,
    runId: string,
    rowKey: string,
    now: string,
  ): Promise<{ recovered: boolean; row: MigrationJournalRow; receipt?: MutationReceipt }> {
    const row = await this.requireRow(tenantId, runId, rowKey);
    if (row.status !== "applying" || !row.command_id) return { recovered: false, row };
    const receipt = await this.getKernelReceipt(tenantId, row.command_id);
    if (!receipt) return { recovered: false, row };
    if (receipt.aggregate.doctype !== row.target_doctype || receipt.aggregate.name !== row.target_name) {
      throw errors.database(`Migration command receipt does not match reserved target for row ${rowKey}`);
    }
    if (row.command_payload_hash && receipt.payload_hash !== row.command_payload_hash) throw errors.idempotency();
    const finalStatus = row.intended_action === "update" ? "updated" : "imported";
    const recovered = await this.recordOutcome(tenantId, runId, {
      row_key: row.row_key,
      fingerprint: row.row_fingerprint,
      status: finalStatus,
      target_name: row.target_name ?? receipt.aggregate.name,
    }, now);
    return { recovered: true, row: recovered, receipt };
  }

  async appendCheckpoint(
    tenantId: string,
    runId: string,
    checkpoint: MigrationCheckpoint,
    now: string,
  ): Promise<MigrationCheckpoint> {
    const current = await this.latestCheckpoint(tenantId, runId);
    const next = advanceMigrationCheckpoint(current, checkpoint);
    await this.writer.prepare(
      `INSERT INTO migration_checkpoints(tenant_id,run_id,sequence,cursor,batch_fingerprint,high_watermark,created_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7)`,
    ).bind(tenantId, runId, next.sequence, next.cursor, next.batch_fingerprint, next.high_watermark ?? null, now).run();
    return next;
  }

  async latestCheckpoint(tenantId: string, runId: string): Promise<MigrationCheckpoint | null> {
    const row = await this.writer.prepare(
      `SELECT sequence,cursor,batch_fingerprint,high_watermark
       FROM migration_checkpoints WHERE tenant_id=?1 AND run_id=?2 ORDER BY sequence DESC LIMIT 1`,
    ).bind(tenantId, runId).first<{ sequence: number; cursor: string; batch_fingerprint: string; high_watermark: string | null }>();
    if (!row) return null;
    const run = await this.getRun(tenantId, runId);
    if (!run) throw errors.database("Migration checkpoint references missing run");
    return {
      source_id: run.source_id,
      adapter: run.source_kind,
      sequence: row.sequence,
      cursor: row.cursor,
      batch_fingerprint: row.batch_fingerprint,
      ...(row.high_watermark ? { high_watermark: row.high_watermark } : {}),
    };
  }

  async recordReconciliation(
    tenantId: string,
    runId: string,
    snapshotId: string,
    metrics: readonly MigrationReconciliationMetric[],
    now: string,
  ): Promise<void> {
    if (!snapshotId.trim()) throw errors.validation("Migration reconciliation snapshot_id is required");
    if (!metrics.length) throw errors.validation("Migration reconciliation requires at least one metric");
    const statements = metrics.map((metric) => this.writer.prepare(
      `INSERT INTO migration_reconciliation_metrics(tenant_id,run_id,snapshot_id,metric,expected,actual,matches,created_at)
       VALUES(?1,?2,?3,?4,?5,?6,?7,?8)
       ON CONFLICT(tenant_id,run_id,snapshot_id,metric) DO UPDATE SET
         expected=excluded.expected,actual=excluded.actual,matches=excluded.matches,created_at=excluded.created_at`,
    ).bind(tenantId, runId, snapshotId, metric.metric, metric.expected, metric.actual, metric.matches ? 1 : 0, now));
    await this.db.batch(statements);
  }

  async purgeStaging(tenantId: string, runId: string, now: string): Promise<number> {
    const run = await this.getRun(tenantId, runId);
    if (!run) throw errors.notFound("Migration run not found");
    if (run.state !== "completed" && run.state !== "cancelled") {
      throw errors.lifecycle("Migration staging can be purged only after completion or cancellation");
    }
    const result = await this.writer.prepare(
      `UPDATE migration_row_receipts SET document_json=NULL,staging_purged_at=?3,modified_at=?3
       WHERE tenant_id=?1 AND run_id=?2 AND document_json IS NOT NULL`,
    ).bind(tenantId, runId, now).run();
    return result.meta?.changes ?? 0;
  }

  private async requireRow(tenantId: string, runId: string, rowKey: string): Promise<MigrationJournalRow> {
    const row = await this.getRow(tenantId, runId, rowKey);
    if (!row) throw errors.notFound("Migration row not found");
    return row;
  }

  private async getRunByPlanId(tenantId: string, planId: string): Promise<MigrationRunRecord | null> {
    const row = await this.writer.prepare(
      `SELECT run_id,plan_id,manifest_id,source_id,source_kind,source_fingerprint,target_doctype,
              duplicate_policy,key_field,mapping_json,state,started_by,created_at,modified_at,completed_at
       FROM migration_runs WHERE tenant_id=?1 AND plan_id=?2`,
    ).bind(tenantId, planId).first<RunRow>();
    return row ? runRecord(row) : null;
  }

  private async getKernelReceipt(tenantId: string, commandId: string): Promise<MutationReceipt | null> {
    const row = await this.writer.prepare(
      `SELECT command_id,tenant_id,actor_user_id,doctype,name,aggregate_version,payload_hash,committed_at,result_json
       FROM mutation_receipts WHERE tenant_id=?1 AND command_id=?2`,
    ).bind(tenantId, commandId).first<ReceiptDbRow>();
    if (!row) return null;
    return {
      command_id: row.command_id,
      tenant_id: row.tenant_id,
      actor_user_id: row.actor_user_id,
      aggregate: { doctype: row.doctype, name: row.name },
      aggregate_version: row.aggregate_version,
      payload_hash: row.payload_hash,
      committed_at: row.committed_at,
      result: JSON.parse(row.result_json) as JsonObject,
    };
  }
}

function assertRunMatches(run: MigrationRunRecord, plan: MigrationPlan): void {
  if (
    run.plan_id !== plan.plan_id
    || run.source_id !== plan.source_id
    || run.source_kind !== plan.source_kind
    || run.source_fingerprint !== plan.source_fingerprint
    || run.target_doctype !== plan.target_doctype
    || run.duplicate_policy !== plan.duplicate_policy
    || run.key_field !== plan.key_field
    || JSON.stringify(run.mapping) !== JSON.stringify(plan.mapping)
  ) throw errors.idempotency();
}

function runRecord(row: RunRow): MigrationRunRecord {
  return {
    run_id: row.run_id,
    plan_id: row.plan_id,
    manifest_id: row.manifest_id,
    source_id: row.source_id,
    source_kind: row.source_kind,
    source_fingerprint: row.source_fingerprint,
    target_doctype: row.target_doctype,
    duplicate_policy: row.duplicate_policy,
    key_field: row.key_field,
    mapping: JSON.parse(row.mapping_json) as Record<string, string | null>,
    state: row.state,
    started_by: row.started_by,
    created_at: row.created_at,
    modified_at: row.modified_at,
    completed_at: row.completed_at,
  };
}

function journalRow(row: JournalDbRow): MigrationJournalRow {
  return {
    row_key: row.row_key,
    source_row_number: row.source_row_number,
    row_fingerprint: row.row_fingerprint,
    target_doctype: row.target_doctype,
    target_name: row.target_name,
    intended_action: row.intended_action,
    status: row.status,
    command_id: row.command_id,
    command_payload_hash: row.command_payload_hash,
    document: row.document_json ? JSON.parse(row.document_json) as JsonObject : null,
    error: row.error_text,
    attempt_count: row.attempt_count,
    created_at: row.created_at,
    modified_at: row.modified_at,
    staging_purged_at: row.staging_purged_at,
  };
}

function boundedError(value: string): string {
  return value.trim().slice(0, 4000) || "Migration row failed";
}
