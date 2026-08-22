/**
 * TRẢ 4 Ô CỦA BATCH VỀ ĐÚNG CHỖ: từ `doctype_definitions` (base) về `custom_fields` (overlay).
 *
 * ===== TRIỆU CHỨNG =====
 * `forge.apps.install` cho `alumdoor` FAILED — HTTP 417:
 *   "Custom field color collides with a standard field on Batch"
 * rồi worker sập theo (assertion libuv trong `src\win\async.c`), kéo 8799 chết,
 * mọi tab 5173 báo "FORGE CONNECTION — Có lỗi phía máy chủ".
 *
 * ===== GỐC RỄ (bằng chứng) =====
 * KHÔNG phải hồi quy của brief. `server/briefs/alumdoor-v2.json` khai
 * `customFields.Batch` (dòng 14707-14724) từ commit 21572fee0 — 30/07/2026 — không đổi.
 *
 * Hỏng nằm ở D1 dev, tenant `demo`:
 *   - 20/08 13:52:09 (sao lưu `nhap/.sao-luu/d1-truoc-MO-QUYEN-2026-08-20T13-52-09-285Z.sqlite`)
 *     `doctype_definitions.demo.Batch` còn ĐÚNG bản gốc migration: revision 2, 5 ô
 *     (batch_id, item, manufacturing_date, expiry_date, disabled).
 *   - Sau đó một script vá tay đã NHÉT 4 ô `color`, `condition`, `length_m`, `is_offcut`
 *     thẳng vào `metadata_json` của base (chính script mà `nhap/sua-form-batch.mjs` nói tới:
 *     "Script thêm ô đã ??= một viewPolicy.form rỗng rồi nhét 4 ô mới vào").
 *     Hiện base là revision 6, 9 ô.
 *   - 4 tên đó ĐỒNG THỜI là custom field do app `alumdoor` sở hữu (bảng `app_objects`:
 *     Batch-color, Batch-condition, Batch-length_m, Batch-is_offcut).
 *
 * `server/packages/frappe-model/src/store.ts::loadDocType()` đọc base rồi merge overlay lên
 * mà KHÔNG lọc trùng, nên `mergeCustomizations()`
 * (`server/packages/frappe-model/src/customization.ts:117`) thấy hai field cùng tên và ném lỗi.
 *
 * ===== VÌ SAO SỬA THEO HƯỚNG NÀY =====
 * `nhap/go-trung-custom-field-batch.mjs` (đã chạy 21/08 10:40) chỉ XOÁ 4 dòng `custom_fields`.
 * Đó là gỡ tạm: lần `forge` kế tiếp cài lại app sẽ ghi lại đúng 4 dòng đó
 * (`server/packages/app-registry/src/installer.ts:319-334`, ON CONFLICT DO UPDATE) ⇒ va chạm quay lại.
 * Nguồn sự thật của 4 ô này là BRIEF, không phải base. Nên phải làm ngược lại:
 * gỡ 4 ô KHỎI BASE và trả chúng về `custom_fields` — đúng mô hình nền tảng, đúng
 * `app_objects`, và trùng khớp tenant mới (base `__standard__` của Batch chỉ có 5 ô).
 *
 * Giữ nguyên định nghĩa GIÀU (có mô tả tiếng Việt) đang nằm trong base khi chuyển sang
 * `custom_fields`, nên không mất chữ nào. Lần `forge` sau brief sẽ ghi đè bằng bản của brief.
 *
 * ===== RỦI RO DỮ LIỆU: KHÔNG CÓ =====
 * `documents` + `master_records` với record_type/doctype = 'Batch': 0 bản ghi. Không có gì mồ côi.
 *
 * Runtime PHẢI TẮT.  CHẠY:
 *   node nhap/tra-4-o-batch-ve-custom-field.mjs           (chạy thử, chỉ đọc)
 *   node nhap/tra-4-o-batch-ve-custom-field.mjs --that    (ghi thật, có sao lưu)
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(
  GOC,
  "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite",
);
const THAT = process.argv.includes("--that");
const TENANT = "demo";
const DT = "Batch";
const TRA_VE = ["color", "condition", "length_m", "is_offcut"];
const NGUOI = "tra-4-o-batch";

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
    if (await congDangNghe(cong)) throw new Error(`Cổng ${cong} còn nghe — TẮT runtime trước khi ghi.`);
  }
}
if (!existsSync(D1)) throw new Error(`Không thấy D1: ${D1}`);

const db = new DatabaseSync(D1, { readOnly: !THAT });

// --- an toàn: không được có bản ghi Batch nào ---
const soDoc = db.prepare("SELECT COUNT(*) AS n FROM documents WHERE tenant_id=? AND doctype=?").get(TENANT, DT).n;
const soMaster = db.prepare("SELECT COUNT(*) AS n FROM master_records WHERE tenant_id=? AND record_type=?").get(TENANT, DT).n;
console.log(`bản ghi ${DT}: documents=${soDoc}, master_records=${soMaster}`);

const row = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DT);
if (!row) throw new Error(`Không thấy ${TENANT}/${DT} trong doctype_definitions`);
const meta = JSON.parse(row.metadata_json);
console.log(`base hiện có ${meta.fields.length} ô: ${meta.fields.map((f) => f.fieldname).join(", ")}`);

const chuyen = [];
for (const ten of TRA_VE) {
  const i = meta.fields.findIndex((f) => f.fieldname === ten);
  if (i < 0) { console.log(`  (bỏ qua) ${ten} — base không có, có thể đã sửa rồi`); continue; }
  chuyen.push({ field: meta.fields[i], insert_after: i > 0 ? meta.fields[i - 1].fieldname : null });
}
if (!chuyen.length) { console.log("Không có gì để chuyển — base đã sạch."); db.close(); process.exit(0); }

const conLai = meta.fields.filter((f) => !TRA_VE.includes(f.fieldname));
console.log(`\nsẽ CHUYỂN ${chuyen.length} ô khỏi base → custom_fields:`);
for (const c of chuyen) console.log(`  ${c.field.fieldname.padEnd(12)} ${c.field.fieldtype.padEnd(8)} insert_after=${c.insert_after}`);
console.log(`base còn lại ${conLai.length} ô: ${conLai.map((f) => f.fieldname).join(", ")}`);

const daCo = db.prepare("SELECT fieldname FROM custom_fields WHERE tenant_id=? AND dt=?").all(TENANT, DT).map((r) => r.fieldname);
console.log(`custom_fields hiện có (${daCo.length}): ${daCo.join(", ")}`);
const denBu = TRA_VE.filter((f) => daCo.includes(f));
if (denBu.length) console.log(`⚠ đã có sẵn trong custom_fields, sẽ GHI ĐÈ: ${denBu.join(", ")}`);

if (!THAT) { console.log("\n(chạy thử — thêm --that để ghi thật)"); db.close(); process.exit(0); }

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const sao = resolve(GOC, "nhap/.sao-luu", `d1-truoc-TRA-4-O-BATCH-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
copyFileSync(D1, sao);

const now = new Date().toISOString();
meta.fields = conLai;
meta.revision = Number(meta.revision ?? row.revision ?? 1) + 1;

db.exec("BEGIN");
try {
  db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=?, modified_by=?, modified_at=? WHERE tenant_id=? AND doctype=?")
    .run(JSON.stringify(meta), Number(row.revision ?? 0) + 1, NGUOI, now, TENANT, DT);

  const chen = db.prepare(
    `INSERT INTO custom_fields(tenant_id,name,dt,fieldname,metadata_json,insert_after,modified_by,modified_at)
     VALUES(?,?,?,?,?,?,?,?)
     ON CONFLICT(tenant_id,name) DO UPDATE SET
       dt=excluded.dt, fieldname=excluded.fieldname, metadata_json=excluded.metadata_json,
       insert_after=excluded.insert_after, modified_by=excluded.modified_by, modified_at=excluded.modified_at`,
  );
  for (const c of chuyen) {
    chen.run(TENANT, `${DT}-${c.field.fieldname}`, DT, c.field.fieldname, JSON.stringify(c.field), c.insert_after, NGUOI, now);
  }

  // Bump revision overlay: mergeCustomizations gắn phiên bản schema hiệu dụng vào số này,
  // không bump thì client còn giữ DocType cũ trong cache và không thấy ô nào đổi chỗ.
  db.prepare(
    `INSERT INTO customization_revisions(tenant_id,doctype,revision,modified_at) VALUES(?,?,1,?)
     ON CONFLICT(tenant_id,doctype) DO UPDATE SET revision=customization_revisions.revision+1, modified_at=excluded.modified_at`,
  ).run(TENANT, DT, now);

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}

// --- kiểm lại: base và overlay không còn tên nào chung ---
const baseSau = JSON.parse(db.prepare("SELECT metadata_json FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DT).metadata_json)
  .fields.map((f) => f.fieldname);
const overlaySau = db.prepare("SELECT fieldname FROM custom_fields WHERE tenant_id=? AND dt=?").all(TENANT, DT).map((r) => r.fieldname);
const conTrung = overlaySau.filter((f) => baseSau.includes(f));
db.close();

console.log(`\nbase sau khi sửa (${baseSau.length}): ${baseSau.join(", ")}`);
console.log(`overlay sau khi sửa (${overlaySau.length}): ${overlaySau.join(", ")}`);
console.log(conTrung.length ? `\n✗ VẪN CÒN TRÙNG: ${conTrung.join(", ")}` : `\n✓ xong — không còn tên trùng. Sao lưu: ${sao}`);
if (conTrung.length) process.exit(1);
