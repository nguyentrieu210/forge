import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { SuiteController } from "./suite-controllers.js";

const COST_READ_ROLES = new Set([
  "Chủ xưởng",
  "Kế toán",
  "General Accountant",
  "Chief Accountant",
  "Director",
  "Kế toán tổng hợp",
  "Kế toán trưởng",
  "Giám đốc",
  "System Manager",
]);
const COST_CLOSE_ROLES = new Set([
  "Chief Accountant",
  "Director",
  "Kế toán tổng hợp",
  "Kế toán trưởng",
  "Giám đốc",
  "System Manager",
]);
const ADJUSTMENT_CATEGORIES = new Set([
  "Material",
  "Labor",
  "Machine",
  "Energy",
  "Consumable",
  "Overhead",
  "Other",
]);

export interface ManufacturingCostRateData extends JsonObject {
  company: string;
  operation?: string;
  workstation?: string;
  effective_from: string;
  effective_to?: string;
  currency: string;
  currency_scale?: number;
  labor_rate_per_hour?: string | number;
  machine_rate_per_hour?: string | number;
  electricity_rate_per_hour?: string | number;
  consumable_rate_per_hour?: string | number;
  overhead_rate_per_hour?: string | number;
  is_active?: boolean | number;
  note?: string;
}

interface CostSnapshotRow extends JsonObject {
  bom_row_id: string;
  item_code: string;
  required_qty_micros: number;
  standard_rate_minor?: number;
  standard_cost_minor?: number;
}

interface CostingManufacturingSnapshot extends JsonObject {
  bom_checksum?: string;
  work_order_qty_micros?: number;
  rows?: CostSnapshotRow[];
}

interface CostingWorkOrderData extends JsonObject {
  company: string;
  production_item: string;
  bom_no: string;
  qty?: string | number;
  qty_micros?: number;
  operating_cost_minor?: number;
  costing_currency?: string;
  costing_currency_scale?: number;
  standard_material_cost_minor?: number;
  standard_operating_cost_minor?: number;
  standard_total_cost_minor?: number;
  manufacturing_snapshot?: CostingManufacturingSnapshot;
}

interface CostingBomItem extends JsonObject {
  row_id?: string;
  rate_minor?: number;
  amount_minor?: number;
}

interface CostingBomData extends JsonObject {
  currency?: string;
  currency_scale?: number;
  raw_material_cost_minor?: number;
  operating_cost_minor?: number;
  quantity_micros?: number;
  output_stock_qty_micros?: number;
  items?: CostingBomItem[];
}

interface DocumentSqlRow {
  name: string;
  version?: number;
  payload_json: string;
}

interface ChildSqlRow {
  name: string;
  row_id: string;
  payload_json: string;
}

interface LedgerSqlRow {
  voucher_no: string;
  line_key: string;
  actual_qty_micros: number;
  stock_value_difference_minor: number;
  posting_at: string;
}

interface SnapshotSqlRow {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  sheet_json: string;
  generated_by: string;
  generated_at: string;
}

interface FreezeSqlRow {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  frozen_at: string;
}

interface AdjustmentSqlRow {
  adjustment_id: string;
  snapshot_id: string;
  category: string;
  delta_amount_minor: number;
  reason: string;
  actor_user_id: string;
  created_at: string;
  details_json: string;
}

interface RateCandidate {
  name: string;
  data: ManufacturingCostRateData;
}

export interface ManufacturingMaterialCostRow extends JsonObject {
  bom_row_id: string;
  item_code: string;
  standard_required_qty_micros: number;
  standard_qty_for_completed_micros: number;
  standard_rate_minor: number;
  standard_cost_for_completed_minor: number;
  actual_consumed_qty_micros: number;
  scrap_qty_micros: number;
  offcut_qty_micros: number;
  gross_source_value_minor: number;
  recovered_value_minor: number;
  actual_net_material_cost_minor: number;
  variance_minor: number;
}

export interface ManufacturingOperationCostRow extends JsonObject {
  job_card: string;
  operation: string;
  workstation: string;
  employee: string;
  posting_at: string;
  hours_micros: number;
  rate_id: string;
  labor_cost_minor: number;
  machine_cost_minor: number;
  electricity_cost_minor: number;
  consumable_cost_minor: number;
  overhead_cost_minor: number;
  total_cost_minor: number;
  missing_rate: boolean;
}

export interface ManufacturingCostSummary extends JsonObject {
  completion_micros: number;
  standard_material_cost_for_completed_minor: number;
  standard_operating_cost_for_completed_minor: number;
  standard_total_cost_for_completed_minor: number;
  actual_material_cost_to_date_minor: number;
  actual_operation_cost_to_date_minor: number;
  actual_total_cost_to_date_minor: number;
  actual_cost_allocated_to_finished_minor: number;
  estimated_wip_cost_minor: number;
  finished_stock_value_minor: number;
  valuation_adjustment_to_actual_minor: number;
  material_variance_minor: number;
  operation_variance_minor: number;
  total_variance_minor: number;
  actual_unit_cost_minor: number;
}

export interface ManufacturingCostSheet extends ManufacturingCostSummary {
  work_order: string;
  work_order_version: number;
  company: string;
  production_item: string;
  bom_no: string;
  bom_checksum: string;
  currency: string;
  currency_scale: number;
  target_qty_micros: number;
  produced_qty_micros: number;
  standard_cost_source: "WORK_ORDER_SNAPSHOT" | "LEGACY_BOM_FALLBACK";
  legacy_standard_warning: boolean;
  ready_to_finalize: boolean;
  missing_rate_job_cards: string[];
  material_rows: ManufacturingMaterialCostRow[];
  operation_rows: ManufacturingOperationCostRow[];
  source_fingerprint: string;
}

