import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";

const accountingRoot = new URL("../apps-src/vn-accounting/", import.meta.url);
const byName = (items, name) => items.find((item) => item.name === name);
const fields = (doctype) => new Map(doctype.fields.map((field) => [field.fieldname, field]));

function assertFourEyes(workflow, makerRole) {
  assert.ok(workflow, "workflow must exist");
  const submit = workflow.transitions.find((transition) => transition.action === "Gửi duyệt");
  const approve = workflow.transitions.find((transition) => transition.action === "Phê duyệt");
  assert.equal(submit?.allowed_role, makerRole);
  assert.equal(approve?.allowed_role, "Chief Accountant");
  assert.equal(approve?.allow_self_approval, false);
}

test("VN accounting exposes statutory registries, tax worker and finance budget operations", async () => {
  const parsed = parseAppManifest(await readAppSource(fileURLToPath(accountingRoot)));
  assert.equal(parsed.id, "vn-accounting");
  assert.equal(parsed.version, "1.6.0");
  assert.equal(parsed.worker, "cloudforge-app-vn-accounting");
  assert.ok(parsed.validators.some((item) => item.doctype === "VN Tax Ruleset" && item.actions?.includes("submit")));

  const evaluator = parsed.actions.find((item) => item.name === "tax-evaluate");
  assert.ok(evaluator);
  assert.equal(evaluator.permission_doctype, "VN Tax Ruleset");
  assert.equal(evaluator.permission_action, "read");
  assert.equal(evaluator.commit.method, "vn-accounting.tax.evaluate");
  assert.ok(parsed.nav.some((item) => item.key === "tax-evaluate" && item.route === "/x/action:tax-evaluate"));

  for (const name of [
    "TT99 Account Map",
    "TT99 Voucher Form",
    "TT99 Book Form",
    "TT99 Financial Statement Template",
    "VN Tax Ruleset",
  ]) {
    assert.ok(byName(parsed.doctypes, name), `${name} must be packaged`);
    assert.ok(parsed.nav.some((item) => item.key === name), `${name} must be navigable`);
  }

  for (const [key, route] of [
    ["finance-budget", "/app/Finance%20Budget"],
    ["finance-budget-revision", "/app/Finance%20Budget%20Revision"],
    ["finance-budget-commitment", "/app/Finance%20Budget%20Commitment"],
  ]) {
    assert.ok(parsed.nav.some((item) => item.key === key && item.route === route), `${key} must be navigable`);
  }

  assert.ok(parsed.externalDocTypes.some((item) => item.name === "E-Invoice Submission" && item.app === "erpnext"));
  assert.ok(parsed.nav.some((item) => item.key === "e-invoice-submission" && item.route === "/app/E-Invoice%20Submission"));

  const legal = byName(parsed.doctypes, "VN Legal Rule");
  const legalFields = fields(legal);
  assert.equal(legal.is_submittable, true);
  assert.equal(legalFields.get("rule_version")?.required, true);
  assert.equal(legalFields.get("source_file_hash")?.required, true);
  assert.match(String(legalFields.get("rule_type")?.options), /Insurance/);
  assert.equal(legalFields.get("approved_by")?.read_only, true);
  assert.equal(legalFields.get("approved_at")?.read_only, true);

  const voucher = byName(parsed.doctypes, "TT99 Voucher Form");
  const book = byName(parsed.doctypes, "TT99 Book Form");
  const statement = byName(parsed.doctypes, "TT99 Financial Statement Template");
  for (const registry of [voucher, book, statement]) {
    const map = fields(registry);
    assert.equal(registry.is_submittable, true);
    assert.equal(map.get("legal_rule")?.required, true);
    assert.equal(map.get("effective_from")?.required, true);
    assert.equal(map.get("test_evidence_json")?.required, true);
    assert.equal(map.get("approved_by")?.read_only, true);
  }
  assert.equal(fields(statement).get("lines_json")?.required, true);
  assert.equal(fields(statement).get("rounding_digits")?.required, true);

  const tax = byName(parsed.doctypes, "VN Tax Ruleset");
  const taxFields = fields(tax);
  for (const required of ["company", "rule_type", "taxpayer_segment", "schema_version", "effective_from", "expression_json", "test_vectors_json", "legal_rule", "source_hash"]) {
    assert.equal(taxFields.get(required)?.required, true, `${required} must be required on VN Tax Ruleset`);
  }
  assert.equal(taxFields.get("schema_version")?.read_only, true);
  assert.equal(taxFields.get("schema_version")?.default, 1);
  assert.ok(tax.permissions.some((permission) => permission.role === "Tax Specialist" && permission.create));
  assert.ok(tax.permissions.some((permission) => permission.role === "Internal Auditor" && permission.read && !permission.write));

  assertFourEyes(parsed.workflows.find((item) => item.document_type === "VN Legal Rule"), "Tax Specialist");
  assertFourEyes(parsed.workflows.find((item) => item.document_type === "TT99 Account Map"), "General Accountant");
  assertFourEyes(parsed.workflows.find((item) => item.document_type === "TT99 Voucher Form"), "General Accountant");
  assertFourEyes(parsed.workflows.find((item) => item.document_type === "TT99 Book Form"), "General Accountant");
  assertFourEyes(parsed.workflows.find((item) => item.document_type === "TT99 Financial Statement Template"), "General Accountant");
  assertFourEyes(parsed.workflows.find((item) => item.document_type === "VN Tax Ruleset"), "Tax Specialist");
});
