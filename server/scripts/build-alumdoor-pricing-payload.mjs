#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const ALUMDOOR_PRICE_LIST = "ALUMDOOR-SELLING";
export const STANDARD_VARIANT = "STANDARD";
export const VARIANTS = Object.freeze({
  MOTOR_NO_LAC: "ALUMDOOR_MOTOR_NO_LAC",
  MOTOR_NO_CONTROLLER: "ALUMDOOR_MOTOR_NO_CONTROLLER",
  MOTOR_NO_CONTROLLER_NO_LAC: "ALUMDOOR_MOTOR_NO_CONTROLLER_NO_LAC",
  MOTOR_LAC36: "ALUMDOOR_MOTOR_LAC36",
  RAY_SON_MSK: "ALUMDOOR_RAY_SON_MSK",
});

const RAY_SURCHARGE_TARGETS = Object.freeze([
  "TP-RAYHOP",
  "TP-TD87A1 GS",
  "TP-RAY HỘP TD U100",
  "TP-RAYNHOMUC",
]);

const clean = (value) => String(value ?? "").normalize("NFC").trim();
const fold = (value) => clean(value)
  .normalize("NFD")
  .replace(/\p{M}/gu, "")
  .toLocaleUpperCase("vi")
  .replace(/[Đ]/g, "D");
const truthy = (value) => value === true || value === 1 || value === "1";
const disabled = (value) => truthy(value) || ["true", "yes", "có", "co"].includes(clean(value).toLocaleLowerCase("vi"));

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

function itemPriceDocument(item, rate, variant = STANDARD_VARIANT) {
  const uom = clean(item.default_sales_uom) || clean(item.stock_uom);
  const name = itemPriceName(ALUMDOOR_PRICE_LIST, item.item_code, uom, variant);
  return {
    doctype: "Item Price",
    name,
    price_list: ALUMDOOR_PRICE_LIST,
    item_code: clean(item.item_code),
    uom,
    price_variant: variant,
    rate,
    currency: "VND",
    disabled: 0,
  };
}

function ruleName(itemCode, variant) {
  return `ALUMDOOR-PR:${clean(itemCode)}:${clean(variant)}`;
}

function adjustmentRule(itemCode, variant, amount, lineage) {
  return {
    doctype: "Pricing Rule",
    name: ruleName(itemCode, variant),
    disabled: 0,
    price_list: ALUMDOOR_PRICE_LIST,
    currency: "VND",
    rule_level: "LINE",
    apply_on: "ITEM",
    item_code: clean(itemCode),
    effect_type: "ADJUSTMENT",
    adjustment_basis: "PRICED_QTY",
    adjustment_rate: amount,
    priority: 500,
    exclusive_group: `ALUMDOOR-PRICE-VARIANT:${clean(itemCode)}`,
    conditions: JSON.stringify([{ field: "price_variant", operator: "eq", value: variant }]),
    taxable: 1,
    discountable: 0,
    _lineage: lineage,
  };
}

