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

test("projects package exposes portfolio, planning, execution, capacity and acceptance controls", () => {
  const app = json("app.json");
  const roles = json("roles.json");

  assert.equal(app.id, "projects");
  assert.equal(app.version, "1.2.0");
  for (const key of [
    "Project Portfolio", "Project Template", "Project Capacity Plan", "Project", "Project Task",
    "Project Change Order", "Project Acceptance Certificate", "Project Timesheet",
  ]) {
    assert.ok(app.nav.some((entry) => entry.key === key), `missing nav ${key}`);
  }
  for (const report of ["Project Task Control", "Project Timesheet Control", "Project Change Order Control", "Project Acceptance Control"]) {
    assert.ok(app.reports.some((entry) => entry.name === report), `missing report ${report}`);
  }
  assert.ok(roles.some((entry) => entry.role === "Project User" && entry.desk_access === true));
  assert.ok(roles.some((entry) => entry.role === "Project Manager" && entry.desk_access === true));
});

test("portfolio and template contracts are explicit rather than inferred from UI", () => {
  const portfolio = json("doctypes/project-portfolio.json");
  const portfolioItem = json("doctypes/project-portfolio-item.json");
  const template = json("doctypes/project-template.json");
  const templateTask = json("doctypes/project-template-task.json");
  const project = json("doctypes/project.json");

  assert.equal(field(portfolio, "portfolio_owner").options, "User");
  assert.equal(field(portfolio, "projects").options, "Project Portfolio Item");
  assert.equal(portfolioItem.is_child, true);
  assert.equal(field(portfolioItem, "project").options, "Project");
  assert.equal(field(template, "tasks").options, "Project Template Task");
  assert.equal(templateTask.is_child, true);
  assert.equal(field(templateTask, "task_key").required, true);
  assert.equal(field(templateTask, "duration_days").required, true);
  assert.equal(field(project, "template").options, "Project Template");
});

test("project owns planning horizon, resources and gantt without financial shadow fields", () => {
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

  for (const forbidden of ["budget", "actual_cost", "revenue", "profit", "cash_flow", "retention"]) {
    assert.equal(project.fields.some((entry) => entry.fieldname === forbidden), false, `${forbidden} must stay with WS01 authority`);
  }
});

test("capacity planning is structured but does not invent availability calculations", () => {
  const plan = json("doctypes/project-capacity-plan.json");
  const line = json("doctypes/project-capacity-line.json");

  assert.equal(field(plan, "company").options, "Company");
  assert.equal(field(plan, "resources").options, "Project Capacity Line");
  assert.equal(line.is_child, true);
  assert.equal(field(line, "available_hours").required, true);
  assert.equal(field(line, "planned_hours").required, true);
  assert.equal(field(line, "target_utilization_percent").fieldtype, "Percent");
  assert.equal(line.fields.some((entry) => entry.fieldname === "computed_available_hours"), false);
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

test("change orders and acceptance certificates separate operational approval from finance", () => {
  const change = json("doctypes/project-change-order.json");
  const changeWorkflow = json("workflows/project-change-order.json");
  const acceptance = json("doctypes/project-acceptance-certificate.json");
  const acceptanceWorkflow = json("workflows/project-acceptance-certificate.json");

  assert.equal(field(change, "project").options, "Project");
  assert.equal(field(change, "commercial_reference").fieldtype, "Data");
  assert.equal(change.fields.some((entry) => ["amount", "revenue", "cost"].includes(entry.fieldname)), false);
  const changeApprove = transition(changeWorkflow, "Phê duyệt");
  assert.equal(changeApprove.allow_self_approval, false);
  assert.equal(changeApprove.next_state, "Đã duyệt");

  assert.equal(field(acceptance, "project").options, "Project");
  assert.equal(field(acceptance, "task").options, "Project Task");
  assert.equal(field(acceptance, "signed_document").mandatory_depends_on, "eval:doc.workflow_state == 'Đã xác nhận'");
  assert.equal(field(acceptance, "commercial_reference").fieldtype, "Data");
  const accept = transition(acceptanceWorkflow, "Xác nhận nghiệm thu");
  assert.equal(accept.allow_self_approval, false);
  assert.equal(accept.next_state, "Đã xác nhận");
});

test("project lifecycle, evidence prints and package compiler remain deterministic", () => {
  const projectWorkflow = json("workflows/project.json");
  const projectPrint = json("prints/project.json");
  const timesheetPrint = json("prints/project-timesheet.json");
  const changePrint = json("prints/project-change-order.json");
  const acceptancePrint = json("prints/project-acceptance-certificate.json");

  assert.equal(transition(projectWorkflow, "Khởi động").next_state, "Đang thực hiện");
  assert.equal(transition(projectWorkflow, "Tạm dừng").next_state, "Tạm dừng");
  assert.equal(transition(projectWorkflow, "Hoàn tất").next_state, "Hoàn tất");
  assert.equal(projectPrint.doc_type, "Project");
  assert.ok(projectPrint.html.includes("{{ doc.objective }}"));
  assert.equal(timesheetPrint.doc_type, "Project Timesheet");
  assert.equal(changePrint.doc_type, "Project Change Order");
  assert.equal(acceptancePrint.doc_type, "Project Acceptance Certificate");

  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `projects pack check failed: ${result.stdout}${result.stderr}`);
});
