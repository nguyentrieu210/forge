import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEASUREMENT_PROFILES,
  MEASUREMENT_PROFILE_NAMES,
  measurementProfileByName,
} from "../scripts/lib/alumdoor-measurement-profile-catalog.mjs";
import {
  GEOMETRY_FIELDS,
  GEOMETRY_PROFILES,
  assertGeometryCatalog,
  geometryFieldByCode,
} from "../scripts/lib/alumdoor-geometry-catalog.mjs";
import { alumdoorBriefVersion } from "./helpers.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

test("Measurement Profile is exactly seven inventory/measurement profiles", () => {
  assert.equal(MEASUREMENT_PROFILES.length, 7);
  assert.deepEqual(MEASUREMENT_PROFILE_NAMES, [
    "Hàng thường",
    "Nhôm cây/lá",
    "Ống/trục",
    "Tấm/Kính",
    "Cuộn",
    "Lô/Serial",
    "Thành phẩm theo m2",
  ]);
  assert.equal(measurementProfileByName("Nhôm cây/lá")?.stockUom, "Cây");
  assert.equal(measurementProfileByName("Ống/trục")?.stockUom, "Kg");
  assert.equal(measurementProfileByName("Thành phẩm theo m2")?.stockUom, "Bộ");
});

test("Measurement Profile does not own door geometry or technical kg/m", () => {
  const serialized = JSON.stringify(MEASUREMENT_PROFILES);
  for (const forbidden of [
    "theoretical_kg_per_m",
    "effective_width_m",
    "kerf_mm",
    "scrap_threshold_m",
    "phu_bi",
    "rộng phủ bì",
    "cut_formula",
  ]) {
    assert.equal(serialized.toLocaleLowerCase("vi").includes(forbidden.toLocaleLowerCase("vi")), false, forbidden);
  }
});

test("Geometry Field keeps physical dimensions separate and owns only runtime binding metadata", () => {
  assert.equal(assertGeometryCatalog(), true);
  // 10 kích thước/đại lượng hình học + billable_area_sqm. Hai ô lọt lòng đã có bằng chứng nguồn
  // và đã tồn tại trong brief soạn tay; canonical catalog phải giữ chúng để generator không xoá.
  assert.equal(GEOMETRY_FIELDS.length, 11);
  const linear = GEOMETRY_FIELDS.filter((row) => row.axis !== "OTHER");
  assert.equal(linear.length, 10);
  assert.ok(linear.every((row) => ["WIDTH", "HEIGHT", "LENGTH"].includes(row.axis)));
  assert.equal(geometryFieldByCode("billable_area_sqm")?.axis, "OTHER");
  assert.equal(geometryFieldByCode("billable_area_sqm")?.uom, "m2");
  assert.equal(geometryFieldByCode("PB_CAO")?.runtimeFieldname, "height_m");
  assert.equal(geometryFieldByCode("PB_RAY_RONG")?.runtimeFieldname, "width_pb_ray_m");
  assert.equal(geometryFieldByCode("PB_NHUA_RONG")?.runtimeFieldname, "width_pb_nhua_m");
  assert.equal(geometryFieldByCode("CAT_LA_RONG")?.runtimeFieldname, "cut_width_m");
  assert.equal(geometryFieldByCode("LUOI_CAO")?.runtimeFieldname, "mesh_height_m");
  assert.equal(geometryFieldByCode("RAY_DAI")?.runtimeFieldname, "", "không ép output ray vào SalesLine.length_m");
  assert.equal(geometryFieldByCode("V4_DAI")?.runtimeFieldname, "", "không ép output V4 vào SalesLine.length_m");
  assert.equal(geometryFieldByCode("TRUC_DAI")?.runtimeFieldname, "", "không ép output trục vào SalesLine.length_m");
});