export interface ManufacturingCostSnapshotResult extends JsonObject {
  snapshot_id: string;
  work_order: string;
  source_fingerprint: string;
  existing: boolean;
  frozen: boolean;
}

export interface ManufacturingCostAdjustmentInput {
  adjustment_id: string;
  snapshot_id: string;
  category: string;
  delta_amount_minor: number;
  reason: string;
  details?: JsonObject;
}

export class ManufacturingCostRateController extends SuiteController<ManufacturingCostRateData> {
  readonly doctype = "Manufacturing Cost Rate";

  async normalize(context: ControllerContext<ManufacturingCostRateData>): Promise<ManufacturingCostRateData> {
    const input = context.command.document;
    const company = requireText(input.company, "company", 240);
    const operation = optionalText(input.operation, 240);
    const workstation = optionalText(input.workstation, 240);
    const effectiveFrom = requireDate(input.effective_from, "effective_from");
    const effectiveTo = input.effective_to ? requireDate(input.effective_to, "effective_to") : "";
    if (effectiveTo && effectiveTo < effectiveFrom) throw errors.validation("effective_to must be on or after effective_from");
    const currency = requireText(input.currency, "currency", 32);
    const currencyMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const currencyScale = typeof currencyMaster?.currency_scale === "number" ? currencyMaster.currency_scale : 2;
    const normalized = {
      labor_rate_per_hour: normalizeMoney(input.labor_rate_per_hour ?? 0, currencyScale, "labor_rate_per_hour"),
      machine_rate_per_hour: normalizeMoney(input.machine_rate_per_hour ?? 0, currencyScale, "machine_rate_per_hour"),
      electricity_rate_per_hour: normalizeMoney(input.electricity_rate_per_hour ?? 0, currencyScale, "electricity_rate_per_hour"),
      consumable_rate_per_hour: normalizeMoney(input.consumable_rate_per_hour ?? 0, currencyScale, "consumable_rate_per_hour"),
      overhead_rate_per_hour: normalizeMoney(input.overhead_rate_per_hour ?? 0, currencyScale, "overhead_rate_per_hour"),
    };
    const totalMinor = Object.values(normalized).reduce((sum, value) => sum + toScaledInt(value, currencyScale), 0);
    if (totalMinor <= 0) throw errors.validation("At least one manufacturing hourly cost rate must be greater than zero");
    const isActive = input.is_active === undefined ? true : input.is_active === true || input.is_active === 1;

    if (context.command.action === "submit") {
      for (const [doctype, name] of [["Company", company], ["Currency", currency]] as const) {
        if (!await context.reader.hasMasterRecord(context.command.tenant_id, doctype, name)) {
          throw errors.reference(`${doctype} ${name} does not exist or is disabled`);
        }
      }
      if (operation && !await context.reader.hasMasterRecord(context.command.tenant_id, "Operation", operation)) {
        throw errors.reference(`Operation ${operation} does not exist or is disabled`);
      }
      if (workstation && !await context.reader.hasMasterRecord(context.command.tenant_id, "Workstation", workstation)) {
        throw errors.reference(`Workstation ${workstation} does not exist or is disabled`);
      }
      if (isActive) await assertNoRateOverlap(context, company, operation, workstation, effectiveFrom, effectiveTo);
    }

    return {
      ...input,
      company,
      ...(operation ? { operation } : {}),
      ...(workstation ? { workstation } : {}),
      effective_from: effectiveFrom,
      ...(effectiveTo ? { effective_to: effectiveTo } : {}),
      currency,
      currency_scale: currencyScale,
      ...normalized,
      is_active: isActive,
    };
  }
}

async function assertNoRateOverlap(
  context: ControllerContext<ManufacturingCostRateData>,
  company: string,
  operation: string,
  workstation: string,
  effectiveFrom: string,
  effectiveTo: string,
): Promise<void> {
  const documents = await context.reader.listDocumentsByDoctype<ManufacturingCostRateData>(
    context.command.tenant_id,
    "Manufacturing Cost Rate",
  );
  for (const document of documents) {
    if (document.name === context.command.aggregate.name || document.docstatus !== 1) continue;
    const data = document.data;
    if (data.is_active === false || data.is_active === 0) continue;
    if (text(data.company) !== company || optionalText(data.operation, 240) !== operation || optionalText(data.workstation, 240) !== workstation) continue;
    const existingFrom = requireDate(data.effective_from, "effective_from");
    const existingTo = data.effective_to ? requireDate(data.effective_to, "effective_to") : "";
    if (intervalsOverlap(existingFrom, existingTo, effectiveFrom, effectiveTo)) {
      throw errors.reference("Manufacturing Cost Rate overlaps an active rate for the same company/operation/workstation scope", {
        conflicting_rate: document.name,
      });
    }
  }
}

export class D1ManufacturingCostingService {
  constructor(private readonly db: D1Database) {}

  async preview(tenantId: string, actor: Actor, workOrder: string): Promise<ManufacturingCostSheet> {
    assertCostRead(actor);
    return this.loadLiveSheet(tenantId, requireText(workOrder, "work_order", 240));
  }

