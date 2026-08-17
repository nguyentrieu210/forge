import { describe, expect, it, vi } from "vitest";
import {
  approveAlumDoorPayroll,
  overtimeProjectionsFromTrace,
} from "../../../apps/tenant-worker/src/payroll-coordinator.js";

const tenantId = "TENANT-1";
const payrollName = "PAY-2026-08";
const employee = "EMP-001";

function doc(doctype: string, name: string, data: Record<string, unknown>, options: { docstatus?: number; version?: number } = {}) {
  return {
    tenant_id: tenantId,
    doctype,
    name,
    owner: "test@example.com",
    docstatus: options.docstatus ?? 0,
    status: options.docstatus === 1 ? "submitted" : "draft",
    version: options.version ?? 1,
    created_at: "2026-08-01T00:00:00.000Z",
    modified_at: "2026-08-01T00:00:00.000Z",
    data,
    children: [],
  };
}

function salaryTrace() {
  return JSON.stringify({
    paid_leave: [
      {
        leave_application: { name: "LEAVE-001", version: 7 },
        paid_dates: [
          {
            work_date: "2026-08-10",
            shift_assignment: "SHIFT-ASG-001",
            shift_type: "DAY",
            scheduled_minutes: 480,
            payable_work_fraction_bp: 10_000,
          },
        ],
      },
    ],
  });
}

function fixtures() {
  const payroll = doc("Payroll Entry", payrollName, {
    company: "COMPANY-1",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    alu_state: "calculated",
    salary_slips: [{ salary_slip: "SLIP-001" }],
  });
  const slip = doc("Salary Slip", "SLIP-001", {
    employee,
    company: "COMPANY-1",
    start_date: "2026-08-01",
    end_date: "2026-08-31",
    alu_payroll_entry: payrollName,
    alu_input_hash: "hash-1",
    alu_formula_trace_json: salaryTrace(),
    alu_state: "calculated",
  });
  const policy = doc("AlumDoor Attendance Policy", "POLICY-1", {
    company: "COMPANY-1",
    policy_status: "approved",
    effective_from: "2026-01-01",
    effective_to: "2026-12-31",
  }, { docstatus: 1 });
  return { payroll, slip, policy };
}

function services() {
  const { payroll, slip, policy } = fixtures();
  const executeBundle = vi.fn(async ({ commands }: { commands: Array<Record<string, unknown>> }) =>
    commands.map((_, index) => ({ aggregate_version: index + 2 })));
  const store = {
    getDocument: vi.fn(async (_tenant: string, doctype: string, name: string) => {
      if (doctype === "Payroll Entry" && name === payrollName) return payroll;
      if (doctype === "Salary Slip" && name === "SLIP-001") return slip;
      if (doctype === "AlumDoor Attendance Day") return null;
      return null;
    }),
    listDocumentsByDoctype: vi.fn(async (_tenant: string, doctype: string) => {
      if (doctype === "AlumDoor Attendance Day") return [];
      if (doctype === "AlumDoor Attendance Policy") return [policy];
      return [];
    }),
  };
  return {
    kernel: { executeBundle } as never,
    store: store as never,
    now: () => "2026-08-31T12:00:00.000Z",
    executeBundle,
    storeSpy: store,
  };
}

const actor = {
  user_id: "payroll@example.com",
  roles: ["AlumDoor Payroll Approver"],
};

describe("AlumDoor payroll finalize atomic bundle", () => {
  it("submits Salary Slip, creates a locked paid-leave Attendance Day, then submits Payroll Entry in one bundle", async () => {
    const svc = services();
    const result = await approveAlumDoorPayroll({ tenantId, actor: actor as never, payrollEntry: payrollName }, svc);

    expect(svc.executeBundle).toHaveBeenCalledTimes(1);
    const bundle = svc.executeBundle.mock.calls[0]![0] as { commands: Array<Record<string, any>> };
    const commands = bundle.commands;
    expect(commands).toHaveLength(3);

    expect(commands[0]).toMatchObject({ action: "submit", aggregate: { doctype: "Salary Slip", name: "SLIP-001" } });
    expect(commands[1]).toMatchObject({
      action: "create",
      aggregate: { doctype: "AlumDoor Attendance Day" },
      document: {
        employee,
        company: "COMPANY-1",
        work_date: "2026-08-10",
        shift_assignment: "SHIFT-ASG-001",
        shift_type: "DAY",
        scheduled_minutes: 480,
        regular_minutes: 0,
        raw_overtime_minutes: 0,
        overtime_minutes: 0,
        paid_leave_minutes: 480,
        source_leave_application: "LEAVE-001",
        source_leave_version: 7,
        state: "locked",
        locked_by_payroll: payrollName,
      },
    });
    expect(commands[2]).toMatchObject({ action: "submit", aggregate: { doctype: "Payroll Entry", name: payrollName } });
    expect(result).toMatchObject({ state: "approved", employee_count: 1, attendance_locked: 1 });
  });

  it("does not perform any coordinator-side mutation before the single atomic bundle succeeds", async () => {
    const svc = services();
    svc.executeBundle.mockRejectedValueOnce(new Error("transaction rollback"));

    await expect(approveAlumDoorPayroll({ tenantId, actor: actor as never, payrollEntry: payrollName }, svc)).rejects.toThrow("transaction rollback");
    expect(svc.executeBundle).toHaveBeenCalledTimes(1);
    expect(svc.storeSpy.getDocument).toHaveBeenCalled();
    expect(svc.storeSpy.listDocumentsByDoctype).toHaveBeenCalled();
  });
});

describe("AlumDoor payroll overtime final projection", () => {
  it("projects zero payable OT when raw attendance has no submitted approval", () => {
    const result = overtimeProjectionsFromTrace(JSON.stringify({
      attendance: [{ name: "AAD-001", work_date: "2026-08-17", raw_overtime_minutes: 90 }],
      overtime_requests: [],
    }), employee);

    expect(result).toEqual([{
      employee,
      workDate: "2026-08-17",
      attendanceDay: "AAD-001",
      rawOvertimeMinutes: 90,
      payableOvertimeMinutes: 0,
    }]);
  });

  it("projects min(raw, approved) and never creates payable minutes beyond attendance evidence", () => {
    const result = overtimeProjectionsFromTrace(JSON.stringify({
      attendance: [{ name: "AAD-002", work_date: "2026-08-18", raw_overtime_minutes: 60 }],
      overtime_requests: [{ name: "OT-001", overtime_date: "2026-08-18", approved_minutes: 120 }],
    }), employee);

    expect(result[0]).toMatchObject({
      rawOvertimeMinutes: 60,
      payableOvertimeMinutes: 60,
    });
  });

  it("fails closed when two overtime approvals cover the same employee/date", () => {
    expect(() => overtimeProjectionsFromTrace(JSON.stringify({
      attendance: [{ name: "AAD-003", work_date: "2026-08-19", raw_overtime_minutes: 60 }],
      overtime_requests: [
        { name: "OT-001", overtime_date: "2026-08-19", approved_minutes: 30 },
        { name: "OT-002", overtime_date: "2026-08-19", approved_minutes: 30 },
      ],
    }), employee)).toThrow(/Duplicate Overtime Request trace date/u);
  });
});
