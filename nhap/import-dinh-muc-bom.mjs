/**
 * NHẬP ĐỊNH MỨC (BOM) THẬT CỦA XƯỞNG VÀO D1
 *
 *   node nhap/import-dinh-muc-bom.mjs          → CHẠY THỬ, chỉ đọc, không ghi gì
 *   node nhap/import-dinh-muc-bom.mjs --that   → GHI THẬT (tự sao lưu D1 trước)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NGUỒN
 *   `nhap/du-lieu/DM-BOM.csv` — 2.061 dòng trích sheet `ĐM` của `MS LIÊN BS.xlsx`.
 *   File đã được chuyển thành `nhap/du-lieu/29-dinh-muc-bom.json` (đúng khuôn các tầng khác:
 *   file dữ liệu là NGUỒN, script chỉ là cái tay ghi).
 *
 * VÌ SAO GHI VÀO `Bill of Materials` CHỨ KHÔNG PHẢI `BOM Template`
 *   Dữ liệu này là ĐỊNH MỨC HẰNG SỐ trên một đơn vị thành phẩm ("2 cái cục nhựa mỗi cặp con
 *   lăn", "0,096 kg bù lon mỗi con lăn"). `BOM Template` + `BOM Component Rule` là lớp SINH
 *   số lượng bằng CÔNG THỨC trên trường hình học — nhét hằng số vào đó là dùng sai lớp, và
 *   `BOM Template` hôm nay còn chưa có mục trên menu lẫn editor nên chủ xưởng không sửa được.
 *   `Bill of Materials` có sẵn `BOM Item.qty_basis` (Cố định / Theo chiều cao / Theo chiều
 *   rộng / Theo diện tích / Theo số lá) — đúng thứ cần để mang nghĩa của ĐVT `KG/M2`, `KG/M
 *   ngang`, `CÁI`…, và nó đã có màn hình sống.
 *
 * NHỮNG GÌ SCRIPT NÀY CỐ Ý KHÔNG NHẬP (xem `29-dong-bi-bo-qua.csv`)
 *   1. Cấu phần có `dinh_muc` TRỐNG hoặc = 0 (lá ruột, lá đầu + 3 lá đáy…): đó là công thức
 *      HÌNH HỌC, ô để trống chứ không phải định mức bằng 0. Ghi 0 vào BOM = xưởng xuất kho
 *      thiếu vật tư mà không có gì kêu. Chúng phải đi đường `BOM Rule` / `BOM Component Rule`.
 *   2. Cấu phần ĐVT `KG/M` hoặc `M` trần: "trên một mét" — nhưng KHÔNG ghi mét theo chiều
 *      CAO hay chiều RỘNG. `qty_basis` bắt buộc phải chọn một trong hai. Đoán = bịa.
 *   3. Vật tư / thành phẩm chưa tra ra MỘT mã chắc chắn trong danh mục `Item` của D1.
 *      Tiền lệ 17/17 và 35/35 mã chết trong brief là lý do dòng này tồn tại.
 *
 * KHÔNG ĐỘNG VÀO GIÁ. Lệch giá và lệch bản lá chỉ được BÁO trong
 * `docs/audits/ALUMDOOR-IMPORT-DINH-MUC-20260821.md`, không script nào ở đây ghi đè.
 */

import { DatabaseSync } from "node:sqlite";
import {
  moPhienGhi, ghiLo, dongPhien, inBaoCao, kiemThamChieu,
  chuanHoaTheoDoctype, DUONG_D1, TENANT,
} from "./lib/d1.mjs";
import { docNguon, truong } from "./lib/doc-nguon.mjs";

const GHI_THAT = process.argv.includes("--that");
const TANG = "29-dinh-muc-bom";

const nguon = docNguon(TANG, "Bill of Materials");
const banGhi = nguon.ban_ghi.map((r) => ({
  name: r.name, payload: structuredClone(r.payload), title: r.title, content: r.content,
}));

const soCauPhan = banGhi.reduce((n, r) => n + r.payload.items.length, 0);
const maThanhPham = [...new Set(truong(banGhi, "item"))];
const maVatTu = [...new Set(banGhi.flatMap((r) => r.payload.items.map((d) => d.item_code)))];

console.log("═══ NHẬP ĐỊNH MỨC (BOM) THẬT CỦA XƯỞNG ═══");
console.log(`  nguồn        : ${nguon.nguon}`);
console.log(`  sẽ ghi       : ${banGhi.length} Bill of Materials · ${soCauPhan} dòng cấu phần`);
console.log(`  phủ          : ${maThanhPham.length} mã thành phẩm · dùng ${maVatTu.length} mã vật tư`);
const bq = { tong: nguon.bo_qua.tong, theoLyDo: nguon.bo_qua.theo_ly_do };
console.log(`  CỐ Ý BỎ QUA  : ${bq.tong} dòng CSV (chi tiết: ${nguon.bo_qua.chi_tiet})`);
for (const [lyDo, n] of bq.theoLyDo) console.log(`      ${String(n).padStart(5)}  ${lyDo}`);
console.log(`  D1           : ${DUONG_D1}`);
console.log(`  tenant       : ${TENANT}`);