  async generate(
    tenantId: string,
    actor: Actor,
    workOrder: string,
    now = new Date().toISOString(),
  ): Promise<ManufacturingCostSnapshotResult> {
    assertCostRead(actor);
    const normalizedWorkOrder = requireText(workOrder, "work_order", 240);
    const sheet = await this.loadLiveSheet(tenantId, normalizedWorkOrder);

    const frozen = await this.db.prepare(
      `SELECT s.snapshot_id,s.work_order,s.source_fingerprint,f.frozen_at
       FROM manufacturing_cost_freezes f
       JOIN manufacturing_cost_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.work_order=?2`,
    ).bind(tenantId, normalizedWorkOrder).first<FreezeSqlRow>();
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
    ).bind(tenantId, normalizedWorkOrder, sheet.source_fingerprint).first<SnapshotSqlRow>();
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
    await this.db.prepare(
      `INSERT INTO manufacturing_cost_snapshots(
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
    return {
      snapshot_id: snapshotId,
      work_order: normalizedWorkOrder,
      source_fingerprint: sheet.source_fingerprint,
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
  ): Promise<{ snapshot_id: string; work_order: string; existing: boolean }> {
    assertCostClose(actor);
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,work_order,source_fingerprint,sheet_json,generated_by,generated_at
       FROM manufacturing_cost_snapshots WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<SnapshotSqlRow>();
    if (!snapshot) throw errors.notFound("Manufacturing cost snapshot not found");
    const sheet = parseObject(snapshot.sheet_json, "manufacturing cost snapshot") as unknown as ManufacturingCostSheet;
    if (sheet.ready_to_finalize !== true) {
      throw errors.lifecycle("Manufacturing cost sheet cannot be finalized until production is complete and every timed Job Card has an effective cost rate");
    }

    const existing = await this.db.prepare(
      `SELECT s.snapshot_id,s.work_order,s.source_fingerprint,f.frozen_at
       FROM manufacturing_cost_freezes f
       JOIN manufacturing_cost_snapshots s
         ON s.tenant_id=f.tenant_id AND s.snapshot_id=f.snapshot_id
       WHERE f.tenant_id=?1 AND f.work_order=?2`,
    ).bind(tenantId, snapshot.work_order).first<FreezeSqlRow>();
    if (existing) {
      if (existing.snapshot_id !== normalizedSnapshotId) {
        throw errors.lifecycle("Work Order costing is already finalized to another immutable snapshot");
      }
      return { snapshot_id: normalizedSnapshotId, work_order: snapshot.work_order, existing: true };
    }

    await this.db.prepare(
      `INSERT INTO manufacturing_cost_freezes(tenant_id,work_order,snapshot_id,frozen_by,frozen_at,reason)
       VALUES(?1,?2,?3,?4,?5,?6)`,
    ).bind(tenantId, snapshot.work_order, normalizedSnapshotId, actor.user_id, now, reason.trim()).run();
    return { snapshot_id: normalizedSnapshotId, work_order: snapshot.work_order, existing: false };
  }

  async adjust(
    tenantId: string,
    actor: Actor,
    input: ManufacturingCostAdjustmentInput,
    now = new Date().toISOString(),
  ): Promise<{ adjustment_id: string; existing: boolean }> {
    assertCostClose(actor);
    const adjustmentId = requireText(input.adjustment_id, "adjustment_id", 240);
    const snapshotId = requireText(input.snapshot_id, "snapshot_id", 240);
    const category = requireText(input.category, "category", 40);
    if (!ADJUSTMENT_CATEGORIES.has(category)) throw errors.validation(`Unsupported manufacturing cost adjustment category: ${category}`);
    const delta = safeInteger(input.delta_amount_minor, "delta_amount_minor");
    if (delta === 0) throw errors.validation("Manufacturing cost adjustment amount must be non-zero");
    const reason = requireText(input.reason, "reason", 1000);
    const details = input.details ?? {};

    const existing = await this.db.prepare(
      `SELECT adjustment_id,snapshot_id,category,delta_amount_minor,reason,actor_user_id,created_at,details_json
       FROM manufacturing_cost_adjustments WHERE tenant_id=?1 AND adjustment_id=?2`,
    ).bind(tenantId, adjustmentId).first<AdjustmentSqlRow>();
    if (existing) {
      if (existing.snapshot_id !== snapshotId || existing.category !== category || existing.delta_amount_minor !== delta || existing.reason !== reason) {
        throw errors.lifecycle("Manufacturing cost adjustment id already exists with different content");
      }
      return { adjustment_id: adjustmentId, existing: true };
    }

    const frozen = await this.db.prepare(
      `SELECT 1 AS ok FROM manufacturing_cost_freezes WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, snapshotId).first<{ ok: number }>();
    if (!frozen) throw errors.lifecycle("Manufacturing cost snapshot must be finalized before adjustments are recorded");