test("Geometry Profile owns field visibility/role but no formulas", () => {
  assert.equal(GEOMETRY_PROFILES.length, 5);
  const germany = GEOMETRY_PROFILES.find((row) => row.code === "GP-CUA-DUC");
  assert.ok(germany);
  assert.deepEqual(germany.itemGroups, ["Cửa CN Đức"]);
  assert.ok(germany.fields.some((row) => row.geometryField === "LOT_LONG_CAO" && row.role === "INPUT"));
  assert.ok(germany.fields.some((row) => row.geometryField === "LOT_LONG_RONG" && row.role === "INPUT"));
  assert.ok(germany.fields.some((row) => row.geometryField === "PB_RAY_RONG" && row.role === "INPUT"));
  assert.ok(germany.fields.some((row) => row.geometryField === "PB_NHUA_RONG" && row.role === "INPUT"));
  assert.ok(germany.fields.some((row) => row.geometryField === "CAT_LA_RONG" && row.role === "CALCULATED"));
  const serialized = JSON.stringify(GEOMETRY_PROFILES);
  assert.doesNotMatch(serialized, /formula|deduction|offset|expression|=|\+|-\s*0\./i);
});

test("item import source is compatible with Cây stock / Kg purchase invariant", async () => {
  const source = await readFile(resolve(repoRoot, "server/scripts/build-alumdoor-item-only-import.mjs"), "utf8");
  assert.match(source, /const stockUom = kgTarget\s*\? "Cây"/);
  assert.match(source, /default_purchase_uom: kgTarget \? "Kg" : stockUom/);
  assert.match(source, /has_batch_no: Boolean\(kgTarget\)/);
  assert.match(source, /has_catch_weight: true/);
  assert.match(source, /purchase_allocation_uom: "Cây"/);
  assert.match(source, /uom_conversions: \[\]/);
});

test("static V2 metadata contains Geometry masters and moved ownership", async () => {
  const brief = JSON.parse(await readFile(resolve(repoRoot, "server/briefs/alumdoor-v2.json"), "utf8"));
  assert.equal(brief.version, alumdoorBriefVersion());
  const byName = new Map(brief.doctypes.map((row) => [row.name, row]));
  for (const name of ["Geometry Field", "Geometry Profile", "Geometry Profile Scope", "Geometry Profile Field"]) {
    assert.ok(byName.has(name), `thiếu ${name}`);
  }
  const measurement = byName.get("Measurement Profile");
  const names = new Set((measurement.fields ?? []).map((field) => typeof field === "string" ? field.split(":", 1)[0] : field.fieldname));
  for (const moved of ["theoretical_kg_per_m", "effective_width_m", "kerf_mm", "scrap_threshold_m"]) assert.equal(names.has(moved), false, moved);
  const item = byName.get("Item");
  const geometryProfile = (item.fields ?? []).find((field) => (typeof field === "string" ? field.split(":", 1)[0] : field.fieldname) === "geometry_profile");
  assert.ok(geometryProfile);
  assert.equal(typeof geometryProfile === "object" ? geometryProfile.options : "", "Geometry Profile");
  assert.equal(brief.fixtures.filter((row) => row.type === "Measurement Profile").length, 9);
  assert.equal(brief.fixtures.filter((row) => row.type === "Geometry Field").length, 11);
  assert.equal(brief.fixtures.filter((row) => row.type === "Geometry Profile").length, 5);
  const geometryField = byName.get("Geometry Field");
  const axis = (geometryField.fields ?? []).find((field) => typeof field === "object" && field.fieldname === "axis");
  assert.deepEqual(axis?.optionLabels, { WIDTH: "Chiều rộng", HEIGHT: "Chiều cao", LENGTH: "Chiều dài", OTHER: "Khác" });
  const geometryProfileField = byName.get("Geometry Profile Field");
  const role = (geometryProfileField.fields ?? []).find((field) => typeof field === "object" && field.fieldname === "role");
  assert.deepEqual(role?.optionLabels, { INPUT: "Nhập liệu", CALCULATED: "Tự tính", INFO: "Thông tin" });
});
