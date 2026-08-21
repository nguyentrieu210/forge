/**
 * TẦNG 09 — MÁC VẬT LIỆU + QUY CÁCH KỸ THUẬT VẬT TƯ
 *
 * Đây là chỗ nhận những thứ lâu nay chỉ sống trong chuỗi mã: chất gì, dày bao nhiêu, khổ nào.
 * Nền tảng đã dựng sẵn cả hai doctype từ trước và cả hai đang TRỐNG 0 bản ghi, `Item` cũng có
 * sẵn `material_specification` trống 0/438 — nên đây là điền vào chỗ đã chừa, không phải đẻ
 * thêm cấu trúc mới.
 *
 * Mác phải vào TRƯỚC quy cách: `Material Specification.material_grade` trỏ sang nó.
 *
 * Nguồn do `nhap/dung-quy-cach.mjs` sinh, KHÔNG sửa tay.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu, xoaMaThua } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const mac = docNguon("09-mac-vat-lieu", "Material Grade");
const quyCach = docNguon("09-quy-cach-vat-tu", "Material Specification");

const dong = (nguon) => nguon.ban_ghi.map((r) => ({
  name: r.name, payload: r.payload, title: r.title ?? r.name, content: r.content ?? r.name,
}));

const phien = await moPhienGhi({ tang: "09-quy-cach-vat-lieu" });
try {
  kiemThamChieu(phien, "Item Group", truong(quyCach.ban_ghi, "item_group"), "Quy cách kỹ thuật vật tư");

  const kq = [ghiLo(phien, "Material Grade", dong(mac))];
  kiemThamChieu(phien, "Material Grade", truong(quyCach.ban_ghi, "material_grade"), "Quy cách kỹ thuật vật tư");
  kq.push(ghiLo(phien, "Material Specification", dong(quyCach)));

  const xoaQC = xoaMaThua(phien, "Material Specification", quyCach.ban_ghi.map((r) => r.name));
  inBaoCao("09 quy cách vật liệu", kq, phien);
  if (xoaQC.xoa) console.log(`  xoá ${xoaQC.xoa} quy cách không còn trong nguồn`);
} finally {
  dongPhien(phien);
}
