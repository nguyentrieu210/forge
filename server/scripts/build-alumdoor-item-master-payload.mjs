#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { partitionAlumdoorItemSourceBlockers } from "./lib/alumdoor-item-blocker-partition.mjs";
import { buildCanonicalAlumdoorItemMaster } from "./lib/alumdoor-item-master-classification.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";

const [sourceArg, payloadArg, auditArg] = process.argv.slice(2);
if (!sourceArg || !payloadArg || !auditArg) {
  throw new Error(
    "Usage: node build-alumdoor-item-master-payload.mjs <source-records.json> <payload.json> <audit.json>",
  );
}

const sourcePath = resolve(sourceArg);
const payloadPath = resolve(payloadArg);
const auditPath = resolve(auditArg);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const records = Array.isArray(source) ? source : source.records;
if (!Array.isArray(records)) {
  throw new Error("source-records.json phải là array hoặc object { records: [...] }");
}

const clean = (value) => String(value ?? "").trim();
const uomKey = (value) => clean(value).replace(/\s+/g, "").toLocaleUpperCase("vi");
function positiveNumber(value) {
  const text = clean(value).replace(",", ".");
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}
function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value > 0))];
}

function deriveExactCodeConversionEvidence(item, rawRecords) {
  if ((item.conversion_factors ?? []).length > 0) return item;
  const explicitStockUom = clean(item.stock_uom);
  const salesUoms = [...new Set((item.sales_uoms ?? []).map(clean).filter(Boolean))];
  const conversionBases = new Set(item.conversion_bases ?? []);
  const inferredStockUom = explicitStockUom
    || (conversionBases.has("kg_per_m") || conversionBases.has("kg_per_thung") ? "Kg" : "");
  if (salesUoms.length !== 1 || salesUoms[0] === inferredStockUom) return item;

  const exactRows = rawRecords.filter((row) => clean(row.item_code) === clean(item.item_code));
  if (salesUoms[0] === "Mét" && (inferredStockUom === "Kg" || conversionBases.has("kg_per_m"))) {
    const factors = uniqueNumbers(exactRows
      .filter((row) => uomKey(row.source_uom) === "KG/M")
      .map((row) => positiveNumber(row.source_rate_or_quantity ?? row.source_qty_or_formula)));
    if (factors.length > 0) {
      return {
        ...item,
        requires_conversion: true,
        conversion_bases: [...new Set([...(item.conversion_bases ?? []), "kg_per_m"])],
        conversion_factors: factors.map((factor) => ({
          conversion_basis: "kg_per_m",
          conversion_factor: factor,
          source: "real_source_exact_code_kg_per_m",
        })),
      };
    }
  }

  // NVL-OKHOA is one physical lock per commercial set in the source: the
  // numbered sellable row is 1 Bộ and the exact BOM component row is also 1 Bộ,
  // while the physical inventory snapshot counts the same code in Cái.
  if (item.item_code === "NVL-OKHOA" && inferredStockUom === "Cái" && salesUoms[0] === "Bộ") {
    const sellableOne = exactRows.some((row) => (
      row.source_role === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT
      && uomKey(row.source_uom) === "BỘ"
      && positiveNumber(row.source_rate_or_quantity) === 1
    ));
    const bomOne = exactRows.some((row) => (
      row.source_role === ITEM_SOURCE_ROLES.BOM_REFERENCE
      && uomKey(row.source_uom) === "BỘ"
      && positiveNumber(row.source_qty_or_formula) === 1
    ));
    if (sellableOne && bomOne) {
      return {
        ...item,
        requires_conversion: true,
        conversion_bases: [...new Set([...(item.conversion_bases ?? []), "piece_per_set"])],
        conversion_factors: [{
          conversion_basis: "piece_per_set",
          conversion_factor: 1,
          source: "real_source_exact_code_one_lock_per_set",
        }],
      };
    }
  }

  // NVL-CHNHUA is sold by Kg but the physical snapshot is counted in Cái.
  // The real source explicitly records "91 cái /kg" on the numbered sellable
  // row and repeats 0.0096 kg/cái in BOM notes. Item conversion semantics need
  // stock units per sales unit, therefore the direct source ratio is 91 Cái/Kg.
  if (item.item_code === "NVL-CHNHUA" && inferredStockUom === "Cái" && salesUoms[0] === "Kg") {
    const hasSellableKg = exactRows.some((row) => (
      row.source_role === ITEM_SOURCE_ROLES.SELLABLE_PRODUCT
      && uomKey(row.source_uom) === "KG"
    ));
    const hasStockPiece = exactRows.some((row) => (
      row.source_role === ITEM_SOURCE_ROLES.STOCK_ITEM
      && uomKey(row.source_uom) === "CÁI"
    ));
    if (hasSellableKg && hasStockPiece) {
      return {
        ...item,
        requires_conversion: true,
        conversion_bases: [...new Set([...(item.conversion_bases ?? []), "piece_per_kg"])],
        conversion_factors: [{
          conversion_basis: "piece_per_kg",
          conversion_factor: 91,
          source: "real_source_numbered_row_91_piece_per_kg",
        }],
      };
    }
  }

  return item;
}

