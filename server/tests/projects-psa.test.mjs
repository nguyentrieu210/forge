import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps-src", "projects");
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

test("projects package exposes project task and timesheet capabilities", () => {
  const app = json("app.json");
  const roles = json("roles.json");

  assert.equal(app.id, "projects");
  assert.equal(app.version, "1.0.0");
  assert.deepEqual(app.nav.map((entry) => entry.key), ["Project", "Project Task", "Project Timesheet"]);
  assert.ok(roles.some((entry) => entry.role === "Project User" && entry.desk_access === true));
  assert.ok(roles.some((entry) => entry.role === "Project Manager" && entry.desk_access === true));
});

test("project owns planning horizon and explicit resource assignments", () => {
  const project = json("doctypes/project.json");
  const resource = json("doctypes/project-resource-assignment.json");

  assert.equal(field(project, "company").options, "Company");
  assert.equal(field(project, "customer").options, "Customer");
  assert.equal(field(project, "planned_start").required, true);
  assert.equal(field(project, "planned_end").required, true);
  assert.equal(field(project, "resources").fieldtype, "Table");
  assert.equal(field(project, "resources").options, "Project Resource Assignment");
  assert.equal(resource.is_child, true);
  assert.equal(field(resource, "user").options, "User");
  assert.equal(field(resource, "employee").options, "Employee");
  assert.equal(field(resource, "allocation_percent").fieldtype, "Percent");
  assert.equal(project.viewPolicy.gantt.enabled, true);
});

test("task models WBS parent dependencies milestone schedule and manager confirmation", () => {
  const task = json("doctypes/project-task.json");
  const dependency = json("doctypes/project-task-dependency.json");
  const workflow = json("workflows/project-task.json");

  assert.equal(field(task, "project").options, "Project");
  assert.equal(field(task, "parent_task").options, "Project Task");
  assert.equal(field(task, "dependencies").options, "Project Task Dependency");
  assert.equal(field(task, "milestone").fieldtype, "Check");
  assert.equal(task.viewPolicy.gantt.enabled, true);
  assert.equal(dependency.is_child, true);
  assert.equal(field(dependency, "depends_on").options, "Project Task");
  assert.ok(field(dependency, "dependency_type").options.includes("Finish-to-Start"));

  assert.equal(transition(workflow, "Gửi hoàn tất").allowed_role, "Project User");
  const complete = transition(workflow, "Xác nhận hoàn tất");
  assert.equal(complete.allowed_role, "Project Manager");
  assert.equal(complete.allow_self_approval, false);
});

test("timesheet approval is authoritative before later billing integration", () => {
  const timesheet = json("doctypes/project-timesheet.json");
  const detail = json("doctypes/project-timesheet-detail.json");
  const workflow = json("workflows/project-timesheet.json");

  assert.equal(timesheet.is_submittable, true);
  assert.equal(field(timesheet, "project").options, "Project");
  assert.equal(field(timesheet, "employee").options, "Employee");
  assert.equal(field(timesheet, "details").options, "Project Timesheet Detail");
  assert.equal(detail.is_child, true);
  assert.equal(field(detail, "task").options, "Project Task");
  assert.equal(field(detail, "hours").fieldtype, "Float");
  assert.equal(field(detail, "billable").fieldtype, "Check");

  const approve = transition(workflow, "Phê duyệt");
  assert.deepEqual(
    { state: approve.state, next: approve.next_state, role: approve.allowed_role, self: approve.allow_self_approval },
    { state: "Chờ duyệt", next: "Đã duyệt", role: "Project Manager", self: false },
  );

  const forbiddenFinanceFields = ["billing_rate", "billable_amount", "invoice", "gl_entry", "revenue"];
  for (const name of forbiddenFinanceFields) {
    assert.equal(timesheet.fields.some((entry) => entry.fieldname === name), false, `${name} must wait for WS01 authority`);
  }
});

test("project lifecycle, prints and package compiler remain deterministic", () => {
  const projectWorkflow = json("workflows/project.json");
  const projectPrint = json("prints/project.json");
  const timesheetPrint = json("prints/project-timesheet.json");

  assert.equal(transition(projectWorkflow, "Khởi động").next_state, "Đang thực hiện");
  assert.equal(transition(projectWorkflow, "Tạm dừng").next_state, "Tạm dừng");
  assert.equal(transition(projectWorkflow, "Hoàn tất").next_state, "Hoàn tất");
  assert.equal(projectPrint.doc_type, "Project");
  assert.ok(projectPrint.html.includes("{{ doc.objective }}"));
  assert.equal(timesheetPrint.doc_type, "Project Timesheet");

  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `projects pack check failed: ${result.stdout}${result.stderr}`);
});
