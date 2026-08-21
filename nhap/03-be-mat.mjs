/**
 * TẦNG 03 — BỀ MẶT (Surface Finish)
 *
 * Phụ thuộc TẦNG 01: `applies_to_groups[].item_group` và `excluded_groups` khoanh phạm vi theo
 * nhóm hàng. Nhóm ghi sai chính tả vẫn ghi được vào D1, nhưng phạm vi im lặng thành RỖNG — bề
 * mặt trông vẫn "có cấu hình" mà không áp cho mặt hàng nào.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu } from "./lib/d1.mjs";
import { docNguon } from "./lib/doc-nguon.mjs";

const nguon = docNguon("03-be-mat", "Surface Finish");

const nhomDung = nguon.ban_ghi.flatMap((r) => [
  ...(r.payload?.applies_to_groups ?? []).map((d) => d.item_group),
  ...(r.payload?.excluded_groups ?? []).map((d) => d.item_group ?? d),
]).filter(Boolean);

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.payload?.finish_name ?? r.name,
  content: r.content ?? `${r.name} ${r.payload?.finish_name ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "03-be-mat" });
try {
  kiemThamChieu(phien, "Item Group", nhomDung, "Bề mặt");
  inBaoCao("03 bề mặt", ghiLo(phien, "Surface Finish", banGhi), phien);
} finally {
  dongPhien(phien);
}
