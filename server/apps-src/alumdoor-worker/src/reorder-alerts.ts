/**
 * D2/D3 của `docs/audits/ALUMDOOR-DANH-MUC-SERVER-NGU-20260821.md` — hai trường khai sẵn
 * trong danh mục mà tới ngày audit chưa có bất kỳ dòng code nào đọc giá trị:
 *
 *  · D2 — `Item.reorder_levels[].{safety_stock,reorder_level,reorder_qty,lead_time_days}`
 *    (bảng con "Mức tồn và đặt hàng"): không có chỗ nào so khớp với tồn hiện tại để báo
 *    "mã X đã dưới điểm đặt hàng lại".
 *  · D3 — `Supplier Item.minimum_order_qty` ("Số lượng mua tối thiểu"): không có chỗ nào đọc
 *    khi lập đơn mua cho đúng nhà cung cấp.
 *
 * Audit §4a xếp cả hai vào nhóm "suy được từ dữ liệu — chưa làm, không cần hỏi thêm": công
 * thức đã rõ trong tên trường, không cần quyết định nghiệp vụ mới để bắt đầu. Cả hai method ở
 * đây ĐỌC-CHỈ tuyệt đối — không tạo/sửa bất kỳ tài liệu nào, chỉ nối dây phần đọc.
 */

import type { PlatformCall } from "./platform-call.js";
import { answer, refuse } from "./responses.js";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

// ---------------------------------------------------------------------------
// D3 — Supplier Item.minimum_order_qty
// ---------------------------------------------------------------------------

export interface SupplierItemTerm {
  item_code: string;
  /** `false` = chưa khai "Mã hàng nhà cung cấp" này cho nhà cung cấp đã hỏi — KHÔNG phải MOQ = 0. */
  found: boolean;
  supplier_item_code?: string;
  minimum_order_qty?: number;
  lead_time_days?: number;
  preferred?: boolean;
  disabled?: boolean;
}

/**
 * `alumdoor.purchase.supplier_item_terms` — ĐỌC-CHỈ.
 *
 * `Supplier Item` đặt tên theo `format:{supplier}:{item_code}` (brief), nên tra thẳng theo tên
 * dựng sẵn — không cần quét bảng, không cần filter. Dùng khi lập Purchase Order/Material
 * Request: client hỏi một nhà cung cấp + danh sách mã hàng trên phiếu, method trả lại MOQ/thời
 * gian giao của đúng cặp (nhà cung cấp, mã hàng) đó.
 */
export async function supplierItemTerms(call: PlatformCall, args: Row): Promise<Response> {
  const supplier = text(args.supplier);
  if (!supplier) return refuse("Thiếu nhà cung cấp (supplier).");
  const itemCodesRaw = Array.isArray(args.item_codes) ? args.item_codes : [];
  const itemCodes = [...new Set(itemCodesRaw.map((code) => text(code)).filter(Boolean))].slice(0, 100);
  if (itemCodes.length === 0) return refuse("Thiếu danh sách mặt hàng (item_codes).");

  const terms = await Promise.all(itemCodes.map(async (itemCode): Promise<SupplierItemTerm> => {
    const name = `${supplier}:${itemCode}`;
    const response = await call(`resource/Supplier%20Item/${encodeURIComponent(name)}`).catch(() => null);
    if (!response?.ok) return { item_code: itemCode, found: false };
    const payload = await response.json().catch(() => null) as { data?: Row } | null;
    const data = payload?.data;
    if (!data) return { item_code: itemCode, found: false };
    const moq = number(data.minimum_order_qty);
    const lead = number(data.lead_time_days);
    return {
      item_code: itemCode,
      found: true,
      ...(text(data.supplier_item_code) ? { supplier_item_code: text(data.supplier_item_code) } : {}),
      ...(moq !== null ? { minimum_order_qty: moq } : {}),
      ...(lead !== null ? { lead_time_days: lead } : {}),
      preferred: truthy(data.preferred),
      disabled: truthy(data.disabled),
    };
  }));

  return answer({ supplier, terms });
}

// ---------------------------------------------------------------------------
// D2 — Item.reorder_levels so với tồn hiện tại
// ---------------------------------------------------------------------------

