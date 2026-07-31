import { fromScaledInt } from "../../money/src/index.js";

export type PurchaseSupplierDebtWindowStatus = "Open" | "Settled" | "Reversed";

export interface PurchaseSupplierDebtReportFilters {
  company?: string;
  supplier?: string;
  item_code?: string;
  window_id?: string;
  status?: PurchaseSupplierDebtWindowStatus;
  from_date?: string;
  to_date?: string;
  limit?: number;
}

export interface PurchaseSupplierDebtReportColumn {
  key: keyof PurchaseSupplierDebtReportRow;
  label: string;
  align?: "left" | "right";
}

export interface PurchaseSupplierDebtReportSummary {
  label: string;
  value: string;
}

export interface PurchaseSupplierDebtReportRow {
  queue_key: string;
  window_id: string;
  window_sequence: number;
  window_status: PurchaseSupplierDebtWindowStatus;
  company: string;
  supplier: string;
  item_code: string;
  material: string;
  ordered_qty: string;
  received_qty: string;
  allocated_qty: string;
  nominal_remaining_qty: string;
  unapplied_receipt_qty: string;
  tolerance: string;
  oldest_open_po_date: string | null;
  oldest_open_po_age_days: number | null;
  barem_weight_kg: string;
  actual_weight_kg: string | null;
}

export interface PurchaseSupplierDebtReport {
  kind: "purchase_supplier_debt_report";
  title: string;
  description: string;
  generated_at: string;
  csv_filename: string;
  filters: PurchaseSupplierDebtReportFilters;
  columns: PurchaseSupplierDebtReportColumn[];
  rows: PurchaseSupplierDebtReportRow[];
  summary: PurchaseSupplierDebtReportSummary[];
}

export interface PurchaseSupplierDebtLedgerRow {
  queue_key: string;
  company: string;
  supplier: string;
  material_snapshot_json: string;
  window_id: string;
  window_sequence: number;
  window_status: PurchaseSupplierDebtWindowStatus;
  tolerance_bps: number;
  opened_at: string;
  ordered_qty_micros: number;
  allocated_qty_micros: number;
  unapplied_qty_micros: number;
  barem_weight_micros: number;
  actual_weight_micros: number;
  actual_weight_value_count: number;
  oldest_open_po_date: string | null;
}

