#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const work = mkdtempSync(join(tmpdir(), "alumdoor-item-importer-"));
const script = new URL("./import-alumdoor-item-master-local.mjs", import.meta.url).pathname;
try {
  const goodPath = join(work, "good.json");
  const item = {
    doctype: "Item",
    item_code: "TP-IMPORTER-FIXTURE",
    item_name: "Importer fixture",
    item_group: "Cửa CN Đức",
    item_nature: "Hàng tồn kho",
    material_stage: "Thành phẩm",
    supply_type: "Tự sản xuất",
    is_stock_item: 1,
    is_purchase_item: 0,
    is_sales_item: 1,
    is_fixed_asset: 0,
    include_item_in_manufacturing: 1,
    is_sub_contracted_item: 0,
    stock_uom: "Bộ",
    default_purchase_uom: "",
    default_sales_uom: "m2",
    measurement_profile: "Thành phẩm theo m2",
    disabled: 0,
    uom_conversions: [],
  };
  writeFileSync(goodPath, `${JSON.stringify({
    format: "alumdoor-item-master-payload/v2",
    generated_from: "fixture",
    item_count: 1,
    items: [item],
  }, null, 2)}\n`, "utf8");

  const good = spawnSync(process.execPath, [script, goodPath, "--validate-only"], { encoding: "utf8" });
  if (good.status !== 0 || !good.stdout.includes("ALUMDOOR_ITEM_LOCAL_IMPORT_VALIDATE_ONLY_PASS")) {
    throw new Error(`valid payload did not pass\nSTDOUT:\n${good.stdout}\nSTDERR:\n${good.stderr}`);
  }

  const duplicatePath = join(work, "duplicate.json");
  writeFileSync(duplicatePath, `${JSON.stringify({
    format: "alumdoor-item-master-payload/v2",
    generated_from: "fixture",
    item_count: 2,
    items: [item, { ...item }],
  }, null, 2)}\n`, "utf8");
  const duplicate = spawnSync(process.execPath, [script, duplicatePath, "--validate-only"], { encoding: "utf8" });
  if (duplicate.status === 0) throw new Error("duplicate item_code payload unexpectedly passed");
  if (!`${duplicate.stdout}\n${duplicate.stderr}`.includes("Duplicate item_code in payload")) {
    throw new Error(`duplicate payload failed for unexpected reason\n${duplicate.stdout}\n${duplicate.stderr}`);
  }

  console.log("ALUMDOOR_ITEM_LOCAL_IMPORTER_TEST_PASS");
} finally {
  rmSync(work, { recursive: true, force: true });
}
