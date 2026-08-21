/**
 * XUẤT DANH MỤC MẶT HÀNG ra file để đọc.
 *
 *   .md   đọc trên màn hình, chia theo nhóm hàng
 *   .csv  mở bằng Excel — có BOM UTF-8 nên không vỡ dấu tiếng Việt
 *
 * Đọc thẳng D1 (chỉ đọc), không cần runtime chạy.
 */

import { DatabaseSync } from "node:sqlite";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const db = new DatabaseSync(process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite"), { readOnly: true });

const items = db.prepare("SELECT payload_json FROM documents WHERE tenant_id='demo' AND doctype='Item'")
  .all().map((r) => JSON.parse(r.payload_json))
  .sort((a, b) => `${a.item_group}${a.item_code}`.localeCompare(`${b.item_group}${b.item_code}`, "vi"));
db.close();

const heSo = (x) => (x.uom_conversions ?? []).map((c) => `${c.uom} = ${c.conversion_factor}`).join(" ; ");
const nhom = {};
for (const x of items) (nhom[x.item_group] ??= []).push(x);

const md = [
  "# DANH MỤC MẶT HÀNG — Alumdoor",
  "",
  `Xuất ${new Date().toLocaleString("vi-VN")} · **${items.length} mặt hàng** · ${Object.keys(nhom).length} nhóm hàng`,
  "",
  "Quy ước mã: `VT_` + thân mã cũ · dấu phân cách là **gạch dưới** · chỉ dùng `A-Z 0-9 _ .`",
  "",
  "Hệ số quy đổi = số ĐVT tồn cho MỘT đơn vị giao dịch. Đang để `0` = chưa khai.",
  "",
];
for (const [ten, ds] of Object.entries(nhom)) {
  md.push(`## ${ten}  (${ds.length} mã)`, "");
  md.push("| Mã hàng | Tên hàng | Tồn | Mua | Bán | Hệ số | Ghi chú |");
  md.push("|---|---|---|---|---|---|---|");
  for (const x of ds) {
    md.push(`| \`${x.item_code}\` | ${x.item_name} | ${x.stock_uom} | ${x.default_purchase_uom ?? ""} | ${x.default_sales_uom ?? ""} | ${heSo(x)} | ${String(x.description ?? "").replace(/\|/g, "/")} |`);
  }
  md.push("");
}
writeFileSync(resolve(GOC, "nhap/DANH-MUC-MAT-HANG.md"), md.join("\n"), "utf8");

const oh = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv = [["Nhóm hàng", "Mã hàng", "Tên hàng", "ĐVT tồn", "ĐVT mua", "ĐVT bán", "Hệ số quy đổi", "Bản chất", "Giai đoạn vật tư", "Nguồn cung", "Ngừng KD", "Ghi chú"].map(oh).join(",")];
for (const x of items) {
  csv.push([x.item_group, x.item_code, x.item_name, x.stock_uom, x.default_purchase_uom, x.default_sales_uom,
    heSo(x), x.item_nature, x.material_stage, x.supply_type, x.disabled ? "x" : "", x.description].map(oh).join(","));
}
// BOM UTF-8: thiếu nó là Excel mở ra hỏng hết dấu tiếng Việt.
writeFileSync(resolve(GOC, "nhap/DANH-MUC-MAT-HANG.csv"), `\uFEFF${csv.join("\r\n")}`, "utf8");

console.log(`${items.length} mặt hàng · ${Object.keys(nhom).length} nhóm`);
for (const [ten, ds] of Object.entries(nhom)) console.log(`   ${ten.padEnd(30)}${ds.length}`);
console.log("\nC:\alumdoor\nhap\DANH-MUC-MAT-HANG.md    ← đọc trên màn hình");
console.log("C:\alumdoor\nhap\DANH-MUC-MAT-HANG.csv   ← mở bằng Excel");
