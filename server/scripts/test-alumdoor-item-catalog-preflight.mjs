#!/usr/bin/env node
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(process.cwd());
const script = join(root, "server", "scripts", "preflight-alumdoor-item-catalog.mjs");
const dir = await mkdtemp(join(tmpdir(), "alumdoor-item-preflight-"));

async function runCase(name, tsv, map, shouldPass, expectedIssue) {
  const catalog = join(dir, `${name}.tsv`);
  const audit = join(dir, `${name}.audit.json`);
  const mapPath = join(dir, `${name}.groups.json`);
  await writeFile(catalog, tsv, "utf8");
  const args = [script, catalog, audit];
  if (map !== null) {
    await writeFile(mapPath, `${JSON.stringify(map, null, 2)}\n`, "utf8");
    args.push(mapPath);
  }
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (shouldPass && result.status !== 0) {
    throw new Error(`${name}: đáng lẽ PASS\n${result.stdout}\n${result.stderr}`);
  }
  if (!shouldPass && result.status === 0) {
    throw new Error(`${name}: đáng lẽ BLOCK`);
  }
  const report = JSON.parse(await readFile(audit, "utf8"));
  if (shouldPass && report.blocker_count !== 0) {
    throw new Error(`${name}: PASS nhưng còn ${report.blocker_count} blocker`);
  }
  if (!shouldPass && !report.blockers.some((row) => row.issue === expectedIssue)) {
    throw new Error(`${name}: không tìm thấy blocker ${expectedIssue}`);
  }
}

const header = "Mã SP\tTÊN SP\tNhóm SP\tĐVT\n";
await runCase(
  "rate-uom",
  `${header}NVL-TRUC34\tTRỤC 34\tCửa tấm liền Úc\tKG/M\n`,
  null,
  false,
  "invalid_item_uom",
);
await runCase(
  "ambiguous-motor",
  `${header}TP-MT-DEMO\tMOTOR DEMO\tMotor & Bình điện\tBỘ\n`,
  null,
  false,
  "ambiguous_motor_item_group",
);
await runCase(
  "valid-catalog",
  `${header}TP-DOOR-DEMO\tCỬA DEMO\tCửa CN Đức\tM2\nTP-MT-DEMO\tMOTOR DEMO\tMotor & Bình điện\tBỘ\n`,
  { "TP-MT-DEMO": "Motor" },
  true,
  null,
);

console.log("ALUMDOOR_ITEM_CATALOG_PREFLIGHT_TEST_PASS");
