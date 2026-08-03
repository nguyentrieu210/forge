import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readAppSource } from "../scripts/lib/read-app-source.mjs";
import { parseAppManifest } from "../dist/packages/app-registry/src/manifest.js";

const root = new URL("../apps-src/vn-accounting/", import.meta.url);
const fields = (doctype) => new Map(doctype.fields.map((field) => [field.fieldname, field]));

test("VN Accounting Policy is versioned, evidence-bound and four-eyes controlled", async () => {
  const parsed = parseAppManifest(await readAppSource(fileURLToPath(root)));
  const policy = parsed.doctypes.find((item) => item.name === "VN Accounting Policy");
  assert.ok(policy);
  const map = fields(policy);
  for (const required of [
    "company", "policy_version", "regime_code", "legal_rule", "legal_document_no",
    "fiscal_year_start", "effective_from", "accounting_currency", "legal_report_currency",
    "inventory_account", "cogs_account", "stock_adjustment_account",
    "stock_received_not_billed_account", "retained_earnings_account",
    "internal_regulation_file", "source_url", "source_file_hash",
  ]) {
    assert.equal(map.get(required)?.required, true, `${required} must be required`);
  }
  assert.equal(map.get("company")?.set_only_once, true);
  assert.equal(map.get("approved_by")?.read_only, true);
  assert.equal(map.get("approved_at")?.read_only, true);
  assert.ok(policy.permissions.some((permission) => permission.role === "Internal Auditor" && permission.read && !permission.write));
  for (const role of ["Chief Accountant", "Accounts Manager", "System Manager"]) {
    const permission = policy.permissions.find((entry) => entry.role === role);
    assert.ok(permission?.submit, `${role} must be able to approve policy`);
    assert.equal(permission?.cancel, undefined, `${role} must not cancel approved policy history`);
    assert.equal(permission?.amend, undefined, `${role} must not amend approved policy history`);
  }

  const workflow = parsed.workflows.find((item) => item.document_type === "VN Accounting Policy");
  assert.ok(workflow);
  const submit = workflow.transitions.find((transition) => transition.action === "Gửi duyệt");
  const approve = workflow.transitions.find((transition) => transition.action === "Phê duyệt");
  const retire = workflow.transitions.find((transition) => transition.action === "Kết thúc hiệu lực");
  assert.equal(submit?.allowed_role, "General Accountant");
  assert.equal(approve?.allowed_role, "Chief Accountant");
  assert.equal(approve?.allow_self_approval, false);
  assert.equal(retire?.allowed_role, "Chief Accountant");
  assert.equal(retire?.allow_self_approval, false);
  assert.equal(workflow.states.find((state) => state.state === "Hết hiệu lực")?.docstatus, 1);
});

test("VAT dataset action is read-only and ruleset carries explicit account mapping", async () => {
  const parsed = parseAppManifest(await readAppSource(fileURLToPath(root)));
  assert.equal(parsed.version, "1.6.0");
  const tax = parsed.doctypes.find((item) => item.name === "VN Tax Ruleset");
  assert.ok(tax);
  assert.equal(fields(tax).get("tax_accounts_json")?.fieldtype, "Code");
  const action = parsed.actions.find((item) => item.name === "vat-dataset");
  assert.ok(action);
  assert.equal(action.commit.method, "vn-accounting.vat.dataset");
  assert.equal(action.permission_doctype, "VN Tax Ruleset");
  assert.equal(action.permission_action, "read");
  assert.equal(action.preview, undefined);
  assert.deepEqual(action.fields.map((field) => field.fieldname), ["ruleset", "from_date", "to_date", "limit_per_type"]);
  assert.ok(parsed.nav.some((item) => item.key === "vat-dataset" && item.route === "/x/action:vat-dataset"));
});
