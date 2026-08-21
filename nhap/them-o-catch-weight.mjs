/**
 * THÊM Ô CÒN THIẾU cho hợp đồng tồn nhôm "cân thực tế", và dọn ô chết.
 *
 * VÌ SAO GHI THẲNG `doctype_definitions`: `PUT /api/resource/DocType/...` không nhận lại chính
 * tài liệu mà `GET` vừa trả về (lỗi round-trip của nền tảng, ném "Unknown search field"). Ghi
 * metadata thẳng là đường duy nhất còn lại. Runtime PHẢI TẮT.
 *
 * BA VIỆC:
 *   1. Item   + Cân thực tế · Theo dõi theo lô · ĐVT khối lượng · Cho phép tồn âm
 *      Đây đúng 4 ô mà `aluminumItemContract` đang đòi mà doctype chưa có, nên hợp đồng hiện
 *      KHÔNG mã nào thoả được. Thiếu chúng thì bật `inventory_mode` lên là khoá chết mặt hàng.
 *   2. Batch  + Màu · Tình trạng · Chiều dài · Là đầu thừa
 *      Tầng cắt (`proposeCutV2`) đọc đúng 4 ô này để chọn lô và moi đầu thừa ra dùng trước.
 *   3. Material Specification − Loại quy cách
 *      Chép lại bộ chữ của Bộ theo dõi nhưng không nơi nào đọc, và đã trôi dạt: 23/33 mã có
 *      bộ theo dõi khác loại quy cách. Để lại thì có ngày người ta sửa nó rồi tưởng máy nghe.
 *
 * CHẠY:  node nhap/them-o-catch-weight.mjs [--that]
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = process.env.ALUMDOOR_D1_PATH || resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const THAT = process.argv.includes("--that");

/** Khuôn một ô — nền tảng đòi đủ cờ, thiếu cờ nào là field bị coi như dị dạng. */
const o = (fieldname, label, fieldtype, extra = {}) => ({
  fieldname, label, fieldtype,
  required: false, read_only: false, hidden: false, list_only: false,
  allow_on_submit: false, no_copy: false, unique: false,
  in_list_view: false, in_standard_filter: false, search_index: false,
  permlevel: 0, valueSource: "user", editMode: "editable", surface: "expanded",
  serverEnforced: false, set_only_once: false, non_negative: false,
  not_nullable: false, print_hide: false, print_hide_if_no_value: false,
  ...extra,
});

