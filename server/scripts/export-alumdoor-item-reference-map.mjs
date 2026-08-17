#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { assertCanonicalItemPayload, normalizeCanonicalItemGroup } from "./lib/alumdoor-item-import-policy.mjs";

const [sqlArg = "server/imports/alumdoor-item-only-2026-08-11.sql", outputArg = "alumdoor-item-reference-map.json"] = process.argv.slice(2);
const sqlPath = resolve(sqlArg);
const outputPath = resolve(outputArg);

function parseSqlTuple(line) {
  let text = line.trim();
  if (text.endsWith(",") || text.endsWith(";")) text = text.slice(0, -1).trim();
  if (!text.startsWith("(") || !text.endsWith(")")) return null;
  text = text.slice(1, -1);

  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "'") {
      if (quoted && text[index + 1] === "'") {
        value += "'";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  values.push(value);
  return values;
}

const sql = await readFile(sqlPath, "utf8");
const items = {};
const invalid = [];
for (const line of sql.split(/\r?\n/)) {
  if (!line.includes(",'Item',")) continue;
  const values = parseSqlTuple(line);
  if (!values || values.length !== 12 || values[2] !== "Item") continue;
  let payload;
  try {
    payload = JSON.parse(values[11]);
  } catch (error) {
    invalid.push({ item_code: values[3] ?? "", issue: "invalid_payload_json", detail: error.message });
    continue;
  }

  let canonicalGroup;
  try {
    canonicalGroup = normalizeCanonicalItemGroup(payload.item_group);
  } catch (error) {
    invalid.push({ item_code: payload.item_code ?? values[3], issue: "noncanonical_item_group", detail: error.message });
    continue;
  }
  const canonicalPayload = { ...payload, item_group: canonicalGroup };
  try {
    assertCanonicalItemPayload(canonicalPayload);
  } catch (error) {
    invalid.push({ item_code: payload.item_code ?? values[3], issue: "payload_policy_failure", detail: error.message });
  }

  const code = payload.item_code ?? values[3];
  items[code] = {
    item_code: code,
    item_name: payload.item_name ?? "",
    item_group: canonicalGroup,
    stock_uom: payload.stock_uom ?? "",
    purchase_uom: payload.default_purchase_uom ?? "",
    sales_uom: payload.default_sales_uom ?? "",
    inventory_mode: payload.inventory_mode ?? "",
    material_stage: payload.material_stage ?? "",
    is_stock_item: Boolean(payload.is_stock_item),
    is_purchase_item: Boolean(payload.is_purchase_item),
    is_sales_item: Boolean(payload.is_sales_item),
    has_catch_weight: Boolean(payload.has_catch_weight),
    weight_uom: payload.weight_uom ?? "",
    payload: canonicalPayload,
    source: "alumdoor-item-only-2026-08-11.sql",
  };
}

const groupCounts = {};
for (const item of Object.values(items)) {
  groupCounts[item.item_group] = (groupCounts[item.item_group] ?? 0) + 1;
}
const report = {
  source: sqlPath,
  item_count: Object.keys(items).length,
  invalid_count: invalid.length,
  group_counts: Object.fromEntries(Object.entries(groupCounts).sort(([a], [b]) => a.localeCompare(b, "vi"))),
  invalid,
  items,
};
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  item_count: report.item_count,
  invalid_count: report.invalid_count,
  group_counts: report.group_counts,
  output: outputPath,
}, null, 2));
if (report.item_count === 0) throw new Error("Không đọc được Item nào từ SQL tham chiếu");
console.log(`ALUMDOOR_ITEM_REFERENCE_MAP_PASS items=${report.item_count} invalid=${report.invalid_count}`);
