import test from "node:test";
import assert from "node:assert/strict";
import { EmployeePositionAssignmentController, OrganizationPositionController } from "../dist/packages/clouderp-erpnext/src/hrm-organization-controllers.js";

function document(name, data, docstatus = 1, version = 1) { return { name, docstatus, version, data }; }
function fakeReader({ masters = {}, documents = {} } = {}) {
  return {
    async getDocument(_tenant, doctype, name) { return documents[`${doctype}:${name}`] ?? null; },
    async getMasterRecordData(_tenant, doctype, name) { return masters[`${doctype}:${name}`] ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) { return Object.entries(documents).filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value); },
    async hasMasterRecord(_tenant, doctype, name) { return Boolean(masters[`${doctype}:${name}`]); },
    async getPeriodLockDate() { return null; },
  };
}
function context(doctype, name, action, data, reader) { return { command: { tenant_id: "demo", aggregate: { doctype, name }, action, actor: { user_id: "hr@example.test", roles: ["HR Manager"] }, document: data }, reader, existing: null, nextVersion: 1, now: "2026-08-03T00:00:00Z" }; }

const orgMasters = {
  "Company:Demo": {},
  "Branch:BR-A": { company: "Demo" },
  "Department:OPS": { company: "Demo" },
  "Designation:MANAGER": {},
  "Designation:ENGINEER": {},
};

test("organization position rejects hierarchy cycle and validates scope", async () => {
  const documents = {
    "Organization Position:ROOT": document("ROOT", { position_code: "ROOT", position_name: "Root", company: "Demo", branch: "BR-A", department: "OPS", designation: "MANAGER", parent_position: "CHILD", planned_seats: 1, active: 1 }, 0),
    "Organization Position:CHILD": document("CHILD", { position_code: "CHILD", position_name: "Child", company: "Demo", branch: "BR-A", department: "OPS", designation: "ENGINEER", parent_position: "ROOT", planned_seats: 2, active: 1 }, 0),
  };
  const controller = new OrganizationPositionController();
  await assert.rejects(controller.normalize(context("Organization Position", "ROOT", "save", { position_code: "ROOT", position_name: "Root", company: "Demo", branch: "BR-A", department: "OPS", designation: "MANAGER", parent_position: "CHILD", planned_seats: 1 }, fakeReader({ masters: orgMasters, documents }))), /hierarchy cycle detected/);
});

test("position assignment enforces employee scope, no overlap and planned seat capacity", async () => {
  const masters = {
    ...orgMasters,
    "Employee:EMP-1": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A", department: "OPS", designation: "ENGINEER" },
    "Employee:EMP-2": { employee_status: "Đang làm việc", company: "Demo", branch: "BR-A", department: "OPS", designation: "ENGINEER" },
    "Organization Position:ENG": { position_code: "ENG", company: "Demo", branch: "BR-A", department: "OPS", designation: "ENGINEER", planned_seats: 1, active: 1 },
  };
  const documents = {
    "Employee Position Assignment:PA-OLD": document("PA-OLD", { employee: "EMP-1", position: "ENG", from_date: "2026-01-01", to_date: "2026-12-31" }),
  };
  const controller = new EmployeePositionAssignmentController();
  const reader = fakeReader({ masters, documents });
  await assert.rejects(controller.normalize(context("Employee Position Assignment", "PA-EMP", "submit", { employee: "EMP-1", position: "ENG", from_date: "2026-06-01", to_date: "2026-06-30", reason: "Duplicate" }, reader)), /already has an overlapping position assignment/);
  await assert.rejects(controller.normalize(context("Employee Position Assignment", "PA-CAP", "submit", { employee: "EMP-2", position: "ENG", from_date: "2026-06-01", to_date: "2026-06-30", reason: "Fill" }, reader)), /has no free planned seat/);
});