/**
 * `reorder_levels` là bảng con (`Table`) — không chiếu được qua danh sách (cùng giới hạn nền
 * tảng mà `catalog-readiness.ts` đã ghi ở đầu file đó: "BẢNG CON KHÔNG CHIẾU ĐƯỢC QUA LIST").
 * Nên phải mở TỪNG hồ sơ Item để đọc, đúng như `probeUomConversions` đã làm cho
 * `uom_conversions` — và vì vậy phải chặn hai lớp y hệt: trần số lượng + hạn giờ, để một danh
 * mục lớn không bao giờ làm method quá hạn.
 */
const ITEM_PAGE_SIZE = 100;
const MAX_ITEM_PAGES = 2; // trần quét mặt hàng còn dùng: tối đa 200 mã mỗi lượt gọi.
const PROBE_BATCH = 20;
const SCAN_BUDGET_MS = 8_000;

export interface ReorderAlertRow {
  item_code: string;
  item_name: string;
  warehouse: string;
  current_qty: number;
  safety_stock: number | null;
  reorder_level: number;
  reorder_qty: number | null;
  lead_time_days: number | null;
  /** `true` = tồn đã chạm cả điểm đặt hàng lại LẪN mức tồn an toàn — cấp bách hơn. */
  below_safety_stock: boolean;
}

export interface ReorderAlertsResult {
  alerts: ReorderAlertRow[];
  items_scanned: number;
  items_with_reorder_levels: number;
  /** `true` = chưa quét hết toàn bộ danh mục (chạm trần số lượng hoặc hạn giờ) — số trên là MỘT PHẦN, không phải toàn bộ. */
  incomplete: boolean;
}

async function fetchJson(call: PlatformCall, path: string): Promise<Row | null> {
  const response = await call(path).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null) as Promise<Row | null>;
}

/** Trang mặt hàng CÒN DÙNG, theo `name` tăng dần — cùng lý do `catalog-readiness.ts::scanRows` đã ghi (phân trang trên khoá chính, không phải `modified_at`). */
async function listActiveItems(
  call: PlatformCall,
  deadline: number,
  now: () => number,
): Promise<{ items: Array<{ name: string; item_name: string }>; incomplete: boolean }> {
  const items: Array<{ name: string; item_name: string }> = [];
  for (let page = 0; page < MAX_ITEM_PAGES; page += 1) {
    if (now() > deadline) return { items, incomplete: true };
    const query = new URLSearchParams({
      fields: JSON.stringify(["name", "item_name", "is_stock_item"]),
      filters: JSON.stringify([["disabled", "=", 0]]),
      limit_page_length: String(ITEM_PAGE_SIZE),
      limit_start: String(page * ITEM_PAGE_SIZE),
      order_by: "name asc",
    });
    const payload = await fetchJson(call, `resource/Item?${query}`);
    if (payload === null) return { items, incomplete: true };
    const batch = (payload.data as Row[] | undefined) ?? [];
    for (const row of batch) {
      // Dịch vụ không được giữ mức đặt lại (chặn ở `item-catalog-invariants.ts`) — bỏ qua
      // luôn ở đây thay vì mở hồ sơ rồi nhận `reorder_levels` rỗng.
      if (row.is_stock_item !== undefined && !truthy(row.is_stock_item)) continue;
      items.push({ name: text(row.name), item_name: text(row.item_name) });
    }
    if (batch.length < ITEM_PAGE_SIZE) return { items, incomplete: false };
  }
  return { items, incomplete: true };
}

interface ReorderRow {
  warehouse: string;
  safety_stock: number | null;
  /** Không bao giờ `null` ở đây — `readReorderRows` đã lọc bỏ dòng chưa khai điểm đặt hàng. */
  reorder_level: number;
  reorder_qty: number | null;
  lead_time_days: number | null;
}

/** Mở một hồ sơ Item, trả các dòng `reorder_levels` có khai `reorder_level`. `null` = đọc lỗi (khác rỗng thật). */
async function readReorderRows(call: PlatformCall, itemCode: string): Promise<ReorderRow[] | null> {
  const payload = await fetchJson(call, `resource/Item/${encodeURIComponent(itemCode)}`);
  if (payload === null) return null;
  const data = (payload.data as Row | undefined) ?? null;
  const rows = Array.isArray(data?.reorder_levels) ? (data!.reorder_levels as Row[]) : [];
  return rows
    .map((row): ReorderRow | null => {
      const warehouse = text(row.warehouse);
      const reorderLevel = number(row.reorder_level);
      if (!warehouse || reorderLevel === null) return null; // chưa khai đủ để so khớp được.
      return {
        warehouse,
        safety_stock: number(row.safety_stock),
        reorder_level: reorderLevel,
        reorder_qty: number(row.reorder_qty),
        lead_time_days: number(row.lead_time_days),
      };
    })
    .filter((row): row is ReorderRow => row !== null);
}

