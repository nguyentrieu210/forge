import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  D1ManufacturingCostingService as BaseManufacturingCostingService,
  type ManufacturingCostAdjustmentInput,
  type ManufacturingCostSheet,
  type ManufacturingCostSnapshotResult,
  type ManufacturingOperationCostRow,
} from "./manufacturing-costing-base.js";

const COST_CLOSE_ROLES = new Set([
  "Chief Accountant",
  "Director",
  "Kế toán tổng hợp",
  "Kế toán trưởng",
  "Giám đốc",
  "System Manager",
]);

interface WorkOrderRow { payload_json: string }

export interface ManufacturingWipLedgerRow {
  warehouse: string;
  line_key: string;
  stock_value_difference_minor: number;
  purpose: string;
}

interface JobCardRow { name: string; payload_json: string }

interface SnapshotRow {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  sheet_json: string;
  generated_by: string;
  generated_at: string;
}

interface FreezeRow {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  frozen_at: string;
}

interface AdjustmentRow {
  adjustment_id: string;
  snapshot_id: string;
  category: string;
  delta_amount_minor: number;
  reason: string;
  actor_user_id: string;
  details_json: string;
}

interface AdjustmentTotalRow { total_minor: number }

export interface OperationProgressCost {
  operation: string;
  completed_qty_micros: number;
  total_cost_minor: number;
}

export interface ManufacturingWipState extends JsonObject {
  material_wip_stock_value_minor: number;
  material_wip_warehouses: string[];
  material_wip_source: "WORK_ORDER_WIP" | "TRANSFER_TARGETS" | "DIRECT_CONSUMPTION";
}

/**
 * Costing facade layered over the already validated costing implementation.
 *
 * The base service remains the authority for standards, rate selection, material
 * consumption, immutable snapshot reads and adjustment aggregation. This facade tightens
 * production-close semantics without introducing a second stock or accounting ledger.
 *
 * Inventory policy is explicit: manufacture capitalization stays on Forge's existing
 * ACTUAL_MATERIAL + STANDARD_OPERATION rule. The Cost Sheet reports ACTUAL operation cost
 * and the resulting manufacturing variance. We intentionally do not retroactively mutate
 * stock value here: once a finished unit has moved or been delivered, changing only its old
 * finished-warehouse value without replaying downstream valuation/COGS is financially wrong.
 * The Finance/Daily-Ledger layer can post the frozen variance with an explicit account policy.
 */
export class D1ExactManufacturingCostingService {
  private readonly base: BaseManufacturingCostingService;

  constructor(private readonly db: D1Database) {
    this.base = new BaseManufacturingCostingService(db);
  }

  async preview(tenantId: string, actor: Actor, workOrder: string): Promise<ManufacturingCostSheet> {
    const normalizedWorkOrder = requireText(workOrder, "work_order", 240);
    const baseSheet = await this.base.preview(tenantId, actor, normalizedWorkOrder);
    return this.enhanceLiveSheet(tenantId, normalizedWorkOrder, baseSheet);
  }

