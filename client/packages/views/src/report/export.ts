/**
 * Xuất bảng báo cáo ra file mở được bằng Excel.
 *
 * Dùng CSV chứ không .xlsx: sinh xlsx thật đòi thêm một thư viện đóng gói ZIP + XML (vài trăm KB
 * vào bundle) trong khi Excel mở CSV không khác gì. Đổi lại phải xử lý đúng ba thứ mà bản CSV
 * viết vội hay sai — và sai thì người dùng mở ra thấy chữ Việt thành "Tá»n kho", cột dồn hết vào
 * một ô, hoặc mã hàng "0012" bị nuốt số 0.
 */

/** Số kiểu Việt Nam: "1.234.567,89" → 1234567.89. Trả về null nếu không phải số. */
function viNumber(raw: string): number | null {
  const s = raw.trim();
  if (!/^-?[\d.]+(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function csvCell(value: unknown, sep: string): string {
  if (value === null || value === undefined) return "";
  let s = String(value);

  // Số đã được định dạng sẵn theo kiểu VN ("1.234.567,89") thì trả về dạng SỐ THUẦN, để Excel
  // nhận là số và cộng/lọc được. Giữ nguyên chuỗi đã định dạng thì cả cột thành text, mọi hàm
  // SUM đều ra 0 — lỗi rất hay gặp và người dùng thường không hiểu vì sao.
  const asNum = viNumber(s);
  if (asNum !== null && /[.,]/.test(s)) s = String(asNum);

  const mustQuote = s.includes(sep) || s.includes('"') || s.includes("\n") || s.includes("\r");
  // Chuỗi bắt đầu bằng = + - @ bị Excel hiểu là CÔNG THỨC (lỗ hổng CSV injection, và cũng làm
  // hỏng dữ liệu vô hại như mã "-01"). Chèn dấu nháy đơn để ép về text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return mustQuote ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface ExportColumn {
  label?: string;
  fieldname?: string;
  fieldtype?: string;
}

/** Fieldtype cần ghi xuống Excel dưới dạng SỐ THẬT để còn SUM/lọc/vẽ biểu đồ được. */
const NUMERIC_FIELDTYPES = new Set(["Currency", "Float", "Int", "Percent"]);

/**
 * Xuất ra .xlsx THẬT thay vì .csv.
 *
 * Nút vẫn ghi "Xuất Excel" nhưng trước đây tải về một file .csv, và đó là nguồn của cả một nhóm
 * lỗi khó chịu mà người dùng chỉ mô tả được là "mở lên bị lỗi": dòng chỉ dẫn `sep=;` hiện thành
 * chữ trong ô đầu tiên, dấu ngăn cột phụ thuộc thiết lập vùng của từng máy, và thiếu BOM một chút
 * là tiếng Việt thành ký tự rác. File .xlsx không có bất kỳ vấn đề nào trong số đó: mã hoá và cấu
 * trúc cột nằm trong chính file.
 *
 * Nạp lười SheetJS (~430KB) — chỉ tải khi người dùng thật sự bấm xuất file.
 */
export async function downloadXlsx(
  filename: string,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown> | unknown[]>,
  rawOf: (row: Record<string, unknown> | unknown[], col: ExportColumn, idx: number) => unknown,
  textOf: (row: Record<string, unknown> | unknown[], col: ExportColumn, idx: number) => string,
): Promise<void> {
  const XLSX = await import("xlsx");
  const head = columns.map((c) => c.label ?? c.fieldname ?? "");
  const body = rows.map((r) =>
    columns.map((c, i) => {
      const v = rawOf(r, c, i);
      // Số thì ghi SỐ (Excel cộng được), còn lại ghi chuỗi đã định dạng như đang thấy trên màn hình.
      if (NUMERIC_FIELDTYPES.has(c.fieldtype ?? "") && typeof v === "number" && Number.isFinite(v)) return v;
      return textOf(r, c, i);
    }),
  );

  const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
  ws["!cols"] = columns.map((c) => ({ wch: Math.min(42, Math.max(12, (c.label ?? c.fieldname ?? "").length + 6)) }));
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cell = ws[addr] as { t?: string; z?: string };
    if (cell?.t === "n") cell.z = "#,##0.##"; // không có thì Excel hiện 6250000, phải tự đếm chữ số
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BaoCao");
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/**
 * Dựng nội dung CSV.
 * @param sep Dấu ngăn cột. Excel bản tiếng Việt/châu Âu đọc CSV theo dấu CHẤM PHẨY vì dấu phẩy
 *            đã dùng làm dấu thập phân. Dùng dấu phẩy thì mở ra cả hàng dồn vào một ô.
 */
export function buildCsv(
  columns: ExportColumn[],
  rows: Array<Record<string, unknown> | unknown[]>,
  cellOf: (row: Record<string, unknown> | unknown[], col: ExportColumn, idx: number) => unknown,
  sep = ";",
): string {
  const head = columns.map((c) => csvCell(c.label ?? c.fieldname ?? "", sep)).join(sep);
  const body = rows.map((r) => columns.map((c, i) => csvCell(cellOf(r, c, i), sep)).join(sep));
  // sep= ở dòng đầu: chỉ dẫn riêng của Excel để nó dùng đúng dấu ngăn cột bất kể thiết lập vùng
  // của máy. Không có dòng này thì cùng một file mở ở máy khác lại dồn cột.
  return [`sep=${sep}`, head, ...body].join("\r\n");
}

/** Tải chuỗi CSV xuống dưới dạng file. */
export function downloadCsv(filename: string, csv: string): void {
  // ﻿ (BOM UTF-8) là BẮT BUỘC: thiếu nó Excel trên Windows đọc file theo bảng mã địa phương
  // và toàn bộ tiếng Việt có dấu biến thành ký tự rác.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi ngay sẽ huỷ tải ở một số trình duyệt; hoãn một nhịp cho chắc.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Tên file có ngày giờ để tải nhiều lần không đè lên nhau. */
export function stampedName(base: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