function motorFamilyTarget(row, item) {
  const semantic = fold(`${row.item_name} ${row.source_parent_name}`);
  if (semantic.includes("TANKER_ALUMAX")) return /^(TP-MT-TANKER|TP-MT-ALUMAX)/i.test(item.item_code);
  if (semantic.includes("YHLD")) return /^TP-MT-YHLD/i.test(item.item_code);
  if (semantic.includes("JG")) return /^TP-MT-JG/i.test(item.item_code);
  return false;
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

function stableSort(rows) {
  return [...rows].sort((a, b) => clean(a.name).localeCompare(clean(b.name), "vi"));
}

function addUnique(map, doc, kind, blockers) {
  const previous = map.get(doc.name);
  if (!previous) {
    map.set(doc.name, doc);
    return;
  }
  if (JSON.stringify(previous) !== JSON.stringify(doc)) {
    blockers.push({ type: `conflicting_${kind}`, name: doc.name, first: previous, second: doc });
  }
}

export function buildPricingPayload(pricingSourceFile, itemPayloadFile) {
  const sourceRows = Array.isArray(pricingSourceFile?.records) ? pricingSourceFile.records : [];
  const items = Array.isArray(itemPayloadFile?.items) ? itemPayloadFile.items : [];
  const itemsByCode = new Map(items.map((item) => [clean(item.item_code), { ...item, item_code: clean(item.item_code) }]));
  const blockers = [];
  const baseByCode = new Map();
  const sourceBlocked = sourceRows.filter((row) => row.classification === "BLOCKED");
  blockers.push(...sourceBlocked.map((row) => ({ type: "source_blocked", row: sourceLineage(row) })));

  for (const row of sourceRows.filter((entry) => entry.classification === "BASE_PRICE")) {
    const code = clean(row.item_code);
    const item = itemsByCode.get(code);
    if (!item) {
      blockers.push({ type: "missing_canonical_item", row: sourceLineage(row), item_code: code });
      continue;
    }
    if (!truthy(item.is_sales_item) || disabled(item.disabled)) {
      blockers.push({ type: "item_not_sellable", row: sourceLineage(row), item_code: code });
      continue;
    }
    const uom = clean(item.default_sales_uom) || clean(item.stock_uom);
    if (!uom) {
      blockers.push({ type: "missing_canonical_sales_uom", row: sourceLineage(row), item_code: code });
      continue;
    }
    const rate = Number(row.source_price);
    if (!Number.isFinite(rate) || rate <= 0) {
      blockers.push({ type: "invalid_base_price", row: sourceLineage(row), item_code: code, rate });
      continue;
    }
    const candidate = { item, rate, lineage: sourceLineage(row) };
    const prior = baseByCode.get(code);
    if (prior && (prior.rate !== rate || (clean(prior.item.default_sales_uom) || clean(prior.item.stock_uom)) !== uom)) {
      blockers.push({ type: "conflicting_base_price", item_code: code, first: prior.lineage, second: candidate.lineage });
      continue;
    }
    if (!prior) baseByCode.set(code, candidate);
  }

  const itemPrices = new Map();
  const pricingRules = new Map();
  for (const { item, rate, lineage } of baseByCode.values()) {
    const document = itemPriceDocument(item, rate, STANDARD_VARIANT);
    addUnique(itemPrices, { ...document, _lineage: lineage }, "item_price", blockers);
  }

  const ensureVariant = (itemCode, variant, amount, lineage) => {
    const base = baseByCode.get(clean(itemCode));
    if (!base) {
      blockers.push({ type: "variant_target_missing_base_price", item_code: clean(itemCode), variant, lineage });
      return;
    }
    const variantPrice = { ...itemPriceDocument(base.item, base.rate, variant), _lineage: lineage };
    addUnique(itemPrices, variantPrice, "item_price", blockers);
    addUnique(pricingRules, adjustmentRule(base.item.item_code, variant, amount, lineage), "pricing_rule", blockers);
  };

  for (const row of sourceRows.filter((entry) => entry.classification === "DEDUCTION")) {
    const amount = Number(row.source_price);
    const variant = deductionVariant(row);
    if (!Number.isFinite(amount) || amount >= 0 || !variant) {
      blockers.push({ type: "unresolved_deduction", row: sourceLineage(row), variant, amount });
      continue;
    }
    const targets = [...baseByCode.values()].filter(({ item }) => motorFamilyTarget(row, item));
    if (targets.length === 0) {
      blockers.push({ type: "deduction_family_has_no_targets", row: sourceLineage(row), variant });
      continue;
    }
    for (const target of targets) ensureVariant(target.item.item_code, variant, amount, sourceLineage(row));
  }

  for (const row of sourceRows.filter((entry) => entry.classification === "SURCHARGE")) {
    const amount = Number(row.source_price);
    const code = clean(row.item_code);
    if (!Number.isFinite(amount) || amount <= 0) {
      blockers.push({ type: "invalid_surcharge", row: sourceLineage(row), amount });
      continue;
    }
    if (code === "PHUTHU_SONRAY_MSK") {
      for (const itemCode of RAY_SURCHARGE_TARGETS) {
        ensureVariant(itemCode, VARIANTS.RAY_SON_MSK, amount, sourceLineage(row));
      }
      continue;
    }
    if (fold(code) === fold("TP-Tanker-Alumax-Lac36")) {
      const parent = clean(row.parent_item_code);
      if (!parent) {
        blockers.push({ type: "lac36_missing_parent_context", row: sourceLineage(row) });
        continue;
      }
      ensureVariant(parent, VARIANTS.MOTOR_LAC36, amount, sourceLineage(row));
      continue;
    }
    blockers.push({ type: "unresolved_surcharge", row: sourceLineage(row) });
  }

  for (const record of itemPrices.values()) {
    if (!(Number(record.rate) > 0)) blockers.push({ type: "non_positive_item_price", name: record.name, rate: record.rate });
  }

  const priceList = {
    doctype: "Price List",
    name: ALUMDOOR_PRICE_LIST,
    price_list_name: ALUMDOOR_PRICE_LIST,
    currency: "VND",
    selling: 1,
    buying: 0,
    disabled: 0,
  };
  const payload = {
    format: "alumdoor-pricing-payload/v1",
    managed_price_list: ALUMDOOR_PRICE_LIST,
    source_file: pricingSourceFile?.source_file || "apps/alumdoor/docs/nguon/ms-lien/ĐM.md",
    price_list: priceList,
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
    blocker_count: blockers.length,
    blockers,
  };
  return { payload, report };
}

export function payloadFingerprint(payload) {
  return JSON.stringify(payload);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [sourceArg, itemArg, outputArg, reportArg] = process.argv.slice(2);
  if (!sourceArg || !itemArg || !outputArg || !reportArg) {
    throw new Error("Usage: node build-alumdoor-pricing-payload.mjs <pricing-source.json> <item-payload.json> <pricing-payload.json> <report.json>");
  }
  const [pricingSourceFile, itemPayloadFile] = await Promise.all([
    readFile(resolve(sourceArg), "utf8").then(JSON.parse),
    readFile(resolve(itemArg), "utf8").then(JSON.parse),
  ]);
  const { payload, report } = buildPricingPayload(pricingSourceFile, itemPayloadFile);
  await mkdir(dirname(resolve(outputArg)), { recursive: true });
  await writeFile(resolve(outputArg), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await writeFile(resolve(reportArg), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    `ALUMDOOR_PRICING_PAYLOAD_BUILT base=${report.base_item_price_count} variants=${report.variant_item_price_count} item_prices=${report.item_price_count} rules=${report.pricing_rule_count} blocked=${report.blocker_count}`,
  );
  console.log(`ALUMDOOR_PRICING_PAYLOAD_OUTPUT ${resolve(outputArg)}`);
  console.log(`ALUMDOOR_PRICING_PAYLOAD_REPORT ${resolve(reportArg)}`);
  if (report.blocker_count > 0) process.exitCode = 1;
}
