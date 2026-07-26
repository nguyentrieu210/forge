/**
 * Ánh xạ file mẫu MISA AMIS → chứng từ ERPNext.
 *
 * Kiểm chứng trên 3 file mẫu thật (C:\Toka\Form Amis) bằng apps/kho-vn/verify-misa.mjs:
 * 35/43/40 cột, tiêu đề ở dòng index 7, mọi cột bắt buộc đều khớp và ngày parse đúng.
 * Dòng tiêu đề KHÔNG chốt cứng mà tự dò (findHeaderRow) — xem lý do ở hàm đó.
 *
 * Nguyên tắc khớp cột: so theo TÊN TIÊU ĐỀ đã chuẩn hoá (bỏ dấu, bỏ dấu sao bắt buộc, gộp
 * khoảng trắng) chứ không theo VỊ TRÍ cột. Người dùng hay xoá bớt cột không dùng hoặc chèn thêm
 * cột riêng của công ty; khớp theo vị trí thì cả file lệch một nhịp và dữ liệu vào sai field mà
 * vẫn nhập trót lọt — sai kiểu đó nguy hiểm hơn nhiều so với báo lỗi ngay.
 */

/** Bỏ dấu tiếng Việt + chuẩn hoá để so tiêu đề cột không phụ thuộc dấu/hoa thường/khoảng trắng. */
export function normalizeHeader(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\(\*\)/g, "")   // MISA đánh dấu cột bắt buộc bằng (*)
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

export type MisaKind = "nhap" | "xuat" | "chuyen";

export interface FieldSpec {
  /** field trên chứng từ ERPNext (đầu phiếu hoặc dòng hàng). */
  target: string;
  /** thuộc dòng hàng (items) thay vì đầu phiếu. */
  line?: boolean;
  /** các tiêu đề MISA có thể gặp cho field này (đã chuẩn hoá). */
  headers: string[];
  required?: boolean;
  /** kiểu để ép giá trị. */
  type?: "date" | "number" | "text";
}

/**
 * Mỗi loại phiếu MISA → DocType ERPNext tương ứng + bảng ánh xạ cột.
 *
 * Chuyển kho map sang `Stock Entry` loại "Material Transfer"; nhập kho sang `Purchase Receipt`;
 * xuất kho sang `Delivery Note`. Đây là ba chứng từ chuẩn — KHÔNG tạo doctype riêng, để sổ kho
 * vẫn là một (BRD §6 #3/#4).
 */
