#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const [sourceArg, payloadArg, reportArg] = process.argv.slice(2);
if (!sourceArg || !payloadArg || !reportArg) {
  throw new Error("Usage: node validate-alumdoor-pricing-payload.mjs <pricing-source.json> <pricing-payload.json> <pricing-report.json>");
}
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

if (report.blocker_count !== 0) failures.push({ type: "payload_blockers", blocker_count: report.blocker_count, blockers: report.blockers });
if (rows.some((row) => row.classification === "BLOCKED")) failures.push({ type: "source_blocked_rows" });
if (prices.some((row) => !(Number(row.rate) > 0))) failures.push({ type: "non_positive_item_price" });
if (prices.some((row) => clean(row.item_code).startsWith("TRU-") || clean(row.item_code).startsWith("PHUTHU"))) {
  failures.push({ type: "pseudo_adjustment_leaked_into_item_price" });
}

const priceNames = new Set();
for (const row of prices) {
  if (!clean(row.name) || priceNames.has(clean(row.name))) failures.push({ type: "duplicate_item_price_identity", name: row.name });
  priceNames.add(clean(row.name));
}
const ruleNames = new Set();
for (const row of rules) {
  if (!clean(row.name) || ruleNames.has(clean(row.name))) failures.push({ type: "duplicate_rule_identity", name: row.name });
  ruleNames.add(clean(row.name));
  if (clean(row.effect_type) !== "ADJUSTMENT") failures.push({ type: "wrong_rule_effect", name: row.name, effect_type: row.effect_type });
  if (!Number.isFinite(Number(row.adjustment_rate)) || Number(row.adjustment_rate) === 0) failures.push({ type: "zero_rule_adjustment", name: row.name });
  let conditions = [];
  try { conditions = typeof row.conditions === "string" ? JSON.parse(row.conditions) : row.conditions; } catch {}
  if (!Array.isArray(conditions) || !conditions.some((condition) => condition?.field === "price_variant" && condition?.operator === "eq")) {
    failures.push({ type: "rule_missing_price_variant_condition", name: row.name });
  }
  const variantPriceName = prices.find((price) => clean(price.item_code) === clean(row.item_code) && clean(price.price_variant) === clean(conditions?.find((condition) => condition?.field === "price_variant")?.value))?.name;
  if (!variantPriceName) failures.push({ type: "rule_missing_variant_item_price", name: row.name, item_code: row.item_code });
}

for (const sourceRow of rows.filter((row) => row.classification === "DEDUCTION" || row.classification === "SURCHARGE")) {
  const matchingRules = rules.filter((rule) => Number(rule?._lineage?.source_row) === Number(sourceRow.source_row));
  if (matchingRules.length === 0) {
    failures.push({ type: "adjustment_source_row_not_materialized", source_row: sourceRow.source_row, item_code: sourceRow.item_code });
    continue;
  }
  for (const rule of matchingRules) {
    if (Number(rule.adjustment_rate) !== Number(sourceRow.source_price)) {
      failures.push({ type: "adjustment_amount_mismatch", source_row: sourceRow.source_row, rule: rule.name, source_price: sourceRow.source_price, rule_rate: rule.adjustment_rate });
    }
  }
}

for (const sourceRow of rows.filter((row) => row.classification === "NON_PRICING")) {
  if (prices.some((price) => clean(price.item_code) === clean(sourceRow.item_code) && price?._lineage?.source_row === sourceRow.source_row)) {
    failures.push({ type: "non_pricing_row_materialized", source_row: sourceRow.source_row, item_code: sourceRow.item_code });
  }
}

const standardPrices = prices.filter((row) => clean(row.price_variant) === "STANDARD");
const variantPrices = prices.filter((row) => clean(row.price_variant) !== "STANDARD");
if (standardPrices.length !== report.base_item_price_count) failures.push({ type: "base_count_mismatch" });
if (variantPrices.length !== report.variant_item_price_count) failures.push({ type: "variant_count_mismatch" });
if (prices.length !== report.item_price_count) failures.push({ type: "price_count_mismatch" });
if (rules.length !== report.pricing_rule_count) failures.push({ type: "rule_count_mismatch" });
if (variantPrices.length !== rules.length) failures.push({ type: "variant_rule_cardinality_mismatch", variants: variantPrices.length, rules: rules.length });

if (failures.length > 0) {
  console.error(JSON.stringify({ failures }, null, 2));
  throw new Error(`ALUMDOOR_PRICING_PAYLOAD_VALIDATION_FAILED count=${failures.length}`);
}
console.log(
  `ALUMDOOR_PRICING_PAYLOAD_VALIDATION_PASS source_rows=${rows.length} base=${standardPrices.length} variants=${variantPrices.length} rules=${rules.length} non_pricing=${rows.filter((row) => row.classification === "NON_PRICING").length}`,
);
