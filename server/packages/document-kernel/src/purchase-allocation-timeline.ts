import { fromScaledInt } from "../../money/src/index.js";

export type PurchaseAllocationTimelineDoctype = "Purchase Order" | "Purchase Receipt";

export interface PurchaseAllocationTimelineColumn {
  key: string;
  label: string;
  align?: "left" | "right";
}

export interface PurchaseAllocationTimelineSummary {
  label: string;
  value: string;
}

export interface PurchaseAllocationTimelineWindow {
  window_id: string;
  sequence: number;
  status: "Open" | "Settled" | "Reversed";
  tolerance: string;
  nominal_qty: string;
  received_qty: string;
  remaining_qty: string;
  minimum_qty: string | null;
  maximum_qty: string | null;
  shortage_variance: string | null;
  overage_variance: string | null;
  reason: string | null;
}

export interface PurchaseAllocationTimelineRow {
  row_id: string;
  event_at: string;
  event: string;
  window: string;
  purchase_receipt: string | null;
  receipt_row: string | null;
  purchase_order: string | null;
  purchase_order_row: string | null;
  qty: string;
  barem_weight_kg: string | null;
  actual_weight_kg: string | null;
  actor: string;
  reason: string | null;
}

export interface PurchaseAllocationTimeline {
  kind: "purchase_allocation_timeline";
  doctype: PurchaseAllocationTimelineDoctype;
  name: string;
  title: string;
  description: string;
  columns: PurchaseAllocationTimelineColumn[];
  rows: PurchaseAllocationTimelineRow[];
  summary: PurchaseAllocationTimelineSummary[];
  windows: PurchaseAllocationTimelineWindow[];
}

export interface PurchaseAllocationTimelineLedgerRow {
  source_type: "obligation" | "allocation" | "unapplied";
  entry_id: string;
  entry_kind: string;
  window_id: string;
  window_sequence: number;
  window_status: "Open" | "Settled" | "Reversed";
  tolerance_bps: number;
  purchase_order: string | null;
  purchase_receipt: string | null;
  purchase_order_item_row_id: string | null;
  receipt_item_row_id: string | null;
  qty_micros: number;
  barem_weight_micros: number | null;
  projected_actual_weight_micros: number | null;
  posting_at: string | null;
  committed_at: string;
  actor: string;
  reason: string | null;
}

export interface PurchaseAllocationTimelineWindowRow {
  window_id: string;
  window_sequence: number;
  window_status: "Open" | "Settled" | "Reversed";
  tolerance_bps: number;
  nominal_qty_micros: number;
  received_qty_micros: number;
  minimum_qty_micros: number | null;
  maximum_qty_micros: number | null;
  shortage_variance_micros: number | null;
  overage_variance_micros: number | null;
  settlement_reason: string | null;
}

export class D1PurchaseAllocationTimelineService {
  private readonly reader: D1Database | D1DatabaseSession;

  constructor(db: D1Database) {
    this.reader = db.withSession?.("first-primary") ?? db;
  }

  async getTimeline(
    tenantId: string,
    doctype: PurchaseAllocationTimelineDoctype,
    name: string,
  ): Promise<PurchaseAllocationTimeline | null> {
    const rollout = await this.reader.prepare(
      "SELECT enabled FROM purchase_allocation_rollout_state WHERE tenant_id=?1",
    ).bind(tenantId).first<{ enabled: number }>();
    if (Number(rollout?.enabled ?? 0) !== 1) return null;

    const rows = doctype === "Purchase Order"
      ? await this.listPurchaseOrderRows(tenantId, name)
      : await this.listPurchaseReceiptRows(tenantId, name);
    const windows = await this.listWindows(tenantId, doctype, name);
    return buildPurchaseAllocationTimeline(doctype, name, rows, windows);
  }

