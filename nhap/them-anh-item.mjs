/**
 * THÊM Ô HÌNH ẢNH cho mặt hàng: hiện thành CỘT ngoài danh sách và ô trong form chi tiết,
 * bấm vào là chọn tệp / chụp hình.
 *
 * VÌ SAO GHI THẲNG `doctype_definitions`, KHÔNG QUA API
 * `PUT /api/resource/DocType/Item` KHÔNG nhận lại chính tài liệu mà `GET` vừa trả về: bản GET
 * đưa `search_fields` ra dạng chuỗi "item_code,item_name" và các cờ field ở dạng `reqd`/`read_only`
 * kiểu số, còn bản PUT lại đọc theo hình dạng canonical. Ghi lại y nguyên cũng ném
 * "Unknown search field: item_code". Đây là lỗi round-trip của nền tảng — ghi metadata thẳng là
 * đường duy nhất còn lại cho tới khi nó được sửa.
 *
 * Runtime PHẢI TẮT khi chạy (ghi thẳng tệp SQLite).
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const sao = resolve(GOC, "nhap/.sao-luu", `d1-truoc-THEM-ANH-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
copyFileSync(D1, sao);

const db = new DatabaseSync(D1);
const row = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, "Item");
if (!row) throw new Error("Không thấy doctype Item");
const m = JSON.parse(row.metadata_json);

const daCo = (m.fields ?? []).some((f) => f.fieldname === "image");
if (!daCo) {
  const i = m.fields.findIndex((f) => f.fieldname === "item_name");
  m.fields.splice(i + 1, 0, {
    fieldname: "image",
    label: "Hình ảnh",
    fieldtype: "Attach Image",
    required: false, read_only: false, hidden: false, list_only: false,
    allow_on_submit: true, no_copy: false, unique: false,
    in_list_view: true, in_standard_filter: false, search_index: false,
    permlevel: 0,
    description: "Bấm vào ảnh ngoài danh sách hoặc trong form để chọn tệp / chụp hình.",
    valueSource: "user", editMode: "editable", surface: "quick",
    serverEnforced: false, set_only_once: false, non_negative: false,
    not_nullable: false, print_hide: false, print_hide_if_no_value: false,
  });
  m.fields.forEach((f, k) => { f.idx = k + 1; });
}

/**
 * `image_field` cho engine biết field nào là ảnh. Không đặt thì nó tự lấy field `Attach Image`
 * đầu tiên — đúng field này, nhưng khai rõ vẫn hơn đoán.
 */
m.image_field = "image";

// Cột thứ 3 ngoài danh sách, ngay sau mã hàng và tên hàng.
m.viewPolicy ??= {};
m.viewPolicy.list ??= { enabled: true, columns: [] };
const cot = m.viewPolicy.list.columns ?? [];
if (!cot.includes("image")) cot.splice(2, 0, "image");
m.viewPolicy.list.columns = cot;

// Trong form chi tiết: ngay dưới tên hàng.
m.viewPolicy.form ??= { enabled: true, fields: [] };
const fo = m.viewPolicy.form.fields ?? [];
if (!fo.includes("image")) fo.splice(fo.indexOf("item_name") + 1, 0, "image");
m.viewPolicy.form.fields = fo;

m.revision = (m.revision ?? row.revision ?? 1) + 1;
db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=?, modified_at=?, modified_by=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), m.revision, new Date().toISOString(), "them-anh-item", TENANT, "Item");
db.close();

console.log(`field ảnh: ${daCo ? "đã có sẵn" : "ĐÃ THÊM"}`);
console.log(`image_field : ${m.image_field}`);
console.log(`cột danh sách: ${m.viewPolicy.list.columns.join(" · ")}`);
console.log(`trong form   : ${m.viewPolicy.form.fields.includes("image") ? "có" : "KHÔNG"}`);
console.log(`revision → ${m.revision}`);
console.log(`sao lưu: ${sao}`);
