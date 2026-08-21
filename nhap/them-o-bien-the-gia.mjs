/**
 * THÊM Ô `price_variant` VÀO DÒNG BÁN — mắt xích đứt làm không bán nổi một cánh cửa nào.
 *
 * `commercial-sales-order-controller.ts:125` đọc `item.price_variant` để chọn dòng đơn giá, và
 * dòng 144 ghi `resolved.price_variant` trả lại. Nhưng doctype `Sales Order Item` KHÔNG có ô đó
 * — kernel nuốt giá trị gửi lên, nên `priceVariant` luôn undefined và mọi dòng rơi về biến thể
 * `STANDARD`.
 *
 * Trước đây không ai thấy, vì cửa còn dòng giá `STANDARD` lấy từ sheet ĐM. Ngày 21/08/2026 tôi
 * xoá 27 dòng STANDARD ấy — chúng đá nhau với dòng lấy từ ảnh bảng giá và sai số (`CUC_UC_KT_6D`
 * STANDARD ghi 465.000 trong khi ảnh nói kéo tay là 485.000). Xoá là đúng, nhưng nó lôi lỗi sẵn
 * có ra ánh sáng: giờ cửa CHỈ còn dòng theo biến thể, mà dòng bán không có cách nào chọn biến thể.
 *
 * Thử thật: đặt CỬA ĐỨC AL595 kèm `price_variant: "CHI_LA"` → "Item Price Alumdoor 2026:
 * CDUC_TD_AL595:m2 does not exist for variant STANDARD". Chữ CHI_LA gửi lên bị bỏ đi im lặng.
 *
 * BỘ CHỮ lấy đúng theo những gì bảng giá đang dùng, không tự nghĩ thêm:
 *    STANDARD     hàng thường, một giá
 *    CHI_LA       cửa Đức bán chỉ lá
 *    TANG_RAY     cửa Đức bán kèm ray tặng (chỉ áp cho cửa từ 8m²)
 *    KEO_TAY      cửa Úc và cửa Đài Loan bản kéo tay
 *    MOTOR_NGOAI  cửa Úc bản motor ngoài
 *    TRON_BO      bán trọn bộ
 *    TACH_MON     bán tách món, chỉ lấy lá
 *
 * GHI THẲNG D1 vì `PUT /api/resource/DocType` không nhận lại tài liệu mà `GET` vừa trả về.
 * Runtime PHẢI TẮT.
 *
 * CHẠY:  node nhap/them-o-bien-the-gia.mjs [--that]
 */
import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const GOC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const D1 = resolve(GOC, "server/apps/tenant-worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/0f70e06fc007ec84591c21ca1daaf09474ca2074a0d42ba21eb2a3fcdbb2cdf8.sqlite");
const TENANT = "demo";
const THAT = process.argv.includes("--that");

if (THAT) copyFileSync(D1, resolve(GOC, "nhap/.sao-luu", `d1-truoc-PRICE-VARIANT-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`));
const db = new DatabaseSync(D1);

for (const dt of ["Sales Order Item", "Sales Invoice Item", "Delivery Note Item", "Quotation Item"]) {
  const r = db.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, dt);
  if (!r) { console.log(`${dt.padEnd(22)}không có doctype`); continue; }
  const m = JSON.parse(r.metadata_json);
  if (m.fields.some((f) => f.fieldname === "price_variant")) { console.log(`${dt.padEnd(22)}đã có price_variant`); continue; }
  /**
   * KHUÔN PHẢI LẤY TỪ Ô NGƯỜI DÙNG CHỌN ĐƯỢC, không lấy ô đầu tiên vớ được.
   *
   * Lần đầu tôi chép khuôn của `sales_mode` — ô ấy khai `valueSource: "default"`,
   * `serverEnforced: true`, `editMode: "hidden"`, tức MÁY tự điền và người dùng không sửa được.
   * Chép nó xong lại bỏ mất `default` nên sinh ra ô dị dạng: doctype đọc lên trả 417 và cả
   * runtime chết 500. Ô cần ở đây là ô người bán CHỌN, nên phải theo khuôn `leaf_variant`
   * (valueSource user · editMode editable · surface expanded · không ẩn · không serverEnforced).
   */
  const mau = m.fields.find((f) => f.fieldtype === "Select" && f.options
    && f.valueSource === "user" && f.editMode === "editable" && !f.hidden && !f.serverEnforced);
  if (!mau) { console.log(`${dt.padEnd(22)}không tìm được ô Select người dùng chọn được`); continue; }
  const { fieldname, label, options, description, ...co } = mau;
  const i = m.fields.findIndex((f) => f.fieldname === "rate");
  m.fields.splice(i < 0 ? m.fields.length : i, 0, {
    ...co, fieldname: "price_variant", label: "Biến thể giá",
    options: "STANDARD\nCHI_LA\nTANG_RAY\nKEO_TAY\nMOTOR_NGOAI\nTRON_BO\nTACH_MON",
    description: "Chọn dòng đơn giá nào của mặt hàng. Cửa Đức có CHI_LA và TANG_RAY; cửa Úc có KEO_TAY và MOTOR_NGOAI; cửa Đài Loan có TRON_BO và TACH_MON. Hàng thường để STANDARD.",
  });
  m.fields.forEach((f, k) => { f.idx = k + 1; });
  console.log(`${dt.padEnd(22)}thêm price_variant (${m.fields.length} ô)`);
  if (THAT) db.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
    .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, TENANT, dt);
}
db.close();
console.log(THAT ? "\nĐÃ GHI — khởi động lại runtime" : "\nchạy thử (thêm --that để ghi)");

/**
 * ĐĂNG KÝ VÀO DANH SÁCH TRẮNG CỦA FORM.
 *
 * Thêm ô vào `fields` là chưa đủ để nó hiện lên màn `/app/Sales Order/new`. Hai doctype này có
 * `viewPolicy.form.fields` — một danh sách trắng liệt kê đúng những ô form được vẽ. Ô nào không
 * có tên trong đó thì tồn tại trong dữ liệu nhưng KHÔNG bao giờ hiện ra, và người bán không có
 * cách nào chọn biến thể giá.
 *
 * Chèn ngay TRƯỚC `rate`: người bán chọn biến thể rồi mới thấy đơn giá tương ứng, đọc xuôi.
 */
{
  const db2 = new DatabaseSync(D1);
  for (const dt of ["Sales Order Item", "Quotation Item"]) {
    const r = db2.prepare("SELECT metadata_json, revision FROM doctype_definitions WHERE tenant_id=? AND doctype=?").get(TENANT, dt);
    if (!r) continue;
    const m = JSON.parse(r.metadata_json);
    const ds = m.viewPolicy?.form?.fields;
    if (!Array.isArray(ds)) { console.log(`${dt.padEnd(22)}không có danh sách trắng — bỏ qua`); continue; }
    if (ds.includes("price_variant")) { console.log(`${dt.padEnd(22)}đã có trong danh sách trắng`); continue; }
    const i = ds.indexOf("rate");
    ds.splice(i < 0 ? ds.length : i, 0, "price_variant");
    console.log(`${dt.padEnd(22)}thêm vào danh sách trắng form (${ds.length} ô)`);
    if (THAT) db2.prepare("UPDATE doctype_definitions SET metadata_json=?, revision=? WHERE tenant_id=? AND doctype=?")
      .run(JSON.stringify(m), Number(r.revision ?? 0) + 1, TENANT, dt);
  }
  db2.close();
}

console.log(THAT ? "\nDA GHI — khoi dong lai runtime" : "\nchay thu (them --that de ghi)");
