import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SalarySlipController } from "./enterprise-controllers.js";
import type { SalarySlipData } from "./enterprise-types.js";
import { buildAlumDoorLiteSalarySlipInputs } from "./alumdoor-payroll-lite.js";
import { buildHrmSalarySlipInputs } from "./hrm-payroll.js";

export class HrmSalarySlipController extends SalarySlipController {
  async normalize(context: ControllerContext<SalarySlipData>): Promise<SalarySlipData> {
    const input = context.command.document;
    const alumdoorProfile = typeof input.alu_pay_profile === "string" ? input.alu_pay_profile.trim() : "";

    // AlumDoor Attendance Day is authoritative attendance evidence for Lite payroll.
    // Raw minutes outside Shift Assignment are not payable by themselves: submitted
    // Overtime Request approval caps payable OT before the fixed-rate calculation runs.
    if (alumdoorProfile) {
      const sourceDocument = { ...input, earnings: [], deductions: [] } as SalarySlipData;
      const sourceContext: ControllerContext<SalarySlipData> = {
        ...context,
        command: { ...context.command, document: sourceDocument },
      };
      const generated = await buildAlumDoorLiteSalarySlipInputs(sourceContext, sourceDocument);
      if (!generated) return super.normalize(context);

      // The generator trace intentionally records who/when performed a calculation for audit.
      // Those audit values must not make the authoritative input hash change on every preview.
      const parsedTrace = parseTrace(generated.alu_formula_trace_json);
      const stableHash = await sha256(JSON.stringify({
        ...parsedTrace,
        actor: undefined,
        calculated_at: undefined,
        input_hash: undefined,
      }));
      const previousHash = typeof context.existing?.data.alu_input_hash === "string"
        ? context.existing.data.alu_input_hash.trim()
        : "";
      if (context.command.action === "submit" && previousHash && previousHash !== stableHash) {
        throw errors.validation("PAYROLL_INPUT_CHANGED: Dữ liệu công/lương đã thay đổi; vui lòng tính lại trước khi duyệt.");
      }

      const traceJson = JSON.stringify({ ...parsedTrace, input_hash: stableHash });
      const requestedState = typeof input.alu_state === "string" ? input.alu_state.trim() : "";
      const aluState = context.command.action === "submit"
        ? "approved"
        : context.command.action === "cancel"
          ? "cancelled"
          : requestedState === "pending_approval"
            ? "pending_approval"
            : "draft";
      const document = {
        ...sourceDocument,
        ...generated,
        input_hash: stableHash,
        rule_trace_json: traceJson,
        alu_input_hash: stableHash,
        alu_formula_trace_json: traceJson,
        alu_state: aluState,
      } as SalarySlipData;
      return super.normalize({ ...context, command: { ...context.command, document } });
    }

    const assignment = typeof input.salary_structure_assignment === "string"
      ? input.salary_structure_assignment.trim()
      : "";

    // Salary slips linked to an HR salary assignment are always regenerated from
    // authoritative payroll inputs. This prevents a draft/preview from carrying
    // stale earnings into submit after attendance/leave/allowance sources changed.
    if (!assignment) return super.normalize(context);

    const sourceDocument = {
      ...input,
      salary_structure_assignment: assignment,
      earnings: [],
      deductions: [],
    } as SalarySlipData;
    const sourceContext: ControllerContext<SalarySlipData> = {
      ...context,
      command: { ...context.command, document: sourceDocument },
    };
    const generated = await buildHrmSalarySlipInputs(sourceContext, sourceDocument);
    if (!generated) return super.normalize(context);

    const document = { ...sourceDocument, ...generated } as SalarySlipData;
    const nextContext: ControllerContext<SalarySlipData> = {
      ...context,
      command: { ...context.command, document },
    };
    return super.normalize(nextContext);
  }
}

function parseTrace(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw errors.validation("AlumDoor payroll trace is invalid JSON");
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