  private async listPurchaseOrderRows(
    tenantId: string,
    purchaseOrder: string,
  ): Promise<PurchaseAllocationTimelineLedgerRow[]> {
    const obligations = await this.reader.prepare(
      `SELECT 'obligation' AS source_type, entry.entry_id, entry.entry_kind,
              entry.window_id, window.window_sequence, window.status AS window_status,
              window.tolerance_bps, entry.purchase_order, NULL AS purchase_receipt,
              entry.purchase_order_item_row_id, NULL AS receipt_item_row_id,
              entry.qty_micros, 0 AS barem_weight_micros,
              NULL AS projected_actual_weight_micros,
              entry.transaction_date AS posting_at, entry.committed_at,
              entry.actor, NULL AS reason
       FROM purchase_window_obligation_entries entry
       JOIN purchase_settlement_windows window
         ON window.tenant_id=entry.tenant_id AND window.window_id=entry.window_id
       WHERE entry.tenant_id=?1 AND entry.purchase_order=?2`,
    ).bind(tenantId, purchaseOrder).all<PurchaseAllocationTimelineLedgerRow>();

    const allocations = await this.reader.prepare(
      `SELECT 'allocation' AS source_type, entry.entry_id, entry.entry_kind,
              entry.window_id, window.window_sequence, window.status AS window_status,
              window.tolerance_bps, entry.purchase_order,
              entry.voucher_no AS purchase_receipt,
              entry.purchase_order_item_row_id, entry.receipt_item_row_id,
              entry.qty_micros, entry.barem_weight_micros,
              entry.projected_actual_weight_micros,
              entry.posting_at, entry.committed_at, entry.actor, entry.reason
       FROM purchase_receipt_allocation_entries entry
       JOIN purchase_settlement_windows window
         ON window.tenant_id=entry.tenant_id AND window.window_id=entry.window_id
       WHERE entry.tenant_id=?1 AND entry.purchase_order=?2`,
    ).bind(tenantId, purchaseOrder).all<PurchaseAllocationTimelineLedgerRow>();

    return [...(obligations.results ?? []), ...(allocations.results ?? [])].map(normalizeLedgerRow);
  }

  private async listPurchaseReceiptRows(
    tenantId: string,
    purchaseReceipt: string,
  ): Promise<PurchaseAllocationTimelineLedgerRow[]> {
    const allocations = await this.reader.prepare(
      `SELECT 'allocation' AS source_type, entry.entry_id, entry.entry_kind,
              entry.window_id, window.window_sequence, window.status AS window_status,
              window.tolerance_bps, entry.purchase_order,
              entry.voucher_no AS purchase_receipt,
              entry.purchase_order_item_row_id, entry.receipt_item_row_id,
              entry.qty_micros, entry.barem_weight_micros,
              entry.projected_actual_weight_micros,
              entry.posting_at, entry.committed_at, entry.actor, entry.reason
       FROM purchase_receipt_allocation_entries entry
       JOIN purchase_settlement_windows window
         ON window.tenant_id=entry.tenant_id AND window.window_id=entry.window_id
       WHERE entry.tenant_id=?1 AND entry.voucher_no=?2`,
    ).bind(tenantId, purchaseReceipt).all<PurchaseAllocationTimelineLedgerRow>();

    const unapplied = await this.reader.prepare(
      `SELECT 'unapplied' AS source_type, entry.entry_id, entry.entry_kind,
              entry.window_id, window.window_sequence, window.status AS window_status,
              window.tolerance_bps, allocation.purchase_order,
              entry.voucher_no AS purchase_receipt,
              allocation.purchase_order_item_row_id, entry.receipt_item_row_id,
              entry.qty_micros, COALESCE(entry.barem_weight_micros,0) AS barem_weight_micros,
              entry.projected_actual_weight_micros,
              entry.posting_at, entry.committed_at, entry.actor, entry.reason
       FROM purchase_unapplied_receipt_entries entry
       JOIN purchase_settlement_windows window
         ON window.tenant_id=entry.tenant_id AND window.window_id=entry.window_id
       LEFT JOIN purchase_receipt_allocation_entries allocation
         ON allocation.tenant_id=entry.tenant_id
        AND allocation.entry_id=entry.allocation_entry_id
       WHERE entry.tenant_id=?1 AND entry.voucher_no=?2`,
    ).bind(tenantId, purchaseReceipt).all<PurchaseAllocationTimelineLedgerRow>();

    return [...(allocations.results ?? []), ...(unapplied.results ?? [])].map(normalizeLedgerRow);
  }