export const MISA_MAP: Record<MisaKind, {
  label: string;
  doctype: string;
  /** giá trị cố định gắn vào mọi phiếu tạo ra từ loại này. */
  fixed?: Record<string, unknown>;
  fields: FieldSpec[];
}> = {
  nhap: {
    label: "Phiếu nhập kho",
    doctype: "Purchase Receipt",
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "supplier", headers: ["ma doi tuong", "ten doi tuong"], required: true },
      { target: "remarks", headers: ["dien giai", "ly do nhap"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong nhap"], required: true, type: "number" },
      { target: "rate", line: true, headers: ["don gia"], type: "number" },
      // Thứ tự = ƯU TIÊN. "kho" quá chung, khớp CHỨA sẽ trúng cả "Xuất tại kho" ⇒ để cuối.
      { target: "warehouse", line: true, headers: ["nhap tai kho", "kho nhap", "ma kho", "kho"] },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
  xuat: {
    label: "Phiếu xuất kho",
    doctype: "Delivery Note",
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "customer", headers: ["ma doi tuong", "ten doi tuong"], required: true },
      { target: "instructions", headers: ["ly do xuat", "dien giai"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong xuat"], required: true, type: "number" },
      { target: "rate", line: true, headers: ["don gia"], type: "number" },
      { target: "warehouse", line: true, headers: ["xuat tai kho", "kho xuat", "ma kho", "kho"] },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
  chuyen: {
    label: "Phiếu chuyển kho",
    doctype: "Stock Entry",
    fixed: { stock_entry_type: "Material Transfer", purpose: "Material Transfer" },
    fields: [
      { target: "posting_date", headers: ["ngay hach toan", "ngay chung tu"], required: true, type: "date" },
      { target: "remarks", headers: ["ve viec dien giai", "dien giai"] },
      { target: "item_code", line: true, headers: ["ma hang"], required: true },
      { target: "qty", line: true, headers: ["so luong", "so luong chuyen"], required: true, type: "number" },
      { target: "s_warehouse", line: true, headers: ["kho xuat", "xuat tai kho", "tu kho"], required: true },
      { target: "t_warehouse", line: true, headers: ["kho nhap", "nhap tai kho", "den kho"], required: true },
      { target: "uom", line: true, headers: ["dvt", "don vi tinh"] },
    ],
  },
};

/** Số chứng từ — dùng để GOM các dòng cùng một phiếu lại. */
export const DOC_NO_HEADERS = ["so chung tu", "so phieu", "so ct"];

/**
 * Ngày trong file Excel có ba dạng: chuỗi "31/01/2020", số serial của Excel, hoặc Date đã parse.
 * Trả về yyyy-mm-dd (dạng Frappe nhận).
 */
export function toISODate(v: unknown): string {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) return isoOf(v);

  if (typeof v === "number") {
    // Excel đếm ngày từ 1899-12-30 (lệch 1 ngày do lỗi năm nhuận 1900 mà Excel cố giữ).
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return Number.isNaN(d.getTime()) ? "" : isoOf(d);
  }

  const s = String(v).trim();
  // dd/mm/yyyy — cách viết của người Việt và của chính file MISA.
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

function isoOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  // getUTC*: giá trị dựng từ Date.UTC ở trên, dùng getFullYear (giờ địa phương) sẽ lệch 1 ngày.
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** "1.234,5" (kiểu VN) hoặc "1,234.5" (kiểu Anh) → số. */
export function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  // Dấu nào xuất hiện SAU CÙNG là dấu thập phân — cách duy nhất phân biệt "1.234" (nghìn) với
  // "1.234" (thập phân) mà không cần biết trước file theo quy ước nào.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let out = s;
  if (lastComma > lastDot) out = s.replace(/\./g, "").replace(",", ".");
  else out = s.replace(/,/g, "");
  const n = Number(out.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Khớp tiêu đề file → chỉ số cột, theo TÊN chứ không theo vị trí. */
export function matchColumns(headerRow: unknown[], fields: FieldSpec[]): Record<string, number> {
  const norm = headerRow.map(normalizeHeader);
  const out: Record<string, number> = {};
  for (const f of fields) {
    for (const want of f.headers) {
      const i = norm.findIndex((h) => h === want);
      if (i >= 0) { out[f.target] = i; break; }
    }
    // chưa khớp tuyệt đối thì thử khớp CHỨA — file thật hay có thêm chú thích trong tiêu đề
    if (out[f.target] === undefined) {
      for (const want of f.headers) {
        const i = norm.findIndex((h) => h.includes(want));
        if (i >= 0) { out[f.target] = i; break; }
      }
    }
  }
  return out;
}

/**
 * TỰ DÒ dòng tiêu đề thay vì chốt cứng một chỉ số.
 *
 * File mẫu MISA để 6–7 dòng hướng dẫn ở đầu, và con số đó KHÁC NHAU giữa các mẫu (bản nhập kho
 * còn thêm một dòng gộp "Chi tiết hàng tiền"). Chốt cứng "dòng 7" thì chỉ cần MISA thêm một dòng
 * ghi chú, hoặc người dùng chèn một dòng, là toàn bộ ánh xạ trượt và không cột nào khớp.
 *
 * Cách dò: quét 20 dòng đầu, tìm dòng chứa nhiều DẤU HIỆU tiêu đề nhất (những cụm chắc chắn có ở
 * hàng tiêu đề của mọi mẫu). Trả -1 nếu không thấy — thà báo lỗi rõ còn hơn nhập nhầm dòng.
 */
const HEADER_MARKERS = ["ma hang", "ngay hach toan", "ngay chung tu", "so chung tu", "so luong", "don gia"];

export function findHeaderRow(rows: unknown[][], maxScan = 20): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const norm = (rows[i] ?? []).map(normalizeHeader);
    let score = 0;
    for (const m of HEADER_MARKERS) if (norm.some((h) => h === m || h.includes(m))) score++;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // Cần ít nhất 2 dấu hiệu: một dòng dữ liệu tình cờ chứa chữ "số lượng" không được coi là tiêu đề.
  return bestScore >= 2 ? best : -1;
}

export function findDocNoColumn(headerRow: unknown[]): number {
  const norm = headerRow.map(normalizeHeader);
  for (const want of DOC_NO_HEADERS) {
    const i = norm.findIndex((h) => h === want || h.includes(want));
    if (i >= 0) return i;
  }
  return -1;
}
