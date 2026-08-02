import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";

const accountingRoot = new URL("../apps-src/vn-accounting/", import.meta.url);

function fieldMap(doctype) {
  return new Map(doctype.fields.map((field) => [field.fieldname, field]));
}

test("VN accounting 1.2 exposes TT99 statutory configuration and reporting", async () => {
  const source = await readAppSource(fileURLToPath(accountingRoot));
  const parsed = parseAppManifest(source);

  assert.equal(parsed.id, "vn-accounting");
  assert.equal(parsed.version, "1.2.0");

  for (const key of [
    "TT99 Account Map",
    "TT99 Voucher Form",
    "TT99 Book Form",
    "TT99 Financial Statement Template",
    "TT99 Transition Map",
    "Tax Ruleset",
    "E-Invoice Document",
  ]) {
    assert.ok(parsed.nav.some((item) => item.key === key), `${key} must be navigable`);
    assert.ok(parsed.doctypes.some((item) => item.name === key), `${key} must exist`);
  }

  for (const route of [
    "/app/query-report/General%20Ledger",
    "/app/query-report/Trial%20Balance",
    "/app/query-report/Balance%20Sheet",
    "/app/query-report/Profit%20and%20Loss%20Statement",
    "/app/query-report/Cash%20Flow",
  ]) {
    assert.ok(parsed.nav.some((item) => item.route === route), `${route} must be exposed`);
  }

  assert.ok(parsed.roles.some((item) => item.role === "Tax Specialist"));
  assert.ok(parsed.roles.some((item) => item.role === "Accounting Auditor"));
});

test("TT99 definitions carry legal, effective-date and test evidence", async () => {
  const parsed = parseAppManifest(await readAppSource(fileURLToPath(accountingRoot)));

  const accountMap = fieldMap(parsed.doctypes.find((item) => item.name === "TT99 Account Map"));
  for (const field of [
    "company", "source_account", "statutory_account_code", "statutory_account_name",
    "target_account", "legal_rule", "effective_from", "mapping_reason", "test_evidence_json",
  ]) assert.equal(accountMap.get(field)?.required, true, `${field} must be required`);

  const voucher = fieldMap(parsed.doctypes.find((item) => item.name === "TT99 Voucher Form"));
  for (const field of ["form_code", "legal_rule", "document_type", "template_version", "template_json", "effective_from"]) {
    assert.equal(voucher.get(field)?.required, true, `${field} must be required`);
  }

  const book = fieldMap(parsed.doctypes.find((item) => item.name === "TT99 Book Form"));
  for (const field of ["book_code", "legal_rule", "source_ledger", "template_version", "columns_json", "effective_from"]) {
    assert.equal(book.get(field)?.required, true, `${field} must be required`);
  }

  const statement = fieldMap(parsed.doctypes.find((item) => item.name === "TT99 Financial Statement Template"));
  for (const field of ["statement_code", "legal_rule", "statement_type", "template_version", "lines_json", "effective_from"]) {
    assert.equal(statement.get(field)?.required, true, `${field} must be required`);
  }
});

test("tax and e-invoice evidence are versioned separately from TT99", async () => {
  const parsed = parseAppManifest(await readAppSource(fileURLToPath(accountingRoot)));

  const ruleset = fieldMap(parsed.doctypes.find((item) => item.name === "Tax Ruleset"));
  for (const field of ["rule_type", "scope_key", "legal_rule", "scope_json", "expression_json", "fixtures_json", "effective_from"]) {
    assert.equal(ruleset.get(field)?.required, true, `${field} must be required`);
  }
  assert.equal(ruleset.get("ruleset_hash")?.read_only, true);
  assert.equal(ruleset.get("test_passed")?.read_only, true);

  const invoice = fieldMap(parsed.doctypes.find((item) => item.name === "E-Invoice Document"));
  for (const field of [
    "company", "sales_invoice", "provider", "invoice_form", "invoice_series", "invoice_number",
    "issued_at", "xml_schema_version", "xml_file", "legal_rule", "tax_ruleset", "correction_type",
  ]) assert.equal(invoice.get(field)?.required, true, `${field} must be required`);
  assert.equal(invoice.get("xml_hash")?.read_only, true);
  assert.equal(invoice.get("response_payload_hash")?.read_only, true);

  const taxWorkflow = parsed.workflows.find((item) => item.document_type === "Tax Ruleset");
  assert.ok(taxWorkflow);
  assert.ok(taxWorkflow.transitions.some((item) => item.action === "Phê duyệt" && item.allow_self_approval === false));
});