const THEM = {
  Item: {
    sau: "measurement_profile",
    fields: [
      o("has_catch_weight", "Cân thực tế", "Check", { description: "Khối lượng phải CÂN từng lô, không tính ra từ số cây. Bật cho nhôm/thép cây." }),
      o("has_batch_no", "Theo dõi theo lô", "Check", { description: "Mỗi lần nhập tạo một lô riêng, giữ được màu · tình trạng · chiều dài." }),
      o("weight_uom", "ĐVT khối lượng", "Link", { options: "UOM", description: "Đơn vị của số cân thực tế. Với nhôm/thép là Kg." }),
      o("allow_negative_stock", "Cho phép tồn âm", "Check", { description: "Để TẮT. Hàng cắt theo lô mà cho tồn âm thì sổ lô mất nghĩa." }),
    ],
  },
  Batch: {
    sau: "item",
    fields: [
      o("color", "Màu", "Link", { options: "Item Color", description: "Cùng mã cùng chiều dài nhưng khác màu là hai lô khác nhau." }),
      o("condition", "Tình trạng", "Select", { options: "Thô\nĐã sơn", description: "Trục nhập về là thô; sau khi sơn thành lô khác." }),
      o("length_m", "Chiều dài (m)", "Float", { non_negative: true, description: "Chiều dài mỗi cây/lá trong lô. Đây là thứ tầng cắt dựa vào để chọn lô." }),
      o("is_offcut", "Là đầu thừa", "Check", { description: "Lô sinh ra sau khi cắt. Lần cắt sau hệ thống moi đầu thừa ra dùng trước." }),
    ],
  },
};
const XOA = { "Material Specification": ["spec_type"] };

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
const dau = new Date().toISOString().replace(/[:.]/g, "-");
if (THAT) copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-CATCH-WEIGHT-${dau}.sqlite`));

const db = new DatabaseSync(D1);
const doc = (dt) => {
  const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, dt);
  if (!r) throw new Error(`không thấy doctype ${dt}`);
  return { m: JSON.parse(r.metadata_json), revision: r.revision };
};
const ghi = (dt, m, revision) => db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), Number(revision ?? 0) + 1, TENANT, dt);

console.log(THAT ? "GHI THẬT\n" : "chạy thử (thêm --that để ghi)\n");

for (const [dt, { sau, fields }] of Object.entries(THEM)) {
  const { m, revision } = doc(dt);
  const co = new Set((m.fields ?? []).map((f) => f.fieldname));
  const moi = fields.filter((f) => !co.has(f.fieldname));
  console.log(`${dt}: đã có ${m.fields.length} ô · thêm ${moi.length}${moi.length ? " → " + moi.map((f) => f.label).join(", ") : " (không có gì để thêm)"}`);
  if (!moi.length) continue;
  const i = m.fields.findIndex((f) => f.fieldname === sau);
  m.fields.splice(i < 0 ? m.fields.length : i + 1, 0, ...moi);
  m.fields.forEach((f, k) => { f.idx = k + 1; });
  if (THAT) ghi(dt, m, revision);
}

/**
 * ĐĂNG KÝ HIỂN THỊ.
 *
 * `viewPolicy.form.fields` là DANH SÁCH TRẮNG: thêm ô vào doctype mà không khai vào đây thì
 * form không vẽ nó ra. Ô có thật, lưu được, chỉ là không ai nhìn thấy để bật — hỏng im lặng
 * đúng kiểu khó truy nhất. Lần đầu chạy script này tôi quên bước này.
 */
for (const [dt, { sau, fields }] of Object.entries(THEM)) {
  const { m, revision } = doc(dt);
  /**
   * CHỈ ghi thêm khi doctype ĐÃ CÓ danh sách trắng. Không có nghĩa là form vẽ hết mọi ô —
   * tự đẻ ra một danh sách trắng ở đây là thu hẹp form từ "hiện tất cả" xuống "chỉ 4 ô tôi
   * vừa thêm", che mất những ô vốn đang hiển thị. Đã lỡ làm đúng vậy với Batch một lần.
   */
  const ds = m.viewPolicy?.form?.fields;
  if (!Array.isArray(ds)) { console.log(`${dt}: form không dùng danh sách trắng — ô mới tự hiện, không đụng`); continue; }
  const thieu = fields.map((f) => f.fieldname).filter((f) => !ds.includes(f));
  console.log(`${dt}: hiện trên form thêm ${thieu.length}${thieu.length ? " → " + thieu.join(", ") : " (đã đủ)"}`);
  if (!thieu.length) continue;
  const i = ds.indexOf(sau);
  ds.splice(i < 0 ? ds.length : i + 1, 0, ...thieu);
  if (THAT) ghi(dt, m, revision);
}

for (const [dt, bo] of Object.entries(XOA)) {
  const { m, revision } = doc(dt);
  const dinh = (m.fields ?? []).filter((f) => bo.includes(f.fieldname));
  console.log(`${dt}: xoá ${dinh.length} ô → ${dinh.map((f) => f.label).join(", ") || "(không có)"}`);
  if (!dinh.length) continue;
  /** Chép giá trị cũ ra tệp TRƯỚC khi xoá — xoá field là mất dữ liệu của nó, phải có đường về. */
  const cu = db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, dt)
    .map((r) => { const p = JSON.parse(r.payload_json); return { name: r.name, ...Object.fromEntries(bo.map((k) => [k, p[k]])) }; })
    .filter((r) => bo.some((k) => r[k] !== undefined && r[k] !== null && r[k] !== ""));
  const tep = resolve(GOC, "nhap/.sao-luu", `truoc-khi-xoa-${dt.replace(/\s+/g, "-")}-${dau}.json`);
  if (THAT) writeFileSync(tep, JSON.stringify(cu, null, 1), "utf8");
  console.log(`   sao lưu ${cu.length} bản ghi có giá trị → ${THAT ? tep.replace(GOC + "\\", "") : "(chạy thử, chưa ghi)"}`);
  m.fields = m.fields.filter((f) => !bo.includes(f.fieldname));
  m.fields.forEach((f, k) => { f.idx = k + 1; });
  /**
   * DỌN MỌI CHỖ CÒN TRỎ TỚI Ô VỪA XOÁ.
   *
   * Xoá field khỏi `fields` là chưa xong: `viewPolicy` và `search_fields` vẫn nêu tên nó, và
   * truy vấn danh sách sẽ hỏi một cột không tồn tại. Triệu chứng ngoài màn hình là ô Link báo
   * "Không tải được kết quả" — không nhắc gì tới field đã xoá, nên rất khó lần ra.
   */
  const donDS = (ds) => Array.isArray(ds) ? ds.filter((k) => !bo.includes(k)) : ds;
  for (const khung of ["list", "form", "quickEntry", "kanban", "calendar", "gantt", "chart"]) {
    const v = m.viewPolicy?.[khung];
    if (!v) continue;
    if (Array.isArray(v.columns)) v.columns = donDS(v.columns);
    if (Array.isArray(v.fields)) v.fields = donDS(v.fields);
  }
  if (m.viewPolicy?.mobile?.bulk?.columns) m.viewPolicy.mobile.bulk.columns = donDS(m.viewPolicy.mobile.bulk.columns);
  if (Array.isArray(m.search_fields)) m.search_fields = donDS(m.search_fields);
  else if (typeof m.search_fields === "string") m.search_fields = m.search_fields.split(",").map((x) => x.trim()).filter((x) => x && !bo.includes(x)).join(",");
  if (bo.includes(m.title_field)) delete m.title_field;
  if (bo.includes(m.sort_field)) delete m.sort_field;
  if (THAT) {
    ghi(dt, m, revision);
    for (const r of db.prepare("SELECT name, payload_json FROM documents WHERE tenant_id=? AND doctype=?").all(TENANT, dt)) {
      const p = JSON.parse(r.payload_json);
      if (!bo.some((k) => k in p)) continue;
      for (const k of bo) delete p[k];
      db.prepare("UPDATE documents SET payload_json=? WHERE tenant_id=? AND doctype=? AND name=?").run(JSON.stringify(p), TENANT, dt, r.name);
    }
  }
}
db.close();
console.log(THAT ? "\nxong — bật lại runtime rồi chạy bước tiếp" : "\n(chưa ghi gì)");
