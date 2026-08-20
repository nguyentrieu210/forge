#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applySealedPriceAuthority,
  loadSealedTierTable,
  SEALED_PRICE_SOURCE,
} from "./lib/alumdoor-sealed-price-authority.mjs";

export const ALUMDOOR_PRICE_LIST = "ALUMDOOR-SELLING";
export const STANDARD_VARIANT = "STANDARD";
export const VARIANTS = Object.freeze({
  MOTOR_NO_LAC: "ALUMDOOR_MOTOR_NO_LAC",
  MOTOR_NO_CONTROLLER: "ALUMDOOR_MOTOR_NO_CONTROLLER",
  MOTOR_NO_CONTROLLER_NO_LAC: "ALUMDOOR_MOTOR_NO_CONTROLLER_NO_LAC",
  MOTOR_LAC36: "ALUMDOOR_MOTOR_LAC36",
  RAY_SON_MSK: "ALUMDOOR_RAY_SON_MSK",
  HAND_PULL: "ALUMDOOR_HAND_PULL_CONVERSION",
  DUC_WOODGRAIN: "ALUMDOOR_DUC_WOODGRAIN_SLAT",
  V5_STD: "ALUMDOOR_V5_STD_FINISH",
  DUC_ACCESSORY_MIN: "ALUMDOOR_DUC_ACCESSORY_UNDER_5M",
  UC_ACCESSORY_MIN: "ALUMDOOR_UC_ACCESSORY_UNDER_5M",
  DAILOAN_ACCESSORY_MIN: "ALUMDOOR_DAILOAN_ACCESSORY_UNDER_3M",
  CUALUOI_MIN: "ALUMDOOR_CUALUOI_UNDER_3M",
});

const RAY_SURCHARGE_TARGETS = Object.freeze([
  "TP-RAYHOP",
  "TP-TD87A1 GS",
  "TP-RAY HỘP TD U100",
  "TP-RAYNHOMUC",
]);
const clean = (value) => String(value ?? "").normalize("NFC").trim();
const fold = (value) => clean(value).normalize("NFD").replace(/\p{M}/gu, "").toLocaleUpperCase("vi").replace(/[Đ]/g, "D");
const truthy = (value) => value === true || value === 1 || value === "1";
const disabled = (value) => truthy(value) || ["true", "yes", "có", "co"].includes(clean(value).toLocaleLowerCase("vi"));
const condition = (field, operator, value) => ({ field, operator, value });
const stableSort = (rows) => [...rows].sort((a, b) => clean(a.name) < clean(b.name) ? -1 : clean(a.name) > clean(b.name) ? 1 : 0);

/**
 * Bậc "mọi diện tích" — phải khớp `ALL_AREA_TIER` trong `packages/clouderp-pricing/src/index.ts`.
 *
 * Chép hằng số thay vì import: script này chạy bằng node thuần trên file `.mjs`, không qua `tsc`,
 * nên không với tới `packages/**\/*.ts`. Bù lại bằng test neo hai bên bằng nhau.
 */
export const ALL_AREA_TIER = "MOI-DIEN-TICH";

/**
 * LỆCH NGUỒN CHƯA GIẢI QUYẾT — thang giá theo bậc diện tích, họ TP-TOLEKEM124_8D.
 *
 * Đo trên hai nguồn, không đoán:
 *   · `BANG-GIA-CHINH-THUC-31-07-2026 §3` — bảng 8 bậc × 7 cột, có mộc, hiệu lực 31/07/2026.
 *   · `ms-lien/ĐM.md` — 88 mã có hậu tố bậc trong MÃ HÀNG, gộp còn 11 gốc mã / 7 thang giá.
 *
 * 6/7 thang khớp nguyên vẹn 8/8 bậc. Riêng `TP-TOLEKEM124_8D_MSK` (khớp cột "1LY STĐ") lệch ở
 * ĐÚNG 4 bậc đắt nhất, ĐM.md luôn cao hơn:
 *   3-4 m²: 660.000 vs 630.000  (+30.000)
 *   4-5 m²: 640.000 vs 620.000  (+20.000)
 *   5-6 m²: 620.000 vs 610.000  (+10.000)
 *   6-7 m²: 610.000 vs 600.000  (+10.000)
 *   7-8 / 8-9 / 9-10 / >10 m²: bằng nhau (590/580/570/560).
 *
 * Kèm một điểm lệch NHÃN nữa, ghi luôn: theo giá trị thì `TOLEKEM124_6D` khớp cột "8 DEM STĐ",
 * `_8D` khớp "1LY STĐ", `_1LY` khớp "1.2LY STĐ" — tên mã lệch nhãn cột đúng một nấc.
 *
 * KHÔNG tự chọn bên nào. Luật "nguồn gốc thắng bản trích" nghiêng về BANG-GIA, nhưng ĐM.md mới
 * là thứ đang chạy trên D1, và chênh 30.000đ/m² là tiền thật trên mỗi đơn. Chủ xưởng chốt.
 */

