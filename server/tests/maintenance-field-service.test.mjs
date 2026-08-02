import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps-src", "maintenance");
const PACK = path.join(ROOT, "scripts", "pack-app.mjs");
const json = (file) => JSON.parse(readFileSync(path.join(APP, file), "utf8"));
const field = (doctype, name) => {
  const found = doctype.fields.find((entry) => entry.fieldname === name);
  assert.ok(found, `${doctype.name}.${name} must exist`);
  return found;
};
const transition = (workflow, action) => {
  const found = workflow.transitions.find((entry) => entry.action === action);
  assert.ok(found, `${workflow.name}.${action} must exist`);
  return found;
};

test("maintenance exposes entitlement warranty field-service reports and validators", () => {
  const app = json("app.json");
  const roles = json("roles.json");
  assert.equal(app.version, "1.4.0");
  assert.equal(app.worker, "cloudforge-app-ws07");
  assert.deepEqual(app.validators.map((entry) => entry.doctype), ["Maintenance Request", "Service Contract", "Warranty Claim", "Service Order"]);
  for (const key of ["Maintenance Request", "Warranty Claim", "Service Order", "Service Contract", "Service Technician"]) {
    assert.ok(app.nav.some((entry) => entry.key === key), `missing nav ${key}`);
  }
  assert.ok(app.reports.some((entry) => entry.name === "Service Order Control"));
  assert.ok(app.reports.some((entry) => entry.name === "Warranty Claim Control"));
  assert.ok(roles.some((entry) => entry.role === "Maintenance Technician" && entry.desk_access === true));
});

test("service contract and warranty keep authoritative provenance and approvals", () => {
  const contract = json("doctypes/service-contract.json");
  const covered = json("doctypes/service-contract-item.json");
  const contractWorkflow = json("workflows/service-contract.json");
  const request = json("doctypes/maintenance-request.json");
  const claim = json("doctypes/warranty-claim.json");
  const claimWorkflow = json("workflows/warranty-claim.json");

  assert.equal(field(contract, "covered_items").options, "Service Contract Item");
  assert.equal(field(covered, "serial_no").options, "Serial No");
  assert.equal(transition(contractWorkflow, "Phê duyệt").allow_self_approval, false);
  assert.equal(field(request, "service_contract").options, "Service Contract");
  assert.equal(field(request, "source_delivery_note").options, "Delivery Note");
  assert.equal(field(request, "warranty_reference").mandatory_depends_on, "eval:doc.request_type == 'Bảo hành' && !doc.service_contract");
  assert.equal(field(claim, "eligibility_result").default, "Chưa xác minh");
  assert.equal(transition(claimWorkflow, "Chấp nhận quyền lợi").allow_self_approval, false);
  assert.equal(transition(claimWorkflow, "Bắt đầu xử lý").allowed_role, "Maintenance Technician");
});

test("service order requires structured execution evidence", () => {
  const order = json("doctypes/service-order.json");
  const checklist = json("doctypes/service-checklist-item.json");
  const parts = json("doctypes/service-part-usage.json");
  const workflow = json("workflows/service-order.json");

  assert.equal(field(order, "technician").options, "Service Technician");
  assert.equal(field(order, "checklist").options, "Service Checklist Item");
  assert.equal(field(order, "parts_used").options, "Service Part Usage");
  assert.equal(field(checklist, "photo").fieldtype, "Attach");
  assert.equal(field(parts, "stock_reference").fieldtype, "Data");
  assert.equal(order.viewPolicy.calendar.enabled, true);
  assert.equal(transition(workflow, "Bắt đầu").allowed_role, "Maintenance Technician");
  assert.equal(transition(workflow, "Hoàn tất").allow_self_approval, false);
});

test("maintenance prints and package compiler preserve the contract", () => {
  assert.equal(json("prints/service-contract.json").doc_type, "Service Contract");
  assert.equal(json("prints/warranty-claim.json").doc_type, "Warranty Claim");
  const print = json("prints/service-order.json");
  assert.equal(print.doc_type, "Service Order");
  assert.ok(print.html.includes("doc.checklist"));
  assert.ok(print.html.includes("doc.parts_used"));
  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `maintenance pack check failed: ${result.stdout}${result.stderr}`);
});
