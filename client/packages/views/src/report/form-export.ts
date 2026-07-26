/**
 * Xuất một BIỂU (report form) ra .xlsx — khối tiêu đề + bảng + dòng tổng.
 *
 * Vì sao tách ra khỏi màn báo cáo: mọi biểu kế toán đều có đúng một khuôn — tên đơn vị, tên biểu
 * in hoa gộp giữa trang, vài dòng phụ đề (kỳ báo cáo, kho, mặt hàng), rồi mới tới bảng và dòng
 * tổng. Ba màn báo cáo đầu tiên đã chép đi chép lại gần như nguyên văn đoạn dựng khuôn đó, và mỗi
 * bản chép lại quên một thứ khác nhau: bản quên `!cols` thì Excel hiện "#####" thay cho số, bản
 * quên gán `z` thì ra "6250000" bắt người đọc tự đếm chữ số.
 *
 * Gom về một chỗ thì sửa một lần là mọi biểu được nhờ, và biểu mới chỉ cần khai NỘI DUNG.
 */

/** Số kiểu yyyy-mm-dd → dd/mm/yyyy (cách viết trên mọi biểu của VN). */
export function ymdToDmy(iso: string): string {
  if (!iso) return "";
  const [ngay] = String(iso).split(" ");        // cắt phần giờ nếu là datetime
  const [y, m, d] = (ngay ?? "").split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

/** Gộp ô trong khối TIÊU ĐỀ CỘT — toạ độ tính từ hàng tiêu đề đầu tiên (r = 0). */
export interface HeaderMerge {
  r: number;
  c: number;
  rowSpan?: number;
  colSpan?: number;
}

export interface FormXlsxOptions {
  /** tên file, không cần đuôi .xlsx */
  filename: string;
  sheet: string;
  /** dòng trên cùng, thường là "Đơn vị: <tên công ty>" */
  unit?: string;
  /** tên biểu — gộp ô suốt bề ngang bảng */
  title: string;
  /** phụ đề: kỳ báo cáo, kho, mặt hàng… mỗi chuỗi một dòng, cũng gộp suốt bề ngang */
  subtitles?: string[];
  /** một hoặc hai hàng tiêu đề cột */
  header: unknown[][];
  headerMerges?: HeaderMerge[];
  rows: unknown[][];
  /** dòng tổng / cộng phát sinh / số dư cuối kỳ */
  footer?: unknown[][];
  /** bề rộng cột theo số ký tự */
  colWidths?: number[];
  /** mặc định "#,##0.##" — phân cách hàng nghìn, bỏ số 0 thừa sau dấu phẩy */
  numberFormat?: string;
}

export async function exportFormXlsx(o: FormXlsxOptions): Promise<void> {
  // Nạp lười SheetJS (~430KB): người chỉ xem báo cáo trên màn hình không phải tải.
  const XLSX = await import("xlsx");

  const khoi: unknown[][] = [];
  if (o.unit) khoi.push([o.unit]);
  const dongTieuDe = khoi.length;
  khoi.push([o.title]);
  for (const s of o.subtitles ?? []) khoi.push([s]);
  khoi.push([]); // một dòng trống ngăn khối tiêu đề với bảng

  const aoa = [...khoi, ...o.header, ...o.rows, ...(o.footer ?? [])];

  // Bề ngang bảng = hàng dài nhất. Tính từ dữ liệu THẬT chứ không nhận từ ngoài: khai tay thì chỉ
  // cần thêm một cột là tên biểu gộp thiếu, lệch hẳn khỏi giữa trang.
  const beNgang = Math.max(1, ...o.header.map((r) => r.length), ...o.rows.map((r) => r.length), ...(o.footer ?? []).map((r) => r.length));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }> = [];
  // tên biểu + mọi dòng phụ đề: gộp suốt bề ngang
  for (let r = dongTieuDe; r < khoi.length - 1; r++) {
    merges.push({ s: { r, c: 0 }, e: { r, c: beNgang - 1 } });
  }
  // gộp trong khối tiêu đề cột — dịch xuống đúng chiều cao khối tiêu đề ở trên
  for (const m of o.headerMerges ?? []) {
    const r0 = khoi.length + m.r;
    merges.push({
      s: { r: r0, c: m.c },
      e: { r: r0 + (m.rowSpan ?? 1) - 1, c: m.c + (m.colSpan ?? 1) - 1 },
    });
  }
  ws["!merges"] = merges;

  if (o.colWidths) ws["!cols"] = o.colWidths.map((wch) => ({ wch }));

  const z = o.numberFormat ?? "#,##0.##";
  for (const addr of Object.keys(ws)) {
    if (addr.startsWith("!")) continue;
    const cell = ws[addr] as { t?: string; z?: string };
    if (cell?.t === "n") cell.z = z;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, o.sheet);
  XLSX.writeFile(wb, o.filename.endsWith(".xlsx") ? o.filename : `${o.filename}.xlsx`);
}
