/**
 * TẦNG 02 — ĐƠN VỊ TÍNH (UOM)
 *
 * Không phụ thuộc tầng nào. Mọi mặt hàng và quy cách đo đều trỏ vào đây.
 *
 * LUẬT E07 — chép lại ở đây vì nó đã trả giá để phát hiện, và một danh mục đơn vị "trông có vẻ
 * đủ" là thứ không ai kiểm lại:
 *   · `Lá`, `Thân` BẮT BUỘC có — đơn vị tự nhiên của lá cửa, mặt hàng chính của xưởng.
 *   · `Thùng`, `Băng`, `Bảng`, `Vỉ` bị LOẠI — mỗi thứ chỉ dùng đúng 1 lần, đó là quy cách đóng
 *     gói của một lần mua lẻ chứ không phải đơn vị. Seed lại là dựng lại đúng thứ đã bỏ.
 *   · Không được có hai tên cho cùng một đơn vị (`Cuộn`/`Cuốn`, `m2`/`m²`, `Cái`/`Chiếc`) —
 *     một lần gõ nhầm là tồn kho chẻ làm hai.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao } from "./lib/d1.mjs";
import { docNguon } from "./lib/doc-nguon.mjs";

const BAT_BUOC = ["Lá", "Thân"];
const BI_LOAI = ["Thùng", "Băng", "Bảng", "Vỉ"];
const DONG_NGHIA = [["m2", "m²"], ["Cái", "Chiếc"], ["Mét", "M"], ["Cuộn", "Cuốn"], ["Tấm", "Tâm"]];

const hoa = (v) => String(v ?? "").toLocaleUpperCase("vi");

const nguon = docNguon("02-dvt", "UOM");
const ten = nguon.ban_ghi.map((r) => r.name);
const loi = [];

for (const can of BAT_BUOC) {
  if (!ten.includes(can)) loi.push(`thiếu đơn vị bắt buộc "${can}"`);
}
for (const cam of BI_LOAI) {
  if (ten.some((t) => hoa(t) === hoa(cam))) loi.push(`đơn vị "${cam}" đã bị E07 loại, không được nạp lại`);
}
for (const cap of DONG_NGHIA) {
  const co = cap.filter((ung) => ten.some((t) => hoa(t) === hoa(ung)));
  if (co.length > 1) loi.push(`hai tên cho cùng một đơn vị: ${co.join(" / ")}`);
}
if (loi.length) throw new Error(`Danh mục đơn vị vi phạm E07:\n  - ${loi.join("\n  - ")}`);

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.name,
  content: r.content ?? r.name,
}));

const phien = await moPhienGhi({ tang: "02-dvt" });
try {
  inBaoCao("02 đơn vị tính", ghiLo(phien, "UOM", banGhi), phien);
} finally {
  dongPhien(phien);
}
