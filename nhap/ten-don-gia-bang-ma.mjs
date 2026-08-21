/**
 * TÊN ĐƠN GIÁ = MÃ ĐƠN GIÁ.
 *
 * Chủ xưởng 21/08/2026: "tên đơn giá phải giống như mã đơn giá chứ, gồm cả bậc diện tích".
 *
 * `title_field` của Item Price đang trỏ `item_code`, nên màn danh sách chỉ hiện MÃ HÀNG —
 * giấu mất biến thể và bậc diện tích. Bảy dòng giá của cùng một mã Đài Loan trông y hệt nhau,
 * bảy lần chữ "CDL_DLM_6D", không cách nào biết dòng nào là bậc nào.
 *
 * Bỏ title_field đi thì `deriveColumns` (client/packages/.../columns.ts:78) lấy thẳng `name`,
 * mà name sinh theo `format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier}` — tức
 * đúng cái mã đầy đủ, có bậc diện tích trong đó.
 *
 * GHI THẲNG D1 vì `PUT /api/resource/DocType` không nhận lại tài liệu mà `GET` vừa trả về
 * (ném "Boolean metadata property must be true or false"). Runtime PHẢI TẮT.
 *
 * CHẠY:  node nhap/ten-don-gia-bang-ma.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const THAT = process.argv.includes("--that");

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
if (THAT) copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-TEN-DON-GIA-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));

const db = new DatabaseSync(D1);
const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, "Item Price");
const m = JSON.parse(r.metadata_json);
console.log(`Item Price · title_field hiện tại: ${m.title_field ? `"${m.title_field}"` : "(trống)"}`);

if (m.title_field) {
  delete m.title_field;
  // `search_fields` cũng nên nói lên cả biến thể, nếu không thì ô tìm kiếm vẫn chỉ ăn mã hàng.
  // `search_fields` là MẢNG, không phải chuỗi phẩy — ghi chuỗi vào là toàn bộ Item Price chết
  // với "search_fields must be an array", kể cả đường đọc danh sách.
  const tim = Array.isArray(m.search_fields) ? [...m.search_fields] : [];
  for (const f of ["item_code", "price_variant", "area_tier"]) if (!tim.includes(f)) tim.push(f);
  m.search_fields = tim;
  console.log(`  → bỏ title_field · search_fields = ${JSON.stringify(m.search_fields)}`);
  if (THAT) {
    db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
      .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, TENANT, "Item Price");
    console.log("  ĐÃ GHI");
  }
} else console.log("  không có gì để sửa");
db.close();
console.log(THAT ? "\nxong — khởi động lại runtime" : "\nchạy thử (thêm --that để ghi)");
