import test from "node:test";
import assert from "node:assert/strict";
import {
  payrollCalculatePeriod,
  payrollCreatePeriod,
  minimumRegularDayOvertimeRateVnd,
  payrollSubmitPeriod,
  payrollApprovePeriod,
} from "../dist/apps-src/alumdoor-worker/src/payroll-routes.js";

function callFixture() {
  const docs = new Map();
  docs.set("Payroll Entry:PAY-1", {
    doctype: "Payroll Entry", name: "PAY-1", docstatus: 0, company: "ALUMDOOR", branch: "XUONG",
    posting_at: "2026-08-31T12:00:00.000Z", start_date: "2026-08-01", end_date: "2026-08-31",
    alu_standard_work_days_bp: 260000, alu_state: "draft", salary_slips: [], modified: "v1",
  });
  docs.set("AlumDoor Pay Profile:PP-1", {
    doctype: "AlumDoor Pay Profile", name: "PP-1", docstatus: 1, employee: "EMP-1", company: "ALUMDOOR", branch: "XUONG",
    status: "approved", effective_from: "2026-01-01", pay_mode: "MONTHLY", base_salary_vnd: 13000000,
    overtime_multiplier_bp: 15000, fixed_allowance_vnd: 500000,
  });
  const observed = [];
  const call = async (path, init = {}) => {
    const body = JSON.parse(String(init.body ?? "{}"));
    observed.push({ path, body });
    const method = path.replace(/^method\//, "");
    if (method === "frappe.client.get") {
      const doc = docs.get(`${body.doctype}:${body.name}`);
      return doc ? Response.json({ message: structuredClone(doc) }) : Response.json({ message: "missing" }, { status: 404 });
    }
    if (method === "frappe.client.get_list") {
      const rows = [...docs.values()].filter((doc) => doc.doctype === body.doctype).filter((doc) =>
        Object.entries(body.filters ?? {}).every(([key, value]) => doc[key] === value));
      return Response.json({ message: structuredClone(rows) });
    }
    if (method === "frappe.client.insert") {
      const name = body.doc.doctype === "Salary Slip" ? `SAL-${body.doc.employee}` : "PAY-NEW";
      const doc = { ...body.doc, name, docstatus: 0, modified: `m-${name}` };
      docs.set(`${doc.doctype}:${name}`, doc);
      return Response.json({ message: structuredClone(doc) });
    }
    if (method === "frappe.client.save") {
      const doc = { ...body.doc, modified: `${body.doc.modified ?? "m"}-next` };
      docs.set(`${doc.doctype}:${doc.name}`, doc);
      return Response.json({ message: structuredClone(doc) });
    }
    if (method === "metaforge.api.approve_alumdoor_payroll") {
      return Response.json({ message: { payroll_entry: body.payroll_entry, state: "approved", attendance_locked: 1 } });
    }
    return Response.json({ message: `unexpected ${method}` }, { status: 404 });
  };
  return { call, docs, observed };
}

test("create period writes one draft canonical Payroll Entry", async () => {
  const fixture = callFixture();
  const response = await payrollCreatePeriod({ call: fixture.call, args: { company: "ALUMDOOR", branch: "XUONG", start_date: "2026-09-01", end_date: "2026-09-30", standard_work_days_bp: 260000 }, now: new Date("2026-09-30T12:00:00Z") });
  assert.equal(response.status, 200, await response.text());
  const inserted = fixture.observed.find((entry) => entry.path === "method/frappe.client.insert");
  assert.equal(inserted.body.doc.doctype, "Payroll Entry");
  assert.equal(inserted.body.doc.alu_state, "draft");
  assert.equal(inserted.body.doc.alu_standard_work_days_bp, 260000);
});

test("calculate period creates salary slip drafts from approved Pay Profiles and binds period standard days", async () => {
  const fixture = callFixture();
  const response = await payrollCalculatePeriod({ call: fixture.call, args: { period: "PAY-1" }, now: new Date("2026-08-31T12:00:00Z") });
  assert.equal(response.status, 200, await response.text());
  const slip = fixture.docs.get("Salary Slip:SAL-EMP-1");
  assert.equal(slip.alu_payroll_entry, "PAY-1");
  assert.equal(slip.alu_pay_profile, "PP-1");
  assert.equal(slip.alu_standard_work_days_bp, 260000);
  const period = fixture.docs.get("Payroll Entry:PAY-1");
  assert.equal(period.alu_state, "calculated");
  assert.equal(period.salary_slips[0].salary_slip, "SAL-EMP-1");
});

test("Lite V2 fixes overtime at 50,000 VND/hour and carries a legal floor", async () => {
  assert.equal(minimumRegularDayOvertimeRateVnd({ payMode: "MONTHLY", baseSalaryVnd: 13_000_000, standardWorkDaysBp: 260_000 }), 93_750);
  assert.equal(minimumRegularDayOvertimeRateVnd({ payMode: "DAILY", baseSalaryVnd: 400_000, standardWorkDaysBp: 260_000 }), 75_000);
  const fixture = callFixture();
  const response = await payrollCalculatePeriod({ call: fixture.call, args: { period: "PAY-1" }, calculationVersion: 2 });
  assert.equal(response.status, 200, await response.text());
  const slip = fixture.docs.get("Salary Slip:SAL-EMP-1");
  assert.equal(slip.alu_overtime_rate_vnd_per_hour, 50_000);
  assert.equal(slip.alu_overtime_legal_floor_vnd, 93_750);
  assert.equal(slip.alu_lite_version, 2);
});

test("submit then approve uses the bounded native approval seam", async () => {
  const fixture = callFixture();
  let response = await payrollCalculatePeriod({ call: fixture.call, args: { period: "PAY-1" } });
  assert.equal(response.status, 200, await response.text());
  response = await payrollSubmitPeriod({ call: fixture.call, args: { period: "PAY-1" } });
  assert.equal(response.status, 200, await response.text());
  assert.equal(fixture.docs.get("Payroll Entry:PAY-1").alu_state, "pending_approval");
  response = await payrollApprovePeriod({ call: fixture.call, args: { period: "PAY-1" } });
  assert.equal(response.status, 200, await response.text());
  assert.ok(fixture.observed.some((entry) => entry.path === "method/metaforge.api.approve_alumdoor_payroll" && entry.body.payroll_entry === "PAY-1"));
});
