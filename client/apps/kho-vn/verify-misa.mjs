/**
 * Kiểm bộ ánh xạ MISA trên CHÍNH 3 file mẫu thật, trước khi cho chạy trên dữ liệu người dùng.
 * Chạy: node verify-misa.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import * as XLSX from "xlsx";

const DIR = "C:\\Toka\\Form Amis";
const HEADER_MARKERS = ["ma hang", "ngay hach toan", "ngay chung tu", "so chung tu", "so luong", "don gia"];
function findHeaderRow(rows, maxScan = 20) {
  let best = -1, bestScore = 0;
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const norm = (rows[i] ?? []).map(normalizeHeader);
    let score = 0;
    for (const m of HEADER_MARKERS) if (norm.some((h) => h === m || h.includes(m))) score++;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return bestScore >= 2 ? best : -1;
}

function normalizeHeader(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d")
    .replace(/\(\*\)/g, "").replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
}
function toISODate(v) {
  if (v == null || v === "") return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const p = (n) => String(n).padStart(2, "0");
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}
function match(headerRow, wants) {
  const norm = headerRow.map(normalizeHeader);
  for (const w of wants) {
    let i = norm.findIndex((h) => h === w);
    if (i < 0) i = norm.findIndex((h) => h.includes(w));
    if (i >= 0) return i;
  }
  return -1;
}

const CASES = [
  { file: "nhap_kho_tt200_full.xls", kind: "nhap", need: {
      posting_date: ["ngay hach toan", "ngay chung tu"],
      supplier: ["ma doi tuong", "ten doi tuong"],
      item_code: ["ma hang"],
      qty: ["so luong", "so luong nhap"],
  }},
  { file: "xuat_kho_full.xls", kind: "xuat", need: {
      posting_date: ["ngay hach toan", "ngay chung tu"],
      customer: ["ma doi tuong", "ten doi tuong"],
      item_code: ["ma hang"],
      qty: ["so luong", "so luong xuat"],
  }},
  { file: "chuyen_kho_full.xls", kind: "chuyen", need: {
      posting_date: ["ngay hach toan", "ngay chung tu"],
      item_code: ["ma hang"],
      qty: ["so luong", "so luong chuyen"],
      s_warehouse: ["kho xuat", "xuat tai kho", "tu kho"],
      t_warehouse: ["kho nhap", "nhap tai kho", "den kho"],
  }},
];

let bad = 0;
for (const c of CASES) {
  const path = `${DIR}\\${c.file}`;
  console.log("=".repeat(64));
  console.log(c.file, `(${c.kind})`);
  if (!existsSync(path)) { console.log("  ✗ không thấy file"); bad++; continue; }

  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) { console.log("  ✗ KHÔNG DÒ ĐƯỢC dòng tiêu đề"); bad++; continue; }
  const header = rows[hIdx] ?? [];
  console.log(`  sheet="${wb.SheetNames[0]}"  ${rows.length} dòng  ${header.length} cột  tiêu đề ở index ${hIdx}`);

  for (const [target, wants] of Object.entries(c.need)) {
    const i = match(header, wants);
    const label = i >= 0 ? String(header[i]).slice(0, 34) : "";
    if (i >= 0) console.log(`  ✓ ${target.padEnd(14)} → cột ${String(i).padStart(2)}  "${label}"`);
    else { console.log(`  ✗ ${target.padEnd(14)} KHÔNG KHỚP  (tìm: ${wants.join(" | ")})`); bad++; }
  }

  // thử parse ngày ở dòng dữ liệu đầu
  const di = match(header, c.need.posting_date);
  if (di >= 0) {
    const raw = rows[hIdx + 1]?.[di];
    console.log(`  ngày dòng đầu: ${JSON.stringify(raw)} → "${toISODate(raw)}"`);
    if (!toISODate(raw)) { console.log("    ✗ parse ngày THẤT BẠI"); bad++; }
  }
}
console.log("=".repeat(64));
console.log(bad === 0 ? "✓ TẤT CẢ CỘT BẮT BUỘC ĐỀU KHỚP" : `✗ ${bad} vấn đề`);
process.exit(bad ? 1 : 0);
