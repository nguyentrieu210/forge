import type { Actor, JsonObject, JsonValue } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";

const MAX_SOURCE_LINES = 5000;
const DAILY_LEDGER_ROLES = new Set([
  "General Accountant",
  "Chief Accountant",
  "Director",
  "Kế toán tổng hợp",
  "Kế toán trưởng",
  "Giám đốc",
]);

export interface DailyLedgerContext {
  ledger_date: string;
  company: string;
  warehouse?: string;
  customer?: string;
  sales_order?: string;
}

export interface DailyLedgerSourceLine {
  line_key: string;
  domain: "Sales" | "Purchase" | "Inventory" | "Manufacturing" | "Warranty" | "Finance";
  source_type: string;
  source_ref: string;
  metric: string;
  quantity_micros: number;
  amount_minor: number;
  currency: string;
  details_json: string;
}

export interface DailyLedgerSnapshotResult {
  snapshot_id: string;
  context_key: string;
  source_fingerprint: string;
  line_count: number;
  existing: boolean;
  frozen: boolean;
}

export interface DailyLedgerAdjustmentInput {
  adjustment_id: string;
  snapshot_id: string;
  line_key: string;
  reason: string;
  delta_quantity_micros?: number;
  delta_amount_minor?: number;
  details?: JsonObject;
}

export interface DailyLedgerReportRow extends Record<string, JsonValue> {
  snapshot_id: string;
  context_key: string;
  ledger_date: string;
  company: string;
  warehouse: string;
  customer: string;
  sales_order: string;
  line_key: string;
  domain: string;
  source_type: string;
  source_ref: string;
  metric: string;
  snapshot_quantity_micros: number;
  snapshot_amount_minor: number;
  adjusted_quantity_micros: number;
  adjusted_amount_minor: number;
  currency: string;
  adjustment_count: number;
}

export interface DailyLedgerReconciliationMismatch extends JsonObject {
  kind: "MISSING_IN_LIVE" | "MISSING_IN_SNAPSHOT" | "CHANGED";
  domain: string;
  line_key: string;
}

export interface DailyLedgerReconciliation extends JsonObject {
  ok: boolean;
  snapshot_id: string;
  context_key: string;
  snapshot_fingerprint: string;
  live_fingerprint: string;
  snapshot_counts: JsonObject;
  live_counts: JsonObject;
  mismatches: DailyLedgerReconciliationMismatch[];
  truncated: boolean;
}

interface SnapshotRecord {
  snapshot_id: string;
  context_key: string;
  source_fingerprint: string;
}

interface FreezeRecord extends SnapshotRecord {
  frozen_at: string;
}

interface ExistingAdjustment {
  snapshot_id: string;
  line_key: string;
  reason: string;
  actor_user_id: string;
  delta_quantity_micros: number;
  delta_amount_minor: number;
  details_json: string;
}

export class D1DailyDetailedLedgerService {
  constructor(private readonly db: D1Database) {}