    await this.db.prepare(
      `INSERT INTO manufacturing_cost_adjustments(
         tenant_id,adjustment_id,snapshot_id,category,delta_amount_minor,reason,actor_user_id,created_at,details_json
       ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
    ).bind(tenantId, adjustmentId, snapshotId, category, delta, reason, actor.user_id, now, JSON.stringify(details)).run();
    return { adjustment_id: adjustmentId, existing: false };
  }

  async read(tenantId: string, actor: Actor, snapshotId: string): Promise<JsonObject> {
    assertCostRead(actor);
    const normalizedSnapshotId = requireText(snapshotId, "snapshot_id", 240);
    const snapshot = await this.db.prepare(
      `SELECT snapshot_id,work_order,source_fingerprint,sheet_json,generated_by,generated_at
       FROM manufacturing_cost_snapshots WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<SnapshotSqlRow>();
    if (!snapshot) throw errors.notFound("Manufacturing cost snapshot not found");
    const sheet = parseObject(snapshot.sheet_json, "manufacturing cost snapshot");
    const adjustmentResult = await this.db.prepare(
      `SELECT adjustment_id,snapshot_id,category,delta_amount_minor,reason,actor_user_id,created_at,details_json
       FROM manufacturing_cost_adjustments
       WHERE tenant_id=?1 AND snapshot_id=?2 ORDER BY created_at,adjustment_id`,
    ).bind(tenantId, normalizedSnapshotId).all<AdjustmentSqlRow>();
    const adjustments = (adjustmentResult.results ?? []).map((row) => ({
      adjustment_id: row.adjustment_id,
      category: row.category,
      delta_amount_minor: row.delta_amount_minor,
      reason: row.reason,
      actor_user_id: row.actor_user_id,
      created_at: row.created_at,
      details: parseObject(row.details_json, `manufacturing cost adjustment ${row.adjustment_id}`),
    }));
    const adjustmentTotal = adjustments.reduce((sum, row) => safeAdd(sum, row.delta_amount_minor), 0);
    const actualTotal = safeInteger(sheet.actual_total_cost_to_date_minor, "actual_total_cost_to_date_minor");
    const totalVariance = safeInteger(sheet.total_variance_minor, "total_variance_minor");
    const produced = safeInteger(sheet.produced_qty_micros, "produced_qty_micros");
    const adjustedActual = safeAdd(actualTotal, adjustmentTotal);
    const adjustedUnit = produced > 0 ? safeNumber(divideRounded(BigInt(adjustedActual) * 1_000_000n, BigInt(produced))) : 0;
    const freeze = await this.db.prepare(
      `SELECT frozen_by,frozen_at,reason FROM manufacturing_cost_freezes WHERE tenant_id=?1 AND snapshot_id=?2`,
    ).bind(tenantId, normalizedSnapshotId).first<{ frozen_by: string; frozen_at: string; reason: string }>();

    return {
      ...sheet,
      snapshot_id: normalizedSnapshotId,
      generated_by: snapshot.generated_by,
      generated_at: snapshot.generated_at,
      frozen: Boolean(freeze),
      ...(freeze ? { frozen_by: freeze.frozen_by, frozen_at: freeze.frozen_at, freeze_reason: freeze.reason } : {}),
      adjustments,
      adjustment_total_minor: adjustmentTotal,
      adjusted_actual_total_cost_minor: adjustedActual,
      adjusted_total_variance_minor: safeAdd(totalVariance, adjustmentTotal),
      adjusted_actual_unit_cost_minor: adjustedUnit,
    };
  }

