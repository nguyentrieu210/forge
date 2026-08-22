import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MATERIAL_SPECIFICATION_TYPES,
  loadMaterialSpecificationCatalog,
} from "../scripts/lib/alumdoor-material-specification-catalog.mjs";
import { ALUMDOOR_ITEM_GROUP_CATALOG } from "../scripts/lib/alumdoor-item-group-catalog.mjs";
import { buildMaterialSpecificationSeed } from "../scripts/seed-alumdoor-material-specifications-local.mjs";
import { alumdoorBriefVersion } from "./helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("canonical Material Specification catalog has exactly 17 evidence-backed atomic specs", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  assert.equal(rows.length, 17);
  assert.equal(new Set(rows.map((x) => x.specCode)).size, 17);
  assert.equal(new Set(rows.map((x) => x.itemCode)).size, 17);
  assert.equal(rows.filter((x) => x.payload.profile_system === "TIẾN ĐẠT").length, 12);
  assert.deepEqual(
    rows.filter((x) => x.specType === "Ống/trục").map((x) => x.itemCode).sort(),
    ["TRỤC 114_1.8LY", "TRỤC 114_2.1LY"],
  );
  assert.deepEqual(
    rows.filter((x) => x.specType === "Vật tư tuyến tính").map((x) => x.itemCode).sort(),
    ["RNHUA-DR", "RNINOX-DR", "RON-DD"],
  );
});

test("every canonical spec uses a canonical leaf Item Group and owns technical facts only", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  const leaves = new Set(ALUMDOOR_ITEM_GROUP_CATALOG.filter((x) => !x.isGroup).map((x) => x.name));
  for (const row of rows) {
    assert.ok(leaves.has(row.itemGroup), `${row.itemCode}: non-leaf/unknown group ${row.itemGroup}`);
    assert.ok(MATERIAL_SPECIFICATION_TYPES.includes(row.specType), `${row.itemCode}: invalid type`);
    assert.ok(row.kgPerM > 0, `${row.itemCode}: kg/m must be positive`);
    assert.equal(row.payload.spec_code, row.specCode);
    assert.equal(row.payload.item_group, row.itemGroup);
    assert.equal(row.payload.theoretical_kg_per_m, row.kgPerM);
    for (const forbidden of [
      "stock_uom", "default_purchase_uom", "inventory_mode", "measurement_profile",
      "require_color", "require_length", "track_bundle_qty", "leaf_divisor_m",
      "cutting_policy", "purchase_kg_per_m2", "uom_conversions",
    ]) assert.equal(forbidden in row.payload, false, `${row.specCode}: must not own ${forbidden}`);
  }
});

test("known technical evidence stays exact", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  const byItem = new Map(rows.map((x) => [x.itemCode, x]));
  assert.equal(byItem.get("TP-RAY HỘP TD U100")?.kgPerM, 1.419);
  assert.equal(byItem.get("TP-RAYHOP")?.kgPerM, 1.119);
  assert.equal(byItem.get("RNHUA-DR")?.kgPerM, 0.263);
  assert.equal(byItem.get("RNINOX-DR")?.kgPerM, 0.124);
  assert.equal(byItem.get("TRỤC 114_1.8LY")?.payload.section_code, "Φ114");
  assert.equal(byItem.get("TRỤC 114_1.8LY")?.payload.thickness_mm, 1.8);
  assert.equal(byItem.get("TRỤC 114_2.1LY")?.payload.thickness_mm, 2.1);
});

test("seed writes Material Specification + Item link only, not measurement/UOM/geometry", async () => {
  const { sql, catalog } = await buildMaterialSpecificationSeed(repoRoot, "demo");
  assert.equal(catalog.length, 17);
  assert.match(sql, /Material Specification/);
  assert.match(sql, /material_specification/);
  assert.doesNotMatch(sql, /doctype=['"]Measurement Profile|Measurement Profile:/);
  assert.doesNotMatch(sql, /stock_uom|default_purchase_uom|inventory_mode|measurement_profile/);
  assert.doesNotMatch(sql, /leaf_divisor_m|cutting_policy|purchase_kg_per_m2/);
});

test("V2 schema exposes linear material specs while legacy base remains untouched", () => {
  const base = JSON.parse(readFileSync(resolve(repoRoot, "server/briefs/alumdoor.json"), "utf8"));
  assert.equal(base.version, "1.27.5");
  const baseSpec = base.doctypes.find((x) => x.name === "Material Specification");
  assert.equal(baseSpec.fields.some((x) => (typeof x === "string" ? x.split(":")[0].trim() : x.fieldname) === "spec_type"), false);

  const brief = JSON.parse(readFileSync(resolve(repoRoot, "server/briefs/alumdoor-v2.json"), "utf8"));
  assert.equal(brief.version, alumdoorBriefVersion());
  const dt = brief.doctypes.find((x) => x.name === "Material Specification");
  const type = dt.fields.find((x) => (typeof x === "string" ? x.split(":")[0].trim() : x.fieldname) === "spec_type");
  assert.match(String(type), /Vật tư tuyến tính/);
  const kg = dt.fields.find((x) => typeof x === "object" && x.fieldname === "theoretical_kg_per_m");
  assert.match(kg.depends_on, /Vật tư tuyến tính/);
  const scrap = dt.fields.find((x) => typeof x === "object" && x.fieldname === "scrap_threshold_m");
  assert.match(scrap.depends_on, /Vật tư tuyến tính/);
});

test("legacy profile-spec builder delegates to canonical authority instead of maintaining a second map", () => {
  const source = readFileSync(resolve(repoRoot, "server/scripts/build-alumdoor-profile-specifications.mjs"), "utf8");
  assert.doesNotMatch(source, /PROFILE_WEIGHT_ITEMS/);
  assert.match(source, /buildMaterialSpecificationSeed/);
});
