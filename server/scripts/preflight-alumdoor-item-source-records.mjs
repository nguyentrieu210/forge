#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { partitionAlumdoorItemSourceBlockers } from "./lib/alumdoor-item-blocker-partition.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

const [sourceArg, auditArg] = process.argv.slice(2);
if (!sourceArg || !auditArg) {
  throw new Error(
    "Usage: node preflight-alumdoor-item-source-records.mjs <source-records.json> <audit.json>",
  );
}

const sourcePath = resolve(sourceArg);
const auditPath = resolve(auditArg);
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const records = Array.isArray(source) ? source : source.records;
if (!Array.isArray(records)) {
  throw new Error("source-records.json phải là array hoặc object { records: [...] }");
}

const preflight = preflightAlumdoorItemSourceRecords(records);
const blockerPartition = partitionAlumdoorItemSourceBlockers(preflight.blockers);
const audit = {
  source: sourcePath,
  generated_from: source.generated_from ?? null,
  policy_version: "alumdoor-item-source-v2",
  ...preflight,
  ...blockerPartition,
};

await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  source_record_count: audit.source_record_count,
  accepted_count: audit.accepted_count,
  alias_count: audit.alias_count,
  promotion_count: audit.promotion_count,
  excluded_count: audit.excluded_count,
  reference_count: audit.reference_count,
  blocker_count: audit.blocker_count,
  item_master_blocker_count: audit.item_master_blocker_count,
  bom_blocker_count: audit.bom_blocker_count,
  other_blocker_count: audit.other_blocker_count,
  audit: auditPath,
}, null, 2));

if (audit.blocker_count > 0) {
  throw new Error(
    `ALUMDOOR_ITEM_SOURCE_PREFLIGHT_BLOCKED blockers=${audit.blocker_count} item=${audit.item_master_blocker_count} bom=${audit.bom_blocker_count} other=${audit.other_blocker_count}`,
  );
}
console.log(`ALUMDOOR_ITEM_SOURCE_PREFLIGHT_PASS accepted=${audit.accepted_count} aliases=${audit.alias_count}`);
