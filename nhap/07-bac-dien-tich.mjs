/**
 * TẦNG 07 — BẬC DIỆN TÍCH (Bậc diện tích)
 *
 * Không phụ thuộc tầng nào. Nhưng TẦNG 08 không chạy được nếu thiếu tầng này: `Item Price.area_tier`
 * là Link BẮT BUỘC, mặc định `MOI-DIEN-TICH`.
 *
 * VÌ SAO CÓ BẬC "MỌI DIỆN TÍCH" THAY VÌ ĐỂ TRỐNG
 * Ô trống trong bảng giá nghĩa là "áp cho mọi giá trị của trục đó". Nhưng một trường Link để
 * trống không phân biệt được "cố ý áp cho mọi bậc" với "quên chưa điền" — và cái sau là thứ
 * phải chặn được. Cho nên bậc mở là MỘT BẢN GHI có tên, tra được, đếm được: 211/267 dòng giá
 * hiện nằm ở đó, và nhìn vào là biết ngay chỗ nào chưa phân bậc.
 */

import { moPhienGhi, ghiLo, dongPhien, inBaoCao } from "./lib/d1.mjs";
import { docNguon } from "./lib/doc-nguon.mjs";

const nguon = docNguon("07-bac-dien-tich", "Bậc diện tích");

const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name,
  payload: r.payload,
  title: r.title ?? r.payload?.tier_name ?? r.name,
  content: r.content ?? `${r.name} ${r.payload?.tier_name ?? ""}`.trim(),
}));

const phien = await moPhienGhi({ tang: "07-bac-dien-tich" });
try {
  inBaoCao("07 bậc diện tích", ghiLo(phien, "Bậc diện tích", banGhi), phien);
} finally {
  dongPhien(phien);
}
