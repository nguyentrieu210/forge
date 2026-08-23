import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

test("geometry runtime helper is master-driven and contains no door-name branching", () => {
  const source = readFileSync(resolve(repoRoot, "server/apps-src/alumdoor-worker/src/geometry-profile-runtime.ts"), "utf8");
  assert.match(source, /Geometry Profile/);
  assert.match(source, /Geometry Field/);
  assert.match(source, /runtime_fieldname/);
  assert.match(source, /visible/);
  assert.match(source, /required/);
  assert.match(source, /editable/);
  assert.match(source, /sequence/);
  assert.doesNotMatch(source, /Cửa Đức|Cửa Đài Loan|Cửa Lưới|Cửa Siêu Trường|customer_group/);
  assert.doesNotMatch(source, /width_pb_ray_m|width_pb_nhua_m|mesh_height_m|cut_width_m/);
});

test("geometry catalog owns the concrete runtime bindings", () => {
  const source = readFileSync(resolve(repoRoot, "server/scripts/lib/alumdoor-geometry-catalog.mjs"), "utf8");
  assert.match(source, /PB_CAO[\s\S]*runtimeFieldname: "height_m"/);
  assert.match(source, /PB_RAY_RONG[\s\S]*runtimeFieldname: "width_pb_ray_m"/);
  assert.match(source, /PB_NHUA_RONG[\s\S]*runtimeFieldname: "width_pb_nhua_m"/);
  assert.match(source, /LUOI_CAO[\s\S]*runtimeFieldname: "mesh_height_m"/);
  assert.match(source, /CAT_LA_RONG[\s\S]*runtimeFieldname: "cut_width_m"/);
});
