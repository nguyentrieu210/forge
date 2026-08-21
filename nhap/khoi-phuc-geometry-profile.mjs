/**
 * KHÔI PHỤC trường `geometry_profile` vào metadata SỐNG của doctype `Item`.
 *
 * BỐI CẢNH — 21/08/2026
 * Trường này từng có trong metadata (bản sao lưu `d1-truoc-XEP-HINH-HOC-2026-08-20T18-07-23…`,
 * revision 12), rồi 2 phút sau bị XOÁ khỏi metadata (bản sao lưu tên
 * `d1-truoc-XOA-geometry_profile-2026-08-20T18-09-43…`, revision 13, vẫn còn CHỨA trường —
 * đây là ảnh chụp TRƯỚC lúc xoá, không phải bằng chứng nó đã mất ở đó). Metadata sống hiện tại
 * (revision 14) không còn trường này. Không có script nào trong `nhap/` khớp tên thao tác xoá,
 * không có commit git nào ghi lại (D1 không nằm trong git) — ai/khi nào xoá vẫn chưa rõ.
 *
 * VÌ SAO PHẢI KHÔI PHỤC TRƯỚC KHI GẮN DỮ LIỆU
 * `sales-item-context.ts` đọc `item.geometry_profile` bằng property access JSON thuần nên PATCH
 * thẳng SQL vẫn đọc được dữ liệu dù metadata thiếu trường — script `gan-hinh-hoc.mjs` hoạt động
 * đúng cho tính toán backend NGAY CẢ KHI chưa khôi phục. Nhưng `generic-controller.ts` →
 * `normalizeDocument()` có nhánh riêng cho "trường đã bị rút khỏi metadata mà tài liệu cũ còn
 * mang giá trị cũ": chấp nhận giá trị không đổi rồi ÂM THẦM LOẠI nó khỏi tài liệu chuẩn hoá mới.
 * Nghĩa là chỉ cần ai mở một trong 51 mã cửa m² trên giao diện rồi bấm Lưu (không cần đụng ô
 * hình học) là `geometry_profile` bị xoá lại về rỗng — không lỗi nào báo. Đúng kiểu "luật ngủ im
 * lặng" mà cả đợt hội tụ danh mục này đang chống. Nên khôi phục PHẢI đứng trước, không phải sau.
 *
 * NGUỒN ĐỊNH NGHĨA TRƯỜNG: `server/briefs/alumdoor-v2.json`, doctype `Item`, ngay sau
 * `measurement_profile` — { fieldname: "geometry_profile", fieldtype: "Link",
 * options: "Geometry Profile", label: "Bộ quy cách hình học" }. Chép nguyên, không bịa thêm cờ
 * ẩn/nội bộ nào — brief không đặt `hidden`/`internal` cho nó.
 *
 * VỊ TRÍ: `xep-lai-o-hinh-hoc.mjs` (20/08) đã chuyển ý định đặt trường này CẠNH `door_type` —
 * "Loại cửa áp công thức" chọn công thức nào, "Bộ quy cách hình học" khai công thức đó đo những
 * kích thước gì, đọc rời nhau thì không ô nào tự nói được nó dùng làm gì. Script này tôn trọng
 * đúng ý định đó: chèn ngay sau `door_type`, cả trong `fields` lẫn trong `viewPolicy.form.fields`
 * (danh sách trắng của form — thiếu bước này thì field có trong metadata nhưng KHÔNG hiện trên
 * form, một cách hỏng im lặng khác).
 *
 * CHỈ đụng tenant `demo` — `__standard__` chỉ có 8 field nền, còn thiếu cả `measurement_profile`,
 * rõ ràng chưa từng được áp brief alumdoor, ngoài phạm vi việc này.
 *
 * Runtime PHẢI TẮT.  CHẠY:  node nhap/khoi-phuc-geometry-profile.mjs [--that]
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
const DOCTYPE = "Item";
const SAU = "door_type";
const TRUONG = "geometry_profile";

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
    if (await congDangNghe(cong)) {
      throw new Error(`Cổng ${cong} còn nghe — runtime đang chạy. Tắt worker/Desk rồi chạy lại.`);
    }
  }
}

if (!existsSync(D1)) throw new Error(`Không thấy D1: ${D1}`);
const db = new DatabaseSync(D1, { readOnly: !THAT });
const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, DOCTYPE);
if (!r) throw new Error(`Không thấy doctype_definitions cho ${TENANT}/${DOCTYPE}`);
const m = JSON.parse(r.metadata_json);

const daCo = m.fields.some((f) => f.fieldname === TRUONG);
console.log(`${TENANT}/${DOCTYPE} — hiện có ${m.fields.length} field, revision ${r.revision}`);
console.log(`geometry_profile đã có trong metadata? ${daCo}`);

if (daCo) {
  console.log("Không cần làm gì — metadata đã có trường này.");
  db.close();
  process.exit(0);
}

const DINH_NGHIA = {
  fieldname: TRUONG,
  fieldtype: "Link",
  options: "Geometry Profile",
  label: "Bộ quy cách hình học",
};

const iSau = m.fields.findIndex((f) => f.fieldname === SAU);
if (iSau < 0) throw new Error(`Không thấy field "${SAU}" để chèn cạnh — kiểm tra lại metadata trước khi chạy.`);
m.fields.splice(iSau + 1, 0, { ...DINH_NGHIA });
m.fields.forEach((f, k) => { f.idx = k + 1; });
console.log(`đã chèn "${TRUONG}" ngay sau "${SAU}" trong fields (vị trí ${iSau + 2}/${m.fields.length})`);

let formDoi = false;
if (Array.isArray(m.viewPolicy?.form?.fields)) {
  const list = m.viewPolicy.form.fields;
  if (!list.includes(TRUONG)) {
    const j = list.indexOf(SAU);
    list.splice(j < 0 ? list.length : j + 1, 0, TRUONG);
    formDoi = true;
  }
  console.log(`danh sách trắng của form: ${formDoi ? "đã thêm" : "đã có sẵn / không thấy door_type"}`);
} else {
  console.log("form không dùng danh sách trắng — không cần sửa viewPolicy");
}

if (!THAT) {
  console.log("\n(chạy thử — thêm --that để ghi thật)");
  db.close();
  process.exit(0);
}

mkdirSync(resolve(GOC, "nhap/.sao-luu"), { recursive: true });
copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-KHOI-PHUC-geometry-profile-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));
db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
  .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, TENANT, DOCTYPE);
db.close();
console.log(`\n✓ đã ghi — revision ${TENANT}/${DOCTYPE} → ${Number(r.revision ?? 0) + 1}`);
