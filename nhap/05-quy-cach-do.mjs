/**
 * TẦNG 05 — QUY CÁCH ĐO (Measurement Profile)
 *
 * Phụ thuộc TẦNG 02: mỗi quy cách chốt một `stock_uom`.
 *
 * Đây là tầng mà mặt hàng trỏ vào để biết PHẢI ĐO GÌ khi nhập kho — dài, rộng, số lá, lô. Thiếu
 * nó thì Item nhập được nhưng mọi màn hình nhập kho mất hết ô nhập kích thước, và tồn kho quay
 * về đếm cái.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const nguon = docNguon("05-quy-cach-do", "Measurement Profile");

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.payload?.profile_name ?? r.name,
  content: r.content ?? `${r.name} ${r.payload?.inventory_mode ?? ""} ${r.payload?.stock_uom ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "05-quy-cach-do" });
try {
  kiemThamChieu(phien, "UOM", truong(nguon.ban_ghi, "stock_uom"), "Quy cách đo");
  inBaoCao("05 quy cách đo", ghiLo(phien, "Measurement Profile", banGhi), phien);
} finally {
  dongPhien(phien);
}