export function itemPriceName(priceList, itemCode, uom, variant = STANDARD_VARIANT, areaTier = ALL_AREA_TIER) {
  const base = `${clean(priceList)}:${clean(itemCode)}`;
  const canonicalVariant = clean(variant).toUpperCase() || STANDARD_VARIANT;
  const canonicalTier = clean(areaTier) || ALL_AREA_TIER;
  // The doctype names itself format:{price_list}:{item_code}:{uom}:{price_variant}:{area_tier},
  // so the server appends the variant even when it is STANDARD. Dropping the suffix here made
  // every base row's payload name disagree with the name the row actually gets, which surfaced
  // as 331 extra_managed_item_price blockers on the next preflight.
  //
  // Đoạn bậc là BẮT BUỘC, không phải tuỳ chọn: `resolveAutoname` ném lỗi khi một khoá trong
  // format rỗng, nên dòng giá không bậc vẫn phải mang `MOI-DIEN-TICH`. Bỏ đoạn này đi thì tên
  // payload lệch tên D1 đúng một đoạn — và lệch tên nghĩa là importer TẠO MỚI thay vì cập nhật.
  //
  // 558/558 dòng đang chạy trên D1 vẫn mang tên BỐN đoạn, và chúng KHÔNG được đổi tên (tên
  // `Item Price` nằm trên dòng bán nên guard tham chiếu của nền tảng từ chối). Chỗ nối hai dạng
  // tên là `scripts/lib/alumdoor-item-price-alias.mjs`: nó ghép tên cũ làm bí danh của tên chuẩn
  // để importer cập nhật TẠI CHỖ. Vì thế tên ở đây phải luôn là tên CHUẨN năm đoạn — phát tên
  // bốn đoạn cho "gọn" là làm hỏng cả lượt tạo dòng giá mới (nền tảng đặt tên năm đoạn, payload
  // chờ tên bốn đoạn, post-verify báo `missing_after_apply`).
  return clean(uom)
    ? `${base}:${clean(uom)}:${canonicalVariant}:${canonicalTier}`
    : `${base}:${canonicalVariant}:${canonicalTier}`;
}

function sourceLineage(row) {
  return {
    source_file: row.source_file,
    source_sheet: row.source_sheet,
    source_row: row.source_row,
    source_index: row.source_index,
    source_item_code: row.item_code,
    source_item_name: row.item_name,
    source_uom: row.source_uom,
    source_price: row.source_price,
    classification: row.classification,
    classification_reason: row.classification_reason,
    ...(row.parent_item_code ? { parent_item_code: row.parent_item_code } : {}),
    ...(row.source_parent_row ? { source_parent_row: row.source_parent_row } : {}),
  };
}

/**
 * Một dòng `Item Price`.
 *
 * `areaTier` mặc định là `MOI-DIEN-TICH` vì đó là hình dạng của 558/558 dòng giá đang chạy: giá
 * không phụ thuộc diện tích. Tham số này là chỗ để thang giá theo bậc đi vào đường ống — nguồn
 * `BANG-GIA-CHINH-THUC-31-07-2026 §3` là bảng 8 bậc × 7 cột, và trên D1 nó đang bị nhồi vào MÃ
 * HÀNG: 88 mã có hậu tố bậc (`…_TRONBO_4-5m²`), gộp lại chỉ còn 11 gốc mã / 7 thang giá khác
 * nhau. Không có tham số này thì đường ống không có cách nào phát ra 8 dòng giá cho một mã.
 */