  private async loadLiveSheet(tenantId: string, workOrder: string): Promise<ManufacturingCostSheet> {
    const workOrderRow = await this.db.prepare(
      `SELECT name,version,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='Work Order' AND name=?2 AND docstatus=1 LIMIT 1`,
    ).bind(tenantId, workOrder).first<DocumentSqlRow>();
    if (!workOrderRow) throw errors.notFound(`Submitted Work Order ${workOrder} not found`);
    const workOrderData = parseObject(workOrderRow.payload_json, `Work Order ${workOrder}`) as unknown as CostingWorkOrderData;
    const company = requireText(workOrderData.company, "company", 240);
    const bomNo = requireText(workOrderData.bom_no, "bom_no", 240);
    const bomRow = await this.db.prepare(
      `SELECT name,payload_json FROM documents
       WHERE tenant_id=?1 AND doctype='Bill of Materials' AND name=?2 AND docstatus=1 LIMIT 1`,
    ).bind(tenantId, bomNo).first<DocumentSqlRow>();
    if (!bomRow) throw errors.notFound(`Submitted Bill of Materials ${bomNo} not found`);
    const bomData = parseObject(bomRow.payload_json, `Bill of Materials ${bomNo}`) as unknown as CostingBomData;
    const currency = optionalText(workOrderData.costing_currency, 32) || optionalText(bomData.currency, 32) || "USD";
    const currencyScale = optionalSafeInteger(workOrderData.costing_currency_scale)
      ?? optionalSafeInteger(bomData.currency_scale)
      ?? 2;
    if (currencyScale < 0 || currencyScale > 6) throw errors.misconfigured("Manufacturing costing currency scale must be between 0 and 6");
    const targetQty = positiveInteger(workOrderData.qty_micros ?? workOrderData.manufacturing_snapshot?.work_order_qty_micros, "work_order_qty_micros");
    const bomOutputQty = positiveInteger(bomData.output_stock_qty_micros ?? bomData.quantity_micros ?? targetQty, "BOM output quantity");
    const rawSnapshotRows = Array.isArray(workOrderData.manufacturing_snapshot?.rows) ? workOrderData.manufacturing_snapshot!.rows! : [];
    const snapshotRows = hydrateSnapshotStandards(rawSnapshotRows, bomData, targetQty, bomOutputQty);
    const hasWorkOrderCostSnapshot = Number.isSafeInteger(workOrderData.standard_material_cost_minor)
      && Number.isSafeInteger(workOrderData.standard_operating_cost_minor);

    const [stockDocsResult, childResult, ledgerResult, jobCardResult, rateResult] = await Promise.all([
      this.db.prepare(
        `SELECT name,payload_json FROM documents
         WHERE tenant_id=?1 AND doctype='Stock Entry' AND docstatus=1
           AND json_extract(payload_json,'$.work_order')=?2
         ORDER BY modified_at,name`,
      ).bind(tenantId, workOrder).all<DocumentSqlRow>(),
      this.db.prepare(
        `SELECT d.name,c.row_id,c.payload_json
         FROM documents d
         JOIN document_children c ON c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items'
         WHERE d.tenant_id=?1 AND d.doctype='Stock Entry' AND d.docstatus=1
           AND json_extract(d.payload_json,'$.work_order')=?2
         ORDER BY d.name,c.idx`,
      ).bind(tenantId, workOrder).all<ChildSqlRow>(),
      this.db.prepare(
        `SELECT s.voucher_no,s.line_key,s.actual_qty_micros,s.stock_value_difference_minor,s.posting_at
         FROM stock_ledger_entries s
         JOIN documents d ON d.tenant_id=s.tenant_id AND d.doctype=s.voucher_type AND d.name=s.voucher_no
         WHERE s.tenant_id=?1 AND s.voucher_type='Stock Entry' AND d.docstatus=1
           AND json_extract(d.payload_json,'$.work_order')=?2
         ORDER BY s.posting_at,s.rowid`,
      ).bind(tenantId, workOrder).all<LedgerSqlRow>(),
      this.db.prepare(
        `SELECT name,payload_json FROM documents
         WHERE tenant_id=?1 AND doctype='Job Card' AND docstatus=1
           AND json_extract(payload_json,'$.work_order')=?2
         ORDER BY modified_at,name`,
      ).bind(tenantId, workOrder).all<DocumentSqlRow>(),
      this.db.prepare(
        `SELECT name,payload_json FROM documents
         WHERE tenant_id=?1 AND doctype='Manufacturing Cost Rate' AND docstatus=1
           AND json_extract(payload_json,'$.company')=?2
         ORDER BY name`,
      ).bind(tenantId, company).all<DocumentSqlRow>(),
    ]);

    const material = buildMaterialActuals(
      snapshotRows,
      targetQty,
      stockDocsResult.results ?? [],
      childResult.results ?? [],
      ledgerResult.results ?? [],
    );
    const rates = (rateResult.results ?? []).map((row) => ({
      name: row.name,
      data: parseObject(row.payload_json, `Manufacturing Cost Rate ${row.name}`) as unknown as ManufacturingCostRateData,
    }));
    const operations = buildOperationCosts(jobCardResult.results ?? [], rates, company, currency, currencyScale);
    const legacyMaterial = scaleMinor(
      nonNegativeInteger(bomData.raw_material_cost_minor ?? material.fullStandardMaterialCostMinor, "BOM raw_material_cost_minor"),
      targetQty,
      bomOutputQty,
    );
    const legacyOperating = scaleMinor(
      nonNegativeInteger(bomData.operating_cost_minor ?? 0, "BOM operating_cost_minor"),
      targetQty,
      bomOutputQty,
    );
    const standardMaterial = hasWorkOrderCostSnapshot
      ? nonNegativeInteger(workOrderData.standard_material_cost_minor, "standard_material_cost_minor")
      : material.fullStandardMaterialCostMinor > 0 ? material.fullStandardMaterialCostMinor : legacyMaterial;
    const standardOperating = hasWorkOrderCostSnapshot
      ? nonNegativeInteger(workOrderData.standard_operating_cost_minor, "standard_operating_cost_minor")
      : Number.isSafeInteger(workOrderData.operating_cost_minor)
        ? nonNegativeInteger(workOrderData.operating_cost_minor, "operating_cost_minor")
        : legacyOperating;
    const summary = calculateManufacturingCostSummary({
      target_qty_micros: targetQty,
      produced_qty_micros: material.producedQtyMicros,
      standard_material_cost_minor: standardMaterial,
      standard_operating_cost_minor: standardOperating,
      actual_material_cost_minor: material.actualMaterialCostMinor,
      actual_operation_cost_minor: operations.actualOperationCostMinor,
      finished_stock_value_minor: material.finishedStockValueMinor,
    });
    const materialRows = allocateMaterialStandards(material.rows, material.producedQtyMicros, targetQty);
    const readyToFinalize = material.producedQtyMicros === targetQty
      && operations.missingRateJobCards.length === 0
      && (standardOperating === 0 || operations.rows.length > 0);
    const unsigned: Omit<ManufacturingCostSheet, "source_fingerprint"> = {
      work_order: workOrder,
      work_order_version: safeInteger(workOrderRow.version ?? 1, "work_order_version"),
      company,
      production_item: requireText(workOrderData.production_item, "production_item", 240),
      bom_no: bomNo,
      bom_checksum: optionalText(workOrderData.manufacturing_snapshot?.bom_checksum, 128),
      currency,
      currency_scale: currencyScale,
      target_qty_micros: targetQty,
      produced_qty_micros: material.producedQtyMicros,
      standard_cost_source: hasWorkOrderCostSnapshot ? "WORK_ORDER_SNAPSHOT" : "LEGACY_BOM_FALLBACK",
      legacy_standard_warning: !hasWorkOrderCostSnapshot,
      ready_to_finalize: readyToFinalize,
      missing_rate_job_cards: operations.missingRateJobCards,
      material_rows: materialRows,
      operation_rows: operations.rows,
      ...summary,
    };
    const sourceFingerprint = await sha256Hex(canonicalize(unsigned));
    return { ...unsigned, source_fingerprint: sourceFingerprint } as ManufacturingCostSheet;
  }
}

