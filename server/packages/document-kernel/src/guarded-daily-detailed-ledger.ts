import type { Actor } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  D1DailyDetailedLedgerService,
  assertDailyLedgerAdjustmentRole,
  type DailyLedgerAdjustmentInput,
  type DailyLedgerContext,
  type DailyLedgerReconciliation,
  type DailyLedgerReportRow,
  type DailyLedgerSnapshotResult,
} from "./daily-detailed-ledger.js";

interface DailyLedgerDelegate {
  generate(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerContext,
    now?: string,
  ): Promise<DailyLedgerSnapshotResult>;
  read(tenantId: string, snapshotId: string): Promise<DailyLedgerReportRow[]>;
  reconcile(tenantId: string, input: DailyLedgerContext): Promise<DailyLedgerReconciliation>;
  freeze(
    tenantId: string,
    actor: Actor,
    snapshotId: string,
    reason?: string,
    now?: string,
  ): Promise<{ snapshot_id: string; context_key: string; existing: boolean }>;
  adjust(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerAdjustmentInput,
    now?: string,
  ): Promise<{ adjustment_id: string; existing: boolean }>;
}

interface SnapshotContextRecord {
  snapshot_id: string;
  context_key: string;
  source_fingerprint: string;
  ledger_date: string;
  company: string;
  warehouse: string;
  customer: string;
  sales_order: string;
}

interface FrozenContextRecord {
  snapshot_id: string;
}

/**
 * Business guard around the immutable Daily Detailed Ledger store.
 *
 * The original storage service already made snapshots/freeze/adjustments immutable,
 * but a caller could reconcile a snapshot, let source documents change, then freeze
 * the stale snapshot. This wrapper closes that gap at the service boundary used by the
 * tenant API: immediately before the first freeze it regenerates the current immutable
 * snapshot for the exact stored context and only freezes when the requested snapshot is
 * still the current fingerprint.
 *
 * `generate()` is deliberately used rather than trusting a client reconciliation token.
 * If source data changed, a new immutable snapshot may be prepared as a side effect and
 * the freeze is rejected. The next normal "Cập nhật sổ" therefore opens that exact
 * current snapshot instead of recomputing a competing representation.
 *
 * An already-completed freeze remains idempotent. We do not re-evaluate live sources on
 * a retry after the context is frozen; post-freeze changes belong to append-only
 * adjustments and must not make the original freeze command impossible to replay.
 */
export class D1GuardedDailyDetailedLedgerService {
  private readonly delegate: DailyLedgerDelegate;

  constructor(
    private readonly db: D1Database,
    delegate?: DailyLedgerDelegate,
  ) {
    this.delegate = delegate ?? new D1DailyDetailedLedgerService(db);
  }

  generate(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerContext,
  ): Promise<DailyLedgerSnapshotResult> {
    return this.delegate.generate(tenantId, actor, input);
  }

  read(tenantId: string, snapshotId: string): Promise<DailyLedgerReportRow[]> {
    return this.delegate.read(tenantId, snapshotId);
  }

  reconcile(tenantId: string, input: DailyLedgerContext): Promise<DailyLedgerReconciliation> {
    return this.delegate.reconcile(tenantId, input);
  }

  async freeze(
    tenantId: string,
    actor: Actor,
    snapshotId: string,
    reason = "",
    now = new Date().toISOString(),
  ): Promise<{ snapshot_id: string; context_key: string; existing: boolean }> {
    // Fail permission before any snapshot lookup so unauthorized callers cannot use the
    // freeze route as a document-existence oracle.
    assertDailyLedgerAdjustmentRole(actor);
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,context_key,source_fingerprint,ledger_date,company,warehouse,customer,sales_order
       FROM daily_ledger_snapshots
       WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<SnapshotContextRecord>();
    if (!snapshot) throw errors.notFound("Daily ledger snapshot not found");

    const frozen = await this.db.prepare(
      `SELECT snapshot_id
       FROM daily_ledger_freezes
       WHERE tenant_id=?1 AND context_key=?2`,
    ).bind(tenantId, snapshot.context_key).first<FrozenContextRecord>();
    if (frozen) {
      // Delegate owns the canonical idempotent-same-snapshot / conflict-other-snapshot
      // result and keeps this wrapper from duplicating lifecycle semantics.
      return this.delegate.freeze(tenantId, actor, normalizedSnapshotId, reason, now);
    }

    const current = await this.delegate.generate(tenantId, actor, {
      ledger_date: snapshot.ledger_date,
      company: snapshot.company,
      warehouse: snapshot.warehouse,
      customer: snapshot.customer,
      sales_order: snapshot.sales_order,
    }, now);

    if (
      current.snapshot_id !== normalizedSnapshotId
      || current.source_fingerprint !== snapshot.source_fingerprint
    ) {
      throw errors.lifecycle(
        "Daily ledger source changed after this snapshot; review and reconcile the current snapshot before freezing",
      );
    }

    return this.delegate.freeze(tenantId, actor, normalizedSnapshotId, reason, now);
  }

  adjust(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerAdjustmentInput,
  ): Promise<{ adjustment_id: string; existing: boolean }> {
    return this.delegate.adjust(tenantId, actor, input);
  }
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw errors.validation(`${field} must be non-empty and at most ${max} characters`);
  }
  return normalized;
}
