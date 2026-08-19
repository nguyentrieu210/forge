import { roundTo } from "../../../packages/core/src/index.js";
import { handlePurchaseFifoRequest, type PurchaseFifoEnv } from "./purchase-fifo-receipt.js";
import { handleBulkPurchaseFifoRequest } from "./bulk-purchase-fifo-receipt.js";
import { allowedColorNamesForGroup } from "./color-scopes.js";

type Json = Record<string, unknown>;
type PlatformCall = ((path: string, init?: RequestInit) => Promise<Response>) & { via?: string };

interface PreviewPayload extends Json {
  supplier?: string;
  items?: Json[];
  supplier_invoice_no?: string;
  posting_at?: string;
  message?: string;
}

interface PurchaseDocument extends Json {
  name?: string;
  supplier?: string;
  company?: string;
  currency?: string;
  posting_at?: string;
  supplier_invoice_no?: string;
  docstatus?: number;
  modified?: string;
  note?: string;
  items?: Json[];
}

export interface AluminumContractResult {
  ok: boolean;
  issues: string[];
  stock_uom: string;
}

const COUNTED_UOMS = new Set(["cây", "cay", "lá", "la", "đoạn", "doan"]);
const PURCHASE_DOCTYPES = new Set([
  "Material Request",
  "Supplier Quotation",
  "Purchase Order",
  "Purchase Receipt",
  "Purchase Invoice",
]);

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function norm(value: unknown): string {
  return text(value).toLocaleLowerCase("vi");
}

function checked(value: unknown): boolean {
  if (value === true || value === 1 || value === "1") return true;
  return ["true", "yes", "có", "co"].includes(norm(value));
}

