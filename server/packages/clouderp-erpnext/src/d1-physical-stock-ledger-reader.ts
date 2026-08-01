import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  PhysicalStockLedgerQuery,
  PhysicalStockLedgerReader,
} from "./physical-stock-report-service.js";
import type { PhysicalStockLedgerRow } from "./physical-stock-read-model.js";

export interface PhysicalStockD1Result<T> {
  results?: T[];
}

export interface PhysicalStockD1Statement {
  bind(...values: unknown[]): PhysicalStockD1Statement;
  all<T>(): Promise<PhysicalStockD1Result<T>>;
}

export interface PhysicalStockD1Database {
  prepare(sql: string): PhysicalStockD1Statement;
}

interface LedgerSqlRow {
  tenant_id: string;
  voucher_type: string;
  voucher_no: string;
  voucher_revision: number;
  line_key: string;
  item_code: string;
  warehouse: string;
  actual_qty_micros: number;
  actual_weight_micros: number | null;
  stock_value_difference_minor: number;
  posting_at: string;
  batch_no: string | null;
  serial_no: string | null;
  document_payload_json: string;
}

interface ChildSqlRow {
  doctype: string;
  name: string;
  row_id: string;
  payload_json: string;
}

interface ChildSnapshot {
  rowId: string;
  data: JsonObject;
}

interface RowDraft {
  row: PhysicalStockLedgerRow;
  physicalTotal?: number;
  allocationGroup?: string;
}

const DEFAULT_SOURCE_LIMIT = 20_000;
const MAX_SOURCE_LIMIT = 100_000;

/**
 * Reads the append-only stock ledger and joins immutable physical identity snapshots
 * from the owning document. It never stores or updates a competing balance table.
 */
export class D1PhysicalStockLedgerReader implements PhysicalStockLedgerReader {
  private readonly sourceLimit: number;

  constructor(
    private readonly db: PhysicalStockD1Database,
    sourceLimit = DEFAULT_SOURCE_LIMIT,
  ) {
    if (!Number.isSafeInteger(sourceLimit) || sourceLimit < 1 || sourceLimit > MAX_SOURCE_LIMIT) {
      throw errors.misconfigured(`Physical stock source limit must be from 1 to ${MAX_SOURCE_LIMIT}`);
    }
    this.sourceLimit = sourceLimit;
  }

  async list(query: PhysicalStockLedgerQuery): Promise<readonly PhysicalStockLedgerRow[]> {
    const tenant = requireText(query.tenant_id, "tenant_id", 160);
    const company = requireText(query.company, "company", 240);
    const fetchLimit = this.sourceLimit + 1;

    const ledgerResult = await this.db.prepare(
      `SELECT s.tenant_id,s.voucher_type,s.voucher_no,s.voucher_revision,s.line_key,
              s.item_code,s.warehouse,s.actual_qty_micros,s.actual_weight_micros,s.stock_value_difference_minor,
              s.posting_at,s.batch_no,s.serial_no,d.payload_json AS document_payload_json
       FROM stock_ledger_entries s
       JOIN documents d
         ON d.tenant_id=s.tenant_id AND d.doctype=s.voucher_type AND d.name=s.voucher_no
       WHERE s.tenant_id=?1 AND json_extract(d.payload_json,'$.company')=?2
       ORDER BY s.posting_at,s.rowid
       LIMIT ?3`,
    ).bind(tenant, company, fetchLimit).all<LedgerSqlRow>();
    const ledgerRows = ledgerResult.results ?? [];
    assertWithinLimit(ledgerRows.length, this.sourceLimit, "ledger");

    const childResult = await this.db.prepare(
      `SELECT d.doctype,d.name,c.row_id,c.payload_json
       FROM documents d
       JOIN document_children c
         ON c.tenant_id=d.tenant_id AND c.parent_key=d.doc_key AND c.fieldname='items'
       WHERE d.tenant_id=?1 AND json_extract(d.payload_json,'$.company')=?2
       ORDER BY d.doctype,d.name,c.idx
       LIMIT ?3`,
    ).bind(tenant, company, fetchLimit).all<ChildSqlRow>();
    const childRows = childResult.results ?? [];
    assertWithinLimit(childRows.length, this.sourceLimit, "document child");

    const children = indexChildren(childRows);
    const drafts = ledgerRows.map((row, index) => toDraft(row, children, tenant, company, index));
    allocatePhysicalCounts(drafts);
    return drafts.map((draft) => draft.row);
  }
}