const sourcePreflight = preflightAlumdoorItemSourceRecords(records);
const sourcePartition = partitionAlumdoorItemSourceBlockers(sourcePreflight.blockers);

const promotionGroupsByCode = new Map();
for (const row of sourcePreflight.promotions ?? []) {
  const group = clean(row.source_group);
  if (!group) continue;
  const list = promotionGroupsByCode.get(row.canonical_item_code) ?? [];
  list.push(group);
  promotionGroupsByCode.set(row.canonical_item_code, list);
}
const acceptedWithEvidence = sourcePreflight.accepted.map((item) => {
  const roles = new Set(item.source_roles ?? []);
  const hasDirectIdentity = roles.has(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT)
    || roles.has(ITEM_SOURCE_ROLES.STOCK_ITEM);
  let next = item;
  if (!hasDirectIdentity) {
    const groups = [...new Set(promotionGroupsByCode.get(item.item_code) ?? [])];
    if (groups.length > 0) next = { ...next, source_groups: groups };
  }
  return deriveExactCodeConversionEvidence(next, records);
});
const master = buildCanonicalAlumdoorItemMaster(
  { ...sourcePreflight, accepted: acceptedWithEvidence },
  records,
);

const itemCodes = master.payloads.map((item) => item.item_code);
const uniqueCodes = new Set(itemCodes);
if (uniqueCodes.size !== itemCodes.length) {
  throw new Error(`Canonical Item payload duplicate code: items=${itemCodes.length} unique=${uniqueCodes.size}`);
}

const payload = {
  format: "alumdoor-item-master-payload/v2",
  generated_from: source.generated_from ?? sourcePath,
  item_count: master.payloads.length,
  items: master.payloads,
};
const audit = {
  format: "alumdoor-item-master-audit/v2",
  generated_from: source.generated_from ?? sourcePath,
  source_record_count: sourcePreflight.source_record_count,
  source_identity_count: sourcePreflight.accepted_count,
  source_alias_count: sourcePreflight.alias_count,
  source_promotion_count: sourcePreflight.promotion_count,
  source_excluded_count: sourcePreflight.excluded_count,
  source_reference_count: sourcePreflight.reference_count,
  source_blocker_count: sourcePreflight.blocker_count,
  ...sourcePartition,
  item_payload_count: master.accepted_count,
  item_payload_blocker_count: master.blocker_count,
  item_payload_blockers: master.blockers,
  bom_blockers_retained: sourcePartition.bom_blockers,
};

await writeFile(payloadPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  source_record_count: audit.source_record_count,
  source_identity_count: audit.source_identity_count,
  item_master_source_blocker_count: audit.item_master_blocker_count,
  bom_blocker_count: audit.bom_blocker_count,
  other_source_blocker_count: audit.other_blocker_count,
  item_payload_count: audit.item_payload_count,
  item_payload_blocker_count: audit.item_payload_blocker_count,
  payload: payloadPath,
  audit: auditPath,
}, null, 2));

if (
  audit.item_master_blocker_count > 0
  || audit.other_blocker_count > 0
  || audit.item_payload_blocker_count > 0
) {
  throw new Error(
    `ALUMDOOR_ITEM_MASTER_PAYLOAD_BLOCKED source_item=${audit.item_master_blocker_count} other=${audit.other_blocker_count} payload=${audit.item_payload_blocker_count} bom_retained=${audit.bom_blocker_count}`,
  );
}

console.log(
  `ALUMDOOR_ITEM_MASTER_PAYLOAD_PASS items=${audit.item_payload_count} bom_blockers_retained=${audit.bom_blocker_count}`,
);
