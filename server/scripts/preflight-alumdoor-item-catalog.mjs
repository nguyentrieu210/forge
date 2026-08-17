#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  CANONICAL_ITEM_GROUPS,
  assertAtomicItemUom,
  assertSourceItemCodePreserved,
  normalizeCanonicalItemGroup,
} from "./lib/alumdoor-item-import-policy.mjs";

const [catalogArg, auditArg, groupMapArg] = process.argv.slice(2);
if (!catalogArg || !auditArg) {
  throw new Error(
    "Usage: node preflight-alumdoor-item-catalog.mjs <catalog.tsv> <audit.json> [motor-group-map.json]",
  );
}

const catalogPath = resolve(catalogArg);
const auditPath = resolve(auditArg);
const groupMapPath = groupMapArg ? resolve(groupMapArg) : null;

function parseDelimited(text, delimiter = "\t") {
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      record.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(value);
      records.push(record);
      record = [];
      value = "";
    } else {
      value += char;
    }
  }
  if (value || record.length) {
    record.push(value);
    records.push(record);
  }
  return records;
}

function rowsFromTsv(text) {
  const records = parseDelimited(text.replace(/^\uFEFF/, ""));
  if (!records.length) return [];
  const headers = records.shift().map((header) => header.trim());
  return records
    .filter((values) => values.some((value) => String(value ?? "").trim()))
    .map((values, index) => ({
      excel_row: index + 2,
      ...Object.fromEntries(headers.map((header, col) => [header, String(values[col] ?? "").trim()])),
    }));
}

function normalizeSourceUom(raw) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("thiếu ĐVT");
  if (value.includes("/")) {
    throw new Error(`'${value}' là tỷ lệ/định mức BOM, không phải UOM Item`);
  }
  const normalized = value.toLocaleUpperCase("vi");
  const aliases = new Map([
    ["M²", "m2"],
    ["M2", "m2"],
    ["M", "Mét"],
    ["MÉT", "Mét"],
    ["KG", "Kg"],
    ["CON", "Con"],
    ["BỘ", "Bộ"],
    ["CÁI", "Cái"],
    ["CẶP", "Cặp"],
    ["CÂY", "Cây"],
    ["LÁ", "Lá"],
    ["THÂN", "Thân"],
    ["THANH", "Thanh"],
    ["SỢI", "Sợi"],
    ["CUỘN", "Cuộn"],
    ["TẤM", "Tấm"],
    ["TÚI", "Túi"],
    ["HỘP", "Hộp"],
    ["BÌNH", "Bình"],
    ["LÍT", "Lít"],
  ]);
  const result = aliases.get(normalized);
  if (!result) throw new Error(`ĐVT '${value}' không map được vào Layer 0`);
  assertAtomicItemUom(result, "ĐVT nguồn");
  return result;
}

const MISSING_CODE_OVERRIDES = new Map([
  ["LONG ĐỀN", "NVL_Longden"],
  ["LÔNG ĐỀN", "NVL_Longden"],
  ["HOA KHẾ", "NVL_Hoakhe"],
  ["CỐT TRỤC 140", "NVL_Cottruc140"],
]);

const KNOWN_DUPLICATE_CODES = new Set([
  "NVL-V5_KEM_STD",
  "RNHUA/LONG-CR",
  "TP-BUOMSAT",
  "TP-CUAST1LY_MM",
  "TP-CUAST1.2LY_MM",
  "TP-CUAST8-9D_MM",
  "TP-CUAST1.3LY_MM",
  "TP-YHLD_TayDK",
  "NVL_Longden",
  "NVL_Hoakhe",
]);

const EXCLUDED_COMPOSITES = new Set([
  "RONNHUA_INOX",
  "TP-BO3LADAY",
  "BỘ BA LÁ ĐÁY + LÁ ĐẦU",
]);

const DIRECT_SOURCE_GROUPS = new Set([
  "Phụ kiện",
  "Phụ kiện chung",
  "Phụ kiện CN Đức",
  "Cửa CN Đức",
  "Cửa Lưới",
  "Cửa kéo Đài Loan",
  "Cửa Siêu Trường",
  "Cửa siêu trường",
  "Cửa tấm liền Úc",
  "Cửa Đài Loan",
  "Cửa Đài Loan Inox",
]);

const MOTOR_GROUPS = new Set([
  "Motor",
  "Bình lưu điện",
  "Điều khiển & phụ kiện điện",
  "Linh kiện motor",
]);

const motorGroupMap = groupMapPath
  ? JSON.parse(await readFile(groupMapPath, "utf8"))
  : {};
if (!motorGroupMap || Array.isArray(motorGroupMap) || typeof motorGroupMap !== "object") {
  throw new Error("motor-group-map.json phải là object { item_code: canonical_item_group }");
}
for (const [code, group] of Object.entries(motorGroupMap)) {
  if (!MOTOR_GROUPS.has(group) || !CANONICAL_ITEM_GROUPS.has(group)) {
    throw new Error(`${code}: motor group '${group}' không hợp lệ`);
  }
}

const rows = rowsFromTsv(await readFile(catalogPath, "utf8"));
const blockers = [];
const warnings = [];
const accepted = [];
const excluded = [];
const occurrenceCount = new Map();