function toDraft(
  source: LedgerSqlRow,
  children: Map<string, ChildSnapshot[]>,
  tenant: string,
  company: string,
  index: number,
): RowDraft {
  if (source.tenant_id !== tenant) {
    throw errors.misconfigured("Physical stock D1 reader returned another tenant");
  }
  const parent = parseObject(source.document_payload_json, `ledger document ${index + 1}`);
  if (text(parent.company) !== company) {
    throw errors.misconfigured("Physical stock D1 reader returned another company");
  }

  const line = parseLineKey(source.line_key);
  const documentChildren = children.get(documentKey(source.voucher_type, source.voucher_no)) ?? [];
  const child = line.direction === "finished" ? undefined : matchChild(line.core, documentChildren);
  const snapshot = line.direction === "finished"
    ? object(parent.finished_good_physical_identity)
    : child?.data;
  const voucherRow = line.direction === "finished" ? "FINISHED" : child?.rowId;
  const quantity = safeInteger(source.actual_qty_micros, "actual_qty_micros");
  const weight = optionalSafeInteger(source.actual_weight_micros, "actual_weight_micros");
  const value = safeInteger(source.stock_value_difference_minor, "stock_value_difference_minor");
  const role = line.direction === "source"
    ? text(snapshot?.source_warehouse_role)
    : text(snapshot?.target_warehouse_role);
  const physicalTotal = optionalSafeInteger(snapshot?.physical_count_micros, "physical_count_micros");

  const row: PhysicalStockLedgerRow = {
    tenant_id: tenant,
    company,
    item_code: requireText(source.item_code, "item_code", 240),
    warehouse: requireText(source.warehouse, "warehouse", 240),
    posting_at: requireText(source.posting_at, "posting_at", 80),
    voucher_type: requireText(source.voucher_type, "voucher_type", 160),
    voucher_no: requireText(source.voucher_no, "voucher_no", 240),
    revision: safeInteger(source.voucher_revision, "voucher_revision"),
    quantity_micros: quantity,
    ...(weight === undefined ? {} : { weight_micros: weight }),
    value_micros: value,
    ...(voucherRow ? { voucher_row: voucherRow } : {}),
    ...(text(source.batch_no) ? { batch_no: text(source.batch_no) } : {}),
    ...(text(source.serial_no) ? { serial_no: text(source.serial_no) } : {}),
    ...(role ? { warehouse_role: role } : {}),
    ...snapshotFields(snapshot),
    ...(line.reversed ? {
      reversal_of_voucher_type: source.voucher_type,
      reversal_of_voucher_no: source.voucher_no,
      ...(voucherRow ? { reversal_of_voucher_row: voucherRow } : {}),
    } : {}),
  };

  return {
    row,
    ...(physicalTotal === undefined ? {} : { physicalTotal: Math.abs(physicalTotal) }),
    ...(physicalTotal === undefined ? {} : {
      allocationGroup: [
        tenant,
        source.voucher_type,
        source.voucher_no,
        source.voucher_revision,
        voucherRow ?? source.line_key,
        line.direction,
        line.reversed ? "REV" : "LIVE",
      ].join("|"),
    }),
  };
}

function snapshotFields(snapshot: JsonObject | undefined): Partial<PhysicalStockLedgerRow> {
  if (!snapshot) return {};
  const physicalIdentityKey = text(snapshot.physical_identity_key);
  const inventoryMode = text(snapshot.inventory_mode);
  const measurementProfile = text(snapshot.measurement_profile);
  const color = text(snapshot.color ?? snapshot.colour);
  const condition = text(snapshot.condition);
  const generation = text(snapshot.generation);
  const length = optionalSafeInteger(snapshot.length_micros, "length_micros");
  const width = optionalSafeInteger(snapshot.width_micros, "width_micros");
  const height = optionalSafeInteger(snapshot.height_micros, "height_micros");
  const thickness = optionalSafeInteger(snapshot.thickness_micros, "thickness_micros");
  return {
    ...(physicalIdentityKey ? { physical_identity_key: physicalIdentityKey } : {}),
    ...(inventoryMode ? { inventory_mode: inventoryMode } : {}),
    ...(measurementProfile ? { measurement_profile: measurementProfile } : {}),
    ...(color ? { color } : {}),
    ...(condition ? { condition } : {}),
    ...(generation ? { generation } : {}),
    ...(length === undefined ? {} : { length_micros: length }),
    ...(width === undefined ? {} : { width_micros: width }),
    ...(height === undefined ? {} : { height_micros: height }),
    ...(thickness === undefined ? {} : { thickness_micros: thickness }),
  };
}