export function calculateManufacturingCostSummary(input: {
  target_qty_micros: number;
  produced_qty_micros: number;
  standard_material_cost_minor: number;
  standard_operating_cost_minor: number;
  actual_material_cost_minor: number;
  actual_operation_cost_minor: number;
  finished_stock_value_minor: number;
}): ManufacturingCostSummary {
  const target = positiveInteger(input.target_qty_micros, "target_qty_micros");
  const produced = safeInteger(input.produced_qty_micros, "produced_qty_micros");
  if (produced < 0 || produced > target) throw errors.validation("produced_qty_micros must be between zero and target quantity");
  const standardMaterial = nonNegativeInteger(input.standard_material_cost_minor, "standard_material_cost_minor");
  const standardOperating = nonNegativeInteger(input.standard_operating_cost_minor, "standard_operating_cost_minor");
  const actualMaterial = nonNegativeInteger(input.actual_material_cost_minor, "actual_material_cost_minor");
  const actualOperation = nonNegativeInteger(input.actual_operation_cost_minor, "actual_operation_cost_minor");
  const finishedStockValue = nonNegativeInteger(input.finished_stock_value_minor, "finished_stock_value_minor");
  const completion = safeNumber(divideRounded(BigInt(produced) * 1_000_000n, BigInt(target)));
  const standardMaterialCompleted = scaleMinor(standardMaterial, produced, target);
  const standardOperatingCompleted = scaleMinor(standardOperating, produced, target);
  const standardTotalCompleted = safeAdd(standardMaterialCompleted, standardOperatingCompleted);
  const actualTotal = safeAdd(actualMaterial, actualOperation);
  const allocatedActual = scaleMinor(actualTotal, produced, target);
  const wip = actualTotal - allocatedActual;
  const materialVariance = actualMaterial - standardMaterialCompleted;
  const operationVariance = actualOperation - standardOperatingCompleted;
  const totalVariance = safeAdd(materialVariance, operationVariance);
  const unitCost = produced > 0 ? safeNumber(divideRounded(BigInt(allocatedActual) * 1_000_000n, BigInt(produced))) : 0;
  return {
    completion_micros: completion,
    standard_material_cost_for_completed_minor: standardMaterialCompleted,
    standard_operating_cost_for_completed_minor: standardOperatingCompleted,
    standard_total_cost_for_completed_minor: standardTotalCompleted,
    actual_material_cost_to_date_minor: actualMaterial,
    actual_operation_cost_to_date_minor: actualOperation,
    actual_total_cost_to_date_minor: actualTotal,
    actual_cost_allocated_to_finished_minor: allocatedActual,
    estimated_wip_cost_minor: wip,
    finished_stock_value_minor: finishedStockValue,
    valuation_adjustment_to_actual_minor: allocatedActual - finishedStockValue,
    material_variance_minor: materialVariance,
    operation_variance_minor: operationVariance,
    total_variance_minor: totalVariance,
    actual_unit_cost_minor: unitCost,
  };
}

function hydrateSnapshotStandards(
  rows: CostSnapshotRow[],
  bom: CostingBomData,
  targetQty: number,
  bomOutputQty: number,
): CostSnapshotRow[] {
  const bomRows = new Map((bom.items ?? []).map((row, index) => [optionalText(row.row_id, 240) || `ROW-${index + 1}`, row]));
  return rows.map((row) => {
    const source = bomRows.get(row.bom_row_id);
    const rate = Number.isSafeInteger(row.standard_rate_minor)
      ? nonNegativeInteger(row.standard_rate_minor, "standard_rate_minor")
      : nonNegativeInteger(source?.rate_minor ?? 0, "BOM row rate_minor");
    const required = nonNegativeInteger(row.required_qty_micros, "required_qty_micros");
    const cost = Number.isSafeInteger(row.standard_cost_minor)
      ? nonNegativeInteger(row.standard_cost_minor, "standard_cost_minor")
      : rate > 0
        ? safeNumber(divideRounded(BigInt(rate) * BigInt(required), 1_000_000n))
        : scaleMinor(nonNegativeInteger(source?.amount_minor ?? 0, "BOM row amount_minor"), targetQty, bomOutputQty);
    return { ...row, standard_rate_minor: rate, standard_cost_minor: cost };
  });
}