function positive(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function equalNumber(left: unknown, right: unknown, tolerance = 1e-6): boolean {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function responseJson(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

function refuse(message: string): Response {
  return responseJson({ message }, 422);
}

function platformCaller(request: Request, env: PurchaseFifoEnv): PlatformCall {
  const callback = request.headers.get("x-cloudforge-callback")?.replace(/\/$/, "");
  if (!callback) throw new Error("Nền tảng không cấp địa chỉ gọi ngược.");
  const forwarded = {
    authorization: request.headers.get("authorization") ?? "",
    "x-cloudforge-app": request.headers.get("x-cloudforge-app") ?? "",
    "x-cloudforge-identity": request.headers.get("x-cloudforge-identity") ?? "",
    "x-cloudforge-identity-signature": request.headers.get("x-cloudforge-identity-signature") ?? "",
  };
  const invoke = (path: string, init: RequestInit = {}) => {
    const outbound = new Request(`${callback}/${path.replace(/^\//, "")}`, {
      ...init,
      headers: { "content-type": "application/json", ...forwarded, ...(init.headers as Record<string, string> | undefined) },
    });
    return env.PLATFORM ? env.PLATFORM.fetch(outbound) : fetch(outbound);
  };
  return Object.assign(invoke, { via: env.PLATFORM ? "binding" : "fetch" });
}

async function readDoc<T extends Json>(call: PlatformCall, doctype: string, name: string): Promise<T & { modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
  if (!response.ok) throw new Error(`Không đọc được ${doctype} ${name} (HTTP ${response.status}).`);
  return ((((await response.json()) as { data?: T & { modified?: string } }).data ?? {}) as T & { modified?: string });
}

async function createDoc<T extends Json>(call: PlatformCall, doctype: string, document: T): Promise<T & { name: string; modified?: string }> {
  const response = await call(`resource/${encodeURIComponent(doctype)}`, { method: "POST", body: JSON.stringify(document) });
  if (!response.ok) throw new Error(`Không tạo được ${doctype}: ${(await response.text()).slice(0, 240)}`);
  const data = ((await response.json()) as { data?: T & { name?: string; modified?: string } }).data;
  if (!data?.name) throw new Error(`${doctype} đã tạo nhưng không trả về số chứng từ.`);
  return { ...data, name: data.name };
}

async function updateDoc(call: PlatformCall, doctype: string, name: string, document: Json): Promise<Json> {
  const response = await call(`resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
    method: "PUT",
    body: JSON.stringify(document),
  });
  if (!response.ok) throw new Error(`Không cập nhật được ${doctype} ${name}: ${(await response.text()).slice(0, 240)}`);
  return ((await response.json()) as { data?: Json }).data ?? {};
}

async function submitDoc(call: PlatformCall, doctype: string, name: string, document?: Json): Promise<Json> {
  const source = document ?? await readDoc<Json>(call, doctype, name);
  const response = await call("method/frappe.client.submit", {
    method: "POST",
    body: JSON.stringify({ doc: { ...source, doctype, name } }),
  });
  if (!response.ok) throw new Error(`Không ghi sổ được ${doctype} ${name}: ${(await response.text()).slice(0, 240)}`);
  const payload = await response.json() as { message?: Json; data?: Json };
  return payload.message ?? payload.data ?? {};
}

async function listDocs<T extends Json>(call: PlatformCall, doctype: string, fields: string[], filters: unknown[] = [], limit = 500): Promise<T[]> {
  const query = new URLSearchParams({ fields: JSON.stringify(fields), filters: JSON.stringify(filters), limit_page_length: String(limit) });
  const response = await call(`resource/${encodeURIComponent(doctype)}?${query}`);
  if (!response.ok) throw new Error(`Không đọc được danh sách ${doctype} (HTTP ${response.status}).`);
  return (((await response.json()) as { data?: T[] }).data ?? []);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function aluminumItemContract(item: Json | null): AluminumContractResult {
  const issues: string[] = [];
  const stockUom = text(item?.stock_uom);
  if (!item) return { ok: false, issues: ["Item không tồn tại"], stock_uom: "" };
  if (text(item.inventory_mode) !== "Nhôm cây/lá") issues.push("inventory_mode phải là Nhôm cây/lá");
  if (!COUNTED_UOMS.has(norm(stockUom))) issues.push("stock_uom phải là Cây/Lá/Đoạn, không phải Kg");
  if (norm(item.default_purchase_uom) !== "kg") issues.push("default_purchase_uom phải là Kg");
  if (!checked(item.has_batch_no)) issues.push("phải bật has_batch_no");
  if (!checked(item.has_catch_weight)) issues.push("phải bật has_catch_weight");
  if (norm(item.weight_uom) !== "kg") issues.push("weight_uom phải là Kg");
  if (text(item.purchase_stock_qty_field) !== "qty_bar") issues.push("purchase_stock_qty_field phải là qty_bar");
  if (text(item.purchase_allocation_qty_field) !== "qty_bar") issues.push("purchase_allocation_qty_field phải là qty_bar");
  if (text(item.purchase_allocation_uom) !== stockUom) issues.push("purchase_allocation_uom phải bằng stock_uom");
  if (checked(item.allow_negative_stock)) issues.push("allow_negative_stock phải tắt");
  return { ok: issues.length === 0, issues, stock_uom: stockUom };
}

function inferCondition(line: Json): string {
  const declared = text(line.condition);
  if (declared) return declared;
  return ["thô", "tho"].some((token) => norm(line.color).includes(token)) ? "Thô" : "Đã sơn";
}

function itemColorRequiredByProfile(item: Json): boolean {
  // Measurement Profile Ống/trục is the canonical no-color aluminium case.
  // Other profiles stay color-required unless the profile master explicitly says otherwise in the hook below.
  return norm(item.measurement_profile) !== "ống/trục";
}

async function purchaseColorRequired(call: PlatformCall, item: Json): Promise<boolean> {
  const profileName = text(item.measurement_profile);
  if (!profileName) return itemColorRequiredByProfile(item);
  const profile = await readDoc<Json>(call, "Measurement Profile", profileName).catch(() => null);
  if (profile && profile.require_color !== undefined && profile.require_color !== null && profile.require_color !== "") {
    return checked(profile.require_color);
  }
  return itemColorRequiredByProfile(item);
}

/** Commercial/priced quantity stays Kg; exact counted pieces become canonical stock quantity. */
export function canonicalizeAluminumPurchaseLine(
  line: Json,
  item: Json,
  doctype = "Purchase Receipt",
  requireColor = itemColorRequiredByProfile(item),
): Json {
  const contract = aluminumItemContract(item);
  if (!contract.ok) throw new Error(`${text(line.item_code)}: ${contract.issues.join("; ")}`);
  const qtyBar = positive(line.qty_bar);
  if (!Number.isInteger(qtyBar)) throw new Error(`${text(line.item_code)}: Số cây/lá phải là số nguyên dương.`);
  const length = positive(line.length_m);
  if (!length) throw new Error(`${text(line.item_code)}: Chiều dài cây/lá phải lớn hơn 0.`);
  const color = text(line.color);
  if (requireColor && !color) throw new Error(`${text(line.item_code)}: phải chọn Màu.`);
  const stamped = text(line.is_stamped);
  if (stamped !== "Có" && stamped !== "Không") throw new Error(`${text(line.item_code)}: Dập phải là Có hoặc Không.`);

  const lineUom = text(line.uom) || "Kg";
  let commercialQty = positive(line.qty);
  const actualWeight = positive(line.actual_weight_kg);
  if (norm(lineUom) === "kg") {
    if (doctype === "Purchase Receipt") {
      if (!actualWeight) throw new Error(`${text(line.item_code)}: Phiếu nhập phải có Tổng kg thực cân.`);
      if (commercialQty && !equalNumber(commercialQty, actualWeight)) {
        throw new Error(`${text(line.item_code)}: SL Kg trên phiếu nhập phải bằng Tổng kg thực cân.`);
      }
      commercialQty = actualWeight;
    } else if (!commercialQty) {
      throw new Error(`${text(line.item_code)}: số Kg giao dịch phải lớn hơn 0.`);
    }
  } else if (lineUom === contract.stock_uom) {
    if (!commercialQty) commercialQty = qtyBar;
    if (!equalNumber(commercialQty, qtyBar)) {
      throw new Error(`${text(line.item_code)}: giao dịch theo ${contract.stock_uom} thì SL phải bằng số cây/lá.`);
    }
  } else {
    throw new Error(`${text(line.item_code)}: ĐVT mua chỉ được là Kg hoặc ${contract.stock_uom}.`);
  }

  const {
    conversion_factor: _oldFactor,
    conversion_factor_micros: _oldFactorMicros,
    stock_qty_micros: _oldStockMicros,
    priced_qty_micros: _oldPricedMicros,
    actual_weight_micros: _oldWeightMicros,
    purchase_stock_qty_field: _oldStockField,
    purchase_allocation_qty_field: _oldAllocationField,
    purchase_allocation_uom: _oldAllocationUom,
    ...rest
  } = line;
  return {
    ...rest,
    qty: roundTo(commercialQty),
    qty_bar: qtyBar,
    length_m: roundTo(length),
    uom: lineUom,
    stock_uom: contract.stock_uom,
    stock_qty: qtyBar,
    ...(actualWeight ? { actual_weight_kg: roundTo(actualWeight) } : {}),
    ...(norm(lineUom) === "kg" ? { rate_uom: "Kg" } : {}),
    purchase_stock_qty_field: "qty_bar",
    purchase_allocation_qty_field: "qty_bar",
    purchase_allocation_uom: contract.stock_uom,
    color: color || undefined,
    condition: text(line.condition) || (color ? inferCondition(line) : "Thô"),
    is_stamped: stamped,
  };
}

async function itemMap(call: PlatformCall, lines: Json[]): Promise<Map<string, Json>> {
  const codes = [...new Set(lines.map((line) => text(line.item_code)).filter(Boolean))];
  return new Map(await Promise.all(codes.map(async (code) => [code, await readDoc<Json>(call, "Item", code)] as const)));
}

function groupKey(row: Json): string {
  const match = /^BULK-(\d+)-/.exec(text(row.row_id));
  return match ? `BULK-${match[1]}` : "SINGLE";
}

function supportFingerprintRow(line: Json): Json {
  return {
    row_id: text(line.row_id), item_code: text(line.item_code), purchase_order: text(line.purchase_order),
    qty_bar: Number(line.qty_bar), qty: Number(line.qty), length_m: Number(line.length_m),
    color: text(line.color), condition: text(line.condition), is_stamped: text(line.is_stamped),
    warehouse: text(line.warehouse), rate: Number(line.rate ?? 0),
  };
}

async function existingReceiptByMarker(call: PlatformCall, supplier: string, supplierInvoiceNo: string, marker: string): Promise<PurchaseDocument | null> {
  const filters: unknown[] = [["supplier", "=", supplier]];
  if (supplierInvoiceNo) filters.push(["supplier_invoice_no", "=", supplierInvoiceNo]);
  const listed = await listDocs<PurchaseDocument>(call, "Purchase Receipt", ["name", "docstatus", "note"], filters, 200);
  const hit = listed.find((row) => text(row.note).includes(marker));
  return hit?.name ? readDoc<PurchaseDocument>(call, "Purchase Receipt", hit.name) : null;
}

async function createBatch(call: PlatformCall, receipt: PurchaseDocument, group: string, lines: Json[]): Promise<string> {
  const first = lines[0]!;
  const itemCode = text(first.item_code);
  const warehouse = text(first.warehouse);
  const color = text(first.color);
  const condition = text(first.condition) || inferCondition(first);
  const length = Number(first.length_m);
  const stamped = text(first.is_stamped);
  for (const line of lines) {
    if (text(line.item_code) !== itemCode || text(line.warehouse) !== warehouse || text(line.color) !== color
      || text(line.condition) !== condition || !equalNumber(line.length_m, length) || text(line.is_stamped) !== stamped) {
      throw new Error(`Nhóm nhận ${group} không đồng nhất mã/màu/tình trạng/khổ/kho; không thể gộp thành một Batch.`);
    }
  }
  const deterministicId = `LO-${text(receipt.name).replace(/[^A-Za-z0-9-]/g, "-")}-${group.replace(/[^A-Za-z0-9-]/g, "-")}`;
  const existing = await listDocs<{ name?: string; batch_id?: string }>(call, "Batch", ["name", "batch_id"], [["batch_id", "=", deterministicId]], 2).catch(() => []);
  if (existing[0]?.name) return existing[0].name;
  const intakeQty = roundTo(lines.reduce((sum, line) => sum + Number(line.qty_bar ?? 0), 0));
  const intakeKg = roundTo(lines.reduce((sum, line) => sum + Number(line.actual_weight_kg ?? 0), 0));
  const created = await createDoc(call, "Batch", {
    batch_id: deterministicId, item: itemCode, item_code: itemCode, color, condition, length_m: length,
    intake_qty: intakeQty, ...(intakeKg > 0 ? { intake_kg: intakeKg } : {}), is_stamped: stamped, is_offcut: 0,
    source_voucher_type: "Purchase Receipt", source_voucher_no: text(receipt.name), source_voucher_group: group,
    supplier: text(receipt.supplier), received_at: text(receipt.posting_at), received_warehouse: warehouse,
    intake_note: `Sinh từ ${receipt.name}, nhóm nhận ${group}; số lượng tồn đọc từ Stock Ledger.`,
  });
  return created.name;
}

async function createInboundBundle(call: PlatformCall, receipt: PurchaseDocument, line: Json, batchNo: string): Promise<string> {
  const current = text(line.serial_and_batch_bundle);
  if (current) return current;
  const created = await createDoc(call, "Serial and Batch Bundle", {
    item_code: text(line.item_code), warehouse: text(line.warehouse), type: "Inward", posting_at: text(receipt.posting_at),
    entries: [{ row_id: "ROW-1", qty: positive(line.qty_bar), batch_no: batchNo }],
  });
  await submitDoc(call, "Serial and Batch Bundle", created.name, created);
  return created.name;
}

async function provisionReceiptTracking(call: PlatformCall, receipt: PurchaseDocument): Promise<{ receipt: PurchaseDocument; batches: string[]; bundles: string[] }> {
  if (!receipt.name) throw new Error("Purchase Receipt chưa có tên.");
  if (Number(receipt.docstatus ?? 0) !== 0) return { receipt, batches: [], bundles: [] };
  const lines = Array.isArray(receipt.items) ? receipt.items.filter((line): line is Json => Boolean(line) && typeof line === "object") : [];
  const groups = new Map<string, Json[]>();
  for (const line of lines) groups.set(groupKey(line), [...(groups.get(groupKey(line)) ?? []), line]);
  const batchByGroup = new Map<string, string>();
  for (const [key, rows] of groups) batchByGroup.set(key, await createBatch(call, receipt, key, rows));
  const bundleNames: string[] = [];
  const nextItems: Json[] = [];
  for (const line of lines) {
    const batch = batchByGroup.get(groupKey(line));
    if (!batch) throw new Error(`Không có Batch cho dòng ${text(line.row_id)}.`);
    const bundle = await createInboundBundle(call, receipt, line, batch);
    bundleNames.push(bundle);
    nextItems.push({ ...line, serial_and_batch_bundle: bundle });
  }
  const updated = await updateDoc(call, "Purchase Receipt", receipt.name, { items: nextItems, modified: receipt.modified });
  const fresh = await readDoc<PurchaseDocument>(call, "Purchase Receipt", receipt.name);
  return { receipt: { ...fresh, ...updated }, batches: [...new Set(batchByGroup.values())], bundles: [...new Set(bundleNames)] };
}

async function previewLegacy(request: Request, env: PurchaseFifoEnv, bulk: boolean): Promise<Response> {
  return bulk ? handleBulkPurchaseFifoRequest(request, env, false) : handlePurchaseFifoRequest(request, env, false);
}

function requestArgs(body: unknown): Json {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const args = (body as { args?: unknown }).args;
  return args && typeof args === "object" && !Array.isArray(args) ? args as Json : {};
}

export async function handleTrackedPurchaseFifoRequest(request: Request, env: PurchaseFifoEnv, create: boolean, bulk = false): Promise<Response> {
  try {
    if (!request.headers.get("x-cloudforge-tenant")) return responseJson({ message: "not a platform call" }, 403);
    const args = requestArgs(await request.clone().json().catch(() => ({})));
    const previewResponse = await previewLegacy(request.clone(), env, bulk);
    const preview = await previewResponse.json().catch(() => ({})) as PreviewPayload;
    if (!previewResponse.ok) return responseJson(preview, previewResponse.status);
    const rawLines = Array.isArray(preview.items) ? preview.items.filter((line): line is Json => Boolean(line) && typeof line === "object") : [];
    if (!rawLines.length) return refuse("Kế hoạch FIFO không tạo ra dòng nhận nào.");
    const call = platformCaller(request, env);
    const masters = await itemMap(call, rawLines);
    const canonicalLines = rawLines.map((line) => {
      const code = text(line.item_code);
      const item = masters.get(code);
      if (!item) throw new Error(`Không đọc được Item ${code}.`);
      return canonicalizeAluminumPurchaseLine(line, item, "Purchase Receipt");
    });
    const contract = canonicalLines.map((line) => ({
      item_code: text(line.item_code), stock_uom: text(line.stock_uom), qty_bar: Number(line.qty_bar),
      actual_weight_kg: Number(line.actual_weight_kg), length_m: Number(line.length_m), color: text(line.color), condition: text(line.condition),
    }));
    if (!create) return responseJson({ ...preview, items: canonicalLines, inventory_authority: "Batch + Serial and Batch Bundle + Stock Ledger", legacy_aluminium_lot: "disabled", contract });

    const supplier = text(preview.supplier ?? args.supplier);
    if (!supplier) throw new Error("Thiếu Nhà cung cấp.");
    const supplierInvoiceNo = text(preview.supplier_invoice_no ?? args.supplier_invoice_no);
    const requestedPostingAt = text(preview.posting_at ?? args.posting_at);
    const fingerprint = await sha256(JSON.stringify({
      supplier, supplier_invoice_no: supplierInvoiceNo, posting_at: requestedPostingAt || null,
      items: canonicalLines.map(supportFingerprintRow),
    }));
    const marker = `[alu-stock:${fingerprint}]`;
    const existingReceipt = await existingReceiptByMarker(call, supplier, supplierInvoiceNo, marker);
    let receipt = existingReceipt;
    if (receipt && Number(receipt.docstatus ?? 0) === 1) {
      return responseJson({ ...preview, purchase_receipt: receipt.name, doctype: "Purchase Receipt", draft: false, replayed: true, inventory_authority: "Stock Ledger" });
    }
    if (!receipt) {
      const firstOrder = text(canonicalLines[0]?.purchase_order);
      const order = firstOrder ? await readDoc<Json>(call, "Purchase Order", firstOrder) : {};
      receipt = await createDoc<PurchaseDocument>(call, "Purchase Receipt", {
        supplier,
        company: text(order.company),
        currency: text(order.currency),
        posting_at: requestedPostingAt || new Date().toISOString(),
        ...(supplierInvoiceNo ? { supplier_invoice_no: supplierInvoiceNo } : {}),
        ...(args.driver ? { driver: text(args.driver) } : {}),
        items: canonicalLines,
        note: `${marker} Nhập nhôm FIFO theo Batch/Stock Ledger. ${text(preview.message)}`.trim(),
      });
    }
    const provisioned = await provisionReceiptTracking(call, receipt);
    return responseJson({
      ...preview, items: provisioned.receipt.items ?? canonicalLines, doctype: "Purchase Receipt",
      name: provisioned.receipt.name, purchase_receipt: provisioned.receipt.name, draft: true,
      replayed: Boolean(existingReceipt), batches: provisioned.batches, bundles: provisioned.bundles,
      inventory_authority: "Batch + Serial and Batch Bundle + Stock Ledger", legacy_aluminium_lot: "disabled",
      message: `Đã chuẩn bị ${provisioned.receipt.name} với Batch/Bundle; chưa tăng tồn cho tới khi thủ kho submit phiếu.`,
    });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Không chuẩn bị được phiếu nhập nhôm theo Batch.");
  }
}

async function currentDocument(call: PlatformCall, doctype: string, name: string, action: string, payload: Json): Promise<Json> {
  if (action === "create") return payload;
  try { return { ...(await readDoc<Json>(call, doctype, name)), ...payload }; } catch { return payload; }
}

function lineArray(doc: Json): Json[] {
  return Array.isArray(doc.items) ? doc.items.filter((line): line is Json => Boolean(line) && typeof line === "object" && !Array.isArray(line)) : [];
}

async function validateAllowedColor(call: PlatformCall, item: Json, line: Json, label: string): Promise<void> {
  const color = text(line.color);
  if (!color) throw new Error(`${label}: phải chọn Màu.`);
  const colorMaster = await readDoc<Json>(call, "Item Color", color).catch(() => null);
  if (!colorMaster) throw new Error(`${label}: màu ${color} không tồn tại.`);
  if (checked(colorMaster.disabled)) throw new Error(`${label}: màu ${color} đã ngừng dùng.`);
  const itemGroup = text(item.item_group);
  const allowed = await allowedColorNamesForGroup(call, itemGroup, "purchase");
  if (!allowed.includes(color)) {
    const allowedInternally = await allowedColorNamesForGroup(call, itemGroup, "internal");
    if (allowedInternally.includes(color)) throw new Error(`${label}: màu ${color} chỉ dùng khi bán hàng, không dùng trên chứng từ mua.`);
    throw new Error(`${label}: màu ${color} không áp dụng cho Nhóm hàng ${itemGroup}.`);
  }
}

async function validatePurchaseOrderBarem(call: PlatformCall, item: Json, line: Json, label: string): Promise<void> {
  const specName = text(item.material_specification);
  if (!specName) throw new Error(`${label}: Item chưa có Quy cách vật tư để kiểm barem kg/m.`);
  const spec = await readDoc<Json>(call, "Material Specification", specName);
  const kgPerM = positive(spec.theoretical_kg_per_m ?? spec.kg_per_m ?? line.theoretical_kg_per_m);
  if (!kgPerM) throw new Error(`${label}: Quy cách vật tư chưa có trọng lượng kg/m.`);
  const expectedKg = roundTo(positive(line.length_m) * kgPerM * positive(line.qty_bar));
  if (!equalNumber(line.theoretical_kg, expectedKg, 1e-4)) throw new Error(`${label}: Kg barem phải bằng khổ × kg/m × số cây = ${expectedKg}.`);
  if (norm(line.uom) === "kg" && !equalNumber(line.qty, expectedKg, 1e-4)) throw new Error(`${label}: Đơn mua theo Kg phải dùng đúng kg barem ${expectedKg}.`);
  const rate = Number(line.rate ?? 0);
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`${label}: Đơn giá không hợp lệ.`);
  if (line.amount !== undefined && line.amount !== null && line.amount !== "" && !equalNumber(line.amount, expectedKg * rate, 0.5)) {
    throw new Error(`${label}: Thành tiền phải bằng kg barem × đơn giá.`);
  }
}

export async function validateAluminumPurchaseHook(request: Request, env: PurchaseFifoEnv): Promise<Response | null> {
  const subject = await request.clone().json().catch(() => null) as { doctype?: string; name?: string; action?: string; payload?: Json } | null;
  if (!subject?.doctype || !PURCHASE_DOCTYPES.has(subject.doctype)) return null;
  const call = platformCaller(request, env);
  const doc = await currentDocument(call, subject.doctype, text(subject.name), text(subject.action), subject.payload ?? {});
  const lines = lineArray(doc);
  if (!lines.length) return null;
  const masters = await itemMap(call, lines);
  if (!lines.some((line) => text(masters.get(text(line.item_code))?.inventory_mode) === "Nhôm cây/lá")) return null;
  try {
    for (const [index, line] of lines.entries()) {
      const code = text(line.item_code);
      if (!code) throw new Error(`Dòng ${index + 1}: thiếu Mã hàng.`);
      const item = masters.get(code);
      if (!item) throw new Error(`Dòng ${index + 1}: Item ${code} không tồn tại.`);
      if (text(item.inventory_mode) !== "Nhôm cây/lá") continue;
      const label = `Dòng ${index + 1} (${code})`;
      if (item.is_purchase_item !== undefined && !checked(item.is_purchase_item)) throw new Error(`${label}: Item không được phép mua.`);
      const requireColor = await purchaseColorRequired(call, item);
      if (requireColor || text(line.color)) await validateAllowedColor(call, item, line, label);
      if (subject.doctype === "Purchase Order") await validatePurchaseOrderBarem(call, item, line, label);
      const normalized = canonicalizeAluminumPurchaseLine(line, item, subject.doctype, requireColor);
      if (line.stock_qty !== undefined && line.stock_qty !== null && line.stock_qty !== "" && !equalNumber(line.stock_qty, normalized.stock_qty)) {
        throw new Error(`${label}: stock_qty phải bằng số cây/lá ${normalized.stock_qty}.`);
      }
      if (subject.doctype === "Purchase Receipt" && subject.action === "submit" && !text(line.serial_and_batch_bundle)) {
        throw new Error(`${label}: phải có Serial and Batch Bundle Inward trước khi ghi sổ.`);
      }
    }
    return responseJson({ ok: true, inventory_authority: "Stock Ledger", dual_measure: true });
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "Chứng từ mua nhôm không hợp lệ.");
  }
}
