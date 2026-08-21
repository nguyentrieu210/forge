/**
 * BẢNG GIÁ THEO BẬC DIỆN TÍCH — cửa cuốn Đài Loan bản 75, TRỌN BỘ.
 *
 * Nguồn: ảnh bảng giá chính thức Alumdoor "BẢNG GIÁ CỬA CUỐN ĐÀI LOAN - BẢNG 75 (TRỌN BỘ)",
 * áp dụng từ 07/07/2026. Đây là bảng DUY NHẤT trong toàn bộ tài liệu có giá thay đổi theo
 * diện tích: cửa càng lớn thì đơn giá mỗi m² càng rẻ.
 *
 * 7 loại × 8 bậc = 56 dòng — khớp đúng con số "7 mã × 8 bậc" của tệp giá cũ đã hỏng, tức tệp
 * ấy cũng lấy từ chính bảng này.
 *
 * BỐN LOẠI MẠ MÀU đi với mã `CDL_DLM_*` (Đài Loan Mạ màu), BA LOẠI SƠN TĨNH ĐIỆN đi với
 * `LA_DLK_*_TRONBO` (Đài Loan Kẽm — kẽm là thứ đem sơn tĩnh điện).
 *
 * CHẠY:  node nhap/dung-gia-bac-dien-tich.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const THU_MUC = dirname(fileURLToPath(import.meta.url));
const NGUON = "alumdoor-gia-bac-dien-tich-2026-08-20";

/** Bậc trong ảnh, xếp từ lớn xuống nhỏ — đúng thứ tự bảng in. */
const BAC = ["DT-TREN-10M2", "DT-9-10M2", "DT-8-9M2", "DT-7-8M2", "DT-6-7M2", "DT-5-6M2", "DT-4-5M2", "DT-3-4M2"];

/** Bảy cột của bảng: mã hàng trong danh mục ↔ tên cột trong ảnh. */
const COT = [
  ["CDL_DLM_6D", "6D mạ màu", [380, 390, 400, 410, 420, 430, 440, 450]],
  ["CDL_DLM_7D", "7D mạ màu", [410, 420, 430, 440, 450, 460, 470, 480]],
  ["CDL_DLM_8D", "8D mạ màu", [440, 450, 460, 470, 480, 490, 500, 520]],
  ["CDL_DLM_1LY", "1LY mạ màu", [520, 530, 540, 550, 560, 570, 580, 590]],
  ["LA_DLK_8D_TRONBO", "8 DEM sơn tĩnh điện", [500, 510, 520, 530, 540, 550, 560, 570]],
  ["LA_DLK_1LY_TRONBO", "1LY sơn tĩnh điện", [560, 570, 580, 590, 600, 610, 620, 630]],
  ["LA_DLK_1_2LY_TRONBO", "1.2LY sơn tĩnh điện", [620, 630, 640, 650, 660, 670, 680, 690]],
];

const banGhi = [];
for (const [ma, nhan, gia] of COT) {
  gia.forEach((nghin, i) => {
    const bac = BAC[i];
    banGhi.push({
      name: `Alumdoor 2026:${ma}:m2:TRON_BO:${bac}`,
      payload: {
        price_list: "Alumdoor 2026", item_code: ma, item_group: "Cửa Đài Loan",
        uom: "m2", area_tier: bac, price_variant: "TRON_BO",
        rate: String(nghin * 1000), currency: "VND",
        note: `Bảng giá Đài Loan bản 75 trọn bộ, cột "${nhan}", áp dụng từ 07/07/2026.`,
        disabled: false, _migration_source: NGUON,
      },
      title: nhan, content: `${ma} ${nhan} ${bac}`,
    });
  });
}

/** Tách món — một giá, không theo bậc. Cùng ảnh, phần trên. */
const TACH_MON = [
  ["TON_DLM_6D_K124", "Lá Đài Loan mạ màu bản 75 — 6D", 280000],
  ["TON_DLM_7D_K124", "Lá Đài Loan mạ màu bản 75 — 7D", 300000],
  ["TON_DLM_8D_K124", "Lá Đài Loan mạ màu bản 75 — 8D", 320000],
  ["TON_DLM_1LY_K124", "Lá Đài Loan mạ màu bản 75 — 1 ly", 380000],
  ["LA_DLK_8D", "Lá Đài Loan sơn tĩnh điện bản 75 — 8D", 410000],
  ["LA_DLK_1LY", "Lá Đài Loan sơn tĩnh điện bản 75 — 1 ly", 460000],
  ["LA_DLK_1_2LY", "Lá Đài Loan sơn tĩnh điện bản 75 — 1.2 ly", 510000],
];
for (const [ma, nhan, rate] of TACH_MON) {
  banGhi.push({
    name: `Alumdoor 2026:${ma}:m2:TACH_MON:MOI-DIEN-TICH`,
    payload: {
      price_list: "Alumdoor 2026", item_code: ma, item_group: "Nan/lá cửa",
      uom: "m2", area_tier: "MOI-DIEN-TICH", price_variant: "TACH_MON",
      rate: String(rate), currency: "VND",
      note: `Bảng giá Đài Loan bản 75 TÁCH MÓN: ${nhan}. Áp dụng từ 31/07/2026.`,
      disabled: false, _migration_source: NGUON,
    },
    title: nhan, content: `${ma} ${nhan}`,
  });
}

writeFileSync(resolve(THU_MUC, "du-lieu/22-gia-bac.json"), JSON.stringify({
  doctype: "Item Price", so_ban_ghi: banGhi.length, nguon: NGUON, ban_ghi: banGhi,
}, null, 1), "utf8");

console.log(`${banGhi.length} dòng giá  (${COT.length * BAC.length} theo bậc + ${TACH_MON.length} tách món)\n`);
console.log("  bậc".padEnd(18) + COT.map(([, n]) => n.split(" ")[0].padStart(8)).join(""));
BAC.forEach((b, i) => {
  console.log("  " + b.padEnd(16) + COT.map(([, , g]) => String(g[i]).padStart(8)).join(""));
});
console.log("\n  tách món (nghìn đ/m²):");
for (const [ma, nhan, rate] of TACH_MON) console.log(`     ${ma.padEnd(20)}${String(rate / 1000).padStart(5)}   ${nhan}`);