function buildMaterialActuals(
  snapshotRows: CostSnapshotRow[],
  targetQty: number,
  stockDocs: DocumentSqlRow[],
  children: ChildSqlRow[],
  ledger: LedgerSqlRow[],
): {
  rows: ManufacturingMaterialCostRow[];
  producedQtyMicros: number;
  finishedStockValueMinor: number;
  actualMaterialCostMinor: number;
  fullStandardMaterialCostMinor: number;
} {
  const docData = new Map(stockDocs.map((row) => [row.name, parseObject(row.payload_json, `Stock Entry ${row.name}`)]));
  const childMap = new Map<string, Array<{ row_id: string; data: JsonObject }>>();
  for (const row of children) {
    const values = childMap.get(row.name) ?? [];
    values.push({ row_id: row.row_id, data: parseObject(row.payload_json, `Stock Entry ${row.name} row ${row.row_id}`) });
    values.sort((a, b) => b.row_id.length - a.row_id.length || a.row_id.localeCompare(b.row_id));
    childMap.set(row.name, values);
  }
  const materialMap = new Map<string, ManufacturingMaterialCostRow>();
  for (const row of snapshotRows) {
    const rowId = requireText(row.bom_row_id, "bom_row_id", 240);
    materialMap.set(rowId, {
      bom_row_id: rowId,
      item_code: requireText(row.item_code, "item_code", 240),
      standard_required_qty_micros: nonNegativeInteger(row.required_qty_micros, "required_qty_micros"),
      standard_qty_for_completed_micros: 0,
      standard_rate_minor: nonNegativeInteger(row.standard_rate_minor ?? 0, "standard_rate_minor"),
      standard_cost_for_completed_minor: 0,
      actual_consumed_qty_micros: 0,
      scrap_qty_micros: 0,
      offcut_qty_micros: 0,
      gross_source_value_minor: 0,
      recovered_value_minor: 0,
      actual_net_material_cost_minor: 0,
      variance_minor: 0,
    });
  }

  let producedQtyMicros = 0;
  let finishedStockValueMinor = 0;
  for (const line of ledger) {
    const parent = docData.get(line.voucher_no);
    if (!parent || text(parent.purpose) !== "Manufacture") continue;
    const qty = safeInteger(line.actual_qty_micros, "actual_qty_micros");
    const value = safeInteger(line.stock_value_difference_minor, "stock_value_difference_minor");
    if (line.line_key.startsWith("FINISHED") && qty > 0) {
      producedQtyMicros = safeAdd(producedQtyMicros, qty);
      finishedStockValueMinor = safeAdd(finishedStockValueMinor, Math.max(0, value));
      continue;
    }
    const child = matchChild(line.line_key, childMap.get(line.voucher_no) ?? []);
    if (!child) continue;
    const bomRowId = optionalText(child.data.bom_row_id, 240);
    if (!bomRowId) continue;
    const row = materialMap.get(bomRowId);
    if (!row) continue;
    const kind = optionalText(child.data.manufacturing_kind, 40) || "Consumption";
    if (line.line_key.startsWith("SRC-") && qty < 0) {
      const absoluteQty = Math.abs(qty);
      row.gross_source_value_minor = safeAdd(row.gross_source_value_minor, Math.abs(value));
      if (kind === "Scrap") row.scrap_qty_micros = safeAdd(row.scrap_qty_micros, absoluteQty);
      else if (kind === "Offcut") row.offcut_qty_micros = safeAdd(row.offcut_qty_micros, absoluteQty);
      else row.actual_consumed_qty_micros = safeAdd(row.actual_consumed_qty_micros, absoluteQty);
    }
    if (line.line_key.startsWith("TGT-") && qty > 0 && (kind === "Scrap" || kind === "Offcut")) {
      row.recovered_value_minor = safeAdd(row.recovered_value_minor, Math.max(0, value));
    }
  }
  if (producedQtyMicros > targetQty) throw errors.misconfigured("Manufacturing ledger produced quantity exceeds the Work Order target");

  let actualMaterialCostMinor = 0;
  let fullStandardMaterialCostMinor = 0;
  for (const row of materialMap.values()) {
    row.actual_net_material_cost_minor = Math.max(0, row.gross_source_value_minor - row.recovered_value_minor);
    actualMaterialCostMinor = safeAdd(actualMaterialCostMinor, row.actual_net_material_cost_minor);
    const fullStandard = nonNegativeInteger(
      snapshotRows.find((candidate) => candidate.bom_row_id === row.bom_row_id)?.standard_cost_minor ?? 0,
      "standard_cost_minor",
    );
    fullStandardMaterialCostMinor = safeAdd(fullStandardMaterialCostMinor, fullStandard);
  }
  return {
    rows: [...materialMap.values()],
    producedQtyMicros,
    finishedStockValueMinor,
    actualMaterialCostMinor,
    fullStandardMaterialCostMinor,
  };
}

function allocateMaterialStandards(
  rows: ManufacturingMaterialCostRow[],
  producedQty: number,
  targetQty: number,
): ManufacturingMaterialCostRow[] {
  return rows.map((row) => {
    const standardQty = scaleMinor(row.standard_required_qty_micros, producedQty, targetQty);
    const standardCost = safeNumber(divideRounded(BigInt(standardQty) * BigInt(row.standard_rate_minor), 1_000_000n));
    return {
      ...row,
      standard_qty_for_completed_micros: standardQty,
      standard_cost_for_completed_minor: standardCost,
      variance_minor: row.actual_net_material_cost_minor - standardCost,
    };
  });
}