  async generate(
    tenantId: string,
    actor: Actor,
    workOrder: string,
    now = new Date().toISOString(),
  ): Promise<ManufacturingCostSnapshotResult> {
    const normalizedWorkOrder = requireText(workOrder, "work_order", 240);
    const sheet = await this.preview(tenantId, actor, normalizedWorkOrder);

    const frozen = await this.db.prepare(
      `SELECT s.snapshot_id,s.work_order,s.source_fingerprint,f.frozen_at
       FROM manufacturing_cost_freezes f
       JOIN manufacturing_cost_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.work_order=?2`,
    ).bind(tenantId, normalizedWorkOrder).first<FreezeRow>();
    if (frozen) {
      if (frozen.source_fingerprint !== sheet.source_fingerprint) {
        throw errors.lifecycle("Manufacturing cost sheet is frozen; record an append-only adjustment instead of regenerating it");
      }
      return {
        snapshot_id: frozen.snapshot_id,
        work_order: normalizedWorkOrder,
        source_fingerprint: sheet.source_fingerprint,
        existing: true,
        frozen: true,
      };
    }

    const existing = await this.db.prepare(
      `SELECT snapshot_id,work_order,source_fingerprint,sheet_json,generated_by,generated_at
       FROM manufacturing_cost_snapshots
       WHERE tenant_id=?1 AND work_order=?2 AND source_fingerprint=?3
       ORDER BY generated_at DESC LIMIT 1`,
    ).bind(tenantId, normalizedWorkOrder, sheet.source_fingerprint).first<SnapshotRow>();
    if (existing) {
      return {
        snapshot_id: existing.snapshot_id,
        work_order: normalizedWorkOrder,
        source_fingerprint: sheet.source_fingerprint,
        existing: true,
        frozen: false,
      };
    }

    const workOrderHash = await sha256Hex(normalizedWorkOrder);
    const snapshotId = `MCS-${workOrderHash.slice(0, 12)}-${sheet.source_fingerprint.slice(0, 12)}`;
    const insert = await this.db.prepare(
      `INSERT OR IGNORE INTO manufacturing_cost_snapshots(
         tenant_id,snapshot_id,work_order,company,currency,currency_scale,target_qty_micros,produced_qty_micros,
         standard_total_cost_minor,actual_total_cost_minor,estimated_wip_cost_minor,valuation_adjustment_minor,
         total_variance_minor,source_fingerprint,sheet_json,generated_by,generated_at
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)`,
    ).bind(
      tenantId,
      snapshotId,
      normalizedWorkOrder,
      sheet.company,
      sheet.currency,
      sheet.currency_scale,
      sheet.target_qty_micros,
      sheet.produced_qty_micros,
      sheet.standard_total_cost_for_completed_minor,
      sheet.actual_total_cost_to_date_minor,
      sheet.estimated_wip_cost_minor,
      sheet.valuation_adjustment_to_actual_minor,
      sheet.total_variance_minor,
      sheet.source_fingerprint,
      JSON.stringify(sheet),
      actor.user_id,
      now,
    ).run();
    const changes = Number((insert.meta as { changes?: number } | undefined)?.changes ?? 0);
    return {
      snapshot_id: snapshotId,
      work_order: normalizedWorkOrder,
      source_fingerprint: sheet.source_fingerprint,
      existing: changes === 0,
      frozen: false,
    };
  }

  async read(tenantId: string, actor: Actor, snapshotId: string): Promise<JsonObject> {
    return this.base.read(tenantId, actor, snapshotId);
  }

  async freeze(
    tenantId: string,
    actor: Actor,
    snapshotId: string,
    reason = "",
    now = new Date().toISOString(),
  ): Promise<{ snapshot_id: string; work_order: string; existing: boolean }> {
    assertCostClose(actor);
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,work_order,source_fingerprint,sheet_json,generated_by,generated_at
       FROM manufacturing_cost_snapshots WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<SnapshotRow>();
    if (!snapshot) throw errors.notFound("Manufacturing cost snapshot not found");

    const existing = await this.db.prepare(
      `SELECT s.snapshot_id,s.work_order,s.source_fingerprint,f.frozen_at
       FROM manufacturing_cost_freezes f
       JOIN manufacturing_cost_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.work_order=?2`,
    ).bind(tenantId, snapshot.work_order).first<FreezeRow>();
    if (existing) {
      if (existing.snapshot_id !== normalizedSnapshotId) {
        throw errors.lifecycle("Manufacturing cost is already frozen to another snapshot");
      }
      return { snapshot_id: normalizedSnapshotId, work_order: snapshot.work_order, existing: true };
    }

    const live = await this.preview(tenantId, actor, snapshot.work_order);
    assertFreezeFingerprint(snapshot.source_fingerprint, live.source_fingerprint);
    return this.base.freeze(tenantId, actor, normalizedSnapshotId, reason, now);
  }

