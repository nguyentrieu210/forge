import test from "node:test";
import assert from "node:assert/strict";

import { readBriefSource } from "../scripts/lib/read-brief-source.mjs";

const source = new URL("../briefs/alumdoor-v2.json", import.meta.url);

async function canonicalAlumdoorBrief() {
  return readBriefSource(source);
}

test("Alumdoor reference vertical declares stable package identity and dependency ownership", async () => {
  const brief = await canonicalAlumdoorBrief();

  assert.equal(brief.id, "alumdoor");
  assert.equal(brief.version, "2.2.2");
  assert.equal(brief.domain, "alumdoor");

  const dependencies = brief.requires ?? [];
  const dependencyIds = dependencies.map((entry) => entry.id);
  assert.equal(new Set(dependencyIds).size, dependencyIds.length, "app dependencies must be unique by id");
  assert.deepEqual(
    dependencies.filter((entry) => entry.id === "vn-accounting"),
    [{ id: "vn-accounting", version: "1.1.0" }],
    "Warehouse Cash must remain an explicit vn-accounting dependency",
  );
});

test("Alumdoor consumes Warehouse Cash as external DocTypes instead of claiming Finance schemas", async () => {
  const brief = await canonicalAlumdoorBrief();
  const localNames = new Set((brief.doctypes ?? []).map((entry) => entry.name));
  const externals = brief.externalDocTypes ?? [];
  const externalNames = externals.map((entry) => entry.name);

  assert.equal(new Set(externalNames).size, externalNames.length, "external DocType names must be unique");

  const warehouseCash = [
    "Warehouse Cash Fund",
    "Warehouse Cash Voucher",
    "Warehouse Cash Transfer",
    "Warehouse Cash Count",
  ];
  for (const name of warehouseCash) {
    const declaration = externals.find((entry) => entry.name === name);
    assert.ok(declaration, `missing external declaration for ${name}`);
    assert.equal(declaration.app, "vn-accounting", `${name} must stay owned by vn-accounting`);
    assert.equal(declaration.version, "1.1.0", `${name} must pin the compatible vn-accounting contract`);
    assert.equal(localNames.has(name), false, `${name} must not be redefined by Alumdoor`);
  }
});

test("every non-platform external app has an explicit package dependency", async () => {
  const brief = await canonicalAlumdoorBrief();
  const dependencyIds = new Set((brief.requires ?? []).map((entry) => entry.id));
  const platformProviders = new Set(["frappe", "erpnext"]);

  for (const declaration of brief.externalDocTypes ?? []) {
    if (platformProviders.has(declaration.app)) continue;
    assert.ok(
      dependencyIds.has(declaration.app),
      `external DocType ${declaration.name} is owned by ${declaration.app} but that app is not declared in requires`,
    );
  }
});

test("supplier settlement stays an Alumdoor action over the canonical Purchase Order permission boundary", async () => {
  const brief = await canonicalAlumdoorBrief();
  const action = (brief.actions ?? []).find((entry) => entry.name === "doi-soat-giao-hang-ncc");
  assert.ok(action, "missing supplier settlement action");
  assert.equal(action.permission, "Purchase Order");
  assert.match(String(action.commit), /^alumdoor\.purchase\.supplier_delivery_settlement\s*\|/);
  assert.ok((action.fields ?? []).some((field) => String(field).startsWith("queue_key:Data!")));
  assert.ok((action.fields ?? []).some((field) => String(field).includes("operation:Select(Đối soát,Đảo đối soát)!")));
});