export class D1PurchaseSupplierDebtReportService {
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async run(
    tenantId: string,
    filters: PurchaseSupplierDebtReportFilters = {},
    generatedAt = new Date().toISOString(),
  ): Promise<PurchaseSupplierDebtReport | null> {
    const rollout = await this.reader.prepare(
      "SELECT enabled FROM purchase_allocation_rollout_state WHERE tenant_id=?1",
    ).bind(tenantId).first<{ enabled: number }>();
    if (Number(rollout?.enabled ?? 0) !== 1) return null;

    const bindings: unknown[] = [tenantId];
    const conditions = ["queue.tenant_id=?1"];
    const bind = (value: unknown): string => {
      bindings.push(value);
      return `?${bindings.length}`;
    };

    if (filters.company) conditions.push(`queue.company=${bind(filters.company)}`);
    if (filters.supplier) conditions.push(`queue.supplier=${bind(filters.supplier)}`);
    if (filters.item_code) {
      conditions.push(`json_extract(queue.material_snapshot_json,'$.item_code')=${bind(filters.item_code)}`);
    }
    if (filters.window_id) conditions.push(`window.window_id=${bind(filters.window_id)}`);
    if (filters.status) conditions.push(`window.status=${bind(filters.status)}`);
    if (filters.from_date) conditions.push(`substr(window.opened_at,1,10)>=${bind(filters.from_date)}`);
    if (filters.to_date) conditions.push(`substr(window.opened_at,1,10)<=${bind(filters.to_date)}`);

    const limit = Math.min(Math.max(Math.trunc(filters.limit ?? 250), 1), 500);
    const limitPlaceholder = bind(limit);
    const result = await this.reader.prepare(
      `WITH obligation_by_row AS (
         SELECT tenant_id,window_id,purchase_order,purchase_order_item_row_id,
                MIN(transaction_date) AS transaction_date,
                SUM(qty_micros) AS obligation_qty_micros
         FROM purchase_window_obligation_entries
         WHERE tenant_id=?1
         GROUP BY tenant_id,window_id,purchase_order,purchase_order_item_row_id
       ),
       allocation_by_row AS (
         SELECT tenant_id,window_id,purchase_order,purchase_order_item_row_id,
                SUM(qty_micros) AS allocated_qty_micros
         FROM purchase_receipt_allocation_entries
         WHERE tenant_id=?1
         GROUP BY tenant_id,window_id,purchase_order,purchase_order_item_row_id
       ),
       obligation_by_window AS (
         SELECT tenant_id,window_id,SUM(qty_micros) AS ordered_qty_micros
         FROM purchase_window_obligation_entries
         WHERE tenant_id=?1
         GROUP BY tenant_id,window_id
       ),
       allocation_by_window AS (
         SELECT tenant_id,window_id,
                SUM(qty_micros) AS allocated_qty_micros,
                SUM(barem_weight_micros) AS barem_weight_micros,
                SUM(COALESCE(projected_actual_weight_micros,0)) AS actual_weight_micros,
                SUM(CASE WHEN projected_actual_weight_micros IS NULL THEN 0 ELSE 1 END) AS actual_weight_value_count
         FROM purchase_receipt_allocation_entries
         WHERE tenant_id=?1
         GROUP BY tenant_id,window_id
       ),
       unapplied_by_window AS (
         SELECT tenant_id,window_id,
                SUM(qty_micros) AS unapplied_qty_micros,
                SUM(COALESCE(barem_weight_micros,0)) AS barem_weight_micros,
                SUM(COALESCE(projected_actual_weight_micros,0)) AS actual_weight_micros,
                SUM(CASE WHEN projected_actual_weight_micros IS NULL THEN 0 ELSE 1 END) AS actual_weight_value_count
         FROM purchase_unapplied_receipt_entries
         WHERE tenant_id=?1
         GROUP BY tenant_id,window_id
       ),
       oldest_open_po AS (
         SELECT obligation.tenant_id,obligation.window_id,
                MIN(obligation.transaction_date) AS oldest_open_po_date
         FROM obligation_by_row obligation
         LEFT JOIN allocation_by_row allocation
           ON allocation.tenant_id=obligation.tenant_id
          AND allocation.window_id=obligation.window_id
          AND allocation.purchase_order=obligation.purchase_order
          AND allocation.purchase_order_item_row_id IS obligation.purchase_order_item_row_id
         WHERE obligation.obligation_qty_micros-COALESCE(allocation.allocated_qty_micros,0)>0
         GROUP BY obligation.tenant_id,obligation.window_id
       )
       SELECT queue.queue_key,queue.company,queue.supplier,queue.material_snapshot_json,
              window.window_id,window.window_sequence,window.status AS window_status,
              window.tolerance_bps,window.opened_at,
              COALESCE(obligation.ordered_qty_micros,0) AS ordered_qty_micros,
              COALESCE(allocation.allocated_qty_micros,0) AS allocated_qty_micros,
              COALESCE(unapplied.unapplied_qty_micros,0) AS unapplied_qty_micros,
              COALESCE(allocation.barem_weight_micros,0)+COALESCE(unapplied.barem_weight_micros,0)
                AS barem_weight_micros,
              COALESCE(allocation.actual_weight_micros,0)+COALESCE(unapplied.actual_weight_micros,0)
                AS actual_weight_micros,
              COALESCE(allocation.actual_weight_value_count,0)+COALESCE(unapplied.actual_weight_value_count,0)
                AS actual_weight_value_count,
              oldest.oldest_open_po_date
       FROM purchase_obligation_queues queue
       JOIN purchase_settlement_windows window
         ON window.tenant_id=queue.tenant_id AND window.queue_key=queue.queue_key
       LEFT JOIN obligation_by_window obligation
         ON obligation.tenant_id=window.tenant_id AND obligation.window_id=window.window_id
       LEFT JOIN allocation_by_window allocation
         ON allocation.tenant_id=window.tenant_id AND allocation.window_id=window.window_id
       LEFT JOIN unapplied_by_window unapplied
         ON unapplied.tenant_id=window.tenant_id AND unapplied.window_id=window.window_id
       LEFT JOIN oldest_open_po oldest
         ON oldest.tenant_id=window.tenant_id AND oldest.window_id=window.window_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY queue.supplier,queue.company,
                json_extract(queue.material_snapshot_json,'$.item_code'),
                window.window_sequence,window.window_id
       LIMIT ${limitPlaceholder}`,
    ).bind(...bindings).all<PurchaseSupplierDebtLedgerRow>();

    return buildPurchaseSupplierDebtReport(
      (result.results ?? []).map(normalizeLedgerRow),
      generatedAt,
      { ...filters, limit },
    );
  }
}

