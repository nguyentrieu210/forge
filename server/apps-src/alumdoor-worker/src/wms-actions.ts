/**
 * Nối API cho tầng thuật toán WMS chuẩn — pick/pack/putaway/wave — qua callback công khai
 * của nền tảng. Worker dọc không import implementation package của Forge.
 *
 * Bối cảnh (audit `ALUMDOOR-KHO-SAU-VONG2-20260821.md`, S1/C1): 4 hàm `planPicking`,
 * `validatePacking`, `planPutaway`, `buildPickWaves` đã viết xong, có unit test riêng, nhưng
 * KHÔNG route/UI nào gọi tới. File này nối ĐƯỜNG API — route dispatcher chuẩn hóa dữ liệu,
 * nền tảng gọi đúng hàm engine và trả JSON. Không tự thêm luật nghiệp vụ mới ngoài những gì
 * các hàm `plan*`/`validate*`/`build*` đã định nghĩa.
 *
 * `planPicking` và `planPutaway` là hàm THUẦN (nhận `candidates` làm input, không tự đọc kho).
 * Với `plan_picking`, nếu người gọi không tự truyền `candidates`, route này tự đọc tồn thật qua
 * `Serial Number Status` (mã có serial), `Batch Stock Balance` (mã có batch) hoặc `Stock Balance`
 * (mã thường). Với batch, thứ tự FIFO lấy từ ngày nhập sớm nhất trong `Stock Ledger`, không dựa
 * vào custom field của Batch. `plan_putaway` KHÔNG có nguồn dữ liệu "sức
 * chứa kho" thật trong schema hiện tại (`Warehouse` không có field capacity) nên route này chỉ
 * nhận `candidates` do người gọi truyền — xem ghi chú "cần quyết định thêm" trong audit report.
 * `validate_packing` và `build_pick_waves` không cần đọc kho, chỉ kiểm/nhóm dữ liệu người gọi
 * truyền vào, nên route đi thẳng (thin wrapper) đúng như thiết kế của hai hàm engine.
 */
import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;
interface PickCandidate {
  warehouse: string;
  available_qty_micros: number;
  sequence: number;
  batch_no?: string;
  serial_no?: string;
}
interface PickedStockLine {
  item_code: string;
  warehouse: string;
  picked_qty_micros: number;
  batch_no?: string;
  serial_no?: string;
}
interface PackageInput {
  package_id: string;
  lines: Array<{
    item_code: string;
    warehouse: string;
    packed_qty_micros: number;
    batch_no?: string;
    serial_no?: string;
  }>;
}
interface PutawayCandidate {
  warehouse: string;
  priority: number;
  capacity_qty_micros: number;
  current_qty_micros: number;
}
interface WaveLine {
  line_id: string;
  group_key: string;
  sequence: number;
  qty_micros: number;
}
interface PickPlan {
  requested_qty_micros: number;
  allocated_qty_micros: number;
  shortage_qty_micros: number;
  allocations: Array<{
    warehouse: string;
    qty_micros: number;
    sequence: number;
    batch_no?: string;
    serial_no?: string;
  }>;
}
interface PackingValidation {
  package_count: number;
  picked_qty_micros: number;
  packed_qty_micros: number;
  remaining_qty_micros: number;
  complete: boolean;
}
interface PutawayPlan {
  requested_qty_micros: number;
  allocated_qty_micros: number;
  unallocated_qty_micros: number;
  allocations: Array<{
    warehouse: string;
    qty_micros: number;
    priority: number;
    free_before_micros: number;
    free_after_micros: number;
  }>;
}
interface PickWave {
  wave_key: string;
  group_key: string;
  lines: WaveLine[];
  total_qty_micros: number;
}

const STOCK_UNIT_MICROS = 1_000_000;