  async generate(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerContext,
    now = new Date().toISOString(),
  ): Promise<DailyLedgerSnapshotResult> {
    assertOperator(actor);
    const context = normalizeContext(input);
    const contextKey = buildDailyLedgerContextKey(context);
    const lines = await this.loadSourceLines(tenantId, context);
    const sourceFingerprint = await fingerprintDailyLedgerLines(lines);

    const frozen = await this.db.prepare(
      `SELECT s.snapshot_id,s.context_key,s.source_fingerprint,f.frozen_at
       FROM daily_ledger_freezes f
       JOIN daily_ledger_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.context_key=?2`,
    ).bind(tenantId, contextKey).first<FreezeRecord>();
    if (frozen) {
      if (frozen.source_fingerprint !== sourceFingerprint) {
        throw errors.lifecycle("Daily ledger context is frozen; record an adjustment instead of regenerating it");
      }
      return {
        snapshot_id: frozen.snapshot_id,
        context_key: contextKey,
        source_fingerprint: sourceFingerprint,
        line_count: lines.length,
        existing: true,
        frozen: true,
      };
    }

    const existing = await this.db.prepare(
      `SELECT snapshot_id,context_key,source_fingerprint
       FROM daily_ledger_snapshots
       WHERE tenant_id=?1 AND context_key=?2 AND source_fingerprint=?3
       ORDER BY generated_at DESC LIMIT 1`,
    ).bind(tenantId, contextKey, sourceFingerprint).first<SnapshotRecord>();
    if (existing) {
      return {
        snapshot_id: existing.snapshot_id,
        context_key: contextKey,
        source_fingerprint: sourceFingerprint,
        line_count: lines.length,
        existing: true,
        frozen: false,
      };
    }

    const contextHash = await sha256Hex(contextKey);
    const snapshotId = `DLS-${context.ledger_date.replaceAll("-", "")}-${contextHash.slice(0, 12)}-${sourceFingerprint.slice(0, 12)}`;
    const statements: D1PreparedStatement[] = [
      this.db.prepare(
        `INSERT INTO daily_ledger_snapshots(
           tenant_id,snapshot_id,context_key,ledger_date,company,warehouse,customer,sales_order,
           source_fingerprint,generated_by,generated_at
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(
        tenantId,
        snapshotId,
        contextKey,
        context.ledger_date,
        context.company,
        context.warehouse,
        context.customer,
        context.sales_order,
        sourceFingerprint,
        actor.user_id,
        now,
      ),
    ];
    for (const line of lines) {
      statements.push(this.db.prepare(
        `INSERT INTO daily_ledger_snapshot_lines(
           tenant_id,snapshot_id,line_key,domain,source_type,source_ref,metric,
           quantity_micros,amount_minor,currency,details_json
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`,
      ).bind(
        tenantId,
        snapshotId,
        line.line_key,
        line.domain,
        line.source_type,
        line.source_ref,
        line.metric,
        line.quantity_micros,
        line.amount_minor,
        line.currency,
        line.details_json,
      ));
    }
    await this.db.batch(statements);
    return {
      snapshot_id: snapshotId,
      context_key: contextKey,
      source_fingerprint: sourceFingerprint,
      line_count: lines.length,
      existing: false,
      frozen: false,
    };
  }

  async freeze(
    tenantId: string,
    actor: Actor,
    snapshotId: string,
    reason = "",
    now = new Date().toISOString(),
  ): Promise<{ snapshot_id: string; context_key: string; existing: boolean }> {
    assertAdjustmentRole(actor);
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,context_key,source_fingerprint
       FROM daily_ledger_snapshots WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<SnapshotRecord>();
    if (!snapshot) throw errors.notFound("Daily ledger snapshot not found");

    const existing = await this.db.prepare(
      `SELECT s.snapshot_id,s.context_key,s.source_fingerprint,f.frozen_at
       FROM daily_ledger_freezes f
       JOIN daily_ledger_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.context_key=?2`,
    ).bind(tenantId, snapshot.context_key).first<FreezeRecord>();
    if (existing) {
      if (existing.snapshot_id !== normalizedSnapshotId) {
        throw errors.lifecycle("Daily ledger context is already frozen to another snapshot");
      }
      return { snapshot_id: normalizedSnapshotId, context_key: snapshot.context_key, existing: true };
    }

    await this.db.prepare(
      `INSERT INTO daily_ledger_freezes(tenant_id,context_key,snapshot_id,frozen_by,frozen_at,reason)
       VALUES(?1,?2,?3,?4,?5,?6)`,
    ).bind(tenantId, snapshot.context_key, normalizedSnapshotId, actor.user_id, now, reason.trim()).run();
    return { snapshot_id: normalizedSnapshotId, context_key: snapshot.context_key, existing: false };
  }

  async adjust(
    tenantId: string,
    actor: Actor,
    input: DailyLedgerAdjustmentInput,
    now = new Date().toISOString(),
  ): Promise<{ adjustment_id: string; existing: boolean }> {
    assertAdjustmentRole(actor);
    const adjustmentId = requireText(input.adjustment_id, "adjustment_id", 240);
    const snapshotId = requireText(input.snapshot_id, "snapshot_id", 240);
    const lineKey = requireText(input.line_key, "line_key", 500);
    const reason = requireText(input.reason, "reason", 1000);
    const deltaQuantity = safeInteger(input.delta_quantity_micros ?? 0, "delta_quantity_micros");
    const deltaAmount = safeInteger(input.delta_amount_minor ?? 0, "delta_amount_minor");
    if (deltaQuantity === 0 && deltaAmount === 0) throw errors.validation("Adjustment must change quantity or amount");
    const detailsJson = JSON.stringify(input.details ?? {});

    const existing = await this.db.prepare(
      `SELECT snapshot_id,line_key,reason,actor_user_id,delta_quantity_micros,delta_amount_minor,details_json
       FROM daily_ledger_adjustments WHERE tenant_id=?1 AND adjustment_id=?2`,
    ).bind(tenantId, adjustmentId).first<ExistingAdjustment>();
    if (existing) {
      const identical = existing.snapshot_id === snapshotId
        && existing.line_key === lineKey
        && existing.reason === reason
        && existing.actor_user_id === actor.user_id
        && Number(existing.delta_quantity_micros) === deltaQuantity
        && Number(existing.delta_amount_minor) === deltaAmount
        && existing.details_json === detailsJson;
      if (!identical) throw errors.idempotency();
      return { adjustment_id: adjustmentId, existing: true };
    }

    await this.db.prepare(
      `INSERT INTO daily_ledger_adjustments(
         tenant_id,adjustment_id,snapshot_id,line_key,reason,actor_user_id,created_at,
         delta_quantity_micros,delta_amount_minor,details_json
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
    ).bind(
      tenantId,
      adjustmentId,
      snapshotId,
      lineKey,
      reason,
      actor.user_id,
      now,
      deltaQuantity,
      deltaAmount,
      detailsJson,
    ).run();
    return { adjustment_id: adjustmentId, existing: false };
  }

  async read(tenantId: string, snapshotId: string): Promise<DailyLedgerReportRow[]> {
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const result = await this.db.prepare(
      `SELECT snapshot_id,context_key,ledger_date,company,warehouse,customer,sales_order,
              line_key,domain,source_type,source_ref,metric,
              snapshot_quantity_micros,snapshot_amount_minor,
              adjusted_quantity_micros,adjusted_amount_minor,currency,adjustment_count,
              frozen_by,frozen_at,details_json
       FROM daily_detailed_ledger_report
       WHERE tenant_id=?1 AND snapshot_id=?2
       ORDER BY domain,line_key`,
    ).bind(tenantId, normalizedSnapshotId).all<DailyLedgerReportRow>();
    return result.results ?? [];
  }

  async reconcile(tenantId: string, input: DailyLedgerContext): Promise<DailyLedgerReconciliation> {
    const context = normalizeContext(input);
    const contextKey = buildDailyLedgerContextKey(context);
    const snapshot = await this.db.prepare(
      `SELECT s.snapshot_id,s.context_key,s.source_fingerprint
       FROM daily_ledger_snapshots s
       LEFT JOIN daily_ledger_freezes f
         ON f.tenant_id=s.tenant_id AND f.snapshot_id=s.snapshot_id
       WHERE s.tenant_id=?1 AND s.context_key=?2
       ORDER BY CASE WHEN f.snapshot_id IS NULL THEN 1 ELSE 0 END, s.generated_at DESC
       LIMIT 1`,
    ).bind(tenantId, contextKey).first<SnapshotRecord>();
    if (!snapshot) throw errors.notFound("Daily ledger snapshot not found");

    const live = await this.loadSourceLines(tenantId, context);
    const liveFingerprint = await fingerprintDailyLedgerLines(live);
    const stored = await this.db.prepare(
      `SELECT line_key,domain,source_type,source_ref,metric,quantity_micros,amount_minor,currency,details_json
       FROM daily_ledger_snapshot_lines
       WHERE tenant_id=?1 AND snapshot_id=?2
       ORDER BY domain,line_key`,
    ).bind(tenantId, snapshot.snapshot_id).all<DailyLedgerSourceLine>();
    const snapshotLines = stored.results ?? [];
    const liveByKey = new Map(live.map((line) => [line.line_key, line]));
    const snapshotByKey = new Map(snapshotLines.map((line) => [line.line_key, normalizeSourceLine(line)]));
    const mismatches: DailyLedgerReconciliationMismatch[] = [];
    let truncated = false;

    for (const [key, line] of snapshotByKey) {
      const current = liveByKey.get(key);
      if (!current) pushMismatch(mismatches, { kind: "MISSING_IN_LIVE", domain: line.domain, line_key: key });
      else if (canonicalLine(line) !== canonicalLine(current)) {
        pushMismatch(mismatches, { kind: "CHANGED", domain: line.domain, line_key: key });
      }
      if (mismatches.length >= 100) { truncated = true; break; }
    }
    if (!truncated) {
      for (const [key, line] of liveByKey) {
        if (!snapshotByKey.has(key)) pushMismatch(mismatches, { kind: "MISSING_IN_SNAPSHOT", domain: line.domain, line_key: key });
        if (mismatches.length >= 100) { truncated = true; break; }
      }
    }

    return {
      ok: snapshot.source_fingerprint === liveFingerprint && mismatches.length === 0,
      snapshot_id: snapshot.snapshot_id,
      context_key: contextKey,
      snapshot_fingerprint: snapshot.source_fingerprint,
      live_fingerprint: liveFingerprint,
      snapshot_counts: domainCounts(snapshotLines.map(normalizeSourceLine)),
      live_counts: domainCounts(live),
      mismatches,
      truncated,
    };
  }

  private async loadSourceLines(tenantId: string, context: Required<DailyLedgerContext>): Promise<DailyLedgerSourceLine[]> {
    const result = await this.db.prepare(SOURCE_SQL).bind(
      tenantId,
      context.ledger_date,
      context.company,
      context.warehouse,
      context.customer,
      context.sales_order,
      MAX_SOURCE_LINES + 1,
    ).all<DailyLedgerSourceLine>();
    const raw = result.results ?? [];
    if (raw.length > MAX_SOURCE_LINES) throw errors.validation(`Daily ledger source exceeds ${MAX_SOURCE_LINES} lines`);
    return raw.map(normalizeSourceLine).sort((left, right) =>
      left.domain.localeCompare(right.domain) || left.line_key.localeCompare(right.line_key));
  }
}

export function buildDailyLedgerContextKey(input: DailyLedgerContext): string {
  const context = normalizeContext(input);
  return JSON.stringify([
    context.ledger_date,
    context.company,
    context.warehouse,
    context.customer,
    context.sales_order,
  ]);
}

export async function fingerprintDailyLedgerLines(lines: readonly DailyLedgerSourceLine[]): Promise<string> {
  const normalized = [...lines].map(normalizeSourceLine).sort((left, right) =>
    left.domain.localeCompare(right.domain) || left.line_key.localeCompare(right.line_key));
  return sha256Hex(JSON.stringify(normalized.map(canonicalLine)));
}

export function assertDailyLedgerAdjustmentRole(actor: Actor): void {
  assertAdjustmentRole(actor);
}

function assertOperator(actor: Actor): void {
  if (isAdministrator(actor) || actor.roles.some((role) => DAILY_LEDGER_ROLES.has(role))) return;
  throw errors.permission("Only General Accountant, Chief Accountant or Director may access the Daily Detailed Ledger");
}

function assertAdjustmentRole(actor: Actor): void {
  if (isAdministrator(actor) || actor.roles.some((role) => DAILY_LEDGER_ROLES.has(role))) return;
  throw errors.permission("Only General Accountant, Chief Accountant or Director may freeze or adjust the Daily Detailed Ledger");
}

function isAdministrator(actor: Actor): boolean {
  return actor.user_id === "Administrator"
    || actor.roles.includes("Administrator");
}

function normalizeContext(input: DailyLedgerContext): Required<DailyLedgerContext> {
  const ledgerDate = requireText(input.ledger_date, "ledger_date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ledgerDate) || Number.isNaN(Date.parse(`${ledgerDate}T00:00:00Z`))) {
    throw errors.validation("ledger_date must be a valid YYYY-MM-DD date");
  }
  const parsed = new Date(`${ledgerDate}T00:00:00Z`).toISOString().slice(0, 10);
  if (parsed !== ledgerDate) throw errors.validation("ledger_date must be a valid YYYY-MM-DD date");
  return {
    ledger_date: ledgerDate,
    company: requireText(input.company, "company", 240),
    warehouse: optionalText(input.warehouse, "warehouse", 240),
    customer: optionalText(input.customer, "customer", 240),
    sales_order: optionalText(input.sales_order, "sales_order", 240),
  };
}

function normalizeSourceLine(line: DailyLedgerSourceLine): DailyLedgerSourceLine {
  const domain = String(line.domain) as DailyLedgerSourceLine["domain"];
  if (!["Sales", "Purchase", "Inventory", "Manufacturing", "Warranty", "Finance"].includes(domain)) {
    throw errors.database("Daily ledger source returned an invalid domain");
  }
  return {
    line_key: String(line.line_key),
    domain,
    source_type: String(line.source_type),
    source_ref: String(line.source_ref),
    metric: String(line.metric),
    quantity_micros: Number(line.quantity_micros ?? 0),
    amount_minor: Number(line.amount_minor ?? 0),
    currency: String(line.currency ?? ""),
    details_json: String(line.details_json ?? "{}"),
  };
}

function canonicalLine(line: DailyLedgerSourceLine): string {
  return JSON.stringify([
    line.line_key,
    line.domain,
    line.source_type,
    line.source_ref,
    line.metric,
    line.quantity_micros,
    line.amount_minor,
    line.currency,
    line.details_json,
  ]);
}

function domainCounts(lines: readonly DailyLedgerSourceLine[]): JsonObject {
  const counts: Record<string, number> = { Sales: 0, Purchase: 0, Inventory: 0, Manufacturing: 0, Warranty: 0, Finance: 0 };
  for (const line of lines) counts[line.domain] = (counts[line.domain] ?? 0) + 1;
  return counts;
}

function pushMismatch(
  target: DailyLedgerReconciliationMismatch[],
  mismatch: DailyLedgerReconciliationMismatch,
): void {
  if (target.length < 100) target.push(mismatch);
}

function requireText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${field} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${field} must be non-empty and at most ${max} characters`);
  return normalized;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  return requireText(value, field, max);
}

function safeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${field} must be a safe integer`);
  return Number(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const SOURCE_SQL = `
WITH source_lines AS (
  SELECT
    'Sales:' || f.voucher_type || ':' || f.voucher_no || ':' || f.voucher_revision || ':' || f.line_key AS line_key,
    'Sales' AS domain,
    f.voucher_type AS source_type,
    f.voucher_no AS source_ref,
    f.kind AS metric,
    f.qty_micros AS quantity_micros,
    0 AS amount_minor,
    '' AS currency,
    json_object('sales_order',f.sales_order,'item_code',f.item_code,'posting_at',f.posting_at) AS details_json
  FROM sales_order_fulfillment_entries f
  JOIN documents so
    ON so.tenant_id=f.tenant_id AND so.doc_key='Sales Order:' || f.sales_order
  LEFT JOIN documents voucher
    ON voucher.tenant_id=f.tenant_id AND voucher.doc_key=f.voucher_type || ':' || f.voucher_no
  WHERE f.tenant_id=?1 AND date(f.posting_at)=date(?2)
    AND json_extract(so.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(voucher.payload_json,'$.warehouse')=?4
               OR json_extract(voucher.payload_json,'$.set_warehouse')=?4
               OR json_extract(voucher.payload_json,'$.target_warehouse')=?4)
    AND (?5='' OR json_extract(so.payload_json,'$.customer')=?5)
    AND (?6='' OR f.sales_order=?6)

  UNION ALL

  SELECT
    'Sales:Sales Order:' || d.name || ':' || c.row_id,
    'Sales',
    'Sales Order',
    d.name,
    'ordered',
    COALESCE(CAST(json_extract(c.payload_json,'$.qty_micros') AS INTEGER),0),
    COALESCE(CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER),0),
    COALESCE(json_extract(d.payload_json,'$.currency'),''),
    json_object(
      'sales_order',d.name,
      'item_code',json_extract(c.payload_json,'$.item_code'),
      'customer',json_extract(d.payload_json,'$.customer'),
      'delivery_date',json_extract(d.payload_json,'$.delivery_date'),
      'unfulfilled',CASE WHEN COALESCE(CAST(json_extract(d.payload_json,'$.delivered_percentage') AS REAL),0) < 100 THEN 1 ELSE 0 END
    )
  FROM documents d
  JOIN document_children c
    ON c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items'
  WHERE d.tenant_id=?1 AND d.docstatus=1 AND d.doctype='Sales Order'
    AND date(COALESCE(json_extract(d.payload_json,'$.transaction_date'),d.modified_at))=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(c.payload_json,'$.warehouse')=?4 OR json_extract(d.payload_json,'$.set_warehouse')=?4)
    AND (?5='' OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR d.name=?6)

  UNION ALL

  SELECT
    'Purchase:' || d.doctype || ':' || d.name || ':' || c.row_id,
    'Purchase',
    d.doctype,
    d.name,
    'item',
    COALESCE(CAST(json_extract(c.payload_json,'$.qty_micros') AS INTEGER),0),
    COALESCE(CAST(json_extract(c.payload_json,'$.amount_minor') AS INTEGER),0),
    COALESCE(json_extract(d.payload_json,'$.currency'),''),
    json_object(
      'item_code',json_extract(c.payload_json,'$.item_code'),
      'warehouse',COALESCE(json_extract(c.payload_json,'$.warehouse'),json_extract(d.payload_json,'$.set_warehouse')),
      'supplier',json_extract(d.payload_json,'$.supplier')
    )
  FROM documents d
  JOIN document_children c
    ON c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items'
  WHERE d.tenant_id=?1 AND d.docstatus=1
    AND d.doctype IN ('Purchase Order','Purchase Receipt','Purchase Invoice')
    AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),json_extract(d.payload_json,'$.transaction_date'),d.modified_at))=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(c.payload_json,'$.warehouse')=?4 OR json_extract(d.payload_json,'$.set_warehouse')=?4)
    AND (?5='' OR json_extract(c.payload_json,'$.customer')=?5 OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(c.payload_json,'$.sales_order')=?6 OR json_extract(d.payload_json,'$.sales_order')=?6)

  UNION ALL

  SELECT
    'Inventory:' || s.voucher_type || ':' || s.voucher_no || ':' || s.voucher_revision || ':' || s.line_key,
    'Inventory',
    s.voucher_type,
    s.voucher_no,
    'stock_value_difference',
    s.actual_qty_micros,
    s.stock_value_difference_minor,
    s.currency,
    json_object('item_code',s.item_code,'warehouse',s.warehouse,'batch_no',s.batch_no,'serial_no',s.serial_no,'posting_at',s.posting_at)
  FROM stock_ledger_entries s
  JOIN documents d
    ON d.tenant_id=s.tenant_id AND d.doc_key=s.voucher_type || ':' || s.voucher_no
  WHERE s.tenant_id=?1 AND date(s.posting_at)=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR s.warehouse=?4)
    AND (?5='' OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(d.payload_json,'$.sales_order')=?6)

  UNION ALL

  SELECT
    'Manufacturing:' || d.doctype || ':' || d.name,
    'Manufacturing',
    d.doctype,
    d.name,
    'document',
    COALESCE(
      CAST(json_extract(d.payload_json,'$.qty_micros') AS INTEGER),
      CAST(json_extract(d.payload_json,'$.planned_qty_micros') AS INTEGER),
      CAST(json_extract(d.payload_json,'$.production_qty_micros') AS INTEGER),
      0
    ),
    0,
    COALESCE(json_extract(d.payload_json,'$.currency'),''),
    json_object(
      'status',d.status,
      'warehouse',COALESCE(json_extract(d.payload_json,'$.target_warehouse'),json_extract(d.payload_json,'$.warehouse')),
      'sales_order',json_extract(d.payload_json,'$.sales_order')
    )
  FROM documents d
  WHERE d.tenant_id=?1 AND d.docstatus=1
    AND d.doctype IN ('Production Request','Production Plan','Work Order','Job Card','Paint Job')
    AND date(COALESCE(json_extract(d.payload_json,'$.posting_at'),json_extract(d.payload_json,'$.planned_start_date'),d.modified_at))=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(d.payload_json,'$.target_warehouse')=?4 OR json_extract(d.payload_json,'$.warehouse')=?4)
    AND (?5='' OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(d.payload_json,'$.sales_order')=?6)

  UNION ALL

  SELECT
    'Warranty:' || d.name,
    'Warranty',
    d.doctype,
    d.name,
    COALESCE(json_extract(d.payload_json,'$.issue_cause'),'warranty_claim'),
    CAST(ROUND(COALESCE(CAST(json_extract(d.payload_json,'$.received_fault_qty') AS REAL),0) * 1000000) AS INTEGER),
    0,
    '',
    json_object(
      'customer',json_extract(d.payload_json,'$.customer'),
      'legacy_voucher',json_extract(d.payload_json,'$.legacy_voucher'),
      'received_fault_on',json_extract(d.payload_json,'$.received_fault_on'),
      'replacement_sent_on',json_extract(d.payload_json,'$.replacement_sent_on'),
      'warranty_sent_on',json_extract(d.payload_json,'$.warranty_sent_on'),
      'warranty_received_on',json_extract(d.payload_json,'$.warranty_received_on'),
      'debt_offset_on',json_extract(d.payload_json,'$.debt_offset_on')
    )
  FROM documents d
  WHERE d.tenant_id=?1 AND d.doctype='Warranty Claim'
    AND (
      date(json_extract(d.payload_json,'$.received_fault_on'))=date(?2)
      OR date(json_extract(d.payload_json,'$.replacement_sent_on'))=date(?2)
      OR date(json_extract(d.payload_json,'$.warranty_sent_on'))=date(?2)
      OR date(json_extract(d.payload_json,'$.warranty_received_on'))=date(?2)
      OR date(json_extract(d.payload_json,'$.debt_offset_on'))=date(?2)
    )
    AND (json_extract(d.payload_json,'$.company') IS NULL OR json_extract(d.payload_json,'$.company')='' OR json_extract(d.payload_json,'$.company')=?3)
    AND (?4='' OR json_extract(d.payload_json,'$.warehouse')=?4)
    AND (?5='' OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(d.payload_json,'$.sales_order')=?6 OR json_extract(d.payload_json,'$.legacy_voucher')=?6)

  UNION ALL

  SELECT
    'Finance:PLE:' || p.voucher_type || ':' || p.voucher_no || ':' || p.voucher_revision || ':' || p.line_key,
    'Finance',
    p.voucher_type,
    p.voucher_no,
    p.account_type,
    0,
    p.amount_minor,
    p.currency,
    json_object('party_type',p.party_type,'party',p.party,'account',p.account,'against_voucher_type',p.against_voucher_type,'against_voucher_no',p.against_voucher_no,'posting_at',p.posting_at)
  FROM payment_ledger_entries p
  JOIN documents d
    ON d.tenant_id=p.tenant_id AND d.doc_key=p.voucher_type || ':' || p.voucher_no
  WHERE p.tenant_id=?1 AND date(p.posting_at)=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(d.payload_json,'$.warehouse')=?4 OR json_extract(d.payload_json,'$.set_warehouse')=?4)
    AND (?5='' OR p.party=?5 OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(d.payload_json,'$.sales_order')=?6)

  UNION ALL

  SELECT
    'Finance:GL:' || g.voucher_type || ':' || g.voucher_no || ':' || g.voucher_revision || ':' || g.line_key,
    'Finance',
    g.voucher_type,
    g.voucher_no,
    'gl_net',
    0,
    g.debit_minor-g.credit_minor,
    g.currency,
    json_object('account',g.account,'party_type',g.party_type,'party',g.party,'cost_center',g.cost_center,'posting_at',g.posting_at)
  FROM gl_entries g
  JOIN documents d
    ON d.tenant_id=g.tenant_id AND d.doc_key=g.voucher_type || ':' || g.voucher_no
  WHERE g.tenant_id=?1 AND date(g.posting_at)=date(?2)
    AND json_extract(d.payload_json,'$.company')=?3
    AND (?4='' OR json_extract(d.payload_json,'$.warehouse')=?4 OR json_extract(d.payload_json,'$.set_warehouse')=?4)
    AND (?5='' OR g.party=?5 OR json_extract(d.payload_json,'$.customer')=?5)
    AND (?6='' OR json_extract(d.payload_json,'$.sales_order')=?6)
)
SELECT line_key,domain,source_type,source_ref,metric,quantity_micros,amount_minor,currency,details_json
FROM source_lines
ORDER BY domain,line_key
LIMIT ?7`;
