/**
 * BẢNG GIÁ CÓ MỘC LÀ THẨM QUYỀN GIÁ. Lệch với `ĐM.md` thì bảng có mộc thắng.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUYẾT ĐỊNH CỦA CHỦ XƯỞNG, 2026-08-20: "LẤY GIÁ CÓ MỘC"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Đường ống giá tới nay đọc DUY NHẤT `apps/alumdoor/docs/nguon/ms-lien/ĐM.md`
 * (`extract-alumdoor-pricing-source.mjs` khoá cứng đường dẫn đó). Bảng giá có mộc công ty —
 * `apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md` — **chưa script nào đọc**, dù
 * chính file đó tự khai là *"Nguồn có thẩm quyền cao nhất về GIÁ"* và có sáu tờ đóng mộc.
 *
 * File này là chỗ nối. Nó KHÔNG thay `ĐM.md` — `ĐM.md` vẫn là nguồn của danh mục, định mức và
 * phần lớn giá. Nó chỉ **đè giá ở đúng những chỗ hai bên nói khác nhau**, và ghi lại từng chỗ đè.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * KHOÁ ÁNH XẠ LÀ HỌ LÁ, VÌ LÁ MỚI LÀ THÀNH PHẨM CHÍNH CỦA CÁI CỬA
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Chủ xưởng chốt 2026-08-20: **lá là TP chính của cửa**. Nguồn nói đúng như vậy — tên thành phẩm
 * của cả BỘ CỬA vẫn bắt đầu bằng chữ LÁ:
 *
 *     TP-TOLEKEM124_8D_TRONBO_3-4m²_MSK → "LÁ ĐÀI LOAN STĐ MSK 1LY_TRỌN BỘ 3-4m²"
 *
 * Ray, trục, V4/V5, motor là CẤU PHẦN. Danh tính mặt hàng nằm ở LOẠI LÁ — vật liệu × bản × độ
 * dày. Nên bảng dưới khoá theo họ lá, và đó cũng là lý do ba trục màu · cách bán · bậc diện tích
 * gộp được: chúng không đổi lá, chỉ đổi cách bán cùng một cái lá.
 *
 * `TOLEKEM` = TÔN/TOLE **KẼM**, là VẬT LIỆU chứ không phải màu. Nguồn tự chứng minh ở
 * `DANH-MỤC.md` dòng 58 và 59, cùng một dòng ghi hai kiểu:
 *
 *     [6] MÃ XUẤT  TP-V4_KẼM   ↔   [7] MÃ NHẬP  NVL-V4-KEM_TOLE75_STD
 *     [6] MÃ XUẤT  TP-V5_KẼM   ↔   [7] MÃ NHẬP  NVL-V5_KEM_STD
 *
 * Màu nằm ở đuôi khác (`- GS`, `- MSK`, `XN-VK`); `ALUMDOOR-PHIEN-29-07.md` chốt `MSK ≡ THÔ`.
 *
 * Số sau `TOLEKEM` là quy cách LÁ, không phải độ dày (độ dày ở đuôi `_8D/_1LY`):
 *
 *     TOLEKEM70   → "LÁ YẾM"                    (lá hẹp nhất)
 *     TOLEKEM124  → "LÁ ĐÀI LOAN"               §3 gọi là bản 75
 *     TOLEKEM175  → "LÁ SIÊU TRƯỜNG 175"        §5 gọi là bảng 100
 *
 * Con số luôn LỚN HƠN bề rộng mặt lá (124>75, 175>100) và chính xưởng viết nó vào tên lá — đọc
 * như KHỔ TÔN PHẲNG cần để cán ra lá đó. **Suy luận, KHÔNG có nguồn nào nói thẳng.** Vì thế nó
 * không được mã hoá thành luật ở bất kỳ đâu; ghi ra để người sau khỏi phải suy lại từ đầu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG ÁNH XẠ MÃ→CỘT BẰNG CÁCH ĐỌC TOKEN ĐỘ DÀY TRONG MÃ
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Vì token độ dày trong MÃ SAI. `docs/source-data/doi-chieu-thanh-pham.md` dòng 77-79 ghi TÊN
 * hàng thật của ba họ MSK là **8D · 1LY · 1.2LY**, khớp đúng ba cột STĐ của bảng có mộc. Nhưng
 * MÃ lại ghi `_6D_` · `_8D_` · `_1LY_` — lệch xuống đúng một nấc.
 *
 * Chứng minh bằng giá, đối chiếu đủ 8 bậc trên ảnh chụp D1 (`work/pricing-preimage.json`):
 *
 *     mã                          cột khớp        khớp   cột nhì
 *     TP-CUADL6D  XN-VK/XN-XLC    6D              8/8    0/8
 *     TP-CUADL7D  XN-VK/XN-XLC    7D              8/8    0/8
 *     TP-CUADL8D  XN-VK/XN-XLC    8D              8/8    0/8
 *     TP-CUADL1LY XN-VK/XN-XLC    1LY             8/8    0/8
 *     TP-TOLEKEM124_6D            8 DEM STĐ       8/8    0/8   ← mã nói 6D
 *     TP-TOLEKEM124_8D            1LY STĐ         4/8    0/8   ← mã nói 8D, và LỆCH GIÁ
 *     TP-TOLEKEM124_1LY           1.2LY STĐ       8/8    0/8   ← mã nói 1LY
 *
 * Mười một mã, mười mã khớp TUYỆT ĐỐI một cột và cột nhì luôn 0/8. Ánh xạ không mơ hồ — nhưng
 * nó là ánh xạ theo GIÁ và theo TÊN HÀNG, không theo chữ trong mã.
 *
 * `ĐM.md` xác nhận lại bằng TÊN, độc lập với bằng chứng giá:
 *
 *     TP-TOLEKEM124_6D_…_MSK  → "LÁ ĐÀI LOAN STĐ MSK 8D"
 *     TP-TOLEKEM124_8D_…_MSK  → "LÁ ĐÀI LOAN STĐ MSK 1LY"
 *     TP-TOLEKEM124_1LY_…_MSK → "LÁ ĐÀI LOAN STĐ MSK 1.2LY"
 *
 * Và độ lệch KHÔNG hệ thống, nên đừng ai định "sửa bằng cách cộng một nấc": ở họ 175 thì mã lại
 * cao hơn tên — `NVL-TOLEKEM175_1LY_MSK` mang tên `LÁ SIÊU TRƯỜNG 175_XN-VK_9D` (mã 1LY, tên 9D),
 * ngược chiều với họ 124. Token độ dày trong mã đơn giản là KHÔNG tin được.
 *
 * Nên bảng `CODE_TO_COLUMN` dưới đây khai TAY, kèm bằng chứng. Và có cổng `verifySealedMapping`
 * kiểm lại: mã nào tụt xuống dưới ngưỡng khớp thì CHẾT, không lặng lẽ gán giá của cột khác.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CHỖ LỆCH DUY NHẤT — VÀ VÌ SAO BẢNG CÓ MỘC ĐÚNG
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *     TP-TOLEKEM124_8D  ↔  cột "1LY STĐ"
 *
 *     bậc      3-4    4-5    5-6    6-7  │  7-8    8-9   9-10    >10
 *     ĐM.md    660    640    620    610  │  590    580    570    560
 *     có mộc   630    620    610    600  │  590    580    570    560
 *     lệch     +30    +20    +10    +10  │   —      —      —      —
 *
 * Bốn bậc rẻ KHỚP TUYỆT ĐỐI. Chỉ bốn bậc đắt lệch. Và bằng chứng nội tại: mọi cột của bảng có
 * mộc là thang đều 10.000đ/bậc (riêng cột `8D` bước đầu 20.000 — và `TP-CUADL8D` chép lại đúng
 * chỗ bất thường đó, 520→500). Nửa dưới của `ĐM.md` cũng theo thang 10.000. Chỉ bốn bậc đắt của
 * nó phá thang: 660→640→620→610 (bước 20, 20, 10).
 *
 * Một thang giá gãy ở đúng bốn ô đắt nhất, trong khi mọi thang khác đều tăm tắp, đọc như một
 * lần sửa tay trên bảng tính. Chủ xưởng đã chốt: lấy bảng có mộc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PHẠM VI: CHỈ GIÁ GỐC THEO BẬC. KHÔNG ĐỤNG PHỤ THU.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Bảng §3 có hai loại số, và chúng KHÔNG cùng một cơ chế:
 *
 *     ô trong bảng 8×7   → là GIÁ. Đứng một mình đã là giá. → `Item Price` + `area_tier`
 *     "+20.000đ/m² kéo tay"          ┐
 *     "+40.000đ/m² ngang 6m–7m5"     ├ là SỬA GIÁ. Đứng một mình vô nghĩa.
 *     "+60.000đ/m² ngang 7m5–9m"     ┘ → `Pricing Rule`, adjustment_basis = AREA_SQM
 *
 * File này chỉ lo loại thứ nhất. Nhồi phụ thu vào đây là biến ba luật điều chỉnh thành ba dòng
 * giá gốc không có mặt hàng nào.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const clean = (value) => String(value ?? "").trim();

/** Sentinel của dòng giá KHÔNG gắn bậc — khớp mọi diện tích. Xem `alumdoor-item-price-alias.mjs`. */
const ALL_AREA_TIER = "MOI-DIEN-TICH";