function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim(); }
function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(text(value).toLocaleLowerCase("vi"));
}
function toMicros(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * STOCK_UNIT_MICROS);
}
function fromMicros(value: number): number {
  return Math.round((value / STOCK_UNIT_MICROS) * 1e6) / 1e6;
}
function inputMicros(row: Json, microsField: string, quantityField: string): number {
  return row[microsField] === undefined ? toMicros(row[quantityField]) : Number(row[microsField]);
}
function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}
function refuse(message: string): Response { return responseJson({ message }, 422); }

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const callback = request.headers.get("x-cloudforge-callback")?.replace(/\/$/, "");
  if (!callback) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${callback}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function runPlatformWms<T>(call: PlatformCall, operation: string, input: Json): Promise<T> {
  const response = await call("method/metaforge.inventory.wms_plan", {
    method: "POST",
    body: JSON.stringify({ args: { operation, input } }),
  });
  const payload = await response.json().catch(() => ({})) as {
    message?: T | string;
    error?: { message?: string };
    exception?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.exception
      ?? (typeof payload.message === "string" ? payload.message : `HTTP ${response.status}`));
  }
  return (payload.message ?? payload) as T;
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function reportRows<T>(call: PlatformCall, reportName: string, filters: Json): Promise<T[]> {
  const response = await call("method/frappe.desk.query_report.run", {
    method: "POST",
    body: JSON.stringify({ report_name: reportName, ignore_prepared_report: 1, filters }),
  });
  if (!response.ok) throw new Error(`Không đọc được báo cáo ${reportName} (HTTP ${response.status}).`);
  const payload = await response.json() as { message?: { result?: T[] } | T[]; result?: T[] };
  if (Array.isArray(payload.message)) return payload.message;
  if (payload.message && !Array.isArray(payload.message) && Array.isArray(payload.message.result)) return payload.message.result;
  return payload.result ?? [];
}

function argsOf(body: unknown): Json {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const args = (body as { args?: unknown }).args;
  return args && typeof args === "object" && !Array.isArray(args) ? args as Json : {};
}

/** `candidates` do người gọi truyền thẳng — đã ở đơn vị micros theo đúng hợp đồng của `planPicking`. */
function candidatesFromArgs(raw: unknown): PickCandidate[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((row): PickCandidate => {
    const entry = (row ?? {}) as Json;
    return {
      warehouse: text(entry.warehouse),
      available_qty_micros: inputMicros(entry, "available_qty_micros", "available_qty"),
      sequence: Number(entry.sequence ?? 0),
      ...(text(entry.batch_no) ? { batch_no: text(entry.batch_no) } : {}),
      ...(text(entry.serial_no) ? { serial_no: text(entry.serial_no) } : {}),
    };
  });
}

interface BatchBalanceRow { batch_no?: string; warehouse?: string; actual_qty?: number; }
interface StockBalanceRow { warehouse?: string; bal_qty?: number; actual_qty?: number; balance_qty?: number; qty?: number; }
interface StockLedgerRow {
  posting_at?: string;
  warehouse?: string;
  batch_no?: string;
  serial_no?: string;
  actual_qty?: number;
}
interface SerialStatusRow {
  serial_no?: string;
  actual_qty?: number;
  status?: string;
  last_inward_warehouse?: string;
  last_posting_at?: string;
}

function batchWarehouseKey(batchNo: unknown, warehouse: unknown): string {
  return `${text(batchNo)}\u0000${text(warehouse)}`;
}

/**
 * Đọc tồn thật để dựng `PickCandidate[]` khi người gọi không tự truyền `candidates`.
 * Mã có serial → mỗi serial khả dụng là đúng một candidate nguyên đơn vị.
 * Mã chỉ có batch → `Batch Stock Balance`, sắp theo lần nhập đầu tiên trong Stock Ledger.
 * Mã thường → `Stock Balance`, mỗi kho một `candidate`, sắp theo tên kho cho ổn định.
 */