function itemPriceDocument(item, rate, variant, lineage, areaTier = ALL_AREA_TIER) {
  const uom = clean(item.default_sales_uom) || clean(item.stock_uom);
  return {
    doctype: "Item Price",
    name: itemPriceName(ALUMDOOR_PRICE_LIST, item.item_code, uom, variant, areaTier),
    price_list: ALUMDOOR_PRICE_LIST,
    item_code: clean(item.item_code),
    uom,
    area_tier: clean(areaTier) || ALL_AREA_TIER,
    price_variant: variant,
    rate,
    currency: "VND",
    disabled: 0,
    _lineage: lineage,
  };
}

function pricingRuleDocument({ name, itemCode = "", itemGroup = "", amount, basis = "FIXED", conditions = [], priority = 500, exclusiveGroup = "", lineage }) {
  return {
    doctype: "Pricing Rule",
    name,
    // Pricing Rule declares title as required. The source rows carry no separate policy
    // label, so the canonical rule code is the title — it is the identifier the payload
    // already derives from the source and keeps the row traceable back to it.
    title: name,
    disabled: 0,
    price_list: ALUMDOOR_PRICE_LIST,
    currency: "VND",
    rule_level: "LINE",
    apply_on: itemCode ? "ITEM" : itemGroup ? "ITEM_GROUP" : "ALL",
    ...(itemCode ? { item_code: itemCode } : {}),
    ...(itemGroup ? { item_group: itemGroup } : {}),
    effect_type: "ADJUSTMENT",
    adjustment_basis: basis,
    adjustment_rate: amount,
    priority,
    exclusive_group: exclusiveGroup || `ALUMDOOR:${name}`,
    conditions: JSON.stringify(conditions),
    taxable: 1,
    discountable: 0,
    _lineage: lineage,
  };
}

function deductionVariant(row) {
  const semantic = fold(`${row.item_name} ${row.source_parent_name}`);
  const noController = semantic.includes("KHONG BO DIEU KHIEN") || semantic.includes("KHONGBDK");
  const noLac = semantic.includes("KHONG LAC") || semantic.includes("KHONGLAC");
  if (noController && noLac) return VARIANTS.MOTOR_NO_CONTROLLER_NO_LAC;
  if (noController) return VARIANTS.MOTOR_NO_CONTROLLER;
  if (noLac) return VARIANTS.MOTOR_NO_LAC;
  return "";
}

function motorFamilyTarget(row, item) {
  const semantic = fold(`${row.item_name} ${row.source_parent_name}`);
  // Khớp theo mã NGUỒN, không theo mã đang dùng: tiền tố `TP-MT-*` là cách bảng tính đặt mã, và
  // bảng tính thì không đổi. Khoá theo mã đang dùng thì mỗi đợt đổi mã lại làm luật này im lặng
  // ngừng khớp — im lặng, vì "không nhận ra motor nào" trông hệt như "đơn này không có motor".
  const code = clean(item.source_item_code_original) || clean(item.item_code);
  if (semantic.includes("TANKER_ALUMAX")) return /^(TP-MT-TANKER|TP-MT-ALUMAX)/i.test(code);
  if (semantic.includes("YHLD")) return /^TP-MT-YHLD/i.test(code);
  if (semantic.includes("JG")) return /^TP-MT-JG/i.test(code);
  return false;
}

function addUnique(map, doc, kind, blockers) {
  const previous = map.get(doc.name);
  if (!previous) return map.set(doc.name, doc);
  if (JSON.stringify(previous) !== JSON.stringify(doc)) blockers.push({ type: `conflicting_${kind}`, name: doc.name, first: previous, second: doc });
}

/**
 * `sealedTierTable` là BẢNG GIÁ CÓ MỘC (`BANG-GIA-CHINH-THUC-31-07-2026 §3`), nạp sẵn bởi bên
 * gọi vì hàm này đồng bộ còn việc đọc file thì bất đồng bộ.
 *
 * Truyền `null` = không áp thẩm quyền, giá giữ nguyên như `ĐM.md`. Đó là hành vi của mọi bản
 * trước, nên bỏ tham số không làm hỏng đường ống cũ — chỉ là không có ai đè giá.
 */
