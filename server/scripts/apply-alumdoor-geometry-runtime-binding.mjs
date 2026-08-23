#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GEOMETRY_FIELDS, assertGeometryCatalog } from "./lib/alumdoor-geometry-catalog.mjs";

/**
 * Patch HẸP cho brief Alumdoor đã soạn tay.
 *
 * Không chạy lại build-alumdoor-v2-brief.mjs: file đó chủ động từ chối ghi đè brief soạn tay vì
 * generator còn drift. Script này chỉ:
 *   1. thêm Geometry Field.runtime_fieldname vào schema nếu chưa có;
 *   2. chiếu binding canonical vào đúng Geometry Field fixture đang tồn tại;
 *   3. không xoá fixture, không thay profile/cutting policy, không đổi version.
 *
 * Chạy thử: node server/scripts/apply-alumdoor-geometry-runtime-binding.mjs
 * Ghi thật:  node server/scripts/apply-alumdoor-geometry-runtime-binding.mjs --write
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const briefPath = resolve(root, "server/briefs/alumdoor-v2.json");
const write = process.argv.includes("--write");

assertGeometryCatalog();

const brief = JSON.parse(readFileSync(briefPath, "utf8"));
const geometryField = (brief.doctypes ?? []).find((row) => row.name === "Geometry Field");
if (!geometryField) throw new Error("Không thấy DocType Geometry Field trong alumdoor-v2.json");

const fieldName = (field) => typeof field === "string" ? field.split(":", 1)[0].trim() : field?.fieldname;
const hasRuntimeField = (geometryField.fields ?? []).some((field) => fieldName(field) === "runtime_fieldname");
if (!hasRuntimeField) {
  const anchor = (geometryField.fields ?? []).findIndex((field) => fieldName(field) === "field_name");
  const definition = {
    fieldname: "runtime_fieldname",
    fieldtype: "Data",
    label: "Trường runtime",
    description: "Binding kỹ thuật sang field operational (ví dụ height_m). Để trống nếu geometry chỉ là output của preview/cắt.",
  };
  if (anchor >= 0) geometryField.fields.splice(anchor + 1, 0, definition);
  else geometryField.fields.push(definition);
}

const byCode = new Map(GEOMETRY_FIELDS.map((field) => [field.code, field]));
let matched = 0;
let changed = 0;
const missingFixtures = [];
for (const canonical of GEOMETRY_FIELDS) {
  const fixture = (brief.fixtures ?? []).find((row) => row.type === "Geometry Field" && (row.name === canonical.code || row.data?.field_code === canonical.code));
  if (!fixture) {
    missingFixtures.push(canonical.code);
    continue;
  }
  matched += 1;
  fixture.data ??= {};
  const next = canonical.runtimeFieldname || "";
  if (String(fixture.data.runtime_fieldname ?? "") !== next) {
    fixture.data.runtime_fieldname = next;
    changed += 1;
  }
}

// Không tự tạo/đổi tên fixture ở đây. Nếu canonical và brief lệch mã, phải audit naming trước.
const unknownBriefFixtures = (brief.fixtures ?? [])
  .filter((row) => row.type === "Geometry Field")
  .map((row) => String(row.data?.field_code ?? row.name ?? ""))
  .filter((code) => code && !byCode.has(code));

const summary = {
  brief_version: brief.version,
  schema_added: !hasRuntimeField,
  canonical_fields: GEOMETRY_FIELDS.length,
  matched_fixtures: matched,
  changed_fixtures: changed,
  missing_fixtures: missingFixtures,
  unknown_brief_fixtures: unknownBriefFixtures,
};

if (write) {
  writeFileSync(briefPath, JSON.stringify(brief, null, 2) + "\n", "utf8");
  console.log("ALUMDOOR_GEOMETRY_RUNTIME_BINDING_WRITTEN");
} else {
  console.log("DRY_RUN — thêm --write để ghi");
}
console.log(JSON.stringify(summary, null, 2));
