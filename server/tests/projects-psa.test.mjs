import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps-src", "projects");
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

test("projects exposes portfolio planning execution capacity acceptance and validators", () => {
  const app = json("app.json");
  const roles = json("roles.json");
  assert.equal(app.id, "projects");
  assert.equal(app.version, "1.3.0");
  assert.equal(app.worker, "cloudforge-app-ws07");
  for (const doctype of ["Project Portfolio", "Project Template", "Project Capacity Plan", "Project", "Project Task", "Project Timesheet", "Project Acceptance Certificate"]) {
    assert.ok(app.validators.some((entry) => entry.doctype === doctype), `missing validator ${doctype}`);
  }
  for (const key of ["Project Portfolio", "Project Template", "Project Capacity Plan", "Project", "Project Task", "Project Change Order", "Project Acceptance Certificate", "Project Timesheet"]) {
    assert.ok(app.nav.some((entry) => entry.key === key), `missing nav ${key}`);
  }
  for (const report of ["Project Task Control", "Project Timesheet Control", "Project Change Order Control", "Project Acceptance Control"]) {
    assert.ok(app.reports.some((entry) => entry.name === report), `missing report ${report}`);
  }
  assert.ok(roles.some((entry) => entry.role === "Project User" && entry.desk_access === true));
  assert.ok(roles.some((entry) => entry.role === "Project Manager" && entry.desk_access === true));
});

test("portfolio template and capacity contracts are explicit and bounded", () => {
  const portfolio = json("doctypes/project-portfolio.json");
  const portfolioItem = json("doctypes/project-portfolio-item.json");
  const template = json("doctypes/project-template.json");
  const templateTask = json("doctypes/project-template-task.json");
  const capacity = json("doctypes/project-capacity-plan.json");
  const capacityLine = json("doctypes/project-capacity-line.json");
  assert.equal(field(portfolio, "portfolio_owner").options, "User");
  assert.equal(field(portfolio, "projects").options, "Project Portfolio Item");
  assert.equal(portfolioItem.is_child, true);
  assert.equal(field(portfolioItem, "project").options, "Project");
  assert.equal(field(template, "tasks").options, "Project Template Task");
  assert.equal(templateTask.is_child, true);
  assert.equal(field(templateTask, "task_key").required, true);
  assert.equal(field(templateTask, "duration_days").required, true);
  assert.equal(field(capacity, "resources").options, "Project Capacity Line");
  assert.equal(capacityLine.is_child, true);
  assert.equal(field(capacityLine, "available_hours").required, true);
  assert.equal(field(capacityLine, "planned_hours").required, true);
  assert.equal(capacityLine.fields.some((entry) => entry.fieldname === "computed_available_hours"), false);
});

test("project and task own planning WBS resources and gantt without finance shadow truth", () => {
  const project = json("doctypes/project.json");
  const resource = json("doctypes/project-resource-assignment.json");
  const task = json("doctypes/project-task.json");
  const dependency = json("doctypes/project-task-dependency.json");
  const taskWorkflow = json("workflows/project-task.json");
  assert.equal(field(project, "template").options, "Project Template");
  assert.equal(field(project, "resources").options, "Project Resource Assignment");
  assert.equal(project.viewPolicy.gantt.enabled, true);
  assert.equal(resource.is_child, true);
  assert.equal(field(resource, "allocation_percent").fieldtype, "Percent");
  for (const forbidden of ["budget", "actual_cost", "revenue", "profit", "cash_flow", "retention"]) {
    assert.equal(project.fields.some((entry) => entry.fieldname === forbidden), false, `${forbidden} must stay outside WS07`);
  }
  assert.equal(field(task, "parent_task").options, "Project Task");
  assert.equal(field(task, "dependencies").options, "Project Task Dependency");
  assert.equal(field(task, "milestone").fieldtype, "Check");
  assert.equal(task.viewPolicy.gantt.enabled, true);
  assert.equal(dependency.is_child, true);
  assert.ok(field(dependency, "dependency_type").options.includes("Finish-to-Start"));
  assert.equal(transition(taskWorkflow, "Gửi hoàn tất").allowed_role, "Project User");
  assert.equal(transition(taskWorkflow, "Xác nhận hoàn tất").allow_self_approval, false);
});

test("timesheet approval preserves actor ownership and no billing shadow fields", () => {
  const timesheet = json("doctypes/project-timesheet.json");
  const detail = json("doctypes/project-timesheet-detail.json");
  const workflow = json("workflows/project-timesheet.json");
  assert.equal(field(timesheet, "user").options, "User");
  assert.equal(field(timesheet, "employee").options, "Employee");
  assert.equal(field(timesheet, "details").options, "Project Timesheet Detail");
  assert.equal(detail.is_child, true);
  assert.equal(field(detail, "task").options, "Project Task");
  assert.equal(field(detail, "billable").fieldtype, "Check");
  assert.equal(timesheet.permissions.find((entry) => entry.role === "Project User").if_owner, true);
  assert.equal(transition(workflow, "Phê duyệt").allow_self_approval, false);
  for (const name of ["billing_rate", "billable_amount", "invoice", "gl_entry", "revenue"]) {
    assert.equal(timesheet.fields.some((entry) => entry.fieldname === name), false, `${name} must wait for WS01`);
  }
});

test("change orders and acceptance separate operational approval from finance", () => {
  const change = json("doctypes/project-change-order.json");
  const changeWorkflow = json("workflows/project-change-order.json");
  const acceptance = json("doctypes/project-acceptance-certificate.json");
  const acceptanceWorkflow = json("workflows/project-acceptance-certificate.json");
  assert.equal(field(change, "commercial_reference").fieldtype, "Data");
  assert.equal(change.permissions.find((entry) => entry.role === "Project User").if_owner, true);
  assert.equal(transition(changeWorkflow, "Phê duyệt").allow_self_approval, false);
  assert.equal(field(acceptance, "signed_document").mandatory_depends_on, "eval:doc.workflow_state == 'Đã xác nhận'");
  assert.equal(field(acceptance, "commercial_reference").fieldtype, "Data");
  assert.equal(acceptance.permissions.find((entry) => entry.role === "Project User").if_owner, true);
  assert.equal(transition(acceptanceWorkflow, "Xác nhận nghiệm thu").allow_self_approval, false);
});

test("project prints and package compiler preserve the contract", () => {
  assert.equal(json("prints/project.json").doc_type, "Project");
  assert.equal(json("prints/project-timesheet.json").doc_type, "Project Timesheet");
  assert.equal(json("prints/project-change-order.json").doc_type, "Project Change Order");
  assert.equal(json("prints/project-acceptance-certificate.json").doc_type, "Project Acceptance Certificate");
  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `projects pack check failed: ${result.stdout}${result.stderr}`);
});