  private async listWindows(
    tenantId: string,
    doctype: PurchaseAllocationTimelineDoctype,
    name: string,
  ): Promise<PurchaseAllocationTimelineWindowRow[]> {
    const involvement = doctype === "Purchase Order"
      ? `(EXISTS (SELECT 1 FROM purchase_window_obligation_entries obligation
                  WHERE obligation.tenant_id=window.tenant_id
                    AND obligation.window_id=window.window_id
                    AND obligation.purchase_order=?2)
          OR EXISTS (SELECT 1 FROM purchase_receipt_allocation_entries allocation
                     WHERE allocation.tenant_id=window.tenant_id
                       AND allocation.window_id=window.window_id
                       AND allocation.purchase_order=?2))`
      : `(EXISTS (SELECT 1 FROM purchase_receipt_allocation_entries allocation
                  WHERE allocation.tenant_id=window.tenant_id
                    AND allocation.window_id=window.window_id
                    AND allocation.voucher_no=?2)
          OR EXISTS (SELECT 1 FROM purchase_unapplied_receipt_entries unapplied
                     WHERE unapplied.tenant_id=window.tenant_id
                       AND unapplied.window_id=window.window_id
                       AND unapplied.voucher_no=?2))`;

    const result = await this.reader.prepare(
      `SELECT window.window_id, window.window_sequence,
              window.status AS window_status, window.tolerance_bps,
              COALESCE((SELECT SUM(obligation.qty_micros)
                        FROM purchase_window_obligation_entries obligation
                        WHERE obligation.tenant_id=window.tenant_id
                          AND obligation.window_id=window.window_id),0) AS nominal_qty_micros,
              COALESCE((SELECT SUM(allocation.qty_micros)
                        FROM purchase_receipt_allocation_entries allocation
                        WHERE allocation.tenant_id=window.tenant_id
                          AND allocation.window_id=window.window_id),0)
                + COALESCE((SELECT SUM(unapplied.qty_micros)
                            FROM purchase_unapplied_receipt_entries unapplied
                            WHERE unapplied.tenant_id=window.tenant_id
                              AND unapplied.window_id=window.window_id),0)
                AS received_qty_micros,
              close.minimum_qty_micros, close.maximum_qty_micros,
              close.shortage_variance_micros, close.overage_variance_micros,
              close.reason AS settlement_reason
       FROM purchase_settlement_windows window
       LEFT JOIN purchase_settlement_entries close
         ON close.tenant_id=window.tenant_id
        AND close.window_id=window.window_id
        AND close.entry_kind='close'
       WHERE window.tenant_id=?1 AND ${involvement}
       ORDER BY window.window_sequence, window.window_id`,
    ).bind(tenantId, name).all<PurchaseAllocationTimelineWindowRow>();

    return (result.results ?? []).map(normalizeWindowRow);
  }
}

