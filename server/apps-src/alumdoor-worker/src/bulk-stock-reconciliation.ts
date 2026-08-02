import type { PurchaseFifoEnv } from "./purchase-fifo-receipt.js";

type Json = Record<string, unknown>;
type PlatformCall = (path: string, init?: RequestInit) => Promise<Response>;

interface ReconciliationRow extends Json {
  row_id?: string;
  item_code?: string;
  batch_no?: string;
  counted_qty?: number | string;
  counted_weight_kg?: number | string;
  serial_and_batch_bundle?: string;
  valuation_rate?: number | string;
  variance_reason?: string;
  variance_note?: string;
}

interface ReconciliationDoc extends Json {
  name: string;
  modified?: string;
  docstatus?: number;
  warehouse?: string;
  scope?: string;
  item_group?: string;
  item_code?: string;
  snapshot_at?: string;
  counted_by?: string;
  witnessed_by?: string;
  recon_state?: string;
  items?: ReconciliationRow[];
}

interface PreviewPayload extends Json {
  document?: ReconciliationDoc;
  side_effects?: {
    gl_entries?: number;
    stock_entries?: number;
    payment_entries?: number;
    fulfillment_entries?: number;
    stock_bundle_usages?: number;
  };
}

interface NormalizedCountLine extends Json {
  item_code: string;
  batch_no?: string;
  counted_qty: number;
  counted_weight_kg?: number;
  serial_and_batch_bundle?: string;
  valuation_rate?: number;
  variance_reason?: string;
  variance_note?: string;
}

const MAX_BULK_LINES = 500;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function nonNegative(value: unknown, label: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} không được âm.`);
  return number;
}

function optionalNonNegative(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || text(value) === "") return undefined;
  return nonNegative(value, label);
}

function normalizeLine(raw: unknown, index: number): NormalizedCountLine {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Dòng ${index + 1} không hợp lệ.`);
  const row = raw as Json;
  const itemCode = text(row.item_code);
  if (!itemCode) throw new Error(`Dòng ${index + 1}: cần Mã hàng.`);
  const batchNo = text(row.batch_no);
  const bundle = text(row.serial_and_batch_bundle);
  const reason = text(row.variance_reason);
  const note = text(row.variance_note);
  return {
    item_code: itemCode,
    ...(batchNo ? { batch_no: batchNo } : {}),
    counted_qty: nonNegative(row.counted_qty, `Dòng ${index + 1}: Số đếm thực tế`),
    ...(optionalNonNegative(row.counted_weight_kg, `Dòng ${index + 1}: Kg cân thực tế`) === undefined
      ? {}
      : { counted_weight_kg: optionalNonNegative(row.counted_weight_kg, `Dòng ${index + 1}: Kg cân thực tế`)! }),
    ...(bundle ? { serial_and_batch_bundle: bundle } : {}),
    ...(optionalNonNegative(row.valuation_rate, `Dòng ${index + 1}: Đơn giá điều chỉnh`) === undefined
      ? {}
      : { valuation_rate: optionalNonNegative(row.valuation_rate, `Dòng ${index + 1}: Đơn giá điều chỉnh`)! }),
    ...(reason ? { variance_reason: reason } : {}),
    ...(note ? { variance_note: note } : {}),
  };
}

function rowIdentity(row: { item_code?: unknown; batch_no?: unknown }): string {
  return `${text(row.item_code)}\u0000${text(row.batch_no)}`;
}

function displayIdentity(row: { item_code?: unknown; batch_no?: unknown }): string {
  const item = text(row.item_code);
  const batch = text(row.batch_no);
  return batch ? `${item} / lô ${batch}` : item;
}

function assertNoDuplicateOrAmbiguousRows(rows: Array<{ item_code?: unknown; batch_no?: unknown }>, source: string): void {
  const identities = new Set<string>();
  const batchState = new Map<string, { aggregate: boolean; batches: Set<string> }>();
  for (const row of rows) {
    const item = text(row.item_code);
    if (!item) throw new Error(`${source}: có dòng thiếu Mã hàng.`);
    const identity = rowIdentity(row);
    if (identities.has(identity)) throw new Error(`${source}: trùng dòng ${displayIdentity(row)}.`);
    identities.add(identity);
    const batch = text(row.batch_no);
    const state = batchState.get(item) ?? { aggregate: false, batches: new Set<string>() };
    if (batch) state.batches.add(batch);
    else state.aggregate = true;
    batchState.set(item, state);
  }
  for (const [item, state] of batchState) {
    if (state.aggregate && state.batches.size) {
      throw new Error(`${source}: ${item} không được vừa có dòng tổng vừa có dòng theo lô.`);
    }
  }
}

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const declared = request.headers.get("x-cloudforge-callback");
  if (!declared) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const base = declared.replace(/\/$/, "");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-tenant": request.headers.get("x-cloudforge-tenant") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  return (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${base}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T }).data ?? {}) as T;
}