async function resolvePickCandidates(
  call: PlatformCall,
  itemCode: string,
  warehouse: string,
): Promise<{ candidates: PickCandidate[]; source: "serial_number_status" | "batch_stock_balance" | "stock_balance" }> {
  const item = await readDoc<Json>(call, "Item", itemCode);
  if (!item || checked(item.disabled)) throw new Error(`Mặt hàng ${itemCode} không tồn tại hoặc đã ngừng dùng.`);

  if (checked(item.has_serial_no)) {
    const serialRows = await reportRows<SerialStatusRow>(call, "Serial Number Status", {
      item_code: itemCode,
      status: "Available",
      ...(warehouse ? { last_inward_warehouse: warehouse } : {}),
    });
    const available = serialRows.filter((row) => text(row.serial_no)
      && Number(row.actual_qty ?? 0) === 1
      && text(row.status) === "Available"
      && text(row.last_inward_warehouse)
      && (!warehouse || text(row.last_inward_warehouse) === warehouse));

    let batchBySerial = new Map<string, string>();
    if (checked(item.has_batch_no) && available.length > 0) {
      const ledgerRows = await reportRows<StockLedgerRow>(call, "Stock Ledger", {
        item_code: itemCode,
        ...(warehouse ? { warehouse } : {}),
      });
      batchBySerial = new Map(
        ledgerRows
          .filter((row) => Number(row.actual_qty ?? 0) > 0 && text(row.serial_no) && text(row.batch_no))
          .sort((left, right) => text(left.posting_at).localeCompare(text(right.posting_at)))
          .map((row) => [text(row.serial_no), text(row.batch_no)] as const),
      );
      const missingBatch = available.find((row) => !batchBySerial.has(text(row.serial_no)));
      if (missingBatch) {
        throw new Error(`Serial ${text(missingBatch.serial_no)} không có Batch trong Stock Ledger.`);
      }
    }

    const ordered = [...available].sort((left, right) =>
      text(left.last_posting_at).localeCompare(text(right.last_posting_at))
      || text(left.serial_no).localeCompare(text(right.serial_no)));
    return {
      source: "serial_number_status",
      candidates: ordered.map((row, index): PickCandidate => ({
        warehouse: text(row.last_inward_warehouse),
        available_qty_micros: STOCK_UNIT_MICROS,
        sequence: index + 1,
        serial_no: text(row.serial_no),
        ...(checked(item.has_batch_no) ? { batch_no: batchBySerial.get(text(row.serial_no))! } : {}),
      })),
    };
  }

  if (checked(item.has_batch_no)) {
    const rows = await reportRows<BatchBalanceRow>(call, "Batch Stock Balance", {
      item_code: itemCode,
      ...(warehouse ? { warehouse } : {}),
    });
    const positive = rows.filter((row) => text(row.batch_no) && Number(row.actual_qty ?? 0) > 0
      && (!warehouse || !row.warehouse || text(row.warehouse) === warehouse));
    const ledgerRows = await reportRows<StockLedgerRow>(call, "Stock Ledger", {
      item_code: itemCode,
      ...(warehouse ? { warehouse } : {}),
    });
    const receivedAtByBatchWarehouse = new Map<string, string>();
    for (const row of ledgerRows) {
      if (Number(row.actual_qty ?? 0) <= 0 || !text(row.batch_no) || !text(row.warehouse) || !text(row.posting_at)) continue;
      const key = batchWarehouseKey(row.batch_no, row.warehouse);
      const postingAt = text(row.posting_at);
      const previous = receivedAtByBatchWarehouse.get(key);
      if (!previous || postingAt < previous) receivedAtByBatchWarehouse.set(key, postingAt);
    }
    const ordered = positive
      .map((row) => ({
        row,
        // Không biết ngày nhập thì không được chen lên trước lô có bằng chứng ngày nhập.
        receivedAt: receivedAtByBatchWarehouse.get(batchWarehouseKey(row.batch_no, row.warehouse))
          ?? "9999-12-31T23:59:59.999Z",
      }))
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt)
        || text(left.row.batch_no).localeCompare(text(right.row.batch_no))
        || text(left.row.warehouse).localeCompare(text(right.row.warehouse)));
    const candidates = ordered.map(({ row }, index): PickCandidate => ({
      warehouse: text(row.warehouse),
      available_qty_micros: toMicros(row.actual_qty),
      sequence: index + 1,
      batch_no: text(row.batch_no),
    })).filter((candidate) => candidate.warehouse && candidate.available_qty_micros > 0);
    return { candidates, source: "batch_stock_balance" };
  }

  const rows = await reportRows<StockBalanceRow>(call, "Stock Balance", {
    item_code: itemCode,
    ...(warehouse ? { warehouse } : {}),
  });
  const balanceOf = (row: StockBalanceRow) => Number(row.bal_qty ?? row.actual_qty ?? row.balance_qty ?? row.qty ?? 0);
  const positive = rows.filter((row) => text(row.warehouse) && balanceOf(row) > 0
    && (!warehouse || text(row.warehouse) === warehouse));
  const ordered = [...positive].sort((left, right) => text(left.warehouse).localeCompare(text(right.warehouse)));
  const candidates = ordered.map((row, index): PickCandidate => ({
    warehouse: text(row.warehouse),
    available_qty_micros: toMicros(balanceOf(row)),
    sequence: index + 1,
  }));
  return { candidates, source: "stock_balance" };
}