export function buildPurchaseAllocationTimeline(
  doctype: PurchaseAllocationTimelineDoctype,
  name: string,
  ledgerRows: PurchaseAllocationTimelineLedgerRow[],
  windowRows: PurchaseAllocationTimelineWindowRow[],
): PurchaseAllocationTimeline {
  const orderedRows = [...ledgerRows].sort((left, right) =>
    left.committed_at.localeCompare(right.committed_at) || left.entry_id.localeCompare(right.entry_id));
  const windows = windowRows.map((window) => ({
    window_id: window.window_id,
    sequence: window.window_sequence,
    status: window.window_status,
    tolerance: `${trimDecimal(window.tolerance_bps / 100)}%`,
    nominal_qty: micros(window.nominal_qty_micros),
    received_qty: micros(window.received_qty_micros),
    remaining_qty: micros(Math.max(window.nominal_qty_micros - window.received_qty_micros, 0)),
    minimum_qty: optionalMicros(window.minimum_qty_micros),
    maximum_qty: optionalMicros(window.maximum_qty_micros),
    shortage_variance: optionalMicros(window.shortage_variance_micros),
    overage_variance: optionalMicros(window.overage_variance_micros),
    reason: window.settlement_reason,
  }));

  const rows = orderedRows.map<PurchaseAllocationTimelineRow>((row) => ({
    row_id: row.entry_id,
    event_at: row.committed_at,
    event: eventLabel(row.source_type, row.entry_kind),
    window: `#${row.window_sequence} · ${windowStatusLabel(row.window_status)}`,
    purchase_receipt: row.purchase_receipt,
    receipt_row: row.receipt_item_row_id,
    purchase_order: row.purchase_order,
    purchase_order_row: row.purchase_order_item_row_id,
    qty: micros(row.qty_micros),
    barem_weight_kg: optionalNonZeroMicros(row.barem_weight_micros),
    actual_weight_kg: optionalMicros(row.projected_actual_weight_micros),
    actor: row.actor,
    reason: row.reason,
  }));

  const allocationRows = orderedRows.filter((row) => row.source_type === "allocation");
  const unappliedRows = orderedRows.filter((row) => row.source_type === "unapplied");
  const weightRows = doctype === "Purchase Order" ? allocationRows : [...allocationRows, ...unappliedRows];
  const baremWeight = weightRows.reduce((sum, row) => sum + Number(row.barem_weight_micros ?? 0), 0);
  const actualWeightValues = weightRows
    .map((row) => row.projected_actual_weight_micros)
    .filter((value): value is number => value != null);
  const actualWeight = actualWeightValues.reduce((sum, value) => sum + value, 0);

  const summary = doctype === "Purchase Order"
    ? purchaseOrderSummary(orderedRows, baremWeight, actualWeightValues.length ? actualWeight : null, windows.length)
    : purchaseReceiptSummary(allocationRows, unappliedRows, baremWeight, actualWeightValues.length ? actualWeight : null, windows.length);

  return {
    kind: "purchase_allocation_timeline",
    doctype,
    name,
    title: `Dòng thời gian phân bổ · ${name}`,
    description: "Dữ liệu đọc trực tiếp từ allocation ledger append-only. Các dòng âm là đảo/hủy, không phải bản ghi cũ bị sửa.",
    columns: [
      { key: "event_at", label: "Thời điểm" },
      { key: "event", label: "Sự kiện" },
      { key: "window", label: "Cửa sổ" },
      { key: "purchase_receipt", label: "Phiếu nhập" },
      { key: "receipt_row", label: "Dòng nhập" },
      { key: "purchase_order", label: "Đơn mua" },
      { key: "purchase_order_row", label: "Dòng PO" },
      { key: "qty", label: "Số lượng", align: "right" },
      { key: "barem_weight_kg", label: "Kg barem", align: "right" },
      { key: "actual_weight_kg", label: "Kg thực tế", align: "right" },
      { key: "actor", label: "Người thực hiện" },
      { key: "reason", label: "Lý do" },
    ],
    rows,
    summary,
    windows,
  };
}

function purchaseOrderSummary(
  rows: PurchaseAllocationTimelineLedgerRow[],
  baremWeight: number,
  actualWeight: number | null,
  windowCount: number,
): PurchaseAllocationTimelineSummary[] {
  const ordered = rows
    .filter((row) => row.source_type === "obligation")
    .reduce((sum, row) => sum + row.qty_micros, 0);
  const received = rows
    .filter((row) => row.source_type === "allocation")
    .reduce((sum, row) => sum + row.qty_micros, 0);
  return [
    { label: "Đã đặt", value: micros(ordered) },
    { label: "Đã nhận", value: micros(received) },
    { label: "Còn danh nghĩa", value: micros(Math.max(ordered - received, 0)) },
    { label: "Kg barem", value: micros(baremWeight) },
    ...(actualWeight == null ? [] : [{ label: "Kg thực tế", value: micros(actualWeight) }]),
    { label: "Cửa sổ", value: String(windowCount) },
  ];
}

function purchaseReceiptSummary(
  allocationRows: PurchaseAllocationTimelineLedgerRow[],
  unappliedRows: PurchaseAllocationTimelineLedgerRow[],
  baremWeight: number,
  actualWeight: number | null,
  windowCount: number,
): PurchaseAllocationTimelineSummary[] {
  const allocated = allocationRows.reduce((sum, row) => sum + row.qty_micros, 0);
  const unapplied = unappliedRows.reduce((sum, row) => sum + row.qty_micros, 0);
  return [
    { label: "Tổng nhận", value: micros(allocated + unapplied) },
    { label: "Đã phân bổ", value: micros(allocated) },
    { label: "Chưa phân bổ", value: micros(unapplied) },
    { label: "Kg barem", value: micros(baremWeight) },
    ...(actualWeight == null ? [] : [{ label: "Kg thực tế", value: micros(actualWeight) }]),
    { label: "Cửa sổ", value: String(windowCount) },
  ];
}

