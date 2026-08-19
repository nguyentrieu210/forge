#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [sourceArg, payloadArg, reportArg] = process.argv.slice(2);
if (!sourceArg || !payloadArg || !reportArg) throw new Error("Usage: node validate-alumdoor-pricing-payload.mjs <pricing-source.json> <pricing-payload.json> <pricing-report.json>");
const [source, payload, report] = await Promise.all([
  readFile(resolve(sourceArg), "utf8").then(JSON.parse),
  readFile(resolve(payloadArg), "utf8").then(JSON.parse),
  readFile(resolve(reportArg), "utf8").then(JSON.parse),
]);
const rows = Array.isArray(source.records) ? source.records : [];
const prices = Array.isArray(payload.item_prices) ? payload.item_prices : [];
const rules = Array.isArray(payload.pricing_rules) ? payload.pricing_rules : [];
const failures = [];
const clean = (value) => String(value ?? "").normalize("NFC").trim();
const sourceRowNumber = (value) => Number(value ?? -1);
const parseConditions = (row) => {
  try {
    const value = typeof row.conditions === "string" ? JSON.parse(row.conditions) : row.conditions;
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const lineageRows = (lineage) => {
  const out = [];
  if (Number.isFinite(Number(lineage?.source_row))) out.push(Number(lineage.source_row));
  for (const row of Array.isArray(lineage?.source_rows) ? lineage.source_rows : []) if (Number.isFinite(Number(row?.source_row))) out.push(Number(row.source_row));
  for (const row of Array.isArray(lineage?.base_source_rows) ? lineage.base_source_rows : []) if (Number.isFinite(Number(row?.source_row))) out.push(Number(row.source_row));
  if (Number.isFinite(Number(lineage?.variant_source?.source_row))) out.push(Number(lineage.variant_source.source_row));
  return out;
};

if (report.blocker_count !== 0) failures.push({ type: "payload_blockers", blocker_count: report.blocker_count, blockers: report.blockers });
if (rows.some((row) => row.classification === "BLOCKED")) failures.push({ type: "source_blocked_rows" });
if (prices.some((row) => !(Number(row.rate) > 0))) failures.push({ type: "non_positive_item_price" });
if (prices.some((row) => clean(row.item_code).startsWith("TRU-") || clean(row.item_code).startsWith("PHUTHU"))) failures.push({ type: "pseudo_adjustment_leaked_into_item_price" });

const ALL_AREA_TIER = "MOI-DIEN-TICH";
const priceNames = new Set();
for (const row of prices) {
  const name = clean(row.name);
  if (!name || priceNames.has(name)) failures.push({ type: "duplicate_item_price_identity", name });
  priceNames.add(name);
  // Bậc phải có giá trị: `resolveAutoname` từ chối tạo bản ghi khi một khoá trong `format:` rỗng,
  // nên dòng giá bỏ trống bậc là dòng giá KHÔNG TẠO ĐƯỢC — bắt ở đây, đừng để tới lượt ghi.
  const tier = clean(row.area_tier);
  if (!tier) failures.push({ type: "item_price_missing_area_tier", name });
  // Tên và trường phải nói cùng một chuyện. Lệch nhau thì lần chạy sau tính ra tên khác rồi TẠO
  // MỚI thay vì cập nhật — cùng một mặt hàng có hai dòng giá bật, và pricing ném "Multiple
  // active Item Price records match" đúng lúc đang bán.
  else if (!name.endsWith(`:${tier}`)) failures.push({ type: "item_price_name_tier_mismatch", name, area_tier: tier });
}

/**
 * Một mặt hàng KHÔNG được vừa có giá phẳng vừa có thang bậc.
 *
 * `MOI-DIEN-TICH` khớp mọi diện tích, còn dòng có bậc khớp đúng bậc của nó. Để cả hai cùng bật
 * trên một (bảng giá, mã hàng, ĐVT, biến thể) thì mọi đơn rơi vào bậc đó có HAI dòng giá khớp,
 * và `resolveServerPrice` ném "Multiple active Item Price records match" — thang giá vừa dựng
 * lại làm chết chính nó. Đây là cái bẫy của đợt gộp 88 mã: nếu payload vừa giữ dòng phẳng của mã
 * cũ vừa phát 8 dòng bậc cho mã mới thì không lộ ra ở đâu khác ngoài lúc bán.
 */
const tierGroups = new Map();
for (const row of prices) {
  // Khoá gom bằng JSON chứ không nối chuỗi: mã hàng CÓ dấu cách (`TP-CUADL1LY XN-VK`,
  // `TP-RAY HỘP TD U100`), nối bằng dấu cách rồi tách lại là gom nhầm nhóm.
  const key = JSON.stringify([clean(row.price_list), clean(row.item_code), clean(row.uom), clean(row.price_variant)]);
  if (!tierGroups.has(key)) tierGroups.set(key, []);
  tierGroups.get(key).push(row);
}
for (const [key, group] of tierGroups) {
  const flat = group.filter((row) => clean(row.area_tier) === ALL_AREA_TIER);
  const tiered = group.filter((row) => clean(row.area_tier) && clean(row.area_tier) !== ALL_AREA_TIER);
  if (flat.length > 0 && tiered.length > 0) {
    const [price_list, item_code, uom, price_variant] = JSON.parse(key);
    failures.push({
      type: "item_price_flat_and_tiered_overlap",
      price_list, item_code, uom, price_variant,
      flat: flat.map((row) => row.name),
      tiered: tiered.map((row) => row.name),
    });
  }
}
const ruleNames = new Set();
for (const row of rules) {
  const name = clean(row.name);
  if (!name || ruleNames.has(name)) failures.push({ type: "duplicate_rule_identity", name });
  ruleNames.add(name);
  if (clean(row.effect_type) !== "ADJUSTMENT") failures.push({ type: "wrong_rule_effect", name, effect_type: row.effect_type });
  if (!Number.isFinite(Number(row.adjustment_rate)) || Number(row.adjustment_rate) === 0) failures.push({ type: "zero_rule_adjustment", name });
  if (!clean(row.item_code) && !clean(row.item_group)) failures.push({ type: "unscoped_rule", name });
  const conditions = parseConditions(row);
  const variantCondition = conditions.find((entry) => entry?.field === "price_variant" && entry?.operator === "eq" && clean(entry?.value));
  if (variantCondition) {
    const variant = clean(variantCondition.value);
    const matchingPrices = prices.filter((price) => clean(price.price_variant) === variant && (!clean(row.item_code) || clean(price.item_code) === clean(row.item_code)));
    if (matchingPrices.length === 0) failures.push({ type: "rule_missing_variant_item_price", name, variant, item_code: row.item_code, item_group: row.item_group });
  }
  const classification = clean(row?._lineage?.classification);
  if (classification === "DEDUCTION" && !(Number(row.adjustment_rate) < 0)) failures.push({ type: "deduction_rule_not_negative", name });
  if (classification === "SURCHARGE" && !(Number(row.adjustment_rate) > 0)) failures.push({ type: "surcharge_rule_not_positive", name });
}

const materializedSourceRows = new Set();
for (const row of prices) for (const sourceRow of lineageRows(row._lineage)) materializedSourceRows.add(sourceRow);
for (const row of rules) for (const sourceRow of lineageRows(row._lineage)) materializedSourceRows.add(sourceRow);

for (const sourceRow of rows.filter((row) => row.classification === "BASE_PRICE")) {
  if (!materializedSourceRows.has(sourceRowNumber(sourceRow.source_row))) failures.push({ type: "base_source_row_not_materialized", source_row: sourceRow.source_row, item_code: sourceRow.item_code });
}
for (const sourceRow of rows.filter((row) => row.classification === "DEDUCTION" || row.classification === "SURCHARGE")) {
  const matchingRules = rules.filter((rule) => lineageRows(rule._lineage).includes(sourceRowNumber(sourceRow.source_row)));
  if (matchingRules.length === 0) {
    failures.push({ type: "adjustment_source_row_not_materialized", source_row: sourceRow.source_row, item_code: sourceRow.item_code });
    continue;
  }
  for (const rule of matchingRules) {
    if (Number(rule.adjustment_rate) !== Number(sourceRow.source_price)) failures.push({ type: "adjustment_amount_mismatch", source_row: sourceRow.source_row, rule: rule.name, source_price: sourceRow.source_price, rule_rate: rule.adjustment_rate });
  }
}
for (const sourceRow of rows.filter((row) => row.classification === "NON_PRICING")) {
  if (materializedSourceRows.has(sourceRowNumber(sourceRow.source_row))) failures.push({ type: "non_pricing_row_materialized", source_row: sourceRow.source_row, item_code: sourceRow.item_code });
}

const expectedSummary = {
  priced_rows: rows.length,
  base_price_rows: rows.filter((row) => row.classification === "BASE_PRICE").length,
  surcharge_rows: rows.filter((row) => row.classification === "SURCHARGE").length,
  deduction_rows: rows.filter((row) => row.classification === "DEDUCTION").length,
  non_pricing_rows: rows.filter((row) => row.classification === "NON_PRICING").length,
  blocked_rows: rows.filter((row) => row.classification === "BLOCKED").length,
};
for (const [field, value] of Object.entries(expectedSummary)) if (Number(payload?.source_summary?.[field]) !== value) failures.push({ type: "source_summary_mismatch", field, expected: value, actual: payload?.source_summary?.[field] });

const standardPrices = prices.filter((row) => clean(row.price_variant) === "STANDARD");
const variantPrices = prices.filter((row) => clean(row.price_variant) !== "STANDARD");
if (standardPrices.length !== report.base_item_price_count) failures.push({ type: "base_count_mismatch" });
if (variantPrices.length !== report.variant_item_price_count) failures.push({ type: "variant_count_mismatch" });
if (prices.length !== report.item_price_count) failures.push({ type: "price_count_mismatch" });
if (rules.length !== report.pricing_rule_count) failures.push({ type: "rule_count_mismatch" });

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  throw new Error(`ALUMDOOR_PRICING_PAYLOAD_VALIDATION_FAILED count=${failures.length}`);
}
console.log(`ALUMDOOR_PRICING_PAYLOAD_VALIDATION_PASS source_rows=${rows.length} base=${standardPrices.length} variants=${variantPrices.length} rules=${rules.length} non_pricing=${expectedSummary.non_pricing_rows} blockers=0`);
