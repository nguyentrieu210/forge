/**
 * TẦNG 10 — VẬT TƯ NHẬP TAY
 *
 * SỔ NHẬP TAY của chủ dự án: họ đọc từng dòng, tầng này ghi từng dòng. Mỗi lần thêm thì NỐI vào
 * cuối `10-vat-tu-tay.json`, chạy lại tầng — bản ghi cũ không đổi, bản mới được thêm.
 *
 * VÌ SAO TÁCH KHỎI TẦNG 06
 * Ngày 2026-08-20 chủ dự án đã XOÁ toàn bộ 429 Item để tự nhập lại. Tầng 06 vẫn còn nguyên và
 * vẫn dựng lại được cả 429 mã đó — nên nếu nhập tay đi chung tầng 06 thì chỉ một lần chạy nhầm
 * là đổ hết đống cũ đè lên việc họ đang làm.
 *
 * Và tầng này KHÔNG gọi `xoaMaThua`: nó chỉ biết thêm. Một tầng nhập tay mà tự xoá những gì
 * không có trong file của nó là cách chắc chắn nhất để mất hàng người ta vừa gõ ở nơi khác.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu, dienTruongSuyRa, chuanHoaTheoDoctype } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const nguon = docNguon("10-vat-tu-tay", "Item");

const dvtDung = nguon.ban_ghi.flatMap((r) => [
  r.payload?.stock_uom, r.payload?.default_purchase_uom, r.payload?.default_sales_uom,
  ...(r.payload?.uom_conversions ?? []).map((c) => c.uom ?? c.to_uom),
]).filter(Boolean);

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.payload?.item_name ?? r.name,
  content: `${r.name} ${r.payload?.item_name ?? ""} ${r.payload?.item_group ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "10-vat-tu-tay" });
try {
  kiemThamChieu(phien, "Item Group", truong(nguon.ban_ghi, "item_group"), "Vật tư nhập tay (nhóm hàng)");
  kiemThamChieu(phien, "UOM", dvtDung, "Vật tư nhập tay (đơn vị tính)");
  kiemThamChieu(phien, "Measurement Profile", truong(nguon.ban_ghi, "measurement_profile"), "Vật tư nhập tay (bộ theo dõi)");

  // App tự điền các ô `fetch_from` khi tạo qua giao diện; ghi thẳng SQLite thì phải tự làm,
  // không thì bản ghi lưu được nhưng người dùng bấm Lưu là bị chặn.
  const suy = dienTruongSuyRa(phien, "Item", banGhi);
  if (suy.dien) console.log(`  điền ${suy.dien} ô do server suy ra: ${suy.truong.join(", ")}`);

  const ch = chuanHoaTheoDoctype(phien, "Item", banGhi);
  if (ch.boKhoa || ch.doiKieu) console.log(`  chuẩn hoá: bỏ ${ch.boKhoa} khoá lạ · sửa ${ch.doiKieu} ô Check về boolean`);

  // `chiThem`: KHÔNG đè bản ghi đã có. Chủ dự án sửa thẳng trong app, file này chỉ để thêm dòng
  // mới — đè lên là xoá âm thầm việc họ vừa gõ.
  const kq = ghiLo(phien, "Item", banGhi, { chiThem: true });
  inBaoCao("10 vật tư nhập tay", kq, phien);
  const boQua = banGhi.length - kq.themMoi;
  if (boQua > 0) console.log(`  ${boQua} mã đã có sẵn — giữ nguyên bản trong app, không đè.`);

  const thieuQuyDoi = banGhi.filter((r) => r.payload.default_purchase_uom !== r.payload.stock_uom && !(r.payload.uom_conversions ?? []).length);
  if (thieuQuyDoi.length) {
    console.log(`\n  ⚠ ${thieuQuyDoi.length} mã mua một ĐVT tồn một ĐVT nhưng CHƯA có hệ số quy đổi:`);
    for (const r of thieuQuyDoi) console.log(`     · ${r.name.padEnd(16)} mua ${r.payload.default_purchase_uom} → tồn ${r.payload.stock_uom}`);
    console.log(`     Nhập kho theo ĐVT mua sẽ không quy ra tồn được cho tới khi có hệ số.`);
  }
} finally {
  dongPhien(phien);
}
