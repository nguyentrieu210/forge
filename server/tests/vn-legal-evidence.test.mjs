import assert from "node:assert/strict";
import test from "node:test";
import { parseVnLegalEvidence } from "../dist/apps-src/vn-accounting-worker/src/legal-evidence.js";

function legalRule(overrides = {}) {
  return {
    name: "VAT-2026",
    docstatus: 1,
    rule_type: "VAT",
    rule_version: "2026.1",
    document_no: "VAT-OFFICIAL-2026",
    regime_code: "Tax-specific",
    taxpayer_segment: "enterprise",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
    source_url: "https://official.example/vat-2026",
    source_file_hash: "b".repeat(64),
    ...overrides,
  };
}

test("legal evidence preserves approved source/version/effective-date identity", () => {
  assert.deepEqual(
    parseVnLegalEvidence(legalRule(), "VAT-2026", "VAT", "2026-01-01", "2026-12-31"),
    {
      rule: "VAT-2026",
      rule_type: "VAT",
      rule_version: "2026.1",
      document_no: "VAT-OFFICIAL-2026",
      regime_code: "Tax-specific",
      taxpayer_segment: "enterprise",
      effective_from: "2026-01-01",
      effective_to: "2026-12-31",
      source_url: "https://official.example/vat-2026",
      source_file_hash: "b".repeat(64),
    },
  );
});

test("legal evidence fails closed on draft, type drift, range drift and missing source", () => {
  assert.throws(
    () => parseVnLegalEvidence(legalRule({ docstatus: 0 }), "VAT-2026", "VAT", "2026-01-01", "2026-12-31"),
    /must be submitted/,
  );
  assert.throws(
    () => parseVnLegalEvidence(legalRule({ rule_type: "CIT" }), "VAT-2026", "VAT", "2026-01-01", "2026-12-31"),
    /rule_type VAT/,
  );
  assert.throws(
    () => parseVnLegalEvidence(legalRule({ effective_to: "2026-06-30" }), "VAT-2026", "VAT", "2026-01-01", "2026-12-31"),
    /does not cover/,
  );
  assert.throws(
    () => parseVnLegalEvidence(legalRule({ source_url: "" }), "VAT-2026", "VAT", "2026-01-01", "2026-12-31"),
    /source_url is required/,
  );
});
