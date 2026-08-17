#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function itemPriceName(priceList, itemCode, uom, variant = STANDARD_VARIANT) {
  const base = `${clean(priceList)}:${clean(itemCode)}`;
  const canonicalVariant = clean(variant).toUpperCase() || STANDARD_VARIANT;
  if (canonicalVariant === STANDARD_VARIANT) return clean(uom) ? `${base}:${clean(uom)}` : base;
  return clean(uom) ? `${base}:${clean(uom)}:${canonicalVariant}` : `${base}:${canonicalVariant}`;
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

function itemPriceDocument(item, rate, variant, lineage) {
  const uom = clean(item.default_sales_uom) || clean(item.stock_uom);
  return {
    doctype: "Item Price",
    name: itemPriceName(ALUMDOOR_PRICE_LIST, item.item_code, uom, variant),
    price_list: ALUMDOOR_PRICE_LIST,
    item_code: clean(item.item_code),
    uom,
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
  if (semantic.includes("TANKER_ALUMAX")) return /^(TP-MT-TANKER|TP-MT-ALUMAX)/i.test(item.item_code);
  if (semantic.includes("YHLD")) return /^TP-MT-YHLD/i.test(item.item_code);
  if (semantic.includes("JG")) return /^TP-MT-JG/i.test(item.item_code);
  return false;
}

function addUnique(map, doc, kind, blockers) {
  const previous = map.get(doc.name);
  if (!previous) return map.set(doc.name, doc);
  if (JSON.stringify(previous) !== JSON.stringify(doc)) blockers.push({ type: `conflicting_${kind}`, name: doc.name, first: previous, second: doc });
}

export function buildPricingPayload(pricingSourceFile, itemPayloadFile) {
  const sourceRows = Array.isArray(pricingSourceFile?.records) ? pricingSourceFile.records : [];
  const items = Array.isArray(itemPayloadFile?.items) ? itemPayloadFile.items : [];
  const itemsByCode = new Map(items.map((item) => [clean(item.item_code), { ...item, item_code: clean(item.item_code) }]));
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
    const prior = baseByCode.get(code);
    if (!prior) {
      baseByCode.set(code, { item, rate, uom, lineages: [sourceLineage(row)] });
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
        baseByCode.set(code, { item, rate, uom, lineages: [incoming] });
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
    const base = baseByCode.get(clean(itemCode));
    if (!base) {
      blockers.push({ type: "variant_target_missing_base_price", item_code: clean(itemCode), variant, lineage });
      return null;
    }
    const document = itemPriceDocument(base.item, base.rate, variant, { variant_source: lineage, base_source_rows: base.lineages });
    addUnique(itemPrices, document, "item_price", blockers);
    return document;
  };
  const addRule = (rule) => addUnique(pricingRules, pricingRuleDocument(rule), "pricing_rule", blockers);
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

  for (const row of itemPrices.values()) if (!(Number(row.rate) > 0)) blockers.push({ type: "non_positive_item_price", name: row.name, rate: row.rate });
  const payload = {
    format: "alumdoor-pricing-payload/v1",
    managed_price_list: ALUMDOOR_PRICE_LIST,
    source_file: pricingSourceFile?.source_file || "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
    price_list: { doctype: "Price List", name: ALUMDOOR_PRICE_LIST, price_list_name: ALUMDOOR_PRICE_LIST, currency: "VND", selling: 1, buying: 0, disabled: 0 },
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
  const { payload, report } = buildPricingPayload(pricingSourceFile, itemPayloadFile);
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
