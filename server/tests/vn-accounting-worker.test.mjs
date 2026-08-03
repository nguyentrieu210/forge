import assert from "node:assert/strict";
import test from "node:test";
import worker from "../dist/apps-src/vn-accounting-worker/src/index.js";

function headers() {
  return {
    "content-type": "application/json",
    "x-cloudforge-callback": "https://tenant.example/_app/",
    "x-cloudforge-app": "vn-accounting",
    "x-cloudforge-identity": "identity",
    "x-cloudforge-identity-signature": "signature",
    authorization: "Bearer app-call-key",
  };
}

function validRuleset(overrides = {}) {
  return {
    name: "VAT-KAIRO-2026",
    docstatus: 1,
    company: "Kairo",
    rule_type: "VAT",
    schema_version: 1,
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    expression_json: JSON.stringify({
      version: 1,
      outputs: { vat_minor: { op: "mul_bps", value: { op: "input", name: "taxable_minor" }, basis_points: 1000 } },
    }),
    test_vectors_json: JSON.stringify([
      { inputs: { taxable_minor: 10_000 }, expected: { vat_minor: 1_000 } },
    ]),
    legal_rule: "VAT-2026",
    source_hash: "a".repeat(64),
    ...overrides,
  };
}

test("VN tax validator executes approval test vectors on submit", async () => {
  const request = new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doctype: "VN Tax Ruleset", name: "VAT-KAIRO-2026", action: "submit", payload: validRuleset() }),
  });
  const response = await worker.fetch(request, {});
  assert.equal(response.status, 200);

  const failing = validRuleset({
    test_vectors_json: JSON.stringify([{ inputs: { taxable_minor: 10_000 }, expected: { vat_minor: 999 } }]),
  });
  const rejected = await worker.fetch(new Request("https://app.internal/hooks/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ doctype: "VN Tax Ruleset", name: "VAT-KAIRO-2026", action: "submit", payload: failing }),
  }), {});
  assert.equal(rejected.status, 422);
  assert.match((await rejected.json()).message, /failed vat_minor/);
});

test("VN tax evaluate method reads submitted ruleset through signed callback and remains read-only", async () => {
  const seen = [];
  const platform = {
    async fetch(request) {
      seen.push({ method: request.method, url: request.url, headers: Object.fromEntries(request.headers.entries()) });
      assert.equal(request.method, "GET");
      assert.match(request.url, /\/_app\/resource\/VN%20Tax%20Ruleset\/VAT-KAIRO-2026$/);
      return new Response(JSON.stringify({ data: validRuleset() }), { headers: { "content-type": "application/json" } });
    },
  };
  const response = await worker.fetch(new Request("https://app.internal/api/method/vn-accounting.tax.evaluate", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ method: "vn-accounting.tax.evaluate", args: {
      ruleset: "VAT-KAIRO-2026",
      company: "Kairo",
      effective_at: "2026-08-03",
      input_json: JSON.stringify({ taxable_minor: 12_345 }),
    } }),
  }), { PLATFORM: platform });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.outputs.vat_minor, 1_235);
  assert.equal(body.message.legal_rule, "VAT-2026");
  assert.equal(body.message.trace.schema_version, 1);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers["x-cloudforge-app"], "vn-accounting");
  assert.equal(seen[0].headers["x-cloudforge-identity"], "identity");
});

test("VN tax evaluate refuses draft, wrong company and ineffective rulesets", async () => {
  const run = async (doc, args = {}) => worker.fetch(new Request("https://app.internal/api/method/vn-accounting.tax.evaluate", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ method: "vn-accounting.tax.evaluate", args: {
      ruleset: "VAT-KAIRO-2026", company: "Kairo", effective_at: "2026-08-03",
      input_json: JSON.stringify({ taxable_minor: 1_000 }), ...args,
    } }),
  }), { PLATFORM: { fetch: async () => new Response(JSON.stringify({ data: doc }), { headers: { "content-type": "application/json" } }) } });

  assert.equal((await run(validRuleset({ docstatus: 0 }))).status, 422);
  assert.equal((await run(validRuleset({ company: "Other" }))).status, 422);
  assert.equal((await run(validRuleset({ effective_to: "2026-07-31" }))).status, 422);
});

test("VN bank match method reads one bank transaction and bounded Payment Entry list without writing", async () => {
  const seen = [];
  const platform = {
    async fetch(request) {
      seen.push({ method: request.method, url: request.url, headers: Object.fromEntries(request.headers.entries()) });
      assert.equal(request.method, "GET");
      const url = new URL(request.url);
      if (url.pathname.endsWith("/resource/Bank%20Transaction/BT-001")) {
        return new Response(JSON.stringify({ data: {
          name: "BT-001", docstatus: 1, bank_account: "VCB-001", company: "Kairo",
          posting_at: "2026-08-03T08:00:00Z", transaction_type: "Deposit",
          amount_minor: 1_000_000, currency: "VND", gl_account: "1121-KAIRO",
          reference_number: "FT-12345", description: "ACME thanh toan",
        } }), { headers: { "content-type": "application/json" } });
      }
      if (url.pathname.endsWith("/resource/Payment%20Entry")) {
        const filters = JSON.parse(url.searchParams.get("filters"));
        assert.ok(filters.some((row) => row[0] === "company" && row[2] === "Kairo"));
        assert.ok(filters.some((row) => row[0] === "payment_type" && row[2] === "Receive"));
        assert.equal(url.searchParams.get("limit_page_length"), "200");
        return new Response(JSON.stringify({ data: [
          {
            name: "PE-001", docstatus: 1, company: "Kairo", posting_at: "2026-08-03T09:00:00Z",
            payment_type: "Receive", paid_from: "131-KAIRO", paid_to: "1121-KAIRO",
            received_amount_minor: 1_000_000, company_currency: "VND", party: "ACME", reference_no: "FT12345",
          },
          {
            name: "PE-WRONG", docstatus: 1, company: "Kairo", posting_at: "2026-08-03T09:00:00Z",
            payment_type: "Receive", paid_from: "131-KAIRO", paid_to: "1121-KAIRO",
            received_amount_minor: 999_999, company_currency: "VND", party: "ACME",
          },
        ] }), { headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    },
  };
  const response = await worker.fetch(new Request("https://app.internal/api/method/vn-accounting.bank.match_candidates", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ method: "vn-accounting.bank.match_candidates", args: {
      bank_transaction: "BT-001", max_days: 7, limit: 10,
    } }),
  }), { PLATFORM: platform });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.candidates.length, 1);
  assert.equal(body.message.candidates[0].payment_entry, "PE-001");
  assert.ok(body.message.candidates[0].reasons.includes("REFERENCE_EXACT"));
  assert.match(body.message.write_path, /Submit Bank Reconciliation/);
  assert.equal(seen.length, 2);
});
