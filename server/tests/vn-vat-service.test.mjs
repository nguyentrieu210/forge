import assert from "node:assert/strict";
import test from "node:test";
import { handleVatMethod } from "../dist/apps-src/vn-accounting-worker/src/vat-service.js";

const headers = {
  "x-cloudforge-callback": "https://tenant.example/_app/",
  "x-cloudforge-app": "vn-accounting",
  "x-cloudforge-identity": "identity",
  "x-cloudforge-identity-signature": "signature",
  authorization: "Bearer app-call-key",
};

function ruleset(overrides = {}) {
  return {
    name: "VAT-KAIRO-2026",
    docstatus: 1,
    company: "Kairo",
    rule_type: "VAT",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    legal_rule: "VAT-2026",
    source_hash: "a".repeat(64),
    tax_accounts_json: JSON.stringify({ input_vat: ["1331-KAIRO"], output_vat: ["33311-KAIRO"] }),
    ...overrides,
  };
}

function invoice(doctype, name, account, taxMinor, overrides = {}) {
  return {
    name,
    docstatus: 1,
    company: "Kairo",
    posting_at: "2026-08-03T08:00:00Z",
    currency: "VND",
    currency_scale: 0,
    company_currency: "VND",
    company_currency_scale: 0,
    conversion_rate_micros: 1_000_000,
    net_total_minor: 1_000_000,
    base_net_total_minor: 1_000_000,
    total_taxes_and_charges_minor: taxMinor,
    base_total_taxes_and_charges_minor: taxMinor,
    grand_total_minor: 1_000_000 + taxMinor,
    base_grand_total_minor: 1_000_000 + taxMinor,
    taxes: [{ row_id: "TAX-1", account, tax_amount_minor: taxMinor }],
    doctype,
    ...overrides,
  };
}

function request(method, args) {
  return new Request(`https://app.internal/api/method/${encodeURIComponent(method)}`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ method, args }),
  });
}

test("VAT invoice reconciliation reads approved same-company ruleset and source invoice", async () => {
  const seen = [];
  const platform = {
    async fetch(req) {
      seen.push({ method: req.method, url: req.url, identity: req.headers.get("x-cloudforge-identity") });
      const url = new URL(req.url);
      if (url.pathname.endsWith("/resource/VN%20Tax%20Ruleset/VAT-KAIRO-2026")) {
        return Response.json({ data: ruleset() });
      }
      if (url.pathname.endsWith("/resource/Sales%20Invoice/SI-001")) {
        return Response.json({ data: invoice("Sales Invoice", "SI-001", "33311-KAIRO", 100_000) });
      }
      return new Response("not found", { status: 404 });
    },
  };
  const response = await handleVatMethod(
    "vn-accounting.vat.invoice_reconcile",
    request("vn-accounting.vat.invoice_reconcile", {
      ruleset: "VAT-KAIRO-2026", source_doctype: "Sales Invoice", source_name: "SI-001",
    }),
    { PLATFORM: platform },
    { ruleset: "VAT-KAIRO-2026", source_doctype: "Sales Invoice", source_name: "SI-001" },
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.row.output_vat_minor, 100_000);
  assert.equal(body.message.ready_for_filing_dataset, true);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((entry) => entry.method === "GET"));
  assert.ok(seen.every((entry) => entry.identity === "identity"));
});

