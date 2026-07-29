/**
 * Phiếu nhập nhôm SINH RA LÔ NHÔM — cây cầu giữa hai quyển sổ.
 *
 * Trước đây kho nhôm có hai quyển sổ không bao giờ gặp nhau: phiếu nhập cộng KG vào sổ kho
 * nhưng không sinh lô nào, còn phiếu cắt trừ LÁ trong sổ lô nhưng không ghi sổ kho. Kg chỉ
 * tăng, lá chỉ giảm, hai bên trôi xa nhau mỗi ngày và không có gì báo.
 *
 * Vì sao chạy bằng HOOK chứ không nằm trong nhân:
 *
 *   Nhân chỉ sinh ra BÚT TOÁN (sổ kho, sổ cái), không tạo chứng từ. Lô nhôm là một bản ghi
 *   thật có vòng đời riêng — bị cắt, được hoàn, được trả về — nên nó không phải một dòng sổ.
 *   Hook chạy SAU KHI commit nên một lỗi ở đây không làm hỏng phiếu nhập đã ghi, và nền tảng
 *   bảo đảm giao ít nhất một lần với chống lặp theo từng cặp (app, sự kiện).
 *
 * Nhận diện lô: cùng MÃ + MÀU + TÌNH TRẠNG + KHỔ + KHO là MỘT lô, cộng dồn số lá. Khổ là thứ
 * phân biệt thật — phiếu Tiến Đạt ngày 22/7 có ba dòng cùng mã A282 màu THÔ nhưng dài 8,50 ·
 * 7,20 · 6,60 m, và ba dòng đó là ba lô khác nhau vì cắt được ra những cây khác nhau.
 */
import type { PlatformCall } from "./index.js";

export interface ReceiptLine {
  row_id?: string;
  item_code?: string;
  color?: string;
  length_m?: number;
  qty?: number;
  qty_bar?: number;
  warehouse?: string;
  inventory_mode?: string;
  generation?: string;
}

const positive = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) > 0;
/** Khổ so tới 4 chữ số thập phân — 8,5 và 8,5000 là một; 8,50 và 8,55 thì không. */
const widthKey = (value: unknown): number => Number(Number(value).toFixed(4));

async function readJson<T>(call: PlatformCall, path: string): Promise<T | null> {
  const response = await call(path);
  if (!response.ok) return null;
  return ((await response.json()) as { data?: T }).data ?? null;
}

/** Lô đang có cùng mã · màu · tình trạng · khổ · kho. */
async function findLot(call: PlatformCall, line: {
  profile: string; colour: string; generation: string; width: number; warehouse: string;
}): Promise<{ name: string; sheet_count?: number; modified?: string } | null> {
  const query = new URLSearchParams({
    filters: JSON.stringify({
      profile: line.profile, colour: line.colour,
      generation: line.generation, warehouse: line.warehouse,
    }),
    fields: JSON.stringify(["name", "width_m", "sheet_count"]),
    limit_page_length: "200",
  });
  const rows = await readJson<Array<{ name: string; width_m: number; sheet_count: number }>>(
    call, `resource/Aluminium%20Lot?${query}`);
  const hit = (rows ?? []).find((row) => widthKey(row.width_m) === widthKey(line.width));
  if (!hit) return null;
  return await readJson(call, `resource/Aluminium%20Lot/${encodeURIComponent(hit.name)}`);
}

export interface LotSyncResult {
  created: string[];
  updated: string[];
  skipped: number;
  failed: Array<{ row: string; reason: string }>;
}

/**
 * Ghi lô cho một phiếu nhập vừa được ghi sổ.
 *
 * `direction` = +1 khi ghi sổ, −1 khi huỷ phiếu. Huỷ trừ lại ĐÚNG số lá phiếu này đã cộng —
 * đọc từ `intake_sheets` trên chính lô — chứ không tính lại từ số hiện tại, vì giữa lúc nhập
 * và lúc huỷ có thể đã cắt mất vài lá.
 */
export async function syncLotsFromReceipt(
  call: PlatformCall, receiptName: string, direction: 1 | -1,
): Promise<LotSyncResult> {
  const out: LotSyncResult = { created: [], updated: [], skipped: 0, failed: [] };
  const receipt = await readJson<{ items?: ReceiptLine[] }>(
    call, `resource/Purchase%20Receipt/${encodeURIComponent(receiptName)}`);
  if (!receipt) return out;

  for (const [index, line] of (receipt.items ?? []).entries()) {
    const rowId = String(line.row_id ?? index + 1);
    if (line.inventory_mode !== "Nhôm cây/lá") { out.skipped += 1; continue; }
    const profile = String(line.item_code ?? "").trim();
    const colour = String(line.color ?? "").trim();
    const warehouse = String(line.warehouse ?? "").trim();
    const width = Number(line.length_m);
    const sheets = Number(line.qty_bar);
    // Bộ kiểm lúc ghi phiếu đã bắt buộc có đủ chiều dài và số cây; tới đây mà thiếu thì là
    // dữ liệu cũ trước khi có luật đó — bỏ qua và báo, không đoán.
    if (!profile || !colour || !warehouse || !positive(width) || !positive(sheets)) {
      out.failed.push({ row: rowId, reason: "dòng thiếu mã, màu, kho, chiều dài hoặc số cây" });
      continue;
    }
    const generation = String(line.generation ?? "MỚI").trim() || "MỚI";
    const existing = await findLot(call, { profile, colour, generation, width, warehouse });
    const delta = direction * sheets;

    if (existing) {
      const before = Number(existing.sheet_count ?? 0);
      const already = Number((existing as { intake_sheets?: number }).intake_sheets ?? 0);
      const after = before + delta;
      if (after < 0) {
        out.failed.push({ row: rowId, reason: `huỷ sẽ làm lô ${existing.name} âm (${before} lá, trừ ${sheets})` });
        continue;
      }
      const response = await call(`resource/Aluminium%20Lot/${encodeURIComponent(existing.name)}`, {
        method: "PUT",
        body: JSON.stringify({
          sheet_count: after,
          stock_state: after > 0 ? "TỒN" : "HẾT",
          intake_sheets: Math.max(0, already + delta),
          source_receipt: receiptName,
          source_receipt_row: rowId,
          modified: existing.modified,
        }),
      });
      if (response.ok) out.updated.push(existing.name);
      else out.failed.push({ row: rowId, reason: `không cập nhật được lô ${existing.name}` });
      continue;
    }

    if (direction < 0) { out.skipped += 1; continue; }
    const created = await call("resource/Aluminium%20Lot", {
      method: "POST",
      body: JSON.stringify({
        profile, colour, generation, warehouse,
        width_m: widthKey(width), sheet_count: sheets, intake_sheets: sheets,
        stock_state: "TỒN", received_on: new Date().toISOString().slice(0, 10),
        source_receipt: receiptName, source_receipt_row: rowId,
        intake_note: `Sinh tự động từ phiếu nhập ${receiptName}`,
      }),
    });
    if (created.ok) out.created.push(((await created.json()) as { data?: { name?: string } }).data?.name ?? "");
    else out.failed.push({ row: rowId, reason: "không tạo được lô mới" });
  }
  return out;
}
