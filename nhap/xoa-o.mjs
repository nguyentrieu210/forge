/**
 * XOÁ MỘT Ô khỏi doctype — sạch, có đường về.
 *
 * Xoá field không chỉ là bỏ nó khỏi `fields`. Ba việc phải làm cùng lúc, thiếu cái nào cũng
 * để lại hỏng hóc khó truy:
 *   1. chép giá trị cũ ra tệp — xoá ô là mất dữ liệu của nó
 *   2. bỏ ô khỏi `fields` VÀ khỏi payload từng bản ghi
 *   3. DỌN mọi chỗ còn nêu tên nó (viewPolicy, search_fields, title_field…) — bỏ sót thì truy
 *      vấn danh sách hỏi một cột không tồn tại, ngoài màn hình chỉ hiện "Không tải được kết
 *      quả" mà không nhắc gì tới ô đã xoá
 *
 * Runtime PHẢI TẮT.
 * CHẠY:  node nhap/xoa-o.mjs "<Doctype>" <fieldname> [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const [DT, O] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const THAT = process.argv.includes("--that");
if (!DT || !O) throw new Error('CHẠY: node nhap/xoa-o.mjs "<Doctype>" <fieldname> [--that]');

const db = new DatabaseSync(D1);
const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DT);
if (!r) throw new Error(`không thấy doctype ${DT}`);
const m = JSON.parse(r.metadata_json);
const f = (m.fields ?? []).find((x) => x.fieldname === O);
console.log(`${THAT ? "GHI THẬT" : "chạy thử (thêm --that để ghi)"}\n`);
if (!f) { console.log(`${DT}: không có ô "${O}" — không làm gì.`); db.close(); process.exit(0); }
console.log(`${DT} · xoá ô "${f.label ?? O}" (${O}, ${f.fieldtype})`);

const banGhi = db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, DT)
  .map((x) => ({ name: x.name, p: JSON.parse(x.payload_json) }));
const coGiaTri = banGhi.filter((x) => x.p[O] !== undefined && x.p[O] !== null && x.p[O] !== "");
console.log(`   ${banGhi.length} bản ghi · ${coGiaTri.length} bản có giá trị ở ô này`);
for (const x of coGiaTri.slice(0, 8)) console.log(`      ${x.name.padEnd(28)}${JSON.stringify(x.p[O])}`);
if (coGiaTri.length > 8) console.log(`      … và ${coGiaTri.length - 8} bản nữa`);

const nheo = [];
const loc = (nhan, ds) => {
  if (!Array.isArray(ds)) return ds;
  if (ds.includes(O)) nheo.push(nhan);
  return ds.filter((k) => k !== O);
};
for (const khung of ["list", "form", "quickEntry", "kanban", "calendar", "gantt", "chart"]) {
  const v = m.viewPolicy?.[khung]; if (!v) continue;
  if (Array.isArray(v.columns)) v.columns = loc(`${khung}.columns`, v.columns);
  if (Array.isArray(v.fields)) v.fields = loc(`${khung}.fields`, v.fields);
}
if (m.viewPolicy?.mobile?.bulk?.columns) m.viewPolicy.mobile.bulk.columns = loc("mobile.bulk.columns", m.viewPolicy.mobile.bulk.columns);
if (Array.isArray(m.search_fields)) m.search_fields = loc("search_fields", m.search_fields);
if (m.title_field === O) { nheo.push("title_field"); delete m.title_field; }
if (m.sort_field === O) { nheo.push("sort_field"); delete m.sort_field; }
console.log(`   dọn ${nheo.length} chỗ còn trỏ tới nó: ${nheo.join(", ") || "(không có)"}`);

if (!THAT) { console.log("\n(chưa ghi gì)"); db.close(); process.exit(0); }
mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const dau = new Date().toISOString().replace(/[:.]/g, "-");
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-XOA-${O}-${dau}.sqlite`));
const tep = resolve(GOC, "nhap/.sao-luu", `gia-tri-${DT.replace(/\s+/g, "-")}-${O}-${dau}.json`);
writeFileSync(tep, JSON.stringify(coGiaTri.map((x) => ({ name: x.name, [O]: x.p[O] })), null, 1), "utf8");

m.fields = m.fields.filter((x) => x.fieldname !== O);
m.fields.forEach((x, k) => { x.idx = k + 1; });
db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, TENANT, DT);
let n = 0;
for (const x of banGhi) {
  if (!(O in x.p)) continue;
  delete x.p[O];
  db.prepare("UPDATE documents SET payload_json=? WHERE tenant_id=? AND doctype=? AND name=?").run(JSON.stringify(x.p), TENANT, DT, x.name);
  n += 1;
}
db.close();
console.log(`\n✓ xoá khỏi doctype · gỡ khỏi ${n} bản ghi · giá trị cũ lưu ở ${tep.replace(GOC + "\\", "")}`);