export function buildPurchaseSupplierDebtReport(
  ledgerRows: PurchaseSupplierDebtLedgerRow[],
  generatedAt: string,
  filters: PurchaseSupplierDebtReportFilters = {},
): PurchaseSupplierDebtReport {
  const rows = ledgerRows.map((row) => {
    const material = parseMaterialSnapshot(row.material_snapshot_json);
    const allocated = row.allocated_qty_micros;
    const unapplied = row.unapplied_qty_micros;
    const received = allocated + unapplied;
    const remaining = Math.max(row.ordered_qty_micros - allocated, 0);
    return {
      queue_key: row.queue_key,
      window_id: row.window_id,
      window_sequence: row.window_sequence,
      window_status: row.window_status,
      company: row.company,
      supplier: row.supplier,
      item_code: material.item_code,
      material: materialLabel(material),
      ordered_qty: micros(row.ordered_qty_micros),
      received_qty: micros(received),
      allocated_qty: micros(allocated),
      nominal_remaining_qty: micros(remaining),
      unapplied_receipt_qty: micros(unapplied),
      tolerance: `${trimDecimal(row.tolerance_bps / 100)}%`,
      oldest_open_po_date: row.oldest_open_po_date,
      oldest_open_po_age_days: ageDays(row.oldest_open_po_date, generatedAt),
      barem_weight_kg: micros(row.barem_weight_micros),
      actual_weight_kg: row.actual_weight_value_count > 0 ? micros(row.actual_weight_micros) : null,
    } satisfies PurchaseSupplierDebtReportRow;
  });

  const totalOrdered = ledgerRows.reduce((sum, row) => sum + row.ordered_qty_micros, 0);
  const totalAllocated = ledgerRows.reduce((sum, row) => sum + row.allocated_qty_micros, 0);
  const totalUnapplied = ledgerRows.reduce((sum, row) => sum + row.unapplied_qty_micros, 0);
  const supplierCount = new Set(ledgerRows.map((row) => row.supplier)).size;
  const queueCount = new Set(ledgerRows.map((row) => row.queue_key)).size;

  return {
    kind: "purchase_supplier_debt_report",
    title: "Công nợ giao hàng nhà cung cấp",
    description: "Đọc trực tiếp từ allocation ledger append-only; bảng progress cũ không được dùng làm nguồn sự thật.",
    generated_at: generatedAt,
    csv_filename: `purchase-supplier-debt-${generatedAt.slice(0, 10)}.csv`,
    filters,
    columns: [
      { key: "supplier", label: "Nhà cung cấp" },
      { key: "company", label: "Công ty" },
      { key: "material", label: "Vật tư" },
      { key: "window_sequence", label: "Cửa sổ", align: "right" },
      { key: "window_status", label: "Trạng thái" },
      { key: "ordered_qty", label: "Đã đặt", align: "right" },
      { key: "received_qty", label: "Tổng đã nhận", align: "right" },
      { key: "allocated_qty", label: "Đã phân bổ", align: "right" },
      { key: "nominal_remaining_qty", label: "Nợ danh nghĩa", align: "right" },
      { key: "unapplied_receipt_qty", label: "Phiếu nhập chờ", align: "right" },
      { key: "tolerance", label: "Dung sai", align: "right" },
      { key: "oldest_open_po_date", label: "PO mở cũ nhất" },
      { key: "oldest_open_po_age_days", label: "Tuổi PO (ngày)", align: "right" },
      { key: "barem_weight_kg", label: "Kg barem", align: "right" },
      { key: "actual_weight_kg", label: "Kg thực tế", align: "right" },
    ],
    rows,
    summary: [
      { label: "Nhà cung cấp", value: String(supplierCount) },
      { label: "Luồng vật tư", value: String(queueCount) },
      { label: "Cửa sổ", value: String(rows.length) },
      { label: "Đã đặt", value: micros(totalOrdered) },
      { label: "Đã phân bổ", value: micros(totalAllocated) },
      { label: "Nợ danh nghĩa", value: micros(Math.max(totalOrdered - totalAllocated, 0)) },
      { label: "Phiếu nhập chờ", value: micros(totalUnapplied) },
    ],
  };
}