async function assertExtraRowMatchesScope(call: PlatformCall, draft: ReconciliationDoc, row: NormalizedCountLine): Promise<void> {
  const scope = text(draft.scope);
  if (["Theo mã hàng", "Một mặt hàng"].includes(scope) && row.item_code !== text(draft.item_code)) {
    throw new Error(`Dòng thừa ${displayIdentity(row)} nằm ngoài mã hàng ${text(draft.item_code)} của phiếu kiểm kê.`);
  }
  if (scope === "Theo nhóm hàng") {
    const item = await readDoc<Json>(call, "Item", row.item_code);
    if (text(item.item_group) !== text(draft.item_group)) {
      throw new Error(`Dòng thừa ${displayIdentity(row)} nằm ngoài nhóm hàng ${text(draft.item_group)} của phiếu kiểm kê.`);
    }
  }
}

function mergeCountLines(draft: ReconciliationDoc, lines: NormalizedCountLine[]): {
  items: ReconciliationRow[];
  extra: NormalizedCountLine[];
} {
  const existing = Array.isArray(draft.items) ? draft.items : [];
  assertNoDuplicateOrAmbiguousRows(existing, "Phiếu kiểm kê");
  assertNoDuplicateOrAmbiguousRows(lines, "Dữ liệu dán");

  const inputByIdentity = new Map(lines.map((line) => [rowIdentity(line), line]));
  const missing = existing.filter((row) => !inputByIdentity.has(rowIdentity(row)));
  if (missing.length) {
    const preview = missing.slice(0, 5).map(displayIdentity).join(", ");
    throw new Error(
      `Dữ liệu bulk phải có đủ mọi dòng đã chốt sổ. Còn thiếu ${missing.length} dòng: ${preview}${missing.length > 5 ? ", ..." : ""}.`,
    );
  }

  const existingIdentities = new Set(existing.map(rowIdentity));
  const merged = existing.map((row) => {
    const input = inputByIdentity.get(rowIdentity(row))!;
    return {
      ...row,
      counted_qty: input.counted_qty,
      ...(input.counted_weight_kg === undefined ? { counted_weight_kg: undefined } : { counted_weight_kg: input.counted_weight_kg }),
      ...(input.serial_and_batch_bundle ? { serial_and_batch_bundle: input.serial_and_batch_bundle } : { serial_and_batch_bundle: undefined }),
      ...(input.valuation_rate === undefined ? { valuation_rate: undefined } : { valuation_rate: input.valuation_rate }),
      ...(input.variance_reason ? { variance_reason: input.variance_reason } : { variance_reason: undefined }),
      ...(input.variance_note ? { variance_note: input.variance_note } : { variance_note: undefined }),
    };
  });
  const extra = lines.filter((line) => !existingIdentities.has(rowIdentity(line)));
  for (const [index, line] of extra.entries()) {
    merged.push({ ...line, row_id: `BULK-EXTRA-${index + 1}` });
  }
  assertNoDuplicateOrAmbiguousRows(merged, "Phiếu kiểm kê sau khi nhập");
  return { items: merged, extra };
}

async function previewDraft(call: PlatformCall, draft: ReconciliationDoc, items: ReconciliationRow[]): Promise<PreviewPayload> {
  if (!draft.modified) throw new Error("Phiếu kiểm kê không có modified để khóa ghi đồng thời.");
  const response = await call("v1/inventory/stock-reconciliation/preview", {
    method: "POST",
    body: JSON.stringify({
      name: draft.name,
      modified: draft.modified,
      document: { ...draft, items },
    }),
  });
  const payload = await response.json().catch(() => ({})) as PreviewPayload & { message?: unknown; error?: { message?: unknown } };
  if (!response.ok) {
    throw new Error(text(payload.message) || text(payload.error?.message) || `Không preview được phiếu kiểm kê (HTTP ${response.status}).`);
  }
  const sideEffects = payload.side_effects ?? {};
  if (Object.values(sideEffects).some((value) => Number(value ?? 0) !== 0)) {
    throw new Error("Preview kiểm kê sinh side effect ngoài dự kiến; đã chặn cập nhật draft.");
  }
  if (!payload.document || !Array.isArray(payload.document.items)) {
    throw new Error("Preview kiểm kê không trả về chứng từ chuẩn hóa.");
  }
  return payload;
}

function editableProjection(row: ReconciliationRow): Json {
  return {
    item_code: text(row.item_code),
    batch_no: text(row.batch_no),
    counted_qty: Number(row.counted_qty ?? 0),
    counted_weight_kg: row.counted_weight_kg == null || text(row.counted_weight_kg) === "" ? null : Number(row.counted_weight_kg),
    serial_and_batch_bundle: text(row.serial_and_batch_bundle),
    valuation_rate: row.valuation_rate == null || text(row.valuation_rate) === "" ? null : Number(row.valuation_rate),
    variance_reason: text(row.variance_reason),
    variance_note: text(row.variance_note),
  };
}