  async adjust(
    tenantId: string,
    actor: Actor,
    input: ManufacturingCostAdjustmentInput,
    now = new Date().toISOString(),
  ): Promise<{ adjustment_id: string; existing: boolean }> {
    const adjustmentId = requireText(input.adjustment_id, "adjustment_id", 240);
    const before = await this.db.prepare(
      `SELECT adjustment_id,snapshot_id,category,delta_amount_minor,reason,actor_user_id,details_json
       FROM manufacturing_cost_adjustments WHERE tenant_id=?1 AND adjustment_id=?2`,
    ).bind(tenantId, adjustmentId).first<AdjustmentRow>();
    if (!before) await this.assertAdjustmentKeepsCostNonNegative(tenantId, input);

    const result = await this.base.adjust(tenantId, actor, input, now);
    const stored = await this.db.prepare(
      `SELECT adjustment_id,snapshot_id,category,delta_amount_minor,reason,actor_user_id,details_json
       FROM manufacturing_cost_adjustments WHERE tenant_id=?1 AND adjustment_id=?2`,
    ).bind(tenantId, adjustmentId).first<AdjustmentRow>();
    if (!stored) throw errors.database("Manufacturing cost adjustment could not be verified after write");
    const expectedDetails = input.details ?? {};
    let storedDetails: unknown;
    try {
      storedDetails = JSON.parse(stored.details_json);
    } catch {
      throw errors.database("Manufacturing cost adjustment contains invalid details JSON");
    }
    const identical = stored.snapshot_id === input.snapshot_id
      && stored.category === input.category
      && Number(stored.delta_amount_minor) === input.delta_amount_minor
      && stored.reason === input.reason.trim()
      && stored.actor_user_id === actor.user_id
      && canonicalize(storedDetails) === canonicalize(expectedDetails);
    if (!identical) throw errors.idempotency();
    return result;
  }

