/**
 * GỠ 4 dòng `custom_fields` trùng với field đã có sẵn trong `doctype_definitions.demo.Batch`.
 *
 * BỐI CẢNH — 21/08/2026, server chết khi bootstrap
 * `forge.apps.install` cho app `alumdoor@2.10.0` FAILED:
 *   "Custom field color collides with a standard field on Batch"  (HTTP 417)
 * rồi cả tiến trình worker sập theo (assertion libuv), kéo server 8799 chết.
 *
 * NGUYÊN NHÂN — không phải lỗi phần mềm mới, mà là DỮ LIỆU TRÙNG trên tenant `demo`:
 * `doctype_definitions.demo.Batch` (revision 6) đã mang sẵn 4 field `color`, `condition`,
 * `length_m`, `is_offcut` — mỗi field có mô tả tiếng Việt đầy đủ (VD `color`: "Cùng mã cùng
 * chiều dài nhưng khác màu là hai lô khác nhau."), rõ ràng được thêm bằng tay ở một đợt trước.
 * Nhưng bảng `custom_fields` cho `demo/Batch` LẠI CŨNG khai đúng 4 tên đó (qua
 * `customFields.Batch` trong `server/briefs/alumdoor-v2.json`, dạng rút gọn, KHÔNG có mô tả).
 *
 * `server/packages/frappe-model/src/store.ts::loadDocType()` đọc `base` từ `doctype_definitions`
 * rồi merge `customFields` từ bảng `custom_fields` lên trên — KHÔNG lọc field đã có sẵn trong
 * base trước khi merge (khác với `assertOverlayMerges` trong `router.ts`, nơi CÓ lọc). Base đã
 * có `color` + `customFields` cũng có `color` ⇒ `mergeCustomizations()` thấy hai field cùng tên
 * ⇒ ném lỗi "collides with a standard field".
 *
 * Đây là lỗi CHỈ XẢY RA cho tenant `demo` đã có lịch sử — tenant mới toanh cài từ brief sẽ không
 * dính, vì `doctype_definitions` của nó bắt đầu từ `__standard__` (5 field gốc, không có 4 field
 * trên) rồi mới merge `customFields` lần đầu, không đụng hàng.
 *
 * VÌ SAO GỠ Ở `custom_fields`, KHÔNG GỠ Ở `doctype_definitions`
 * Bản trong `doctype_definitions` GIÀU HƠN — có mô tả nghiệp vụ đầy đủ, còn bản trong
 * `custom_fields` chỉ là cú pháp rút gọn không mô tả. Xoá bản đã có mô tả để dùng bản rút gọn là
 * đi lùi. 6 field còn lại của `customFields.Batch` (`is_stamped`, `intake_kg`,
 * `received_warehouse`, `is_offcut`... — kiểm lại: `is_offcut` NẰM TRONG 4 field trùng, không
 * phải 6 field còn lại) — cut_generation, intake_kg, intake_note, is_stamped, parent_batch,
 * received_warehouse — không trùng base, GIỮ NGUYÊN, không đụng.
 *
 * Runtime PHẢI TẮT (đã tắt — chính lỗi này làm nó sập).  CHẠY: node nhap/go-trung-custom-field-batch.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const THAT = process.argv.includes("--that");
const TENANT = "demo";
const DT = "Batch";
const TRUNG = ["color", "condition", "length_m", "is_offcut"];

const congDangNghe = (cong) => new Promise((ok) => {
  const s = createConnection({ host: "127.0.0.1", port: cong });
  const xong = (kq) => { s.destroy(); ok(kq); };
  s.setTimeout(400);
  s.on("connect", () => xong(true));
  s.on("timeout", () => xong(false));
  s.on("error", () => xong(false));
});

if (THAT) {
  for (const cong of [8799, 5173]) {
    if (await congDangNghe(cong)) throw new Error(`Cổng ${cong} còn nghe — tắt runtime trước khi ghi.`);
  }
}

if (!existsSync(D1)) throw new Error(`Không thấy D1: ${D1}`);
const db = new DatabaseSync(D1, { readOnly: !THAT });

const base = JSON.parse(db.prepare("SELECT metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DT).metadata_json);
const baseNames = new Set(base.fields.map((f) => f.fieldname));
console.log(`${TENANT}/${DT} base hiện có ${base.fields.length} field: ${[...baseNames].join(", ")}`);

const rows = db.prepare(
  "SELECT name, fieldname FROM custom_fields WHERE tenant_id=? AND dt=? AND fieldname IN (?,?,?,?)",
).all(TENANT, DT, ...TRUNG);
console.log(`custom_fields trùng base (${rows.length}/${TRUNG.length} mong đợi): ${rows.map((r) => r.fieldname).join(", ")}`);

const conNhung = TRUNG.filter((f) => !rows.some((r) => r.fieldname === f));
if (conNhung.length) console.log(`⚠ ${conNhung.length} tên trong danh sách trùng KHÔNG thấy trong custom_fields — kiểm lại thủ công: ${conNhung.join(", ")}`);
if (!rows.length) { console.log("Không có gì để gỡ."); db.close(); process.exit(0); }

const conLai = db.prepare("SELECT fieldname FROM custom_fields WHERE tenant_id=? AND dt=?").all(TENANT, DT)
  .map((r) => r.fieldname).filter((f) => !TRUNG.includes(f));
console.log(`custom_fields KHÔNG trùng base, giữ nguyên (${conLai.length}): ${conLai.join(", ")}`);

if (!THAT) { console.log("\n(chạy thử — thêm --that để ghi thật)"); db.close(); process.exit(0); }

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-GO-TRUNG-BATCH-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));

const del = db.prepare("DELETE FROM custom_fields WHERE tenant_id=? AND dt=? AND fieldname=?");
for (const f of TRUNG) del.run(TENANT, DT, f);
db.close();
console.log(`\n✓ đã gỡ ${rows.length} dòng custom_fields trùng cho ${TENANT}/${DT}`);