for (const row of rows) {
  const name = row["TÊN SP"] ?? "";
  const sourceCodeOriginal = row["Mã SP"] ?? "";
  let code = sourceCodeOriginal;
  let codeOrigin = "source";
  const sourceGroup = row["Nhóm SP"] ?? "";
  const sourceUom = row["ĐVT"] ?? "";

  if (!code) {
    const override = MISSING_CODE_OVERRIDES.get(name.toLocaleUpperCase("vi"));
    if (!override) {
      blockers.push({
        excel_row: row.excel_row,
        issue: "missing_item_code",
        item_name: name,
      });
      continue;
    }
    code = override;
    codeOrigin = "explicit_override_for_blank_source";
    warnings.push({
      excel_row: row.excel_row,
      issue: "filled_known_missing_code",
      item_name: name,
      source_code_original: null,
      assigned_code: code,
    });
  } else {
    try {
      assertSourceItemCodePreserved(sourceCodeOriginal, code, `Excel row ${row.excel_row}`);
    } catch (error) {
      blockers.push({
        excel_row: row.excel_row,
        issue: "source_item_code_changed",
        source_code_original: sourceCodeOriginal,
        item_code: code,
        detail: error.message,
      });
      continue;
    }
  }

  if (code.startsWith("TRU-")) {
    excluded.push({ excel_row: row.excel_row, item_code: code, source_code_original: sourceCodeOriginal || null, reason: "sales_adjustment" });
    continue;
  }
  if (EXCLUDED_COMPOSITES.has(code)) {
    excluded.push({ excel_row: row.excel_row, item_code: code, source_code_original: sourceCodeOriginal || null, reason: "composite_not_atomic_item" });
    continue;
  }

  try {
    normalizeSourceUom(sourceUom);
  } catch (error) {
    blockers.push({
      excel_row: row.excel_row,
      issue: "invalid_item_uom",
      item_code: code,
      source_code_original: sourceCodeOriginal || null,
      item_name: name,
      source_uom: sourceUom,
      detail: error.message,
    });
    continue;
  }

  let targetGroup;
  if (sourceGroup === "Motor & Bình điện") {
    targetGroup = motorGroupMap[code];
    if (!targetGroup) {
      blockers.push({
        excel_row: row.excel_row,
        issue: "ambiguous_motor_item_group",
        item_code: code,
        source_code_original: sourceCodeOriginal || null,
        item_name: name,
        source_group: sourceGroup,
        allowed_groups: [...MOTOR_GROUPS],
      });
      continue;
    }
  } else if (DIRECT_SOURCE_GROUPS.has(sourceGroup)) {
    try {
      targetGroup = normalizeCanonicalItemGroup(sourceGroup);
    } catch (error) {
      blockers.push({
        excel_row: row.excel_row,
        issue: "invalid_item_group",
        item_code: code,
        source_code_original: sourceCodeOriginal || null,
        item_name: name,
        source_group: sourceGroup,
        detail: error.message,
      });
      continue;
    }
  } else {
    blockers.push({
      excel_row: row.excel_row,
      issue: "unsupported_source_item_group",
      item_code: code,
      source_code_original: sourceCodeOriginal || null,
      item_name: name,
      source_group: sourceGroup,
    });
    continue;
  }

  const occurrence = occurrenceCount.get(code) ?? 0;
  occurrenceCount.set(code, occurrence + 1);
  accepted.push({
    excel_row: row.excel_row,
    source_code_original: sourceCodeOriginal || null,
    item_code: code,
    code_origin: codeOrigin,
    occurrence: occurrence + 1,
    item_name: name,
    source_group: sourceGroup,
    canonical_item_group: targetGroup,
    canonical_uom: normalizeSourceUom(sourceUom),
  });
}

for (const [code, count] of occurrenceCount) {
  if (count <= 1) continue;
  if (!KNOWN_DUPLICATE_CODES.has(code)) {
    blockers.push({ issue: "unapproved_duplicate_item_code", item_code: code, occurrences: count });
  } else {
    warnings.push({ issue: "known_duplicate_item_code", item_code: code, occurrences: count });
  }
}

const audit = {
  source: catalogPath,
  row_count: rows.length,
  accepted_count: accepted.length,
  excluded_count: excluded.length,
  blocker_count: blockers.length,
  warning_count: warnings.length,
  policy: {
    preserve_source_item_code: true,
    blank_source_code_requires_explicit_override: true,
    derived_uom_is_blocker: true,
    unknown_item_group_is_blocker: true,
    motor_and_battery_group_requires_explicit_map: true,
    unknown_duplicate_code_is_blocker: true,
    missing_code_requires_explicit_override: true,
  },
  blockers,
  warnings,
  excluded,
  accepted,
};

await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  row_count: audit.row_count,
  accepted_count: audit.accepted_count,
  excluded_count: audit.excluded_count,
  blocker_count: audit.blocker_count,
  warning_count: audit.warning_count,
  audit: auditPath,
}, null, 2));

if (blockers.length) {
  throw new Error(`ALUMDOOR_ITEM_PREFLIGHT_BLOCKED blockers=${blockers.length}`);
}
console.log(`ALUMDOOR_ITEM_PREFLIGHT_PASS accepted=${accepted.length}`);