export const SEALED_PRICE_SOURCE =
  "apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md §3";

/**
 * Nhãn bậc trong bảng có mộc → `tier_code` của doctype `Bậc diện tích`.
 *
 * Bảng xếp NGƯỢC (Trên 10m² ở dòng đầu). Giữ thứ tự của bảng khi đọc, chuẩn hoá khi xuất — đảo
 * thứ tự lúc đọc là chỗ dễ lệch một dòng nhất, và lệch một dòng ở đây là sai giá cả bảng.
 */
const TIER_LABEL_TO_CODE = new Map([
  ["Trên 10m²", "BAC-TREN-10"],
  ["9m²–10m²", "BAC-9-10"],
  ["8m²–9m²", "BAC-8-9"],
  ["7m²–8m²", "BAC-7-8"],
  ["6m²–7m²", "BAC-6-7"],
  ["5m²–6m²", "BAC-5-6"],
  ["4m²–5m²", "BAC-4-5"],
  ["3m²–4m²", "BAC-3-4"],
]);

/**
 * Mã hàng (đã bỏ hậu tố bậc) → cột của bảng có mộc.
 *
 * Khai tay vì token độ dày trong mã SAI ở ba họ MSK — xem phần đầu file. Mỗi dòng kèm số bậc
 * khớp đo được lúc chốt, để lần sau lệch đi thì biết lệch bao nhiêu so với lúc nào.
 */