function normalizeLedgerRow(row: PurchaseSupplierDebtLedgerRow): PurchaseSupplierDebtLedgerRow {
  return {
    queue_key: String(row.queue_key),
    company: String(row.company),
    supplier: String(row.supplier),
    material_snapshot_json: String(row.material_snapshot_json),
    window_id: String(row.window_id),
    window_sequence: Number(row.window_sequence),
    window_status: String(row.window_status) as PurchaseSupplierDebtWindowStatus,
    tolerance_bps: Number(row.tolerance_bps),
    opened_at: String(row.opened_at),
    ordered_qty_micros: Number(row.ordered_qty_micros),
    allocated_qty_micros: Number(row.allocated_qty_micros),
    unapplied_qty_micros: Number(row.unapplied_qty_micros),
    barem_weight_micros: Number(row.barem_weight_micros),
    actual_weight_micros: Number(row.actual_weight_micros),
    actual_weight_value_count: Number(row.actual_weight_value_count),
    oldest_open_po_date: row.oldest_open_po_date == null ? null : String(row.oldest_open_po_date),
  };
}

interface MaterialSnapshot {
  item_code: string;
  length_m_micros: number;
  color: string;
  is_stamped: number;
  stock_uom: string;
}

function parseMaterialSnapshot(value: string): MaterialSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = {};
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
  return {
    item_code: typeof record.item_code === "string" && record.item_code.trim()
      ? record.item_code.trim()
      : "Không rõ vật tư",
    length_m_micros: Number.isFinite(Number(record.length_m_micros))
      ? Number(record.length_m_micros)
      : 0,
    color: typeof record.color === "string" ? record.color.trim() : "",
    is_stamped: Number(record.is_stamped) === 1 ? 1 : 0,
    stock_uom: typeof record.stock_uom === "string" ? record.stock_uom.trim() : "",
  };
}

function materialLabel(material: MaterialSnapshot): string {
  const parts = [material.item_code];
  if (material.length_m_micros > 0) parts.push(`${micros(material.length_m_micros)} m`);
  if (material.color) parts.push(material.color);
  if (material.is_stamped === 1) parts.push("Dập");
  if (material.stock_uom) parts.push(material.stock_uom);
  return parts.join(" · ");
}

function ageDays(value: string | null, generatedAt: string): number | null {
  if (!value) return null;
  const start = Date.parse(`${value.slice(0, 10)}T00:00:00.000Z`);
  const end = Date.parse(`${generatedAt.slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(Math.floor((end - start) / 86_400_000), 0);
}

function micros(value: number): string {
  const formatted = fromScaledInt(Math.round(value), 6);
  const separator = formatted.indexOf(".");
  if (separator < 0) return formatted;
  const whole = formatted.slice(0, separator);
  const fraction = formatted.slice(separator + 1).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function trimDecimal(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
