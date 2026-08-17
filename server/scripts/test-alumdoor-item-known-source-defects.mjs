#!/usr/bin/env node
import { ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS } from "./lib/alumdoor-item-known-source-defects.mjs";
import { partitionAlumdoorItemSourceBlockers } from "./lib/alumdoor-item-blocker-partition.mjs";
import { preflightAlumdoorItemSourceRecords } from "./lib/alumdoor-item-source-preflight.mjs";

function expect(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`);
}

expect(ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS.length, 6, "known defect count");

const keys = new Set();
for (const defect of ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS) {
  const key = `${defect.source_sheet}|${defect.source_row}|${defect.item_code}|${defect.item_name}`;
  if (keys.has(key)) throw new Error(`Known defect bị trùng: ${key}`);
  keys.add(key);
  if (!defect.expected_reason) throw new Error(`Known defect thiếu expected_reason: ${key}`);
  if (!defect.note) throw new Error(`Known defect thiếu note: ${key}`);
}

const audit = preflightAlumdoorItemSourceRecords(ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS);
const partition = partitionAlumdoorItemSourceBlockers(audit.blockers);

expect(audit.blocker_count, 6, "known defect preflight blocker count");
expect(partition.item_master_blocker_count, 5, "known Item Master blocker count");
expect(partition.bom_blocker_count, 1, "known BOM blocker count");
expect(partition.other_blocker_count, 0, "known other blocker count");

for (const defect of ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS) {
  const blocker = audit.blockers.find((entry) => (
    entry.source_sheet === defect.source_sheet
    && entry.source_row === defect.source_row
    && entry.item_code === defect.item_code
  ));
  if (!blocker) throw new Error(`Không tạo blocker cho source row ${defect.source_row} ${defect.item_code}`);
  expect(blocker.reason, defect.expected_reason, `blocker reason row ${defect.source_row}`);
}

console.log("ALUMDOOR_ITEM_KNOWN_SOURCE_DEFECTS_PASS item=5 bom=1 total=6");
