/**
 * Luật "phiếu kho đã đủ để lưu chưa", tách khỏi component.
 *
 * Để rời ra vì hai lý do. Một, nút Lưu và dải cảnh báo đỏ phải dùng CHUNG một luật — hai nơi tự
 * phán là đẻ ra kiểu lỗi nút bấm được mà lưu vẫn nổ. Hai, file component kéo theo React và
 * `@metaforge/ui` nên không kiểm thử trần được; file này thuần nên test import thẳng từ `dist`.
 */

/**
 * Ba loại phiếu màn lập tay làm được. DocType `Stock Entry` khai NĂM loại, nhưng:
 *
 * - `Manufacture` cần `work_order` + `finished_good_item` + `finished_good_qty`, đường đúng là
 *   mở từ lệnh sản xuất chứ không lập tay.
 * - `Điều chỉnh tồn` CHƯA AI THI HÀNH ở server: bộ điều khiển chỉ nhận
 *   `Material Receipt | Material Issue | Material Transfer | Manufacture`
 *   (`server/packages/clouderp-core/src/controllers.ts` và `.../clouderp-erpnext/src/controllers.ts`),
 *   nên chọn nó là chắc chắn nổ "Company, posting_at and valid purpose are required" — dù DocType
 *   có khai, ô `adjust_reason` có, và danh mục `Nguyên nhân chênh lệch` đã dựng đủ 7 mục.
 */
export const LOAI_PHIEU_KHO = [
  { ma: "Material Issue", nhan: "Xuất vật tư", mo_ta: "Đưa nhôm, tôn, phụ kiện ra xưởng làm. Server chặn nếu xuất quá tồn." },
  { ma: "Material Transfer", nhan: "Chuyển kho", mo_ta: "Chuyển giữa hai kho, ví dụ sang kho đầu thừa." },
  { ma: "Material Receipt", nhan: "Nhập kho", mo_ta: "Hàng về kho ngoài đường mua, hoặc trả lại." },
] as const;

export type MaPhieuKho = (typeof LOAI_PHIEU_KHO)[number]["ma"];

/** Loại nào cần kho xuất, loại nào cần kho nhập — quyết định luôn ô nào hiện trên màn. */
export const CAN_KHO_XUAT: ReadonlySet<string> = new Set(["Material Issue", "Material Transfer"]);
export const CAN_KHO_NHAP: ReadonlySet<string> = new Set(["Material Receipt", "Material Transfer"]);

export interface PhieuKhoDangSoan {
  purpose: string;
  company: string;
  sourceWarehouse: string;
  targetWarehouse: string;
  rows: ReadonlyArray<{ item_code: string; qty: string }>;
}

/** Câu nói RÕ đang thiếu gì, hoặc chuỗi rỗng nếu đủ để lưu. */
export function kiemTraPhieuKho(input: PhieuKhoDangSoan): string {
  if (!LOAI_PHIEU_KHO.some((entry) => entry.ma === input.purpose)) {
    return `Loại phiếu "${input.purpose}" không lập tay được ở màn này.`;
  }
  if (!input.company) return "Chưa chọn công ty.";
  if (CAN_KHO_XUAT.has(input.purpose) && !input.sourceWarehouse) return "Loại phiếu này phải chọn kho xuất.";
  if (CAN_KHO_NHAP.has(input.purpose) && !input.targetWarehouse) return "Loại phiếu này phải chọn kho nhập.";
  if (input.purpose === "Material Transfer" && input.sourceWarehouse === input.targetWarehouse) {
    return "Chuyển kho mà kho xuất trùng kho nhập thì không chuyển đi đâu cả.";
  }
  const dong = input.rows.filter((row) => (row.item_code ?? "").trim());
  if (!dong.length) return "Phiếu chưa có dòng vật tư nào.";
  for (const row of dong) {
    const qty = Number(row.qty);
    if (!Number.isFinite(qty) || qty <= 0) return `Dòng ${row.item_code} chưa có số lượng hợp lệ.`;
  }
  return "";
}