function allocatePhysicalCounts(drafts: RowDraft[]): void {
  const groups = new Map<string, RowDraft[]>();
  for (const draft of drafts) {
    if (!draft.allocationGroup || draft.physicalTotal === undefined) continue;
    const group = groups.get(draft.allocationGroup) ?? [];
    group.push(draft);
    groups.set(draft.allocationGroup, group);
  }

  for (const group of groups.values()) {
    const total = group[0]?.physicalTotal ?? 0;
    const quantityTotal = group.reduce((sum, draft) => sum + Math.abs(draft.row.quantity_micros), 0);
    let allocated = 0;
    for (const [index, draft] of group.entries()) {
      const absolute = index === group.length - 1 || quantityTotal === 0
        ? total - allocated
        : Math.round(total * Math.abs(draft.row.quantity_micros) / quantityTotal);
      allocated += absolute;
      draft.row.physical_count_micros = draft.row.quantity_micros < 0 ? -absolute : absolute;
    }
  }
}

function indexChildren(rows: ChildSqlRow[]): Map<string, ChildSnapshot[]> {
  const output = new Map<string, ChildSnapshot[]>();
  for (const [index, row] of rows.entries()) {
    const key = documentKey(row.doctype, row.name);
    const values = output.get(key) ?? [];
    values.push({
      rowId: requireText(row.row_id, `document child ${index + 1}.row_id`, 240),
      data: parseObject(row.payload_json, `document child ${index + 1}`),
    });
    values.sort((left, right) => right.rowId.length - left.rowId.length || left.rowId.localeCompare(right.rowId));
    output.set(key, values);
  }
  return output;
}

function matchChild(lineKey: string, children: readonly ChildSnapshot[]): ChildSnapshot | undefined {
  return children.find((child) => hasLineSegment(lineKey, child.rowId));
}

function hasLineSegment(lineKey: string, rowId: string): boolean {
  const escaped = rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|-)${escaped}($|-)`).test(lineKey);
}

function parseLineKey(value: unknown): {
  core: string;
  direction: "source" | "target" | "finished" | "other";
  reversed: boolean;
} {
  const original = requireText(value, "line_key", 500);
  const reversed = original.startsWith("REV-");
  const core = reversed ? original.slice(4) : original;
  const direction = core.startsWith("SRC-")
    ? "source"
    : core.startsWith("TGT-")
      ? "target"
      : core.startsWith("FINISHED")
        ? "finished"
        : "other";
  return { core, direction, reversed };
}

function assertWithinLimit(count: number, limit: number, label: string): void {
  if (count > limit) {
    throw errors.validation(`Physical stock ${label} scan exceeds the ${limit} row safety limit`);
  }
}

function documentKey(doctype: string, name: string): string {
  return `${doctype}\u0000${name}`;
}

function parseObject(value: string, label: string): JsonObject {
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = object(parsed);
    if (!result) throw new Error("not an object");
    return result;
  } catch {
    throw errors.misconfigured(`Physical stock ${label} payload is invalid JSON`);
  }
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function optionalSafeInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return safeInteger(value, field);
}

function safeInteger(value: unknown, field: string): number {
  const result = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(result)) throw errors.misconfigured(`Physical stock ${field} must be a safe integer`);
  return result;
}

function requireText(value: unknown, field: string, max: number): string {
  const result = text(value);
  if (!result || result.length > max) {
    throw errors.misconfigured(`Physical stock ${field} is required and must be at most ${max} characters`);
  }
  return result;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}