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

export type ExportFormat = "xlsx" | "pdf";

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

function html(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Mở hộp thoại in của trình duyệt với một bảng đã dàn trang A4 ngang.
 * Người dùng chọn "Lưu thành PDF"; cách này giữ đúng font Unicode tiếng Việt mà
 * không phải nhúng thêm một bộ font nặng vào bundle.
 */
export function printTablePdf(
  filename: string,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown> | unknown[]>,
  textOf: (row: Record<string, unknown> | unknown[], col: ExportColumn, idx: number) => string,
): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("Không thể tạo bản PDF");
  }
  const head = columns.map((column) => `<th>${html(column.label ?? column.fieldname ?? "")}</th>`).join("");
  const body = rows.map((row) =>
    `<tr>${columns.map((column, index) => `<td>${html(textOf(row, column, index))}</td>`).join("")}</tr>`,
  ).join("");
  doc.open();
  doc.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${html(filename)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #111827; font: 10px/1.35 Arial, "Segoe UI", sans-serif; }
      h1 { margin: 0 0 8px; font-size: 16px; }
      .meta { margin-bottom: 10px; color: #667085; }
      table { width: 100%; border-collapse: collapse; table-layout: auto; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      th, td { border: 1px solid #d0d5dd; padding: 5px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #f2f4f7; font-weight: 700; }
      tbody tr:nth-child(even) { background: #f9fafb; }
    </style></head><body>
      <h1>${html(filename.replace(/-\d{8}-\d{4}$/, ""))}</h1>
      <div class="meta">${rows.length} bản ghi · ${html(new Date().toLocaleString("vi-VN"))}</div>
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </body></html>`);
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(cleanup, 60_000);
  }, 100);
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