function normalizeLedgerRow(row: PurchaseAllocationTimelineLedgerRow): PurchaseAllocationTimelineLedgerRow {
  return {
    source_type: String(row.source_type) as PurchaseAllocationTimelineLedgerRow["source_type"],
    entry_id: String(row.entry_id),
    entry_kind: String(row.entry_kind),
    window_id: String(row.window_id),
    window_sequence: Number(row.window_sequence),
    window_status: String(row.window_status) as PurchaseAllocationTimelineLedgerRow["window_status"],
    tolerance_bps: Number(row.tolerance_bps),
    purchase_order: row.purchase_order == null ? null : String(row.purchase_order),
    purchase_receipt: row.purchase_receipt == null ? null : String(row.purchase_receipt),
    purchase_order_item_row_id: row.purchase_order_item_row_id == null ? null : String(row.purchase_order_item_row_id),
    receipt_item_row_id: row.receipt_item_row_id == null ? null : String(row.receipt_item_row_id),
    qty_micros: Number(row.qty_micros),
    barem_weight_micros: row.barem_weight_micros == null ? null : Number(row.barem_weight_micros),
    projected_actual_weight_micros: row.projected_actual_weight_micros == null
      ? null
      : Number(row.projected_actual_weight_micros),
    posting_at: row.posting_at == null ? null : String(row.posting_at),
    committed_at: String(row.committed_at),
    actor: String(row.actor),
    reason: row.reason == null ? null : String(row.reason),
  };
}

function normalizeWindowRow(row: PurchaseAllocationTimelineWindowRow): PurchaseAllocationTimelineWindowRow {
  return {
    window_id: String(row.window_id),
    window_sequence: Number(row.window_sequence),
    window_status: String(row.window_status) as PurchaseAllocationTimelineWindowRow["window_status"],
    tolerance_bps: Number(row.tolerance_bps),
    nominal_qty_micros: Number(row.nominal_qty_micros),
    received_qty_micros: Number(row.received_qty_micros),
    minimum_qty_micros: row.minimum_qty_micros == null ? null : Number(row.minimum_qty_micros),
    maximum_qty_micros: row.maximum_qty_micros == null ? null : Number(row.maximum_qty_micros),
    shortage_variance_micros: row.shortage_variance_micros == null ? null : Number(row.shortage_variance_micros),
    overage_variance_micros: row.overage_variance_micros == null ? null : Number(row.overage_variance_micros),
    settlement_reason: row.settlement_reason == null ? null : String(row.settlement_reason),
  };
}

function eventLabel(sourceType: PurchaseAllocationTimelineLedgerRow["source_type"], entryKind: string): string {
  const labels: Record<string, string> = {
    "obligation:open": "Mở nghĩa vụ PO",
    "obligation:cancel": "Hủy nghĩa vụ PO",
    "obligation:legacy": "Nghĩa vụ legacy",
    "allocation:allocate": "Phân bổ FIFO",
    "allocation:reverse": "Đảo phân bổ",
    "allocation:manual_allocate": "Phân bổ thủ công",
    "allocation:apply_unapplied": "Áp phiếu nhập chờ",
    "allocation:legacy": "Phân bổ legacy",
    "unapplied:receive": "Ghi nhận chưa phân bổ",
    "unapplied:apply": "Áp lượng chờ vào PO",
    "unapplied:reverse": "Đảo lượng chờ",
    "unapplied:settle": "Tất toán lượng chờ",
  };
  return labels[`${sourceType}:${entryKind}`] ?? `${sourceType}:${entryKind}`;
}

function windowStatusLabel(status: PurchaseAllocationTimelineLedgerRow["window_status"]): string {
  if (status === "Open") return "Đang mở";
  if (status === "Settled") return "Đã tất toán";
  return "Đã đảo tất toán";
}

function micros(value: number): string {
  const formatted = fromScaledInt(Math.round(value), 6);
  const separator = formatted.indexOf(".");
  if (separator < 0) return formatted;
  const whole = formatted.slice(0, separator);
  const fraction = formatted.slice(separator + 1).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

function optionalMicros(value: number | null | undefined): string | null {
  return value == null ? null : micros(value);
}

function optionalNonZeroMicros(value: number | null | undefined): string | null {
  return value == null || value === 0 ? null : micros(value);
}

function trimDecimal(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
