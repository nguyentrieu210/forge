import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMaterialSpecificationSeed } from "../scripts/seed-alumdoor-material-specifications-local.mjs";
import { loadMaterialSpecificationCatalog } from "../scripts/lib/alumdoor-material-specification-catalog.mjs";
import { CANONICAL_ALUMDOOR_ITEM_GROUPS } from "../scripts/lib/alumdoor-item-group-catalog.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, "..", "..");
const canonicalGroups = new Set(CANONICAL_ALUMDOOR_ITEM_GROUPS.map((row) => row.item_group_name));

test("canonical Material Specification catalog has exactly 17 evidence-backed atomic specs", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  assert.equal(rows.length, 17);
  assert.equal(new Set(rows.map((row) => row.specCode)).size, 17);
  assert.equal(new Set(rows.map((row) => row.itemCode)).size, 17);
});

test("every canonical spec uses a canonical leaf Item Group and owns technical facts only", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  for (const row of rows) {
    assert.ok(canonicalGroups.has(row.itemGroup), `${row.itemCode}: nhóm không canonical ${row.itemGroup}`);
    assert.equal(row.payload.spec_code, row.specCode);
    assert.equal(row.payload.item_group, row.itemGroup);
    assert.ok(row.payload.theoretical_kg_per_m > 0, `${row.itemCode}: thiếu kg/m`);
    assert.ok(["Nhôm cây/lá", "Ống/trục", "Vật tư tuyến tính"].includes(row.payload.spec_type), `${row.itemCode}: sai loại quy cách`);
    const forbidden = [
      "stock_uom",
      "default_purchase_uom",
      "inventory_mode",
      "measurement_profile",
      "cutting_policy",
      "leaf_divisor_m",
      "purchase_kg_per_m2",
    ];
    for (const field of forbidden) assert.equal(field in row.payload, false, `${row.itemCode}: Material Specification không được sở hữu ${field}`);
  }
});

test("known technical evidence stays exact", async () => {
  const rows = await loadMaterialSpecificationCatalog(repoRoot);
  const byItem = new Map(rows.map((row) => [row.itemCode, row]));
  assert.equal(byItem.get("TP-RAY HỘP TD U100")?.payload.theoretical_kg_per_m, 1.419);
  assert.equal(byItem.get("RNHUA-DR")?.payload.theoretical_kg_per_m, 0.263);
  assert.equal(byItem.get("RNINOX-DR")?.payload.theoretical_kg_per_m, 0.124);
  assert.deepEqual(
    ["TRỤC 114_1.8LY", "TRỤC 114_2.1LY"].map((code) => ({
      code,
      type: byItem.get(code)?.payload.spec_type,
      section: byItem.get(code)?.payload.section_code,
      thickness: byItem.get(code)?.payload.thickness_mm,
      kgPerM: byItem.get(code)?.payload.theoretical_kg_per_m,
    })),
    [
      { code: "TRỤC 114_1.8LY", type: "Ống/trục", section: "Φ114", thickness: 1.8, kgPerM: 4.4 },
      { code: "TRỤC 114_2.1LY", type: "Ống/trục", section: "Φ114", thickness: 2.1, kgPerM: 4.7 },
    ],
  );
});

test("seed writes Material Specification + Item link only, not measurement/UOM/geometry", async () => {
  const { sql } = await buildMaterialSpecificationSeed(repoRoot, "demo");
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
  assert.equal(brief.version, "2.3.0");
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
  assert.match(source, /loadMaterialSpecificationCatalog/);
});