  private async assertAdjustmentKeepsCostNonNegative(
    tenantId: string,
    input: ManufacturingCostAdjustmentInput,
  ): Promise<void> {
    const snapshotId = requireText(input.snapshot_id, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,work_order,source_fingerprint,sheet_json,generated_by,generated_at
       FROM manufacturing_cost_snapshots WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, snapshotId).first<SnapshotRow>();
    if (!snapshot) throw errors.notFound("Manufacturing cost snapshot not found");
    const sheet = parseObject(snapshot.sheet_json, "manufacturing cost snapshot") as unknown as ManufacturingCostSheet;
    const totals = await this.db.prepare(
      `SELECT COALESCE(SUM(delta_amount_minor),0) AS total_minor
       FROM manufacturing_cost_adjustments WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, snapshotId).first<AdjustmentTotalRow>();
    const existingAdjustments = safeInteger(totals?.total_minor ?? 0, "adjustment_total_minor");
    const delta = safeInteger(input.delta_amount_minor, "delta_amount_minor");
    const prospective = safeAdd(safeAdd(sheet.actual_total_cost_to_date_minor, existingAdjustments), delta);
    if (prospective < 0) throw errors.validation("Manufacturing cost adjustments cannot make total actual cost negative");
  }

  private async enhanceLiveSheet(
    tenantId: string,
    workOrder: string,
    sheet: ManufacturingCostSheet,
  ): Promise<ManufacturingCostSheet> {
    const [workOrderRow, ledgerResult, jobCardResult] = await Promise.all([
      this.db.prepare(
        `SELECT payload_json FROM documents
         WHERE tenant_id=?1 AND doctype='Work Order' AND name=?2 AND docstatus=1 LIMIT 1`,
      ).bind(tenantId, workOrder).first<WorkOrderRow>(),
      this.db.prepare(
        `SELECT s.warehouse,s.line_key,s.stock_value_difference_minor,
                COALESCE(json_extract(d.payload_json,'$.purpose'),'') AS purpose
         FROM stock_ledger_entries s
         JOIN documents d ON d.tenant_id=s.tenant_id AND d.doctype=s.voucher_type AND d.name=s.voucher_no
         WHERE s.tenant_id=?1 AND s.voucher_type='Stock Entry' AND d.docstatus=1
           AND json_extract(d.payload_json,'$.work_order')=?2
         ORDER BY s.posting_at,s.voucher_no,s.line_key`,
      ).bind(tenantId, workOrder).all<ManufacturingWipLedgerRow>(),
      this.db.prepare(
        `SELECT name,payload_json FROM documents
         WHERE tenant_id=?1 AND doctype='Job Card' AND docstatus=1
           AND json_extract(payload_json,'$.work_order')=?2
         ORDER BY modified_at,name`,
      ).bind(tenantId, workOrder).all<JobCardRow>(),
    ]);
    if (!workOrderRow) throw errors.notFound(`Submitted Work Order ${workOrder} not found`);

    const workOrderData = parseObject(workOrderRow.payload_json, `Work Order ${workOrder}`);
    const explicitWipWarehouse = optionalText(workOrderData.wip_warehouse, 240);
    const wip = deriveMaterialWipState(explicitWipWarehouse, ledgerResult.results ?? []);

    const completedByCard = new Map<string, number>();
    for (const row of jobCardResult.results ?? []) {
      const data = parseObject(row.payload_json, `Job Card ${row.name}`);
      const completed = safeInteger(data.completed_qty_micros ?? 0, `Job Card ${row.name} completed_qty_micros`);
      if (completed < 0) throw errors.misconfigured(`Job Card ${row.name} has negative completed quantity`);
      completedByCard.set(row.name, completed);
    }
    const operationProgress: OperationProgressCost[] = (sheet.operation_rows as ManufacturingOperationCostRow[]).map((row) => {
      const completed = completedByCard.get(row.job_card) ?? 0;
      if (row.total_cost_minor > 0 && completed <= 0) throw errors.misconfigured(`Costed Job Card ${row.job_card} has no completed quantity`);
      return {
        operation: row.operation,
        completed_qty_micros: completed,
        total_cost_minor: safeInteger(row.total_cost_minor, `Job Card ${row.job_card} total_cost_minor`),
      };
    });
    const operationWip = calculateOperationWipEstimate(sheet.produced_qty_micros, operationProgress);
    const actualMaterialFinished = safeInteger(sheet.actual_material_cost_to_date_minor, "actual_material_cost_to_date_minor");
    const actualOperation = safeInteger(sheet.actual_operation_cost_to_date_minor, "actual_operation_cost_to_date_minor");
    const operationFinished = safeAdd(actualOperation, -operationWip);
    if (operationFinished < 0) throw errors.misconfigured("Operation WIP exceeds actual operation cost");
    const allocatedFinished = safeAdd(actualMaterialFinished, operationFinished);
    const estimatedWip = safeAdd(wip.material_wip_stock_value_minor, operationWip);
    const finishedStockValue = safeInteger(sheet.finished_stock_value_minor, "finished_stock_value_minor");
    const unitCost = sheet.produced_qty_micros > 0
      ? safeNumber(divideRounded(BigInt(allocatedFinished) * 1_000_000n, BigInt(sheet.produced_qty_micros)))
      : 0;
    const manufacturingVariance = safeAdd(allocatedFinished, -finishedStockValue);

    const enhanced = {
      ...sheet,
      actual_cost_allocated_to_finished_minor: allocatedFinished,
      estimated_wip_cost_minor: estimatedWip,
      valuation_adjustment_to_actual_minor: manufacturingVariance,
      actual_unit_cost_minor: unitCost,
      material_wip_stock_value_minor: wip.material_wip_stock_value_minor,
      material_wip_warehouses: wip.material_wip_warehouses,
      material_wip_source: wip.material_wip_source,
      operation_wip_estimate_minor: operationWip,
      operation_wip_is_estimate: operationWip !== 0,
      work_order_cost_exposure_minor: safeAdd(sheet.actual_total_cost_to_date_minor, wip.material_wip_stock_value_minor),
      wip_cost_basis: "EXACT_MATERIAL_STOCK_FLOW_PLUS_OPERATION_PROGRESS_ESTIMATE",
      inventory_costing_policy: "ACTUAL_MATERIAL_STANDARD_OPERATION",
      manufacturing_cost_variance_minor: manufacturingVariance,
      inventory_revaluation_required: false,
      variance_posting_status: manufacturingVariance === 0 ? "NOT_REQUIRED" : "UNPOSTED_FINANCE_VARIANCE",
      ready_to_finalize: sheet.ready_to_finalize === true
        && wip.material_wip_stock_value_minor === 0
        && operationWip === 0,
    } as ManufacturingCostSheet;
    const { source_fingerprint: _baseFingerprint, ...unsigned } = enhanced;
    return { ...enhanced, source_fingerprint: await sha256Hex(canonicalize(unsigned)) } as ManufacturingCostSheet;
  }
}

export function deriveMaterialWipState(
  explicitWipWarehouse: string,
  ledger: readonly ManufacturingWipLedgerRow[],
): ManufacturingWipState {
  const transferTargets = new Set(
    ledger
      .filter((row) => row.purpose === "Material Transfer" && row.line_key.startsWith("TGT-") && row.stock_value_difference_minor > 0)
      .map((row) => requireText(row.warehouse, "warehouse", 240)),
  );
  const warehouses = new Set<string>();
  let source: ManufacturingWipState["material_wip_source"] = "DIRECT_CONSUMPTION";
  if (explicitWipWarehouse) {
    warehouses.add(explicitWipWarehouse);
    source = "WORK_ORDER_WIP";
    for (const warehouse of transferTargets) {
      if (warehouse !== explicitWipWarehouse) {
        throw errors.misconfigured(`Material Transfer target ${warehouse} does not match Work Order WIP warehouse ${explicitWipWarehouse}`);
      }
    }
  } else if (transferTargets.size > 0) {
    for (const warehouse of transferTargets) warehouses.add(warehouse);
    source = "TRANSFER_TARGETS";
  }

  let value = 0;
  for (const row of ledger) {
    if (!warehouses.has(row.warehouse)) continue;
    value = safeAdd(value, safeInteger(row.stock_value_difference_minor, "stock_value_difference_minor"));
  }
  if (value < 0) throw errors.misconfigured("Work Order WIP stock value is negative; transfer/consumption lineage must be reconciled before costing");
  return {
    material_wip_stock_value_minor: value,
    material_wip_warehouses: [...warehouses].sort(),
    material_wip_source: source,
  };
}

export function calculateOperationWipEstimate(
  producedQtyMicros: number,
  rows: readonly OperationProgressCost[],
): number {
  const produced = safeInteger(producedQtyMicros, "produced_qty_micros");
  if (produced < 0) throw errors.validation("produced_qty_micros cannot be negative");
  const grouped = new Map<string, { completed: number; cost: number }>();
  for (const row of rows) {
    const operation = requireText(row.operation, "operation", 240);
    const completed = safeInteger(row.completed_qty_micros, "completed_qty_micros");
    const cost = safeInteger(row.total_cost_minor, "total_cost_minor");
    if (completed < 0 || cost < 0) throw errors.validation("Operation progress and cost cannot be negative");
    const current = grouped.get(operation) ?? { completed: 0, cost: 0 };
    current.completed = safeAdd(current.completed, completed);
    current.cost = safeAdd(current.cost, cost);
    grouped.set(operation, current);
  }

  let wip = 0;
  for (const { completed, cost } of grouped.values()) {
    if (cost === 0 || completed === 0) continue;
    const finishedQty = Math.min(produced, completed);
    const finishedCost = scaleMinor(cost, finishedQty, completed);
    wip = safeAdd(wip, cost - finishedCost);
  }
  return wip;
}

export function assertFreezeFingerprint(snapshotFingerprint: string, liveFingerprint: string): void {
  if (snapshotFingerprint !== liveFingerprint) {
    throw errors.lifecycle("Manufacturing cost sources changed after this snapshot; generate and review the current Cost Sheet before freezing");
  }
}

function assertCostClose(actor: Actor): void {
  if (!actor.roles.some((role) => COST_CLOSE_ROLES.has(role)) && actor.user_id !== "Administrator") {
    throw errors.permission("Finalizing or adjusting manufacturing cost requires accounting close authority");
  }
}

function parseObject(value: string, label: string): JsonObject {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw errors.misconfigured(`${label} contains invalid JSON`); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.misconfigured(`${label} must contain a JSON object`);
  return parsed as JsonObject;
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw errors.validation(`${label} must be a string`);
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw errors.validation(`${label} must be non-empty and at most ${max} characters`);
  return normalized;
}

function optionalText(value: unknown, max: number): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation("Expected a text value");
  const normalized = String(value).trim();
  if (normalized.length > max) throw errors.validation(`Text value must be at most ${max} characters`);
  return normalized;
}

function scaleMinor(value: number, numerator: number, denominator: number): number {
  if (value === 0 || numerator === 0) return 0;
  if (denominator <= 0) throw errors.validation("Cost allocation denominator must be positive");
  return safeNumber(divideRounded(BigInt(value) * BigInt(numerator), BigInt(denominator)));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  if (numerator < 0n) return -divideRounded(-numerator, denominator);
  return (numerator + denominator / 2n) / denominator;
}

function safeAdd(left: number, right: number): number {
  const value = left + right;
  if (!Number.isSafeInteger(value)) throw errors.validation("Manufacturing cost arithmetic exceeds safe integer range");
  return value;
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${label} must be a safe integer`);
  return Number(value);
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing cost arithmetic exceeds safe integer range");
  return number;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
