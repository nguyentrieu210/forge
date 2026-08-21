/**
 * TẦNG 01 — NHÓM HÀNG (Item Group)
 *
 * Tầng đáy: mọi thứ khác trỏ vào nó (bề mặt khoanh phạm vi theo nhóm, mặt hàng thuộc nhóm),
 * còn nó chỉ trỏ vào CHÍNH NÓ qua `parent_item_group`.
 *
 * Cây tự trỏ nên phải nạp theo thứ tự cha-trước-con, và phải kiểm cha có thật. Nạp lộn xộn thì
 * SQLite vẫn nhận (không có khoá ngoại) — cây chỉ vỡ ra ở màn hình dưới dạng nhóm mồ côi.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao } from "./lib/d1.mjs";
import { docNguon } from "./lib/doc-nguon.mjs";

const nguon = docNguon("01-nhom-hang", "Item Group");

/** Xếp cha trước con; báo lỗi nếu có nhóm trỏ vào cha không tồn tại hoặc có vòng lặp. */
function xepTheoCay(banGhi) {
  const conLai = new Map(banGhi.map((r) => [r.name, r]));
  const daXep = [];
  const daCo = new Set();

  while (conLai.size) {
    const luot = [...conLai.values()].filter((r) => {
      const cha = r.payload?.parent_item_group;
      return !cha || daCo.has(cha);
    });
    if (!luot.length) {
      const ket = [...conLai.values()].map((r) => `${r.name} → ${r.payload?.parent_item_group}`);
      throw new Error(`Nhóm hàng bế tắc (cha không tồn tại hoặc vòng lặp):\n  ${ket.join("\n  ")}`);
    }
    for (const r of luot) { daXep.push(r); daCo.add(r.name); conLai.delete(r.name); }
  }
  return daXep;
}

const banGhi = xepTheoCay(nguon.ban_ghi).map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.name,
  content: r.content ?? `${r.name} ${r.payload?.parent_item_group ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "01-nhom-hang" });
try {
  inBaoCao("01 nhóm hàng", ghiLo(phien, "Item Group", banGhi), phien);
} finally {
  dongPhien(phien);
}