export function buildPricingPayload(pricingSourceFile, itemPayloadFile, sealedTierTable = null) {
  const sourceRows = Array.isArray(pricingSourceFile?.records) ? pricingSourceFile.records : [];
  const items = Array.isArray(itemPayloadFile?.items) ? itemPayloadFile.items : [];
  /**
   * Tra được bằng CẢ HAI mã: mã đang dùng và mã gốc trong bảng tính.
   *
   * Dòng giá đến từ bản trích nguồn nên mang mã theo bảng tính, còn danh sách mặt hàng đã được
   * dịch sang mã đang dùng. Chỉ khoá theo một bên thì 292 dòng giá báo `missing_canonical_item`
   * — đo được sau đợt đổi mã.
   *
   * Không dịch dòng giá: khoá thêm bí danh là một phép thêm, còn dịch là một phép SỬA, và sửa
   * bản trích nguồn thì mất đường truy về bảng tính.
   */
  const itemsByCode = new Map();
  for (const raw of items) {
    const item = { ...raw, item_code: clean(raw.item_code) };
    itemsByCode.set(item.item_code, item);
    const original = clean(raw.source_item_code_original);
    if (original && !itemsByCode.has(original)) itemsByCode.set(original, item);
  }
  const blockers = [];
  const resolutions = [];
  const baseByCode = new Map();
  const v5VariantRows = [];

  for (const row of sourceRows.filter((entry) => entry.classification === "BLOCKED")) blockers.push({ type: "source_blocked", row: sourceLineage(row) });
  for (const row of sourceRows.filter((entry) => entry.classification === "BASE_PRICE")) {
    const code = clean(row.item_code);
    const item = itemsByCode.get(code);
    if (!item) {
      blockers.push({ type: "missing_canonical_item", item_code: code, row: sourceLineage(row) });
      continue;
    }
    if (!truthy(item.is_sales_item) || disabled(item.disabled)) {
      blockers.push({ type: "item_not_sellable", item_code: code, row: sourceLineage(row) });
      continue;
    }
    const uom = clean(item.default_sales_uom) || clean(item.stock_uom);
    if (!uom) {
      blockers.push({ type: "missing_canonical_sales_uom", item_code: code, row: sourceLineage(row) });
      continue;
    }
    const rate = Number(row.source_price);
    if (!Number.isFinite(rate) || rate <= 0) {
      blockers.push({ type: "invalid_base_price", item_code: code, rate, row: sourceLineage(row) });
      continue;
    }
    // Khoá theo mã CANONICAL, không theo mã nguồn.
    //
    // `code` là mã trong bảng tính, còn `ensureVariant` bên dưới tra bằng `item.item_code` —
    // mã đang dùng. Trộn hai không gian khoá thì mọi biến thể motor báo `variant_target_missing
    // _base_price` dù giá gốc có đủ: đo được 179 dòng như vậy sau đợt đổi mã.
    const baseKey = clean(item.item_code);
    const prior = baseByCode.get(baseKey);
    if (!prior) {
      baseByCode.set(baseKey, { item, rate, uom, lineages: [sourceLineage(row)] });
      continue;
    }
    if (prior.rate === rate && prior.uom === uom) {
      prior.lineages.push(sourceLineage(row));
      resolutions.push({ type: "exact_duplicate_base_price", item_code: code, source_row: row.source_row, rate });
      continue;
    }
    const v5Pair = code === "NVL-V5_KEM_STD" && prior.uom === uom && [prior.rate, rate].every((value) => value === 75000 || value === 90000);
    if (v5Pair) {
      const incoming = sourceLineage(row);
      if (rate < prior.rate) {
        v5VariantRows.push({ rate: prior.rate, lineage: prior.lineages[0] });
        baseByCode.set(baseKey, { item, rate, uom, lineages: [incoming] });
      } else {
        v5VariantRows.push({ rate, lineage: incoming });
      }
      resolutions.push({ type: "explicit_price_variant", item_code: code, source_row: row.source_row, variant: VARIANTS.V5_STD });
      continue;
    }
    blockers.push({ type: "conflicting_base_price", item_code: code, first: prior.lineages, second: sourceLineage(row) });
  }

  const itemPrices = new Map();
  const pricingRules = new Map();
  for (const base of baseByCode.values()) addUnique(itemPrices, itemPriceDocument(base.item, base.rate, STANDARD_VARIANT, { source_rows: base.lineages }), "item_price", blockers);

  const ensureVariant = (itemCode, variant, lineage) => {
    // Nhận CẢ mã nguồn lẫn mã đang dùng: có chỗ gọi bằng mã bảng tính (`NVL-V5_KEM_STD`), có chỗ
    // gọi bằng mã canonical. Quy về một mối ngay tại đây thay vì bắt từng chỗ gọi tự nhớ.
    const resolvedItem = itemsByCode.get(clean(itemCode));
    const base = baseByCode.get(clean(resolvedItem?.item_code ?? itemCode));
    if (!base) {
      blockers.push({ type: "variant_target_missing_base_price", item_code: clean(itemCode), variant, lineage });
      return null;
    }
    const document = itemPriceDocument(base.item, base.rate, variant, { variant_source: lineage, base_source_rows: base.lineages });
    addUnique(itemPrices, document, "item_price", blockers);
    return document;
  };
  /**
   * Chính sách giá phải mang mã ĐANG DÙNG, giống dòng giá.
   *
   * Có chỗ gọi bằng mã bảng tính, có chỗ gọi bằng mã canonical. Để lẫn thì bộ kiểm báo
   * `rule_missing_variant_item_price`: chính sách trỏ vào một dòng giá mà theo mã của nó thì
   * không tồn tại — đo được 24 dòng như vậy. Quy về một mối tại đây, không bắt từng chỗ gọi nhớ.
   */
  const addRule = (rule) => {
    const source = clean(rule.itemCode);
    const canonical = itemsByCode.get(source)?.item_code;
    if (!canonical || canonical === source) return addUnique(pricingRules, pricingRuleDocument(rule), "pricing_rule", blockers);
    // TÊN cũng phải theo mã đang dùng, không chỉ trường mã.
    //
    // Tên chính sách là `ALUMDOOR-PR:{mã}:{biến thể}` — nối bằng dấu hai chấm. Chỉ sửa trường mã
    // mà để tên mang mã nguồn thì D1 (đã đổi tên theo mã mới) và payload gọi CÙNG MỘT luật bằng
    // hai tên: importer thấy 24 luật "thừa" ở D1 và 24 luật "mới" trong payload.
    //
    // Thay theo ĐOẠN, không thay chuỗi con — mã hàng không chứa dấu hai chấm nên phép này chắc.
    const rename = (value) => (typeof value === "string" && value.includes(":")
      ? value.split(":").map((part) => (part === source ? canonical : part)).join(":")
      : value);
    const normalized = {
      ...rule,
      itemCode: canonical,
      ...(rule.name ? { name: rename(rule.name) } : {}),
      ...(rule.exclusiveGroup ? { exclusiveGroup: rename(rule.exclusiveGroup) } : {}),
    };
    return addUnique(pricingRules, pricingRuleDocument(normalized), "pricing_rule", blockers);
  };
  const addGroupVariantPrices = (itemGroup, variant, lineage) => {
    let count = 0;
    for (const base of baseByCode.values()) {
      if (clean(base.item.item_group) !== itemGroup) continue;
      if (ensureVariant(base.item.item_code, variant, lineage)) count += 1;
    }
    if (count === 0) blockers.push({ type: "variant_group_has_no_base_prices", item_group: itemGroup, variant, lineage });
  };
  const addGroupVariantRule = (row, itemGroup, variant, threshold) => {
    const lineage = sourceLineage(row);
    addGroupVariantPrices(itemGroup, variant, lineage);
    addRule({
      name: `ALUMDOOR-PR:${clean(row.item_code)}`,
      itemGroup,
      amount: Number(row.source_price),
      basis: "FIXED",
      conditions: [condition("price_variant", "eq", variant), condition("base_amount", "lt", threshold)],
      lineage,
    });
  };

  for (const row of sourceRows.filter((entry) => entry.classification === "DEDUCTION")) {
    const variant = deductionVariant(row);
    const amount = Number(row.source_price);
    const targets = [...baseByCode.values()].filter(({ item }) => motorFamilyTarget(row, item));
    if (!variant || !Number.isFinite(amount) || amount >= 0 || targets.length === 0) {
      blockers.push({ type: "unresolved_deduction", variant, amount, row: sourceLineage(row) });
      continue;
    }
    for (const target of targets) {
      const lineage = sourceLineage(row);
      ensureVariant(target.item.item_code, variant, lineage);
      addRule({
        name: `ALUMDOOR-PR:${target.item.item_code}:${variant}`,
        itemCode: target.item.item_code,
        amount,
        basis: "PRICED_QTY",
        conditions: [condition("price_variant", "eq", variant)],
        exclusiveGroup: `ALUMDOOR-PRICE-VARIANT:${target.item.item_code}`,
        lineage,
      });
    }
  }

  for (const variantRow of v5VariantRows) {
    const base = baseByCode.get("NVL-V5_KEM_STD");
    if (!base) continue;
    ensureVariant("NVL-V5_KEM_STD", VARIANTS.V5_STD, variantRow.lineage);
    addRule({
      name: `ALUMDOOR-PR:NVL-V5_KEM_STD:${VARIANTS.V5_STD}`,
      itemCode: "NVL-V5_KEM_STD",
      amount: variantRow.rate - base.rate,
      basis: "PRICED_QTY",
      conditions: [condition("price_variant", "eq", VARIANTS.V5_STD)],
      exclusiveGroup: "ALUMDOOR-PRICE-VARIANT:NVL-V5_KEM_STD",
      lineage: variantRow.lineage,
    });
  }

  for (const row of sourceRows.filter((entry) => entry.classification === "SURCHARGE")) {
    const code = clean(row.item_code);
    const amount = Number(row.source_price);
    const lineage = sourceLineage(row);
    if (!Number.isFinite(amount) || amount <= 0) {
      blockers.push({ type: "invalid_surcharge", amount, row: lineage });
      continue;
    }
    if (code === "PHUTHU_SONRAY_MSK") {
      for (const itemCode of RAY_SURCHARGE_TARGETS) {
        ensureVariant(itemCode, VARIANTS.RAY_SON_MSK, lineage);
        addRule({ name: `ALUMDOOR-PR:${itemCode}:${VARIANTS.RAY_SON_MSK}`, itemCode, amount, basis: "PRICED_QTY", conditions: [condition("price_variant", "eq", VARIANTS.RAY_SON_MSK)], exclusiveGroup: `ALUMDOOR-PRICE-VARIANT:${itemCode}`, lineage });
      }
      continue;
    }
    if (fold(code) === fold("TP-Tanker-Alumax-Lac36")) {
      const itemCode = clean(row.parent_item_code);
      ensureVariant(itemCode, VARIANTS.MOTOR_LAC36, lineage);
      addRule({ name: `ALUMDOOR-PR:${itemCode}:${VARIANTS.MOTOR_LAC36}`, itemCode, amount, basis: "PRICED_QTY", conditions: [condition("price_variant", "eq", VARIANTS.MOTOR_LAC36)], exclusiveGroup: `ALUMDOOR-PRICE-VARIANT:${itemCode}`, lineage });
      continue;
    }
    if (code === "PHUTHUCHUYENDOICUAKT") {
      const itemCode = clean(row.parent_item_code);
      ensureVariant(itemCode, VARIANTS.HAND_PULL, lineage);
      addRule({ name: `ALUMDOOR-PR:${itemCode}:${VARIANTS.HAND_PULL}`, itemCode, amount, basis: "AREA_SQM", conditions: [condition("price_variant", "eq", VARIANTS.HAND_PULL)], exclusiveGroup: `ALUMDOOR-PRICE-VARIANT:${itemCode}`, lineage });
      continue;
    }
    if (code === "PHUTHU-DUC<8m²") {
      addRule({ name: "ALUMDOOR-PR:DUC-UNDER-8M2", itemGroup: "Cửa CN Đức", amount, basis: "SET_COUNT", conditions: [condition("billable_area_sqm", "lt", 8)], lineage });
      continue;
    }
    if (code === "PHUTHU-UC<7m²") {
      addRule({ name: "ALUMDOOR-PR:UC-UNDER-7M2", itemGroup: "Cửa tấm liền Úc", amount, basis: "SET_COUNT", conditions: [condition("billable_area_sqm", "lt", 7)], lineage });
      continue;
    }
    if (code === "PHUTHU-DAILOAN<8m²") {
      addRule({ name: "ALUMDOOR-PR:DAILOAN-UNDER-8M2", itemGroup: "Cửa Đài Loan", amount, basis: "SET_COUNT", conditions: [condition("billable_area_sqm", "lt", 8)], lineage });
      continue;
    }
    if (code === "PHUTHU-CUALUOI<8m²") {
      addRule({ name: "ALUMDOOR-PR:CUALUOI-UNDER-8M2", itemGroup: "Cửa Lưới", amount, basis: "SET_COUNT", conditions: [condition("billable_area_sqm", "lt", 8)], lineage });
      continue;
    }
    if (code === "PHUTHU-DUC-PK<5tr") {
      addGroupVariantRule(row, "Phụ kiện chung", VARIANTS.DUC_ACCESSORY_MIN, 5_000_000);
      continue;
    }
    if (code === "PHUTHU-UC-PK<5tr") {
      addGroupVariantRule(row, "Phụ kiện chung", VARIANTS.UC_ACCESSORY_MIN, 5_000_000);
      continue;
    }
    if (code === "PHUTHU-DAILOAN-PK<3tr") {
      addGroupVariantRule(row, "Phụ kiện chung", VARIANTS.DAILOAN_ACCESSORY_MIN, 3_000_000);
      continue;
    }
    if (code === "PHUTHU-CUALUOI<3tr") {
      addGroupVariantRule(row, "Cửa Lưới", VARIANTS.CUALUOI_MIN, 3_000_000);
      continue;
    }
    if (code === "PHUTHU-SVG-LADUC") {
      addGroupVariantPrices("Cửa CN Đức", VARIANTS.DUC_WOODGRAIN, lineage);
      addRule({ name: "ALUMDOOR-PR:DUC-WOODGRAIN-SLAT", itemGroup: "Cửa CN Đức", amount, basis: "AREA_SQM", conditions: [condition("price_variant", "eq", VARIANTS.DUC_WOODGRAIN)], lineage });
      continue;
    }
    blockers.push({ type: "unresolved_surcharge", row: lineage });
  }

  /**
   * THẨM QUYỀN GIÁ: bảng có mộc thắng `ĐM.md`.
   *
   * Chủ xưởng chốt 2026-08-20. Chạy TRƯỚC phép kiểm `rate > 0` để giá bị đè cũng phải qua cổng
   * đó — đè xong mới kiểm, chứ không kiểm giá cũ rồi thay bằng giá chưa kiểm.
   *
   * Đo trên ảnh chụp D1: bảng phủ 88 dòng giá, 84 dòng KHỚP SẴN, đúng 4 dòng bị đè — cả 4 đều
   * là `TP-TOLEKEM124_8D` ở bốn bậc đắt nhất. Không có thiệt hại phụ.
   */
  const sealed = applySealedPriceAuthority([...itemPrices.values()], sealedTierTable);
  if (sealed.report.applied) {
    itemPrices.clear();
    for (const row of sealed.item_prices) itemPrices.set(row.name, row);
    console.log(
      `ALUMDOOR_SEALED_PRICE_AUTHORITY covered=${sealed.report.covered_row_count} ` +
        `confirmed=${sealed.report.confirmed_count} overridden=${sealed.report.override_count} ` +
        `source=${JSON.stringify(SEALED_PRICE_SOURCE)}`,
    );
  }

  for (const row of itemPrices.values()) if (!(Number(row.rate) > 0)) blockers.push({ type: "non_positive_item_price", name: row.name, rate: row.rate });
  const payload = {
    format: "alumdoor-pricing-payload/v1",
    managed_price_list: ALUMDOOR_PRICE_LIST,
    source_file: pricingSourceFile?.source_file || "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
    // Alumdoor's Price List schema is not ERPNext's: it has no selling/buying flags
    // (a list's audience is expressed by customer_group), and effective_date is required.
    price_list: { doctype: "Price List", name: ALUMDOOR_PRICE_LIST, price_list_name: ALUMDOOR_PRICE_LIST, effective_date: "2026-01-01", currency: "VND", disabled: 0 },
    item_prices: stableSort(itemPrices.values()),
    pricing_rules: stableSort(pricingRules.values()),
    source_summary: {
      priced_rows: sourceRows.length,
      base_price_rows: sourceRows.filter((row) => row.classification === "BASE_PRICE").length,
      surcharge_rows: sourceRows.filter((row) => row.classification === "SURCHARGE").length,
      deduction_rows: sourceRows.filter((row) => row.classification === "DEDUCTION").length,
      non_pricing_rows: sourceRows.filter((row) => row.classification === "NON_PRICING").length,
      blocked_rows: sourceRows.filter((row) => row.classification === "BLOCKED").length,
    },
  };
  const report = {
    format: "alumdoor-pricing-payload-report/v1",
    managed_price_list: ALUMDOOR_PRICE_LIST,
    source_summary: payload.source_summary,
    canonical_item_count: items.length,
    base_item_price_count: [...itemPrices.values()].filter((row) => row.price_variant === STANDARD_VARIANT).length,
    variant_item_price_count: [...itemPrices.values()].filter((row) => row.price_variant !== STANDARD_VARIANT).length,
    item_price_count: itemPrices.size,
    sealed_price_authority: sealed.report,
    pricing_rule_count: pricingRules.size,
    resolution_count: resolutions.length,
    resolutions,
    blocker_count: blockers.length,
    blockers,
  };
  return { payload, report };
}

