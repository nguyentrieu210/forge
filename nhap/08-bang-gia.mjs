/**
 * TẦNG 08 — BẢNG GIÁ (Price List + Item Price)
 *
 * Phụ thuộc TẦNG 02 (ĐVT), TẦNG 06 (mặt hàng) và TẦNG 07 (bậc diện tích). Cả ba đều được kiểm
 * TRƯỚC khi ghi: một dòng giá trỏ vào mã hàng không tồn tại vẫn nằm yên trong SQLite, nó chỉ
 * vỡ ra lúc lập báo giá cho khách.
 *
 * Nguồn của tầng này do `nhap/dung-bang-gia.mjs` sinh ra, KHÔNG sửa tay: sửa tay vào
 * `08-don-gia.json` thì lần dựng lại sau sẽ đè mất, mà giữa hai lần thì không ai biết bảng giá
 * đang mang con số của nguồn hay của người.
 *
 * `Item Price.currency = "VND"` trỏ vào danh mục Currency hiện CHƯA có bản ghi nào trong D1
 * cục bộ — đúng như dữ liệu cũ. Chưa chặn ở đây vì chặn thì cả bảng giá không vào được; ghi
 * lại để không quên.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu, xoaMaThua } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const bangGia = docNguon("08-bang-gia", "Price List");
const donGia = docNguon("08-don-gia", "Item Price");

const dong = (nguon, lamTieuDe) => nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? lamTieuDe(r),
  content: r.content ?? r.name,
}));

const phien = await moPhienGhi({ tang: "08-bang-gia" });
try {
  kiemThamChieu(phien, "Item", truong(donGia.ban_ghi, "item_code"), "Bảng giá");
  kiemThamChieu(phien, "UOM", truong(donGia.ban_ghi, "uom"), "Bảng giá");
  kiemThamChieu(phien, "Bậc diện tích", truong(donGia.ban_ghi, "area_tier"), "Bảng giá");

  const kq = [ghiLo(phien, "Price List", dong(bangGia, (r) => r.payload.price_list_name))];

  // Bảng giá phải vào TRƯỚC dòng giá, cùng một phiên: nếu đảo thứ tự thì 267 dòng giá trỏ vào
  // một bảng giá chưa tồn tại trong đúng khoảnh khắc giữa hai lệnh ghi.
  kiemThamChieu(phien, "Price List", truong(donGia.ban_ghi, "price_list"), "Bảng giá");
  kq.push(ghiLo(phien, "Item Price", dong(donGia, (r) => r.payload.item_code)));

  // Tên dòng giá NHÚNG mã hàng, nên đổi mã là mọi dòng giá cũ thành rác treo.
  const xoaGia = xoaMaThua(phien, "Item Price", donGia.ban_ghi.map((r) => r.name));
  inBaoCao("08 bảng giá", kq, phien);
  if (xoaGia.xoa) console.log(`  xoá ${xoaGia.xoa} dòng giá mang mã cũ`);
} finally {
  dongPhien(phien);
}
