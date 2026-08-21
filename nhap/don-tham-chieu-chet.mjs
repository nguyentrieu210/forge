/**
 * DỌN THAM CHIẾU CHẾT — ô đã bị xoá nhưng `viewPolicy` / `search_fields` vẫn nêu tên.
 *
 * Truy vấn danh sách sẽ hỏi một cột không còn tồn tại và hỏng; ngoài màn hình ô Link chỉ báo
 * "Không tải được kết quả", không nhắc gì tới field đã xoá — nên rất khó lần ra nguyên nhân.
 *
 * Quét MỌI doctype, không chỉ cái tôi vừa sửa: tham chiếu chết có thể có từ trước.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/don-tham-chieu-chet.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const THAT = process.argv.includes("--that");

const db = new DatabaseSync(D1);
const tat = db.prepare("SELECT doctype, metadata_json, revision FROM doctype_definitions WHERE tenant_id=?").all("demo");
let sua = 0, tong = 0;
const canSua = [];
for (const r of tat) {
  const m = JSON.parse(r.metadata_json);
  const co = new Set((m.fields ?? []).map((f) => f.fieldname));
  const chet = [];
  const loc = (nhan, ds) => {
    if (!Array.isArray(ds)) return ds;
    const xau = ds.filter((k) => k && !co.has(k));
    if (xau.length) chet.push(`${nhan}: ${xau.join(", ")}`);
    return xau.length ? ds.filter((k) => co.has(k)) : ds;
  };
  for (const khung of ["list", "form", "quickEntry", "kanban", "calendar", "gantt", "chart"]) {
    const v = m.viewPolicy?.[khung]; if (!v) continue;
    if (Array.isArray(v.columns)) v.columns = loc(`${khung}.columns`, v.columns);
    if (Array.isArray(v.fields)) v.fields = loc(`${khung}.fields`, v.fields);
  }
  if (m.viewPolicy?.mobile?.bulk?.columns) m.viewPolicy.mobile.bulk.columns = loc("mobile.bulk.columns", m.viewPolicy.mobile.bulk.columns);
  if (Array.isArray(m.search_fields)) m.search_fields = loc("search_fields", m.search_fields);
  if (m.title_field && !co.has(m.title_field)) { chet.push(`title_field: ${m.title_field}`); delete m.title_field; }
  tong += 1;
  if (!chet.length) continue;
  canSua.push({ doctype: r.doctype, chet, m, revision: r.revision });
}
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"} · quét ${tong} doctype\n`);
console.log(`doctype có tham chiếu chết: ${canSua.length}`);
for (const c of canSua) console.log(`   ${c.doctype}\n      ${c.chet.join("\n      ")}`);
if (!canSua.length || !THAT) { db.close(); process.exit(0); }
mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-DON-THAM-CHIEU-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));
for (const c of canSua) {
  db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
    .run(JSON.stringify(c.m), Number(c.revision ?? 0) + 1, "demo", c.doctype);
  sua += 1;
}
db.close();
console.log(`\n✓ dọn ${sua} doctype`);
