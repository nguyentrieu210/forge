/**
 * MỞ QUYỀN — cấp đủ đọc/sửa/tạo/xoá trên các DANH MỤC cho mọi vai đang khai trên chúng.
 *
 * VÌ SAO
 * Nền tảng khai `Item` cho `Chủ xưởng` chỉ đọc, và KHÔNG vai nào được xoá — kể cả System Manager.
 * Đang giai đoạn chủ xưởng tự dựng danh mục bằng tay thì đó là chặn nhầm người: người biết
 * nghiệp vụ nhất lại là người không sửa được.
 *
 * PHẠM VI do chủ dự án chốt 2026-08-20: `Chủ xưởng` và `System Manager` được mở trên MỌI doctype,
 * kể cả chứng từ. Đây là tenant dev chưa có giao dịch nào nên rủi ro bằng không; trên tenant thật
 * thì mở xoá trên bút toán và hoá đơn là chuyện phải cân nhắc lại.
 *
 * Cũng gán thêm vai cho tài khoản đang dùng, vì không rõ Desk kiểm theo vai nào.
 *
 * CHẠY:
 *   node nhap/mo-quyen.mjs           → MỌI doctype
 *   node nhap/mo-quyen.mjs danh-muc  → chỉ 13 danh mục nền
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const NGUOI_DUNG = "dev@example.com";

const DANH_MUC = [
  "Item", "Item Group", "UOM", "Item Color", "Surface Finish", "Measurement Profile",
  "Material Specification", "Material Grade", "Bậc diện tích", "Price List", "Item Price",
  "Geometry Profile", "Supplier",
];
const VAI_THEM = ["System Manager", "Administrator", "Chủ xưởng", "Thủ kho"];

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const sao = resolve(GOC, "nhap/.sao-luu", `d1-truoc-MO-QUYEN-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`);
copyFileSync(D1, sao);

const db = new DatabaseSync(D1);
const doc = (dt) => db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, dt);

const chiDanhMuc = process.argv.includes("danh-muc");
const dsDoctype = chiDanhMuc
  ? DANH_MUC
  : db.prepare("SELECT doctype FROM doctype_definitions WHERE tenant_id=? ORDER BY doctype").all(TENANT).map((r) => r.doctype);

const DAY_DU = {
  read: true, write: true, create: true, delete: true,
  submit: true, cancel: true, amend: true,
  print: true, email: true, report: true, import: true, export: true, share: true,
  if_owner: false, permlevel: 0,
};

let doiDoctype = 0;
const theoNhom = [];
for (const dt of dsDoctype) {
  const r = doc(dt);
  if (!r) { console.log(`  (bỏ qua) ${dt} — không có ở tenant ${TENANT}`); continue; }
  const m = JSON.parse(r.metadata_json);
  const vai = new Set([...(m.permissions ?? []).map((p) => p.role), ...VAI_THEM]);
  m.permissions = [...vai].map((role) => ({ role, ...DAY_DU }));
  /**
   * `allow_delete_non_draft` CHỈ hợp lệ với `kind === "master"` (`frappe-model/validate.ts:107`).
   * Bật cho doctype chứng từ thì metadata thành không hợp lệ và app ném
   * "allow_delete_non_draft is only valid for master DocTypes" — tôi đã bật nhầm cho cả 264
   * doctype một lần, hỏng 207 cái.
   *
   * Với chứng từ, nền tảng KHÔNG cho xoá bản đã submit bằng bất kỳ quyền nào: điều kiện ở
   * `access-control.ts:224` là `docstatus === 0 || (kind master && cờ này)`. Đó là luật toàn vẹn
   * sổ sách nằm trong mã nguồn, không phải cấu hình — muốn đổi thì phải sửa runtime dùng chung.
   */
  if (m.kind === "master") m.allow_delete_non_draft = true;
  else if (m.allow_delete_non_draft) delete m.allow_delete_non_draft;
  m.revision = (m.revision ?? r.revision ?? 1) + 1;
  db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=?, modified_at=?, modified_by=? WHERE tenant_id=? AND doctype=?")
    .run(JSON.stringify(m), m.revision, new Date().toISOString(), "mo-quyen", TENANT, dt);
  if (chiDanhMuc) console.log(`  ${dt.padEnd(24)} ${vai.size} vai · đủ đọc/sửa/tạo/xoá · revision → ${m.revision}`);
  else theoNhom.push(`${dt} (${vai.size} vai)`);
  doiDoctype += 1;
}

// Gán thêm vai cho tài khoản đang dùng — không rõ Desk kiểm theo vai nào.
const coVai = new Set(db.prepare("SELECT role FROM user_roles WHERE tenant_id=? AND user_id=?").all(TENANT, NGUOI_DUNG).map((r) => r.role));
const coRole = new Set(db.prepare("SELECT role FROM roles WHERE tenant_id=?").all(TENANT).map((r) => r.role));
let themVai = 0;
for (const v of VAI_THEM) {
  if (coVai.has(v) || !coRole.has(v)) continue;
  db.prepare("INSERT INTO user_roles(tenant_id,user_id,role) VALUES(?,?,?)").run(TENANT, NGUOI_DUNG, v);
  themVai += 1;
}
console.log(`\n  ${NGUOI_DUNG}: thêm ${themVai} vai → ${[...new Set([...coVai, ...VAI_THEM].filter((v) => coRole.has(v)))].join(", ")}`);
db.close();
console.log(`\n${doiDoctype} doctype đã mở. Sao lưu trước khi đổi: ${sao}`);
