/**
 * CHUYỂN `geometry_profile` xuống cạnh `door_type`.
 *
 * Hai ô này là MỘT CẶP: "Loại cửa áp công thức" chọn công thức nào, "Bộ quy cách hình học"
 * khai công thức đó đo những kích thước gì. Đọc rời nhau thì không ô nào tự nói được nó dùng
 * làm gì — mà chúng đang nằm ở hai khu khác nhau, cách nhau cả đám đơn vị tính.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/xep-lai-o-hinh-hoc.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const THAT = process.argv.includes("--that");
const CHUYEN = "geometry_profile", SAU = "door_type";

const db = new DatabaseSync(D1);
const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get("demo", "Item");
const m = JSON.parse(r.metadata_json);

/** Nhấc một tên ra khỏi mảng rồi chèn lại ngay sau một tên khác. Dùng cho cả `fields` lẫn viewPolicy. */
const doiCho = (ds, lay, ten) => {
  const i = ds.findIndex((x) => (ten ? x[ten] : x) === CHUYEN);
  if (i < 0) return { ds, doi: false };
  const [x] = ds.splice(i, 1);
  const j = ds.findIndex((y) => (ten ? y[ten] : y) === SAU);
  ds.splice(j < 0 ? ds.length : j + 1, 0, x);
  return { ds, doi: true };
};

const a = doiCho(m.fields, null, "fieldname");
m.fields.forEach((f, k) => { f.idx = k + 1; });
const b = m.viewPolicy?.form?.fields ? doiCho(m.viewPolicy.form.fields, null, null) : { doi: false };

console.log(`thứ tự ô trong doctype : ${a.doi ? "đã chuyển" : "không thấy"}`);
console.log(`thứ tự ô trên form     : ${b.doi ? "đã chuyển" : "không thấy / form không dùng danh sách trắng"}`);

let khu = "";
for (const f of m.fields) {
  if (/Section Break|Tab Break/.test(f.fieldtype)) { khu = f.label || f.fieldname; continue; }
  if ([CHUYEN, SAU].includes(f.fieldname)) console.log(`   ${f.fieldname.padEnd(20)} → khu "${khu}"`);
}

if (!THAT) { console.log("\n(chạy thử — thêm --that để ghi)"); db.close(); process.exit(0); }
mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-XEP-HINH-HOC-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));
db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, "demo", "Item");
db.close();
console.log("\n✓ đã ghi");