const CODE_TO_COLUMN = new Map([
  ["TP-CUADL6D XN-VK", { column: "6D", matched_at_decision: 8 }],
  ["TP-CUADL6D XN-XLC", { column: "6D", matched_at_decision: 8 }],
  ["TP-CUADL7D XN-VK", { column: "7D", matched_at_decision: 8 }],
  ["TP-CUADL7D XN-XLC", { column: "7D", matched_at_decision: 8 }],
  ["TP-CUADL8D XN-VK", { column: "8D", matched_at_decision: 8 }],
  ["TP-CUADL8D XN-XLC", { column: "8D", matched_at_decision: 8 }],
  ["TP-CUADL1LY XN-VK", { column: "1LY", matched_at_decision: 8 }],
  ["TP-CUADL1LY XN-XLC", { column: "1LY", matched_at_decision: 8 }],
  // Ba họ dưới: token độ dày trong mã lệch một nấc so với tên hàng và so với cột bảng giá.
  ["TP-TOLEKEM124_6D", { column: "8 DEM STĐ", matched_at_decision: 8, code_thickness_mismatch: true }],
  ["TP-TOLEKEM124_8D", { column: "1LY STĐ", matched_at_decision: 4, code_thickness_mismatch: true }],
  ["TP-TOLEKEM124_1LY", { column: "1.2LY STĐ", matched_at_decision: 8, code_thickness_mismatch: true }],
]);

/**
 * Ngưỡng khớp tối thiểu khi kiểm lại ánh xạ.
 *
 * Đặt 4 vì `TP-TOLEKEM124_8D` chỉ khớp 4/8 lúc chốt — đó CHÍNH LÀ chỗ lệch đang sửa. Nhưng cột
 * nhì của mọi mã đều 0/8, nên 4 vẫn là khoảng cách an toàn tuyệt đối: không cột nào khác lại
 * gần tới mức nhầm được.
 */
const MIN_TIER_MATCH = 4;

/** Bỏ hậu tố bậc khỏi mã: `TP-CUADL6D XN-VK_TRONBO_4-5m²` → `TP-CUADL6D XN-VK`. */
export function stripTierSuffix(itemCode) {
  return clean(itemCode).replace(/_TRONBO(_[\d-]+m²|>[\d]+m²)?.*$/u, "").replace(/_MSK$/u, "").trim();
}

/** Hậu tố bậc trong mã → `tier_code`. Trả `null` khi mã không nhồi bậc. */
export function tierCodeFromItemCode(itemCode) {
  const code = clean(itemCode);
  if (/_TRONBO>\s*10m²/u.test(code)) return "BAC-TREN-10";
  const match = code.match(/_TRONBO_(\d+)-(\d+)m²/u);
  return match ? `BAC-${match[1]}-${match[2]}` : null;
}

