import test from "node:test";
import assert from "node:assert/strict";
import { AppFactoryDefinitionResolver } from "../dist/packages/app-registry/src/index.js";

function definition(name, overrides = {}) {
  const data = {
    definition_key: "purchase-approval",
    definition_kind: "Process",
    target_doctype: "Purchase Order",
    version_no: 1,
    definition_json: { approval_plan: { stages: [{ key: "review", approvers: [{ role: "Manager" }] }] } },
    effective_from: "2026-01-01",
    status: "Active",
    ...overrides,
  };
  return {
    tenant_id: "t", doctype: "App Factory Definition", name,
    owner: "admin@example.com", docstatus: 0, status: data.status,
    version: data.version_no, created_at: "2026-01-01T00:00:00Z", modified_at: "2026-01-01T00:00:00Z",
    data, children: [],
  };
}

function resolver(rows) {
  return new AppFactoryDefinitionResolver({
    async listDocumentsByDoctype() { return rows; },
  });
}

const input = {
  tenant_id: "t",
  definition_key: "purchase-approval",
  definition_kind: "Process",
  target_doctype: "Purchase Order",
  effective_on: "2026-08-03",
};

test("resolver selects the one Active/effective definition and ignores draft/retired/other targets", async () => {
  const rows = [
    definition("ACTIVE", { version_no: 2, effective_from: "2026-07-01" }),
    definition("DRAFT", { version_no: 3, status: "Draft" }),
    definition("RETIRED", { version_no: 1, status: "Retired" }),
    definition("OTHER", { target_doctype: "Sales Order", version_no: 9 }),
  ];
  const resolved = await resolver(rows).resolve(input);
  assert.equal(resolved.name, "ACTIVE");
  assert.equal(resolved.data.version_no, 2);
});

test("effective window is authoritative", async () => {
  const rows = [definition("WINDOW", { effective_from: "2026-07-01", effective_to: "2026-07-31" })];
  assert.equal(await resolver(rows).resolve(input), null);
  const during = await resolver(rows).resolve({ ...input, effective_on: "2026-07-15" });
  assert.equal(during.name, "WINDOW");
});

test("overlapping Active definitions fail closed instead of silently picking a version", async () => {
  await assert.rejects(
    () => resolver([
      definition("V1", { version_no: 1 }),
      definition("V2", { version_no: 2 }),
    ]).resolve(input),
    /Multiple Active Process definitions overlap/,
  );
});

test("require turns absence into an explicit not-found boundary", async () => {
  await assert.rejects(() => resolver([]).require(input), /No Active Process definition/);
});

test("invalid effective date is rejected before scanning definitions", async () => {
  await assert.rejects(() => resolver([]).resolve({ ...input, effective_on: "03-08-2026" }), /YYYY-MM-DD/);
});
