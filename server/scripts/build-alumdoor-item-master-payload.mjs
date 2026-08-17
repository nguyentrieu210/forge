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

const sourcePreflight = preflightAlumdoorItemSourceRecords(records);
const sourcePartition = partitionAlumdoorItemSourceBlockers(sourcePreflight.blockers);

// An allowlisted BOM-only component is promoted to a stock Item identity by the
// source contract. It still must not inherit its parent product group. For that
// narrow case only, carry the component's own audited source_group into master
// classification. Normal sellable/stock identities continue to derive group
// evidence from their direct source rows as before.
const promotionGroupsByCode = new Map();
for (const row of sourcePreflight.promotions ?? []) {
  const group = String(row.source_group ?? "").trim();
  if (!group) continue;
  const list = promotionGroupsByCode.get(row.canonical_item_code) ?? [];
  list.push(group);
  promotionGroupsByCode.set(row.canonical_item_code, list);
}
const acceptedWithPromotionGroups = sourcePreflight.accepted.map((item) => {
  const roles = new Set(item.source_roles ?? []);
  const hasDirectIdentity = roles.has(ITEM_SOURCE_ROLES.SELLABLE_PRODUCT)
    || roles.has(ITEM_SOURCE_ROLES.STOCK_ITEM);
  if (hasDirectIdentity) return item;
  const groups = [...new Set(promotionGroupsByCode.get(item.item_code) ?? [])];
  return groups.length > 0 ? { ...item, source_groups: groups } : item;
});
const master = buildCanonicalAlumdoorItemMaster(
  { ...sourcePreflight, accepted: acceptedWithPromotionGroups },
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