function buildOperationCosts(
  jobCards: DocumentSqlRow[],
  rates: RateCandidate[],
  company: string,
  currency: string,
  currencyScale: number,
): { rows: ManufacturingOperationCostRow[]; actualOperationCostMinor: number; missingRateJobCards: string[] } {
  const rows: ManufacturingOperationCostRow[] = [];
  const missingRateJobCards: string[] = [];
  let actualOperationCostMinor = 0;
  for (const job of jobCards) {
    const data = parseObject(job.payload_json, `Job Card ${job.name}`);
    const hours = nonNegativeInteger(data.total_hours_micros ?? 0, "total_hours_micros");
    const operation = optionalText(data.operation, 240);
    const workstation = optionalText(data.workstation, 240);
    const employee = optionalText(data.employee, 240);
    const postingAt = requireText(data.posting_at, "posting_at", 80);
    const selected = selectRate(rates, company, operation, workstation, postingAt.slice(0, 10));
    let missingRate = false;
    let rateId = "";
    let labor = 0;
    let machine = 0;
    let electricity = 0;
    let consumable = 0;
    let overhead = 0;
    if (hours > 0) {
      if (!selected || text(selected.data.currency) !== currency || safeInteger(selected.data.currency_scale ?? currencyScale, "currency_scale") !== currencyScale) {
        missingRate = true;
        missingRateJobCards.push(job.name);
      } else {
        rateId = selected.name;
        labor = rateCost(selected.data.labor_rate_per_hour, currencyScale, hours, "labor_rate_per_hour");
        machine = rateCost(selected.data.machine_rate_per_hour, currencyScale, hours, "machine_rate_per_hour");
        electricity = rateCost(selected.data.electricity_rate_per_hour, currencyScale, hours, "electricity_rate_per_hour");
        consumable = rateCost(selected.data.consumable_rate_per_hour, currencyScale, hours, "consumable_rate_per_hour");
        overhead = rateCost(selected.data.overhead_rate_per_hour, currencyScale, hours, "overhead_rate_per_hour");
      }
    }
    const total = safeAdd(safeAdd(labor, machine), safeAdd(safeAdd(electricity, consumable), overhead));
    actualOperationCostMinor = safeAdd(actualOperationCostMinor, total);
    rows.push({
      job_card: job.name,
      operation,
      workstation,
      employee,
      posting_at: postingAt,
      hours_micros: hours,
      rate_id: rateId,
      labor_cost_minor: labor,
      machine_cost_minor: machine,
      electricity_cost_minor: electricity,
      consumable_cost_minor: consumable,
      overhead_cost_minor: overhead,
      total_cost_minor: total,
      missing_rate: missingRate,
    });
  }
  return { rows, actualOperationCostMinor, missingRateJobCards };
}

function selectRate(
  rates: RateCandidate[],
  company: string,
  operation: string,
  workstation: string,
  date: string,
): RateCandidate | undefined {
  let selected: RateCandidate | undefined;
  let selectedScore = -1;
  for (const candidate of rates) {
    const data = candidate.data;
    if (text(data.company) !== company || data.is_active === false || data.is_active === 0) continue;
    const from = requireDate(data.effective_from, "effective_from");
    const to = data.effective_to ? requireDate(data.effective_to, "effective_to") : "";
    if (date < from || (to && date > to)) continue;
    const rateOperation = optionalText(data.operation, 240);
    const rateWorkstation = optionalText(data.workstation, 240);
    let score = -1;
    if (rateOperation && rateWorkstation && rateOperation === operation && rateWorkstation === workstation) score = 4;
    else if (rateOperation && !rateWorkstation && rateOperation === operation) score = 3;
    else if (!rateOperation && rateWorkstation && rateWorkstation === workstation) score = 2;
    else if (!rateOperation && !rateWorkstation) score = 1;
    if (score > selectedScore) {
      selected = candidate;
      selectedScore = score;
    }
  }
  return selected;
}

function rateCost(value: unknown, scale: number, hoursMicros: number, label: string): number {
  const rate = toScaledInt(numeric(value ?? 0, label), scale, label);
  if (rate < 0) throw errors.misconfigured(`${label} cannot be negative`);
  return safeNumber(divideRounded(BigInt(rate) * BigInt(hoursMicros), 1_000_000n));
}

function matchChild(lineKey: string, children: Array<{ row_id: string; data: JsonObject }>): { row_id: string; data: JsonObject } | undefined {
  return children.find((child) => hasLineSegment(lineKey, child.row_id));
}

function hasLineSegment(lineKey: string, rowId: string): boolean {
  const escaped = rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|-)${escaped}($|-)`).test(lineKey);
}

function assertCostRead(actor: Actor): void {
  if (!actor.roles.some((role) => COST_READ_ROLES.has(role)) && actor.user_id !== "Administrator") {
    throw errors.permission("Manufacturing cost sheets require workshop or accounting access");
  }
}

function assertCostClose(actor: Actor): void {
  if (!actor.roles.some((role) => COST_CLOSE_ROLES.has(role)) && actor.user_id !== "Administrator") {
    throw errors.permission("Finalizing or adjusting manufacturing cost requires accounting close authority");
  }
}

function normalizeMoney(value: unknown, scale: number, label: string): string {
  const minor = toScaledInt(numeric(value, label), scale, label);
  if (minor < 0) throw errors.validation(`${label} cannot be negative`);
  return fromScaledInt(minor, scale);
}

function numeric(value: unknown, label: string): string | number {
  if (typeof value === "string" || typeof value === "number") return value;
  throw errors.validation(`${label} must be numeric`);
}

function intervalsOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string): boolean {
  const leftEnd = aTo || "9999-12-31";
  const rightEnd = bTo || "9999-12-31";
  return aFrom <= rightEnd && bFrom <= leftEnd;
}

function scaleMinor(value: number, numerator: number, denominator: number): number {
  if (value === 0 || numerator === 0) return 0;
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

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing cost arithmetic exceeds safe integer range");
  return number;
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw errors.validation(`${label} must be a safe integer`);
  return Number(value);
}

function optionalSafeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) ? Number(value) : undefined;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const normalized = safeInteger(value, label);
  if (normalized < 0) throw errors.validation(`${label} cannot be negative`);
  return normalized;
}

function positiveInteger(value: unknown, label: string): number {
  const normalized = safeInteger(value, label);
  if (normalized <= 0) throw errors.validation(`${label} must be positive`);
  return normalized;
}

function requireDate(value: unknown, label: string): string {
  const date = requireText(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw errors.validation(`${label} must be an ISO date`);
  }
  return date;
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

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function parseObject(value: string, label: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw errors.misconfigured(`${label} contains invalid JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw errors.misconfigured(`${label} must contain a JSON object`);
  return parsed as JsonObject;
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