if (!GHI_THAT) {
  // Chạy thử KHÔNG mở phiên ghi: không chặn cổng, không sao lưu, không mở DB ở chế độ ghi.
  // Nhờ vậy chạy thử được ngay cả khi backend đang sống — và đó là lúc người ta hay chạy thử nhất.
  const db = new DatabaseSync(DUONG_D1, { readOnly: true });
  try {
    const co = new Set(db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype='Item'").all(TENANT).map((r) => r.name));
    const thieu = [...maThanhPham, ...maVatTu].filter((m) => !co.has(m));
    const daCo = db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype='Bill of Materials'").all(TENANT).map((r) => r.name);
    const trung = banGhi.filter((r) => daCo.includes(r.name)).map((r) => r.name);
    console.log("\n── CHẠY THỬ (chỉ đọc, KHÔNG ghi gì) ──");
    console.log(`  Item trong D1                 : ${co.size}`);
    console.log(`  mã script định dùng mà D1 THIẾU: ${thieu.length}${thieu.length ? " → " + thieu.join(", ") : " (không thiếu mã nào)"}`);
    console.log(`  Bill of Materials hiện có     : ${daCo.length}`);
    console.log(`  tên trùng với bản ghi sẵn có  : ${trung.length}${trung.length ? " → " + trung.join(", ") : " (không trùng)"}`);
    console.log(`  sau khi ghi sẽ có             : ${daCo.length + banGhi.length - trung.length} Bill of Materials`);
    if (thieu.length) console.log("\n  ⚠ CÓ MÃ THIẾU — chạy `--that` sẽ DỪNG chứ không ghi mã treo.");
    console.log("\n  Chưa ghi gì cả. Muốn ghi thật:");
    console.log("     1) TẮT backend/Desk (script sẽ tự chặn nếu cổng 8799/5173 còn nghe)");
    console.log("     2) node nhap/import-dinh-muc-bom.mjs --that");
  } finally { db.close(); }
  process.exit(0);
}

// ── GHI THẬT ──
// `moPhienGhi` chặn khi cổng 8799/5173 còn nghe (ghi song song với miniflare = hai bản sự thật)
// và sao lưu D1 vào `nhap/.sao-luu/` trước khi mở. Cả hai đều BẮT BUỘC, không có cờ tắt.
const phien = await moPhienGhi({ tang: TANG });
try {
  // Chặn TRƯỚC khi ghi: một BOM trỏ vào mã hàng không tồn tại vẫn ghi được vào SQLite,
  // nó chỉ vỡ ra lúc người ta mở định mức trên màn — xa nhất có thể khỏi nguyên nhân.
  kiemThamChieu(phien, "Item", [...maThanhPham, ...maVatTu], "Định mức BOM");

  const daCo = new Set(phien.db.prepare("SELECT name FROM documents WHERE tenant_id=? AND doctype='Bill of Materials'").all(TENANT).map((r) => r.name));
  const dungTen = banGhi.filter((r) => daCo.has(r.name) && !String(r.payload._migration_source ?? "").startsWith("alumdoor-dinh-muc-bom"));
  if (dungTen.length) {
    // Chỉ xảy ra khi có người tạo BOM tay trong lúc chờ chạy. Đè lên là xoá âm thầm việc của họ.
    throw new Error(`Trùng tên với ${dungTen.length} Bill of Materials không phải của đợt nhập này: ${dungTen.map((r) => r.name).join(", ")}. Sửa \`name\` trong nhap/du-lieu/${TANG}.json rồi chạy lại.`);
  }

  chuanHoaTheoDoctype(phien, "Bill of Materials", banGhi);
  const kq = ghiLo(phien, "Bill of Materials", banGhi);

  // Đẩy bộ đếm số chứng từ lên qua dải vừa dùng, để BOM tạo tay sau này không đâm vào tên cũ.
  const caoNhat = Math.max(...banGhi.map((r) => Number(r.name.split("-").pop())));
  const khoa = phien.db.prepare("SELECT series_key, current_value FROM naming_series WHERE tenant_id=? AND series_key LIKE 'Bill of Materials:%'").get(TENANT);
  if (khoa && khoa.current_value < caoNhat) {
    phien.db.prepare("UPDATE naming_series SET current_value=?, modified_at=? WHERE tenant_id=? AND series_key=?")
      .run(caoNhat, new Date().toISOString(), TENANT, khoa.series_key);
    console.log(`  bộ đếm số chứng từ: ${khoa.current_value} → ${caoNhat}`);
  }

  inBaoCao("29 định mức BOM", kq, phien);
  console.log(`  cấu phần đã ghi: ${soCauPhan} dòng trên ${maThanhPham.length} mã thành phẩm`);
  console.log("\n  CÒN LẠI (không script nào lấp được, cần chủ xưởng chốt):");
  for (const [lyDo, n] of bq.theoLyDo) console.log(`      ${String(n).padStart(5)}  ${lyDo}`);
  console.log("  Xem chi tiết: docs/audits/ALUMDOOR-IMPORT-DINH-MUC-20260821.md");
} finally {
  dongPhien(phien);
}