function sameBulkValues(left: ReconciliationRow[], right: ReconciliationRow[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((row, index) => JSON.stringify(editableProjection(row)) === JSON.stringify(editableProjection(right[index] ?? {})));
}

function summaryRows(items: ReconciliationRow[]): Json[] {
  return items.map((row) => ({
    item_code: text(row.item_code),
    batch_no: text(row.batch_no),
    book_qty: Number(row.book_qty ?? 0),
    counted_qty: Number(row.counted_qty ?? 0),
    variance_qty: Number(row.variance_qty ?? 0),
    book_weight_kg: row.book_weight_kg == null ? null : Number(row.book_weight_kg),
    counted_weight_kg: row.counted_weight_kg == null ? null : Number(row.counted_weight_kg),
    variance_weight_kg: row.variance_weight_kg == null ? null : Number(row.variance_weight_kg),
    variance_reason: text(row.variance_reason),
  }));
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

export async function handleBulkStockReconciliationRequest(
  request: Request,
  env: PurchaseFifoEnv,
  save: boolean,
): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return responseJson({ message: "not a platform call" }, 403);
    const body = await request.json().catch(() => ({})) as { args?: Json };
    const raw = body.args ?? {};
    const reconciliationName = text(raw.reconciliation);
    if (!reconciliationName) throw new Error("Cần chọn Phiếu kiểm kê nháp đã chốt sổ.");
    if (!Array.isArray(raw.lines) || !raw.lines.length) throw new Error("Cần ít nhất một dòng số đếm.");
    if (raw.lines.length > MAX_BULK_LINES) throw new Error(`Mỗi lần chỉ nhận tối đa ${MAX_BULK_LINES} dòng.`);
    const lines = raw.lines.map(normalizeLine);

    const call = platformCaller(request, env);
    const draft = await readDoc<ReconciliationDoc>(call, "Stock Reconciliation", reconciliationName);
    if (!draft.name) throw new Error(`Phiếu kiểm kê ${reconciliationName} không tồn tại.`);
    if (Number(draft.docstatus ?? 0) !== 0) throw new Error(`Phiếu ${reconciliationName} không còn là nháp.`);
    if (!draft.snapshot_at || !draft.warehouse || !draft.counted_by) {
      throw new Error(`Phiếu ${reconciliationName} chưa có snapshot kiểm kê hợp lệ.`);
    }
    if (!["Nháp", "Đang đếm", "Chờ duyệt", ""].includes(text(draft.recon_state))) {
      throw new Error(`Phiếu ${reconciliationName} đang ở trạng thái ${text(draft.recon_state)}; không được nhập số đếm hàng loạt.`);
    }

    const { items, extra } = mergeCountLines(draft, lines);
    await Promise.all(extra.map((row) => assertExtraRowMatchesScope(call, draft, row)));
    const preview = await previewDraft(call, draft, items);
    const planned = preview.document!;
    const plannedItems = planned.items ?? [];
    const rows = summaryRows(plannedItems);

    if (!save) {
      return responseJson({
        reconciliation: draft.name,
        snapshot_at: draft.snapshot_at,
        warehouse: draft.warehouse,
        existing_rows: (draft.items ?? []).length,
        extra_rows: extra.length,
        items: rows,
        message: `Đã preview ${rows.length} dòng theo đúng snapshot ${draft.snapshot_at}; chưa lưu và chưa ghi sổ.`,
      });
    }

    if (sameBulkValues(draft.items ?? [], plannedItems)) {
      return responseJson({
        doctype: "Stock Reconciliation",
        name: draft.name,
        reconciliation: draft.name,
        replayed: true,
        draft: true,
        items: rows,
        message: `Phiếu ${draft.name} đã có đúng số đếm này; không tạo version ghi trùng.`,
      });
    }

    const update = await call(`resource/Stock%20Reconciliation/${encodeURIComponent(draft.name)}`, {
      method: "PUT",
      body: JSON.stringify({ ...planned, modified: draft.modified }),
    });
    const updatedPayload = await update.json().catch(() => ({})) as { data?: ReconciliationDoc; message?: unknown; exc?: unknown };
    if (!update.ok) {
      throw new Error(text(updatedPayload.message) || text(updatedPayload.exc) || `Không lưu được ${draft.name} (HTTP ${update.status}).`);
    }
    const updated = updatedPayload.data ?? planned;
    return responseJson({
      doctype: "Stock Reconciliation",
      name: draft.name,
      reconciliation: draft.name,
      replayed: false,
      draft: true,
      items: summaryRows(updated.items ?? plannedItems),
      message: `Đã cập nhật ${plannedItems.length} dòng số đếm vào ${draft.name}; phiếu vẫn là nháp, chưa ghi sổ.`,
    });
  } catch (error) {
    return responseJson({ message: error instanceof Error ? error.message : String(error) }, 422);
  }
}
