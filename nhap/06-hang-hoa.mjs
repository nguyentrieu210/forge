/**
 * TẦNG 06 — HÀNG HOÁ (Item)
 *
 * Tầng đầu tiên mang dữ liệu XƯỞNG THẬT: 587 mã dựng từ 2169 dòng nguồn.
 * Phụ thuộc TẦNG 01 (nhóm hàng), TẦNG 02 (đơn vị), TẦNG 05 (quy cách đo).
 *
 * Kiểm CẢ BA tham chiếu trước khi ghi. Đây là tầng đông bản ghi nhất, nên cũng là tầng mà một
 * tham chiếu treo dễ lọt nhất: 587 mã × 4 trường trỏ ra ngoài, sai một cái thì không ai thấy
 * cho tới lúc mở đúng mặt hàng đó trên màn hình.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu, xoaMaThua } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const nguon = docNguon("06-hang-hoa", "Item");

const dvtDung = nguon.ban_ghi.flatMap((r) => [
  r.payload?.stock_uom,
  r.payload?.default_purchase_uom,
  r.payload?.default_sales_uom,
  ...(r.payload?.uom_conversions ?? []).map((c) => c.uom ?? c.to_uom),
]).filter(Boolean);

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.payload?.item_name ?? r.name,
  content: r.content ?? r.name,
}));

const phien = await moPhienGhi({ tang: "06-hang-hoa" });
try {
  kiemThamChieu(phien, "Item Group", truong(nguon.ban_ghi, "item_group"), "Hàng hoá (nhóm hàng)");
  kiemThamChieu(phien, "UOM", dvtDung, "Hàng hoá (đơn vị tính)");
  kiemThamChieu(phien, "Measurement Profile", truong(nguon.ban_ghi, "measurement_profile"), "Hàng hoá (quy cách đo)");

  const ketQua = ghiLo(phien, "Item", banGhi);

  // Đổi khuôn mã mà không dọn mã cũ thì danh mục phình đôi và mỗi mặt hàng hiện hai lần.
  const daXoa = xoaMaThua(phien, "Item", banGhi.map((r) => r.name), {
    bangThamChieu: [{ bang: "stock_ledger_entries", cot: "item_code" }, { bang: "gl_entries", cot: "item_code" }],
  });
  inBaoCao("06 hàng hoá", ketQua, phien);
  if (daXoa.xoa) {
    console.log(`  xoá ${daXoa.xoa} mã cũ không còn trong nguồn:`);
    for (const t of daXoa.ten.slice(0, 60)) console.log(`     · ${t}`);
    if (daXoa.ten.length > 60) console.log(`     … và ${daXoa.ten.length - 60} mã nữa`);
  }

  const nghiHuu = banGhi.filter((r) => r.payload?.disabled === 1).length;
  console.log(`  trong đó ngừng dùng: ${nghiHuu} mã`);
  for (const q of nguon.quyet_dinh ?? []) {
    console.log(`  [quyết định] ${q.item_code}: bỏ quy đổi ${JSON.stringify(q.bo_dong_quy_doi)}`);
  }
} finally {
  dongPhien(phien);
}