test("VAT dataset scans bounded submitted invoice lists and returns deterministic totals", async () => {
  const platform = {
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith("/resource/VN%20Tax%20Ruleset/VAT-KAIRO-2026")) return Response.json({ data: ruleset() });
      if (url.pathname.endsWith("/resource/Sales%20Invoice") && url.search) {
        assert.equal(url.searchParams.get("limit_page_length"), "100");
        const filters = JSON.parse(url.searchParams.get("filters"));
        assert.ok(filters.some((row) => row[0] === "company" && row[2] === "Kairo"));
        assert.ok(filters.some((row) => row[0] === "docstatus" && row[2] === 1));
        return Response.json({ data: [{ name: "SI-001", posting_at: "2026-08-03T08:00:00Z", docstatus: 1, company: "Kairo" }] });
      }
      if (url.pathname.endsWith("/resource/Purchase%20Invoice") && url.search) {
        return Response.json({ data: [{ name: "PI-001", posting_at: "2026-08-03T09:00:00Z", docstatus: 1, company: "Kairo" }] });
      }
      if (url.pathname.endsWith("/resource/Sales%20Invoice/SI-001")) return Response.json({ data: invoice("Sales Invoice", "SI-001", "33311-KAIRO", 100_000) });
      if (url.pathname.endsWith("/resource/Purchase%20Invoice/PI-001")) return Response.json({ data: invoice("Purchase Invoice", "PI-001", "1331-KAIRO", 50_000) });
      return new Response("not found", { status: 404 });
    },
  };
  const args = { ruleset: "VAT-KAIRO-2026", from_date: "2026-08-01", to_date: "2026-08-31", limit_per_type: 100 };
  const response = await handleVatMethod("vn-accounting.vat.dataset", request("vn-accounting.vat.dataset", args), { PLATFORM: platform }, args);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.summary.output_vat_minor, 100_000);
  assert.equal(body.message.summary.input_vat_minor, 50_000);
  assert.equal(body.message.summary.net_vat_minor, 50_000);
  assert.equal(body.message.summary.ready_for_filing_dataset, true);
  assert.equal(body.message.truncated, false);
  assert.deepEqual(body.message.errors, []);
});

test("VAT dataset fails readiness on malformed source and conservative truncation", async () => {
  const salesRows = Array.from({ length: 2 }, (_, index) => ({ name: `SI-${index + 1}`, posting_at: "2026-08-03T08:00:00Z", docstatus: 1, company: "Kairo" }));
  const platform = {
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname.endsWith("/resource/VN%20Tax%20Ruleset/VAT-KAIRO-2026")) return Response.json({ data: ruleset() });
      if (url.pathname.endsWith("/resource/Sales%20Invoice") && url.search) return Response.json({ data: salesRows });
      if (url.pathname.endsWith("/resource/Purchase%20Invoice") && url.search) return Response.json({ data: [] });
      if (url.pathname.endsWith("/resource/Sales%20Invoice/SI-1")) {
        return Response.json({ data: invoice("Sales Invoice", "SI-1", "UNMAPPED", 100_000) });
      }
      if (url.pathname.endsWith("/resource/Sales%20Invoice/SI-2")) {
        return Response.json({ data: invoice("Sales Invoice", "SI-2", "33311-KAIRO", 100_000, { taxes: [{ account: "33311-KAIRO" }] }) });
      }
      return new Response("not found", { status: 404 });
    },
  };
  const args = { ruleset: "VAT-KAIRO-2026", from_date: "2026-08-01", to_date: "2026-08-31", limit_per_type: 2 };
  const response = await handleVatMethod("vn-accounting.vat.dataset", request("vn-accounting.vat.dataset", args), { PLATFORM: platform }, args);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.message.truncated, true);
  assert.equal(body.message.errors.length, 1);
  assert.equal(body.message.summary.ready_for_filing_dataset, false);
  assert.ok(body.message.summary.exception_count >= 3);
});

test("VAT service refuses wrong ruleset type, cross-company invoice and invalid period", async () => {
  async function run(rule, source) {
    const platform = {
      async fetch(req) {
        const url = new URL(req.url);
        if (url.pathname.includes("VN%20Tax%20Ruleset")) return Response.json({ data: rule });
        return Response.json({ data: source });
      },
    };
    const args = { ruleset: "VAT-KAIRO-2026", source_doctype: "Sales Invoice", source_name: "SI-001" };
    return handleVatMethod("vn-accounting.vat.invoice_reconcile", request("vn-accounting.vat.invoice_reconcile", args), { PLATFORM: platform }, args);
  }
  assert.equal((await run(ruleset({ rule_type: "CIT" }), invoice("Sales Invoice", "SI-001", "33311-KAIRO", 1))).status, 422);
  assert.equal((await run(ruleset(), invoice("Sales Invoice", "SI-001", "33311-KAIRO", 1, { company: "Other" }))).status, 422);
  assert.equal((await run(ruleset({ effective_to: "2026-07-31" }), invoice("Sales Invoice", "SI-001", "33311-KAIRO", 1))).status, 422);
});
