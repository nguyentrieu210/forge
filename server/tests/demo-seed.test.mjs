import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSeedLookup,
  collectRefs,
  resolveDemoSeedValue,
  seedSummary,
  validateDemoSeedManifest,
} from "../scripts/lib/demo-seed.mjs";

const base = {
  app: "marketplace-demo",
  profile: "rich",
  records: [
    { id: "seller-a", doctype: "Marketplace Seller", key: { field: "seller_code", value: "SELLER-A" }, data: { seller_name: "A" } },
    { id: "order-a", doctype: "Web Order", key: { field: "staff_note", value: "DEMO:ORDER-A" }, data: { seller: "@ref:seller-a", order_date: "@datetime:-2" } },
  ],
};

test("validates ordered demo seed manifests", () => {
  assert.equal(validateDemoSeedManifest(structuredClone(base)).records.length, 2);
});

test("rejects duplicate ids and forward references", () => {
  const duplicate = structuredClone(base);
  duplicate.records[1].id = "seller-a";
  assert.throws(() => validateDemoSeedManifest(duplicate), /duplicate seed record id/);

  const forward = structuredClone(base);
  forward.records[0].data = { seller: "@ref:order-a" };
  assert.throws(() => validateDemoSeedManifest(forward), /references order-a before it is defined/);
});

test("resolves references and relative UTC date macros recursively", () => {
  const now = new Date("2026-08-05T12:34:56.000Z");
  const names = new Map([["seller-a", "SELLER-A"]]);
  assert.deepEqual(resolveDemoSeedValue({
    seller: "@ref:seller-a",
    today: "@today",
    now: "@now",
    yesterday: "@date:-1",
    older: ["@datetime:-2"],
  }, { names, now }), {
    seller: "SELLER-A",
    today: "2026-08-05",
    now: "2026-08-05T12:34:56.000Z",
    yesterday: "2026-08-04",
    older: ["2026-08-03T12:34:56.000Z"],
  });
});

test("collects nested refs and fails unresolved refs", () => {
  assert.deepEqual([...collectRefs({ a: ["@ref:seller-a", { b: "@ref:order-a" }] })].sort(), ["order-a", "seller-a"]);
  assert.throws(() => resolveDemoSeedValue("@ref:missing", { names: new Map() }), /unresolved/);
});

test("builds a fail-closed exact lookup and summary", () => {
  const manifest = validateDemoSeedManifest(structuredClone(base));
  assert.deepEqual(buildSeedLookup(manifest.records[0]), {
    doctype: "Marketplace Seller",
    fields: ["name"],
    filters: { seller_code: "SELLER-A" },
    limit_page_length: 2,
  });
  assert.deepEqual(seedSummary(manifest), {
    app: "marketplace-demo",
    profile: "rich",
    records: 2,
    doctypes: { "Marketplace Seller": 1, "Web Order": 1 },
  });
});