/** `alumdoor.wms.plan_picking` — nối `planPicking` (chặn double-consume, atomic serial). */
export async function handlePlanPicking(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  try {
    const args = argsOf(await request.json().catch(() => ({})));
    const qty = Number(args.qty);
    if (!Number.isFinite(qty) || qty <= 0) return refuse("Cần Số lượng cần lấy lớn hơn 0.");
    const qtyMicros = toMicros(qty);

    const explicitCandidates = candidatesFromArgs(args.candidates);
    let candidates = explicitCandidates;
    let source: string = "candidates";
    if (!candidates) {
      const itemCode = text(args.item_code);
      if (!itemCode) return refuse("Cần Mã hàng, hoặc tự truyền candidates.");
      const call = platformCaller(request, env);
      const resolved = await resolvePickCandidates(call, itemCode, text(args.warehouse));
      candidates = resolved.candidates;
      source = resolved.source;
    }

    const plan = await runPlatformWms<PickPlan>(platformCaller(request, env), "plan_picking", {
      qty_micros: qtyMicros,
      candidates,
    });
    return responseJson({
      ...plan,
      requested_qty: fromMicros(plan.requested_qty_micros),
      allocated_qty: fromMicros(plan.allocated_qty_micros),
      shortage_qty: fromMicros(plan.shortage_qty_micros),
      allocations: plan.allocations.map((allocation) => ({ ...allocation, qty: fromMicros(allocation.qty_micros) })),
      candidate_source: source,
      candidate_count: candidates.length,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không lập được kế hoạch lấy hàng.");
  }
}

/** `alumdoor.wms.validate_packing` — nối `validatePacking` (đối chiếu packed ≤ picked). */
export async function handleValidatePacking(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  try {
    const args = argsOf(await request.json().catch(() => ({})));
    const pickedRows = Array.isArray(args.picked) ? args.picked as Json[] : [];
    if (pickedRows.length > 5_000) return refuse("Danh sách đã lấy vượt quá 5.000 dòng.");
    const picked = pickedRows.map((entry): PickedStockLine => ({
      item_code: text(entry.item_code),
      warehouse: text(entry.warehouse),
      picked_qty_micros: inputMicros(entry, "picked_qty_micros", "picked_qty"),
      ...(text(entry.batch_no) ? { batch_no: text(entry.batch_no) } : {}),
      ...(text(entry.serial_no) ? { serial_no: text(entry.serial_no) } : {}),
    }));

    let packages: PackageInput[];
    if (Array.isArray(args.package_rows)) {
      const rows = args.package_rows as Json[];
      if (rows.length > 5_000) return refuse("Danh sách đóng gói vượt quá 5.000 dòng.");
      const grouped = new Map<string, PackageInput>();
      for (const entry of rows) {
        const packageId = text(entry.package_id);
        const current = grouped.get(packageId) ?? { package_id: packageId, lines: [] };
        current.lines.push({
          item_code: text(entry.item_code),
          warehouse: text(entry.warehouse),
          packed_qty_micros: inputMicros(entry, "packed_qty_micros", "packed_qty"),
          ...(text(entry.batch_no) ? { batch_no: text(entry.batch_no) } : {}),
          ...(text(entry.serial_no) ? { serial_no: text(entry.serial_no) } : {}),
        });
        grouped.set(packageId, current);
      }
      packages = [...grouped.values()];
    } else {
      packages = Array.isArray(args.packages) ? args.packages as PackageInput[] : [];
    }
    const result = await runPlatformWms<PackingValidation>(platformCaller(request, env), "validate_packing", {
      picked,
      packages,
    });
    return responseJson({
      ...result,
      picked_qty: fromMicros(result.picked_qty_micros),
      packed_qty: fromMicros(result.packed_qty_micros),
      remaining_qty: fromMicros(result.remaining_qty_micros),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không đối chiếu được đóng gói với đã lấy.");
  }
}

/**
 * `alumdoor.wms.plan_putaway` — nối `planPutaway`. Route mỏng có chủ đích: `Warehouse` chưa có
 * field sức chứa (`capacity_qty`) trong schema hiện tại, nên `candidates` phải do người gọi
 * truyền (xem "cần quyết định thêm" trong audit report — có nên thêm field sức chứa hay không).
 */
export async function handlePlanPutaway(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  try {
    const args = argsOf(await request.json().catch(() => ({})));
    const qty = Number(args.qty);
    if (!Number.isFinite(qty) || qty <= 0) return refuse("Cần Số lượng cần nhập lớn hơn 0.");
    if (!Array.isArray(args.candidates) || !args.candidates.length) {
      return refuse("Cần candidates (kho ứng viên kèm sức chứa) — Warehouse chưa có field sức chứa để tự đọc.");
    }
    const candidates = (args.candidates as Json[]).map((entry): PutawayCandidate => ({
      warehouse: text(entry.warehouse),
      priority: Number(entry.priority ?? 0),
      capacity_qty_micros: inputMicros(entry, "capacity_qty_micros", "capacity_qty"),
      current_qty_micros: inputMicros(entry, "current_qty_micros", "current_qty"),
    }));
    const plan = await runPlatformWms<PutawayPlan>(platformCaller(request, env), "plan_putaway", {
      qty_micros: toMicros(qty),
      candidates,
    });
    return responseJson({
      ...plan,
      requested_qty: fromMicros(plan.requested_qty_micros),
      allocated_qty: fromMicros(plan.allocated_qty_micros),
      unallocated_qty: fromMicros(plan.unallocated_qty_micros),
      allocations: plan.allocations.map((allocation) => ({
        ...allocation,
        qty: fromMicros(allocation.qty_micros),
        free_before: fromMicros(allocation.free_before_micros),
        free_after: fromMicros(allocation.free_after_micros),
      })),
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không lập được kế hoạch cất hàng.");
  }
}

/** `alumdoor.wms.build_pick_waves` — nối `buildPickWaves` (gom nhóm sóng lấy hàng). */
export async function handleBuildPickWaves(request: Request, env: PurchaseFifoEnv): Promise<Response> {
  try {
    const args = argsOf(await request.json().catch(() => ({})));
    const maxLines = Number(args.max_lines_per_wave ?? 20);
    if (!Array.isArray(args.lines) || !args.lines.length) return refuse("Cần danh sách dòng cần gom sóng (lines).");
    const lines = (args.lines as Json[]).map((entry): WaveLine => ({
      line_id: text(entry.line_id),
      group_key: text(entry.group_key),
      sequence: Number(entry.sequence ?? 0),
      qty_micros: inputMicros(entry, "qty_micros", "qty"),
    }));
    const waves = await runPlatformWms<PickWave[]>(platformCaller(request, env), "build_pick_waves", {
      lines,
      max_lines_per_wave: maxLines,
    });
    return responseJson({
      waves: waves.map((wave) => ({
        ...wave,
        total_qty: fromMicros(wave.total_qty_micros),
        lines: wave.lines.map((line) => ({ ...line, qty: fromMicros(line.qty_micros) })),
      })),
      wave_count: waves.length,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không gom được sóng lấy hàng.");
  }
}