function parseMoney(raw) {
  const digits = clean(raw).replace(/[^\d]/gu, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Đọc bảng 8 bậc × 7 cột của §3.
 *
 * @returns {{columns: string[], byColumn: Map<string, Map<string, number>>}}
 */
export function parseSealedTierTable(markdownText) {
  const afterHeading = String(markdownText).split(/^##\s+3\.\s+/mu)[1];
  if (!afterHeading) throw new Error("BANG-GIA-CHINH-THUC: không tìm thấy mục 3 (Đài Loan bảng 75)");
  // Cắt tại tiêu đề mục kế tiếp — không cắt thì bảng §4..§6 lọt vào.
  const section = afterHeading.split(/^##\s+/mu)[0];

  let columns = null;
  const byColumn = new Map();
  const seenTiers = [];

  for (const line of section.split(/\r?\n/)) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map(clean);
    if (cells.length < 8) continue;
    if (/^-+$/.test(cells[0])) continue;

    if (!columns) {
      if (cells[0] !== "Diện tích") {
        throw new Error(`Bảng bậc §3: cột đầu phải là "Diện tích", đang là "${cells[0]}"`);
      }
      columns = cells.slice(1);
      for (const column of columns) byColumn.set(column, new Map());
      continue;
    }

    const tierCode = TIER_LABEL_TO_CODE.get(cells[0]);
    if (!tierCode) throw new Error(`Bảng bậc §3: nhãn bậc lạ "${cells[0]}"`);
    seenTiers.push(tierCode);
    columns.forEach((column, index) => {
      const rate = parseMoney(cells[index + 1]);
      if (rate === null) throw new Error(`Bảng bậc §3: ô trống ở bậc ${tierCode} cột ${column}`);
      byColumn.get(column).set(tierCode, rate);
    });
  }

  if (!columns) throw new Error("Bảng bậc §3: không đọc được dòng tiêu đề");
  if (seenTiers.length !== TIER_LABEL_TO_CODE.size) {
    throw new Error(`Bảng bậc §3: đọc được ${seenTiers.length} bậc, chờ ${TIER_LABEL_TO_CODE.size}`);
  }
  return { columns, byColumn };
}

export async function loadSealedTierTable(repoRoot) {
  const path = resolve(repoRoot, "apps/alumdoor/docs/nguon/BANG-GIA-CHINH-THUC-31-07-2026.md");
  if (!existsSync(path)) return null;
  return parseSealedTierTable(await readFile(path, "utf8"));
}

/**
 * Cổng kiểm ánh xạ mã→cột.
 *
 * Nhận giá ĐANG chạy (`observed`: `Map<mãGốc, Map<tierCode, rate>>`) và đối chiếu với cột đã
 * khai. Mã nào khớp dưới ngưỡng, HOẶC khớp một cột khác nhiều hơn cột đã khai, thì ném lỗi —
 * gán giá của cột khác là sai tiền, và sai lặng lẽ.
 */
export function verifySealedMapping(table, observed) {
  const report = [];
  for (const [code, tiers] of observed) {
    const declared = CODE_TO_COLUMN.get(code);
    if (!declared) continue;
    const score = (column) => {
      const target = table.byColumn.get(column);
      if (!target) return -1;
      let hit = 0;
      for (const [tier, rate] of tiers) if (target.get(tier) === rate) hit += 1;
      return hit;
    };
    const declaredScore = score(declared.column);
    let best = { column: declared.column, hit: declaredScore };
    for (const column of table.columns) {
      const hit = score(column);
      if (hit > best.hit) best = { column, hit };
    }
    if (declaredScore < MIN_TIER_MATCH) {
      throw new Error(
        `Ánh xạ giá có mộc lệch: ${code} khai cột "${declared.column}" nhưng chỉ khớp ` +
          `${declaredScore}/${tiers.size} bậc (ngưỡng ${MIN_TIER_MATCH}). Kiểm lại nguồn trước khi nới ngưỡng.`,
      );
    }
    if (best.column !== declared.column) {
      throw new Error(
        `Ánh xạ giá có mộc lệch: ${code} khai cột "${declared.column}" (${declaredScore} bậc) ` +
          `nhưng cột "${best.column}" khớp nhiều hơn (${best.hit} bậc).`,
      );
    }
    report.push({ item_code: code, column: declared.column, matched: declaredScore, of: tiers.size });
  }
  return report;
}

/**
 * Giá có mộc cho một mã hàng ở một bậc. Trả `null` khi mã không thuộc bảng §3.
 */
export function sealedRateFor(table, itemCode, tierCode) {
  if (!table || !tierCode) return null;
  const declared = CODE_TO_COLUMN.get(stripTierSuffix(itemCode));
  if (!declared) return null;
  return table.byColumn.get(declared.column)?.get(tierCode) ?? null;
}

/**
 * Đè giá `ĐM.md` bằng giá có mộc, ghi lại từng chỗ đè.
 *
 * KHÔNG im lặng: mỗi lần đè sinh một dòng `overrides` đủ mã, bậc, giá cũ, giá mới, cột nguồn.
 * Đè giá mà không để lại vết là thứ ba tháng sau không ai giải thích được.
 *
 * @param {object[]} itemPrices  dòng giá đã dựng (có `item_code`, `area_tier`, `rate`)
 * @param {object} table         kết quả `loadSealedTierTable`
 */
export function applySealedPriceAuthority(itemPrices, table) {
  if (!table) {
    return { item_prices: itemPrices, report: { applied: false, reason: "no-sealed-source" } };
  }
  const overrides = [];
  const confirmed = [];
  const skippedVariants = [];
  const next = itemPrices.map((row) => {
    /**
     * BẢNG §3 LÀ GIÁ CỦA BIẾN THỂ CHUẨN. Dòng biến thể mang ngữ nghĩa khác — không đè.
     *
     * Đo trên payload thật: 105 dòng có bậc, trong đó **17 dòng là biến thể**
     * `ALUMDOOR_HAND_PULL_CONVERSION` (cửa kéo tay). Hôm nay chúng mang ĐÚNG giá gốc
     * (450.000 = 450.000) nên đè vào không đổi gì — nhưng bảng có mộc ghi rõ *"cửa cuốn lò xo
     * kéo tay +20.000đ/m²"*, tức dòng kéo tay LẼ RA phải là gốc + 20.000.
     *
     * Ngày ai đó nạp đúng con số đó vào, thẩm quyền này sẽ lặng lẽ kéo nó về giá gốc và xoá mất
     * phụ thu. Chặn ở đây, lúc chưa có thiệt hại, rẻ hơn chặn sau khi mất tiền.
     */
    const variant = clean(row.price_variant);
    if (variant && variant !== "STANDARD") {
      skippedVariants.push({ item_code: row.item_code, price_variant: variant });
      return row;
    }
    /**
     * BẬC ĐỌC ĐƯỢC TỪ HAI CHỖ, VÀ HÔM NAY NÓ NẰM Ở CHỖ THỨ HAI.
     *
     * Đích là `Item Price.area_tier`. Nhưng tới 2026-08-20 nó là 0/558 — bậc đang bị nhồi trong
     * MÃ HÀNG (`…_TRONBO_4-5m²`), và đường ống phát `MOI-DIEN-TICH` cho mọi dòng. Chỉ đọc
     * `area_tier` thì thẩm quyền giá phủ 0 dòng, tức quyết định "lấy giá có mộc" KHÔNG có hiệu
     * lực nào cho tới khi gộp xong 88 mã — một việc chưa làm và không lùi được.
     *
     * Nên: ưu tiên `area_tier`, thiếu thì suy từ mã. Sau khi gộp mã xong, nhánh thứ hai tự hết
     * việc mà không phải sửa gì ở đây.
     */
    const declaredTier = clean(row.area_tier);
    const tier = declaredTier && declaredTier !== ALL_AREA_TIER
      ? declaredTier
      : tierCodeFromItemCode(row.item_code);
    const sealed = sealedRateFor(table, row.item_code, tier);
    if (sealed === null) return row;
    const current = Number(row.rate);
    if (current === sealed) {
      confirmed.push({ item_code: row.item_code, area_tier: tier, rate: sealed });
      return row;
    }
    overrides.push({
      item_code: row.item_code,
      area_tier: tier,
      tier_from: declaredTier && declaredTier !== ALL_AREA_TIER ? "area_tier" : "item_code",
      rate_from_dm: current,
      rate_sealed: sealed,
      delta: sealed - current,
      column: CODE_TO_COLUMN.get(stripTierSuffix(row.item_code))?.column ?? null,
      authority: SEALED_PRICE_SOURCE,
    });
    return {
      ...row,
      rate: sealed,
      _price_authority: { source: SEALED_PRICE_SOURCE, replaced_rate: current },
    };
  });

  return {
    item_prices: next,
    report: {
      applied: true,
      source: SEALED_PRICE_SOURCE,
      covered_row_count: overrides.length + confirmed.length,
      confirmed_count: confirmed.length,
      override_count: overrides.length,
      skipped_variant_count: skippedVariants.length,
      overrides,
      skipped_variants: skippedVariants,
    },
  };
}

export const __testing = { CODE_TO_COLUMN, TIER_LABEL_TO_CODE, MIN_TIER_MATCH, parseMoney };
