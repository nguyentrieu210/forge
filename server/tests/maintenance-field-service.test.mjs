import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps-src", "maintenance");
const PACK = path.join(ROOT, "scripts", "pack-app.mjs");

function json(relativePath) {
  return JSON.parse(readFileSync(path.join(APP, relativePath), "utf8"));
}

function field(doctype, fieldname) {
  const found = doctype.fields.find((entry) => entry.fieldname === fieldname);
  assert.ok(found, `${doctype.name}.${fieldname} must exist`);
  return found;
}

function transition(workflow, action) {
  const found = workflow.transitions.find((entry) => entry.action === action);
  assert.ok(found, `${workflow.name}.${action} transition must exist`);
  return found;
}

test("maintenance package exposes entitlement, warranty and field-service navigation", () => {
  const app = json("app.json");
  const roles = json("roles.json");

  assert.equal(app.version, "1.2.0");
  assert.deepEqual(app.nav.map((entry) => entry.key), [
    "Maintenance Request",
    "Warranty Claim",
    "Service Order",
    "Service Contract",
    "Service Technician",
  ]);
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Serial No" && entry.app === "stock"));
  assert.ok(app.externalDocTypes.some((entry) => entry.name === "Delivery Note" && entry.app === "selling"));
  assert.ok(roles.some((entry) => entry.role === "Maintenance Technician" && entry.desk_access === true));
});

test("service contract is approval-controlled and owns explicit covered-item rows", () => {
  const contract = json("doctypes/service-contract.json");
  const item = json("doctypes/service-contract-item.json");
  const workflow = json("workflows/service-contract.json");

  assert.equal(contract.is_submittable, true);
  assert.equal(field(contract, "covered_items").fieldtype, "Table");
  assert.equal(field(contract, "covered_items").options, "Service Contract Item");
  assert.equal(item.is_child, true);
  assert.equal(field(item, "item").options, "Item");
  assert.equal(field(item, "serial_no").options, "Serial No");
  assert.equal(field(contract, "effective_from").required, true);
  assert.equal(field(contract, "effective_to").required, true);
  assert.equal(field(contract, "response_hours").required, true);
  assert.equal(field(contract, "resolution_hours").required, true);

  const approve = transition(workflow, "Phê duyệt");
  assert.deepEqual(
    { state: approve.state, next: approve.next_state, role: approve.allowed_role, self: approve.allow_self_approval },
    { state: "Chờ duyệt", next: "Hiệu lực", role: "Maintenance Manager", self: false },
  );
});

test("maintenance intake keeps delivery, contract, item and serial provenance", () => {
  const request = json("doctypes/maintenance-request.json");
  const warrantyReference = field(request, "warranty_reference");

  assert.equal(field(request, "service_contract").options, "Service Contract");
  assert.equal(field(request, "source_delivery_note").options, "Delivery Note");
  assert.equal(field(request, "item").options, "Item");
  assert.equal(field(request, "serial_no").options, "Serial No");
  assert.equal(warrantyReference.mandatory_depends_on, "eval:doc.request_type == 'Bảo hành' && !doc.service_contract");
});

test("warranty claim separates entitlement verification from technical execution", () => {
  const claim = json("doctypes/warranty-claim.json");
  const workflow = json("workflows/warranty-claim.json");

  assert.equal(field(claim, "service_contract").options, "Service Contract");
  assert.equal(field(claim, "source_delivery_note").options, "Delivery Note");
  assert.equal(field(claim, "serial_no").options, "Serial No");
  assert.equal(field(claim, "eligibility_result").default, "Chưa xác minh");
  assert.ok(field(claim, "eligibility_reason").mandatory_depends_on.includes("Đủ điều kiện"));
  assert.ok(field(claim, "eligibility_reason").mandatory_depends_on.includes("Từ chối"));

  const eligible = transition(workflow, "Chấp nhận quyền lợi");
  assert.deepEqual(
    { state: eligible.state, next: eligible.next_state, role: eligible.allowed_role, self: eligible.allow_self_approval },
    { state: "Chờ xác minh", next: "Đủ điều kiện", role: "Maintenance Manager", self: false },
  );
  assert.equal(transition(workflow, "Bắt đầu xử lý").allowed_role, "Maintenance Technician");
  assert.equal(transition(workflow, "Hoàn tất").allow_self_approval, false);
});

test("service order requires completion evidence and exposes schedule views", () => {
  const order = json("doctypes/service-order.json");
  const workflow = json("workflows/service-order.json");

  assert.equal(field(order, "maintenance_request").options, "Maintenance Request");
  assert.equal(field(order, "warranty_claim").options, "Warranty Claim");
  assert.equal(field(order, "service_contract").options, "Service Contract");
  assert.equal(field(order, "technician").options, "Service Technician");
  assert.equal(field(order, "serial_no").options, "Serial No");
  assert.equal(order.viewPolicy.calendar.enabled, true);
  assert.equal(order.viewPolicy.calendar.startField, "scheduled_start");
  assert.equal(order.viewPolicy.calendar.endField, "scheduled_end");

  for (const fieldname of ["actual_start", "actual_end", "checklist_result", "work_performed", "resolution"]) {
    assert.equal(field(order, fieldname).mandatory_depends_on.includes("Chờ xác nhận"), true);
  }
  assert.equal(field(order, "customer_confirmed_by").mandatory_depends_on, "eval:doc.workflow_state == 'Hoàn tất'");
  assert.equal(field(order, "photo_evidence").fieldtype, "Attach");
  assert.equal(field(order, "customer_signature").fieldtype, "Attach");

  const start = transition(workflow, "Bắt đầu");
  assert.deepEqual(
    { state: start.state, next: start.next_state, role: start.allowed_role },
    { state: "Đã lên lịch", next: "Đang thực hiện", role: "Maintenance Technician" },
  );
  assert.equal(transition(workflow, "Hoàn tất").allow_self_approval, false);
});

test("service evidence prints are source-linked and package compiles through app packer", () => {
  const contractPrint = json("prints/service-contract.json");
  const claimPrint = json("prints/warranty-claim.json");
  const servicePrint = json("prints/service-order.json");

  assert.equal(contractPrint.doc_type, "Service Contract");
  assert.ok(contractPrint.html.includes("{{ doc.response_hours }}"));
  assert.equal(claimPrint.doc_type, "Warranty Claim");
  assert.ok(claimPrint.html.includes("{{ doc.eligibility_result }}"));
  assert.equal(servicePrint.doc_type, "Service Order");
  assert.ok(servicePrint.html.includes("{{ doc.warranty_claim }}"));
  assert.ok(servicePrint.html.includes("{{ doc.resolution }}"));

  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `maintenance pack check failed: ${result.stdout}${result.stderr}`);
});
