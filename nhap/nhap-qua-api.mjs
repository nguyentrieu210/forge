/**
 * NHẬP QUA API — không ghi thẳng SQLite nữa.
 *
 * VÌ SAO ĐỔI
 * Ghi thẳng tệp thì nhanh, nhưng nó bỏ qua đúng những thứ app tự lo: điền ô `fetch_from`, ép kiểu
 * `Check` về boolean, đóng dấu `_metadata_revision`, chặn giá trị sai. Mỗi thứ bỏ qua là một lỗi
 * nổ ra sau đó ở màn hình người dùng, xa nhất có thể khỏi nguyên nhân. Đi qua API thì app tự làm
 * hết — chậm hơn, đổi lại bản ghi sinh ra giống hệt bản người dùng tự tạo.
 *
 * ĐIỀU KIỆN NGƯỢC LẠI với bộ ghi thẳng: runtime PHẢI ĐANG CHẠY.
 *
 * CHẠY:  node nhap/nhap-qua-api.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

throw new Error(
  "ĐÃ KHÓA nhap-qua-api.mjs: các JSON staged cũ có mã retire/alias chưa cascade và hệ số tạm. "
  + "Chỉ dùng local runner sau khi cổng import hợp nhất trả GO.",
);

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const GOC = process.env.ALUMDOOR_API || "http://127.0.0.1:8799";
const NGUOI = process.env.FORGE_ADMIN_USER || "dev@example.com";
const MAT_KHAU = process.env.FORGE_ADMIN_PASSWORD || "local-dev-password-1";

let cookie = "";
/** Nonce CSRF của phiên — server trả ở header lúc đăng nhập, mọi lệnh GHI đều phải kèm. */
let csrf = "";
async function goi(duong, { method = "GET", body } = {}) {
  const res = await fetch(`${GOC}${duong}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-frappe-csrf-token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const dat = res.headers.get("set-cookie");
  if (dat?.startsWith("sid=")) cookie = dat.split(";")[0];
  const nonce = res.headers.get("x-frappe-csrf-token");
  if (nonce) csrf = nonce;
  const chu = await res.text();
  let json; try { json = JSON.parse(chu); } catch { json = { raw: chu }; }
  return { ok: res.ok, status: res.status, json };
}

const dangNhap = await goi("/api/method/login", { method: "POST", body: { usr: NGUOI, pwd: MAT_KHAU } });
if (!dangNhap.ok) throw new Error(`Đăng nhập hỏng (${dangNhap.status}): ${JSON.stringify(dangNhap.json)}`);
console.log(`đăng nhập: ${NGUOI}`);

/** Tệp nguồn truyền qua tham số: `node nhap/nhap-qua-api.mjs 11-hang-thuong` */
const TEP = process.argv[2] || "10-vat-tu-tay";
const nguon = JSON.parse(readFileSync(resolve(THU_MUC, `du-lieu/${TEP}.json`), "utf8"));
/**
 * Doctype LẤY TỪ TỆP NGUỒN, không đóng cứng.
 * Bộ này ban đầu chỉ nhập Item nên viết thẳng "Item" khắp nơi. Quy cách vật tư và mác vật liệu
 * đi đúng đường đó — chép ra bản thứ hai chỉ khác mỗi chữ "Item" là cách chắc chắn nhất để hai
 * bản trôi dạt khỏi nhau. Mọi tệp nguồn đều đã khai `doctype`, dùng luôn.
 */
const DT = nguon.doctype;
if (!DT) throw new Error(`${TEP}.json thiếu khoá "doctype"`);
const duongDan = (ten) => `/api/resource/${encodeURIComponent(DT)}/${encodeURIComponent(ten)}`;
console.log(`nguồn: ${TEP}.json · ${DT} · ${nguon.so_ban_ghi} bản ghi`);

/** Tả bản ghi vừa ghi: Item thì khoe ĐVT, doctype khác thì khoe tên + vài ô đáng nhìn. */
function taTat(d) {
  if (d.stock_uom || d.default_sales_uom) {
    const qd = (d.uom_conversions ?? []).map((c) => `${c.uom}×${c.conversion_factor}`).join(", ");
    return `${String(d.item_name ?? "").padEnd(28)}${d.item_group} · tồn ${d.stock_uom} · mua ${d.default_purchase_uom} · bán ${d.default_sales_uom}${qd ? ` · quy đổi ${qd}` : ""}`;
  }
  const nhan = d.spec_name ?? d.grade_name ?? d.title ?? "";
  const them = [
    d.material_grade && `mác ${d.material_grade}`,
    d.thickness_mm && `dày ${d.thickness_mm}mm`,
    d.material_family && `họ ${d.material_family}`,
  ].filter(Boolean).join(" · ");
  return `${String(nhan).padEnd(34)}${them}`;
}

/**
 * BỌC TRONG `doc` KHI DOCTYPE CÓ Ô TRÙNG TÊN THAM SỐ ĐIỀU KHIỂN.
 *
 * `router.ts` khai `CONTROL_ARGS` gồm "fields", "filters", "parent", "limit"… và gỡ chúng khỏi
 * THÂN tài liệu trước khi validate — vì REST Frappe dùng đúng mấy chữ đó làm tham số truy vấn.
 * Doctype `Geometry Profile` lại có một ô Table tên `fields`, nên gửi thẳng thì ô đó bốc hơi và
 * server báo "Trường hiển thị is required" — lỗi trỏ vào ô mình VỪA gửi, rất khó lần.
 *
 * Chính chú thích trong router chỉ ra lối thoát: `frappe.client.*` bọc tài liệu dưới khoá `doc`,
 * và nhánh đó đọc nguyên vẹn, không đi qua bộ lọc.
 */
const TRUNG_THAM_SO = new Set(["cmd", "doctype", "run_method", "with_parent", "limit_start",
  "limit_page_length", "limit", "order_by", "filters", "or_filters", "fields", "parent", "as_dict", "debug"]);
const canBoc = (p) => Object.keys(p).some((k) => TRUNG_THAM_SO.has(k) && k !== "doctype");
/** Thân gửi đi: bọc `doc` nếu cần, còn không thì gửi thẳng như cũ. */
const than = (p) => (canBoc(p) ? { doc: { ...p, doctype: DT } } : { ...p, doctype: DT });

let them = 0, thay = 0, hong = 0;
for (const r of nguon.ban_ghi) {
  const daCo = await goi(duongDan(r.name));

  /**
   * ĐÃ CÓ thì SỬA, chưa có thì TẠO. Tuyệt đối không xoá-rồi-tạo.
   *
   * Bản trước làm đúng như vậy và mất sạch dữ liệu: xoá xong, lệnh tạo hỏng, bản ghi bốc hơi.
   * Một bộ nhập không được phép để dữ liệu ở trạng thái tệ hơn lúc nó bắt đầu chỉ vì bước sau
   * hỏng — nhất là bộ nhập chạy lại nhiều lần.
   */
  if (daCo.ok) {
    /**
     * PUT phải mang `modified` của bản đang lưu.
     *
     * Thiếu nó, server coi là ghi đè mù và chặn bằng "The document changed after it was loaded" —
     * chốt chặn tranh chấp phiên bản, đúng chứ không phải lỗi: hai người cùng sửa một bản ghi thì
     * người sau không được đè lên người trước mà không biết.
     */
    const sua = await goi(duongDan(r.name), {
      method: "PUT",
      body: than({ ...r.payload, ...(daCo.json?.data?.modified ? { modified: daCo.json.data.modified } : {}) }),
    });
    if (!sua.ok) {
      console.log(`  ✗ ${r.name.padEnd(16)} sửa hỏng (${sua.status}) ${sua.json?.message ?? JSON.stringify(sua.json).slice(0, 300)}`);
      hong += 1; continue;
    }
    if (nguon.ban_ghi.length <= 30) console.log(`  ↻ ${r.name.padEnd(26)} ${taTat(sua.json?.data ?? {})}`);
    thay += 1; continue;
  }

  const tao = await goi(`/api/resource/${encodeURIComponent(DT)}`, { method: "POST", body: than(r.payload) });
  if (!tao.ok) {
    console.log(`  ✗ ${r.name.padEnd(16)} tạo hỏng (${tao.status}) ${tao.json?.message ?? ""}`);
    console.log(`      nguyên văn: ${JSON.stringify(tao.json).slice(0, 400)}`);
    hong += 1;
    continue;
  }
  them += 1;
  if (nguon.ban_ghi.length <= 30) console.log(`  ✓ ${r.name.padEnd(26)} ${taTat(tao.json?.data ?? {})}`);
}
console.log(`\ntạo ${them} · sửa ${thay} · hỏng ${hong}`);