export function payloadFingerprint(payload) { return JSON.stringify(payload); }

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [sourceArg, itemArg, outputArg, reportArg] = process.argv.slice(2);
  if (!sourceArg || !itemArg || !outputArg || !reportArg) throw new Error("Usage: node build-alumdoor-pricing-payload.mjs <pricing-source.json> <item-payload.json> <pricing-payload.json> <report.json>");
  const [pricingSourceFile, itemPayloadFile] = await Promise.all([readFile(resolve(sourceArg), "utf8").then(JSON.parse), readFile(resolve(itemArg), "utf8").then(JSON.parse)]);
  /**
   * Nạp bảng giá có mộc từ gốc repo, không từ cwd — bộ dựng này được gọi từ nhiều thư mục khác
   * nhau (pricing-adapter, bom-adapter, seed-full.sh). Neo theo cwd thì có adapter im lặng chạy
   * KHÔNG có thẩm quyền giá, và giá lệch chỉ lộ ra ở đơn hàng thật.
   */
  const sealedTierTable = await loadSealedTierTable(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."));
  if (!sealedTierTable) console.log("ALUMDOOR_SEALED_PRICE_AUTHORITY skipped=no-source");
  const { payload, report } = buildPricingPayload(pricingSourceFile, itemPayloadFile, sealedTierTable);
  await mkdir(dirname(resolve(outputArg)), { recursive: true });
  await writeFile(resolve(outputArg), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(resolve(reportArg), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`ALUMDOOR_PRICING_PAYLOAD_BUILT base=${report.base_item_price_count} variants=${report.variant_item_price_count} item_prices=${report.item_price_count} rules=${report.pricing_rule_count} blocked=${report.blocker_count}`);
  console.log(`ALUMDOOR_PRICING_PAYLOAD_OUTPUT ${resolve(outputArg)}`);
  console.log(`ALUMDOOR_PRICING_PAYLOAD_REPORT ${resolve(reportArg)}`);
  if (report.blocker_count > 0) {
    console.error(JSON.stringify({ blockers: report.blockers }, null, 2));
    process.exitCode = 1;
  }
}
