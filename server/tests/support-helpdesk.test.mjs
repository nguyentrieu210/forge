import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const APP = path.join(ROOT, "apps-src", "support");
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

test("support exposes queue SLA knowledge responses CSAT and validators", () => {
  const app = json("app.json");
  const roles = json("roles.json");
  assert.equal(app.id, "support");
  assert.equal(app.version, "1.2.0");
  assert.equal(app.worker, "cloudforge-app-ws07");
  assert.deepEqual(app.validators.map((entry) => entry.doctype), ["Support SLA Policy", "Support Ticket"]);
  for (const key of ["Support Ticket", "Support Team", "Support SLA Policy", "Support Knowledge Article", "Support Canned Response", "Support Feedback"]) {
    assert.ok(app.nav.some((entry) => entry.key === key), `missing nav ${key}`);
  }
  assert.ok(app.reports.some((entry) => entry.name === "Support Ticket Queue"));
  assert.ok(app.reports.some((entry) => entry.name === "Support CSAT"));
  assert.ok(roles.some((entry) => entry.role === "Support User"));
  assert.ok(roles.some((entry) => entry.role === "Support Manager"));
});

test("ticket lifecycle requires assignment resolution and escalation evidence", () => {
  const ticket = json("doctypes/support-ticket.json");
  const workflow = json("workflows/support-ticket.json");
  assert.equal(field(ticket, "team").options, "Support Team");
  assert.equal(field(ticket, "assignee").options, "User");
  assert.equal(field(ticket, "sla_policy").options, "Support SLA Policy");
  assert.equal(field(ticket, "response_due_at").read_only, true);
  assert.equal(field(ticket, "resolution_due_at").read_only, true);
  assert.equal(field(ticket, "sla_state").read_only, true);
  assert.equal(field(ticket, "escalation_reason").mandatory_depends_on, "eval:doc.workflow_state == 'Đã leo thang'");
  assert.equal(field(ticket, "escalated_to").mandatory_depends_on, "eval:doc.workflow_state == 'Đã leo thang'");
  assert.equal(transition(workflow, "Phân công").allowed_role, "Support Manager");
  assert.equal(transition(workflow, "Bắt đầu xử lý").allowed_role, "Support User");
  assert.equal(transition(workflow, "Leo thang").next_state, "Đã leo thang");
  assert.equal(transition(workflow, "Đóng phiếu").allow_self_approval, false);
});

test("SLA policy is governed without pretending deadline scheduler already exists", () => {
  const policy = json("doctypes/support-sla-policy.json");
  const priority = json("doctypes/support-sla-priority.json");
  const workday = json("doctypes/support-sla-workday.json");
  const app = json("app.json");
  assert.equal(field(policy, "priorities").options, "Support SLA Priority");
  assert.equal(field(policy, "workdays").options, "Support SLA Workday");
  assert.equal(priority.is_child, true);
  assert.equal(field(priority, "response_minutes").required, true);
  assert.equal(field(priority, "resolution_minutes").required, true);
  assert.equal(field(priority, "escalation_minutes").required, true);
  assert.equal(workday.is_child, true);
  assert.equal(field(workday, "start_time").required, true);
  assert.equal(field(workday, "end_time").required, true);
  assert.equal(app.worker, "cloudforge-app-ws07");
  assert.deepEqual(app.hooks, []);
});

test("email chat social and portal remain provenance labels until connector work lands", () => {
  const ticket = json("doctypes/support-ticket.json");
  const source = field(ticket, "source_channel");
  assert.ok(source.options.includes("Email"));
  assert.ok(source.options.includes("Chat"));
  assert.ok(source.options.includes("Mạng xã hội"));
  assert.ok(source.options.includes("Portal"));
  assert.equal(source.default, "Thủ công");
});

test("knowledge responses and CSAT have governed metadata", () => {
  const article = json("doctypes/support-knowledge-article.json");
  const canned = json("doctypes/support-canned-response.json");
  const feedback = json("doctypes/support-feedback.json");
  assert.equal(field(article, "content").required, true);
  assert.equal(field(article, "published_at").mandatory_depends_on, "eval:doc.is_published == 1");
  assert.equal(field(canned, "body_template").required, true);
  assert.equal(field(feedback, "ticket").options, "Support Ticket");
  assert.equal(field(feedback, "rating").options, "1\n2\n3\n4\n5");
  assert.equal(field(feedback, "followup_note").mandatory_depends_on, "eval:doc.followup_required == 1");
});

test("support print and package compiler preserve the contract", () => {
  const print = json("prints/support-ticket.json");
  assert.equal(print.doc_type, "Support Ticket");
  assert.ok(print.html.includes("{{ doc.resolution }}"));
  assert.ok(print.html.includes("{{ doc.sla_state }}"));
  const result = spawnSync(process.execPath, [PACK, APP, "--check"], { encoding: "utf8" });
  assert.equal(result.status, 0, `support pack check failed: ${result.stdout}${result.stderr}`);
});
