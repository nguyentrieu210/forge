/**
 * TẦNG 04 — MÀU SẮC (Item Color)
 *
 * Phụ thuộc TẦNG 03: mỗi màu thuộc về một bề mặt (`surface_finish`), và phụ thuộc TẦNG 01 nếu
 * màu tự khoanh phạm vi nhóm (`applies_to_groups`).
 *
 * Lưu ý hình dạng dữ liệu: `surface_finish` chứa MÃ bề mặt (`SON_TINH_DIEN`), không phải tên
 * hiển thị (`SƠN TĨNH ĐIỆN`) — và `name` của document bề mặt chính là mã. Trỏ nhầm sang tên
 * hiển thị thì ô chọn rỗng mà D1 vẫn nhận.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu } from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const nguon = docNguon("04-mau-sac", "Item Color");

const nhomDung = nguon.ban_ghi.flatMap((r) => (r.payload?.applies_to_groups ?? [])
  .map((d) => (typeof d === "string" ? d : d.item_group))).filter(Boolean);

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.payload?.color_name ?? r.name,
  content: r.content ?? `${r.name} ${r.payload?.color_name ?? ""} ${r.payload?.surface_finish ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "04-mau-sac" });
try {
  kiemThamChieu(phien, "Surface Finish", truong(nguon.ban_ghi, "surface_finish"), "Màu sắc");
  if (nhomDung.length) kiemThamChieu(phien, "Item Group", nhomDung, "Màu sắc (phạm vi nhóm)");
  inBaoCao("04 màu sắc", ghiLo(phien, "Item Color", banGhi), phien);
} finally {
  dongPhien(phien);
}