/** `actual_qty` của report "Stock Balance" — cùng cách đọc `sales-item-context.ts::quantityFromRow` đã dùng cho tồn hiện tại. */
function quantityFromRow(row: Row): number {
  for (const key of ["actual_qty", "balance_qty", "closing_qty", "stock_qty", "qty"]) {
    const parsed = number(row[key]);
    if (parsed !== null) return parsed;
  }
  return 0;
}

async function currentQty(call: PlatformCall, itemCode: string, warehouse: string): Promise<number | null> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({
      report_name: "Stock Balance",
      ignore_prepared_report: 1,
      filters: { item_code: itemCode, warehouse },
    }),
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null) as {
    message?: { result?: Row[] } | Row[];
    result?: Row[];
  } | null;
  if (!payload) return null;
  const rows = Array.isArray(payload.message) ? payload.message : (payload.message?.result ?? payload.result ?? []);
  return rows.reduce((sum, row) => sum + quantityFromRow(row), 0);
}

/**
 * `alumdoor.inventory.reorder_alerts` — ĐỌC-CHỈ.
 *
 * `item_codes` không truyền: quét tối đa 200 mã còn dùng (2 trang) trong hạn 8 giây. Có nhiều
 * mã hơn hoặc chậm hơn thì trả `incomplete:true` — SỐ ÍT HƠN THẬT, không phải "không có cảnh
 * báo". Truyền `item_codes` thì bỏ qua bước quét, tra thẳng danh sách đó (nhanh, dùng được cho
 * một màn hỏi theo mã cụ thể).
 */
export async function reorderAlerts(call: PlatformCall, args: Row): Promise<Response> {
  const now = () => Date.now();
  const deadline = now() + SCAN_BUDGET_MS;

  const requestedCodesRaw = Array.isArray(args.item_codes) ? args.item_codes : [];
  const requestedCodes = [...new Set(requestedCodesRaw.map((code) => text(code)).filter(Boolean))].slice(0, 200);

  let candidates: Array<{ name: string; item_name: string }>;
  let scanIncomplete = false;
  if (requestedCodes.length > 0) {
    candidates = requestedCodes.map((name) => ({ name, item_name: "" }));
  } else {
    const scanned = await listActiveItems(call, deadline, now);
    candidates = scanned.items;
    scanIncomplete = scanned.incomplete;
  }

  const alerts: ReorderAlertRow[] = [];
  let withReorderLevels = 0;
  let incomplete = scanIncomplete;

  for (let offset = 0; offset < candidates.length; offset += PROBE_BATCH) {
    if (now() > deadline) { incomplete = true; break; }
    const batch = candidates.slice(offset, offset + PROBE_BATCH);
    const batchRows = await Promise.all(batch.map(async (item) => {
      const rows = await readReorderRows(call, item.name);
      return { item, rows };
    }));
    for (const { item, rows } of batchRows) {
      if (rows === null) { incomplete = true; continue; }
      if (rows.length === 0) continue;
      withReorderLevels += 1;
      for (const row of rows) {
        if (now() > deadline) { incomplete = true; break; }
        const qty = await currentQty(call, item.name, row.warehouse);
        if (qty === null) { incomplete = true; continue; }
        if (qty > row.reorder_level) continue;
        alerts.push({
          item_code: item.name,
          item_name: item.item_name,
          warehouse: row.warehouse,
          current_qty: qty,
          safety_stock: row.safety_stock,
          reorder_level: row.reorder_level,
          reorder_qty: row.reorder_qty,
          lead_time_days: row.lead_time_days,
          below_safety_stock: row.safety_stock !== null && qty <= row.safety_stock,
        });
      }
    }
  }

  alerts.sort((left, right) => {
    if (left.below_safety_stock !== right.below_safety_stock) return left.below_safety_stock ? -1 : 1;
    return left.item_code.localeCompare(right.item_code);
  });

  const result: ReorderAlertsResult = {
    alerts,
    items_scanned: candidates.length,
    items_with_reorder_levels: withReorderLevels,
    incomplete,
  };
  return answer(result);
}
