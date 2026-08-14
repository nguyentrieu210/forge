type Json = Record<string, unknown>;

export type ProductionRequestDerivedState =
  | "Nháp"
  | "Đang tạo lệnh"
  | "Đã tạo lệnh"
  | "Đang sản xuất"
  | "Hoàn thành"
  | "Đã huỷ";

export interface ProductionRequestLifecycleLine extends Json {
  request_line_key: string;
  sales_order_row_id: string;
  item_code: string;
  work_order?: string;
  work_order_status?: string;
  health: "MISSING_WORK_ORDER" | "READY" | "IN_PROCESS" | "COMPLETED" | "CANCELLED" | "DUPLICATE_WORK_ORDER";
  duplicates?: string[];
}

export interface ProductionRequestLifecycleResult extends Json {
  schema_version: 1;
  evidence_scope: "PRODUCTION_REQUEST_ITEMS_AND_LINKED_WORK_ORDERS";
  production_request: string;
  sales_order: string;
  stored_state: string;
  derived_state: ProductionRequestDerivedState;
  state_drift: boolean;
  expected_line_count: number;
  active_work_order_count: number;
  completed_work_order_count: number;
  lines: ProductionRequestLifecycleLine[];
  warnings: string[];
}

/**
 * Pure vertical lifecycle projection. Production Request.request_state is compatibility UI
 * state only; exact request_line_key -> Work Order evidence determines the derived state.
 */
export function deriveProductionRequestLifecycle(
  request: Json,
  workOrders: Json[],
): ProductionRequestLifecycleResult {
  const requestName = requiredText(request.name, "Production Request name");
  const salesOrder = requiredText(request.sales_order, "Production Request sales_order");
  const storedState = text(request.request_state) || "Nháp";
  const rows = arrayObjects(request.items);
  const warnings = new Set<string>();
  if (rows.length === 0) warnings.add("PRODUCTION_REQUEST_HAS_NO_ITEMS");

  const byKey = new Map<string, Json[]>();
  for (const workOrder of workOrders) {
    if (text(workOrder.production_request) !== requestName) continue;
    const key = text(workOrder.production_request_line_key);
    if (!key) {
      warnings.add(`WORK_ORDER_MISSING_REQUEST_LINE_KEY:${text(workOrder.name) || "UNKNOWN"}`);
      continue;
    }
    const list = byKey.get(key) ?? [];
    list.push(workOrder);
    byKey.set(key, list);
  }

  const lines: ProductionRequestLifecycleLine[] = [];
  let activeCount = 0;
  let completedCount = 0;
  let missingCount = 0;
  let duplicateCount = 0;
  let inProcessCount = 0;

  for (const [index, row] of rows.entries()) {
    const key = text(row.request_line_key);
    if (!key) {
      warnings.add(`REQUEST_ITEM_MISSING_LINE_KEY:${index + 1}`);
      continue;
    }
    const matches = byKey.get(key) ?? [];
    const active = matches.filter((workOrder) => Number(workOrder.docstatus ?? 0) !== 2 && normalizedStatus(workOrder) !== "cancelled");
    if (active.length > 1) {
      duplicateCount += 1;
      warnings.add(`DUPLICATE_ACTIVE_WORK_ORDER:${key}`);
      lines.push({
        request_line_key: key,
        sales_order_row_id: text(row.sales_order_row_id),
        item_code: text(row.item_code),
        health: "DUPLICATE_WORK_ORDER",
        duplicates: active.map((workOrder) => text(workOrder.name)).filter(Boolean),
      });
      continue;
    }
    if (active.length === 0) {
      missingCount += 1;
      const cancelled = matches.find((workOrder) => Number(workOrder.docstatus ?? 0) === 2 || normalizedStatus(workOrder) === "cancelled");
      lines.push({
        request_line_key: key,
        sales_order_row_id: text(row.sales_order_row_id),
        item_code: text(row.item_code),
        ...(cancelled && text(cancelled.name) ? { work_order: text(cancelled.name), work_order_status: canonicalStatus(cancelled) } : {}),
        health: cancelled ? "CANCELLED" : "MISSING_WORK_ORDER",
      });
      continue;
    }

    activeCount += 1;
    const workOrder = active[0]!;
    const status = canonicalStatus(workOrder);
    const normalized = normalizedStatus(workOrder);
    if (normalized === "completed") completedCount += 1;
    else if (normalized === "in process") inProcessCount += 1;
    lines.push({
      request_line_key: key,
      sales_order_row_id: text(row.sales_order_row_id),
      item_code: text(row.item_code),
      work_order: text(workOrder.name),
      work_order_status: status,
      health: normalized === "completed" ? "COMPLETED" : normalized === "in process" ? "IN_PROCESS" : "READY",
    });
  }

  for (const key of byKey.keys()) {
    if (!rows.some((row) => text(row.request_line_key) === key)) warnings.add(`ORPHAN_WORK_ORDER_LINE_KEY:${key}`);
  }

  const expected = rows.filter((row) => text(row.request_line_key)).length;
  let derived: ProductionRequestDerivedState;
  if (storedState === "Đã huỷ" && activeCount === 0) derived = "Đã huỷ";
  else if (expected === 0) derived = "Nháp";
  else if (duplicateCount > 0 || missingCount > 0) derived = "Đang tạo lệnh";
  else if (completedCount === expected) derived = "Hoàn thành";
  else if (completedCount > 0 || inProcessCount > 0) derived = "Đang sản xuất";
  else derived = "Đã tạo lệnh";

  if (storedState !== derived) warnings.add(`REQUEST_STATE_DRIFT:${storedState}->${derived}`);
  return {
    schema_version: 1,
    evidence_scope: "PRODUCTION_REQUEST_ITEMS_AND_LINKED_WORK_ORDERS",
    production_request: requestName,
    sales_order: salesOrder,
    stored_state: storedState,
    derived_state: derived,
    state_drift: storedState !== derived,
    expected_line_count: expected,
    active_work_order_count: activeCount,
    completed_work_order_count: completedCount,
    lines,
    warnings: [...warnings].sort(),
  };
}

function canonicalStatus(workOrder: Json): string {
  const status = text(workOrder.status);
  if (status) return status;
  const produced = Number(workOrder.produced_qty_micros ?? 0);
  const target = Number(workOrder.qty_micros ?? 0);
  if (Number(workOrder.docstatus ?? 0) === 2) return "Cancelled";
  return produced <= 0 ? "Not Started" : target > 0 && produced >= target ? "Completed" : "In Process";
}
function normalizedStatus(workOrder: Json): string { return canonicalStatus(workOrder).toLocaleLowerCase("en"); }
function arrayObjects(value: unknown): Json[] { return Array.isArray(value) ? value.filter((row): row is Json => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }
function requiredText(value: unknown, field: string): string { const result = text(value); if (!result) throw new Error(`${field} is required`); return result; }
function text(value: unknown): string { return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : ""; }
