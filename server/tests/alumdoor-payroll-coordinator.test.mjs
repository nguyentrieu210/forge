import test from "node:test";
import assert from "node:assert/strict";
import { approveAlumDoorPayroll } from "../dist/apps/tenant-worker/src/payroll-coordinator.js";

function doc(name, data, docstatus = 0, version = 1) { return { name, data, docstatus, version }; }

function storeFixture() {
  const docs = new Map([
    ["Payroll Entry:PAY-1", doc("PAY-1", {
      company: "ALUMDOOR", branch: "XUONG", start_date: "2026-08-01", end_date: "2026-08-31",
      alu_state: "pending_approval", salary_slips: [
        { row_id: "1", salary_slip: "SAL-1" }, { row_id: "2", salary_slip: "SAL-2" },
      ],
    }, 0, 4)],
    ["Salary Slip:SAL-1", doc("SAL-1", { company: "ALUMDOOR", employee: "EMP-1", start_date: "2026-08-01", end_date: "2026-08-31", alu_payroll_entry: "PAY-1", alu_input_hash: "a".repeat(64), alu_state: "pending_approval", alu_formula_trace_json: JSON.stringify({ attendance: [{ name: "AAD-1", work_date: "2026-08-01", raw_overtime_minutes: 0 }], overtime_requests: [], paid_leave: [] }) }, 0, 3)],
    ["Salary Slip:SAL-2", doc("SAL-2", { company: "ALUMDOOR", employee: "EMP-2", start_date: "2026-08-01", end_date: "2026-08-31", alu_payroll_entry: "PAY-1", alu_input_hash: "b".repeat(64), alu_state: "pending_approval", alu_formula_trace_json: JSON.stringify({ attendance: [{ name: "AAD-2", work_date: "2026-08-01", raw_overtime_minutes: 0 }], overtime_requests: [], paid_leave: [] }) }, 0, 2)],
    ["AlumDoor Attendance Day:AAD-1", doc("AAD-1", { employee: "EMP-1", work_date: "2026-08-01", state: "complete", raw_overtime_minutes: 0, segments: [] }, 0, 5)],
    ["AlumDoor Attendance Day:AAD-2", doc("AAD-2", { employee: "EMP-2", work_date: "2026-08-01", state: "approved", raw_overtime_minutes: 0, segments: [] }, 0, 6)],
  ]);
  return {
    async getDocument(_tenant, doctype, name) { return docs.get(`${doctype}:${name}`) ?? null; },
    async listDocumentsByDoctype(_tenant, doctype) { return [...docs.entries()].filter(([key]) => key.startsWith(`${doctype}:`)).map(([, value]) => value); },
  };
}

test("approval submits slips, locks attendance and submits payroll in one bundle", async () => {
  let observed = null;
  const kernel = {
    async executeBundle(bundle) {
      observed = bundle.commands;
      return bundle.commands.map((command, index) => ({ version: (command.expected_version ?? 0) + 1, result: { index } }));
    },
  };
  const result = await approveAlumDoorPayroll({
    tenantId: "alu",
    actor: { user_id: "owner@example.test", roles: ["AlumDoor Payroll Approver"] },
    payrollEntry: "PAY-1",
  }, { kernel, store: storeFixture(), now: () => "2026-08-31T12:00:00.000Z" });

  assert.equal(result.state, "approved");
  assert.equal(result.employee_count, 2);
  assert.equal(result.attendance_locked, 2);
  assert.equal(result.input_hash.length, 64);
  assert.equal(observed.length, 5);
  assert.deepEqual(observed.map((command) => `${command.aggregate.doctype}:${command.action}`), [
    "Salary Slip:submit", "Salary Slip:submit", "AlumDoor Attendance Day:save", "AlumDoor Attendance Day:save", "Payroll Entry:submit",
  ]);
  for (const command of observed.filter((entry) => entry.aggregate.doctype === "AlumDoor Attendance Day")) {
    assert.equal(command.document.state, "locked");
    assert.equal(command.document.locked_by_payroll, "PAY-1");
    assert.ok(command.actor.roles.includes("AlumDoor Payroll System"));
  }
});

test("approval fails closed when attendance contains an exception", async () => {
  const store = storeFixture();
  const original = store.listDocumentsByDoctype;
  store.listDocumentsByDoctype = async (tenant, doctype) => {
    const rows = await original(tenant, doctype);
    if (doctype === "AlumDoor Attendance Day") rows[0].data.state = "exception";
    return rows;
  };
  let executed = false;
  await assert.rejects(() => approveAlumDoorPayroll({
    tenantId: "alu",
    actor: { user_id: "owner@example.test", roles: ["AlumDoor Payroll Approver"] },
    payrollEntry: "PAY-1",
  }, { kernel: { async executeBundle() { executed = true; return []; } }, store }), /PAYROLL_BLOCKED/);
  assert.equal(executed, false);
});

test("non-approver cannot enter payroll approval coordinator", async () => {
  await assert.rejects(() => approveAlumDoorPayroll({
    tenantId: "alu",
    actor: { user_id: "payroll@example.test", roles: ["AlumDoor Payroll User"] },
    payrollEntry: "PAY-1",
  }, { kernel: { async executeBundle() { return []; } }, store: storeFixture() }), /Approver/);
});
