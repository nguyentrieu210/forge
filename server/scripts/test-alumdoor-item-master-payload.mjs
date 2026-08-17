#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ITEM_SOURCE_ROLES } from "./lib/alumdoor-item-source-contract.mjs";

const work = mkdtempSync(join(tmpdir(), "alumdoor-item-master-"));
try {
  const sourcePath = join(work, "source.json");
  const payloadPath = join(work, "payload.json");
  const auditPath = join(work, "audit.json");
  writeFileSync(sourcePath, `${JSON.stringify({
    generated_from: "fixture",
    records: [
      {
        source_role: ITEM_SOURCE_ROLES.SELLABLE_PRODUCT,
        source_sheet: "ĐM",
        source_row: 10,
        source_index: 1,
        item_code: "TP-CUA-DUC-PAYLOAD-FIXTURE",
        item_name: "Cửa Đức payload fixture",
        source_uom: "M2",
        source_group: "Cửa CN Đức",
      },
      {
        source_role: ITEM_SOURCE_ROLES.BOM_REFERENCE,
        source_sheet: "ĐM",
        source_row: 11,
        source_index: null,
        item_code: "NVL-BOM-ONLY-BLOCKER-FIXTURE",
        item_name: "BOM unresolved fixture",
        source_uom: "CÁI",
        source_group: "",
      },
    ],
  }, null, 2)}\n`, "utf8");

  const run = spawnSync(process.execPath, [
    new URL("./build-alumdoor-item-master-payload.mjs", import.meta.url).pathname,
    sourcePath,
    payloadPath,
    auditPath,
  ], { encoding: "utf8" });
  if (run.status !== 0) {
    throw new Error(`builder failed\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`);
  }
  if (!run.stdout.includes("ALUMDOOR_ITEM_MASTER_PAYLOAD_PASS")) {
    throw new Error(`builder missing PASS marker: ${run.stdout}`);
  }

  const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  if (payload.item_count !== 1) throw new Error(`payload item_count expected=1 actual=${payload.item_count}`);
  if (payload.items[0]?.item_code !== "TP-CUA-DUC-PAYLOAD-FIXTURE") {
    throw new Error(`unexpected payload item: ${JSON.stringify(payload.items[0])}`);
  }
  if (payload.items[0]?.stock_uom !== "m2" || payload.items[0]?.default_sales_uom !== "m2") {
    throw new Error(`door unit policy mismatch: ${JSON.stringify(payload.items[0])}`);
  }
  if ((payload.items[0]?.uom_conversions ?? []).length !== 0) {
    throw new Error(`door must not invent m2/Bộ conversion: ${JSON.stringify(payload.items[0])}`);
  }
  if (audit.item_master_blocker_count !== 0) {
    throw new Error(`unexpected Item source blocker count ${audit.item_master_blocker_count}`);
  }
  if (audit.item_payload_blocker_count !== 0) {
    throw new Error(`unexpected Item payload blocker count ${audit.item_payload_blocker_count}`);
  }
  if (audit.bom_blocker_count !== 1) {
    throw new Error(`expected one retained BOM blocker actual=${audit.bom_blocker_count}`);
  }
  console.log("ALUMDOOR_ITEM_MASTER_PAYLOAD_TEST_PASS");
} finally {
  rmSync(work, { recursive: true, force: true });
}
