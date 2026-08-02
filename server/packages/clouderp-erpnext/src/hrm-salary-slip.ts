import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SalarySlipController } from "./enterprise-controllers.js";
import type { SalarySlipData } from "./enterprise-types.js";
import { buildHrmSalarySlipInputs } from "./hrm-payroll.js";

export class HrmSalarySlipController extends SalarySlipController {
  async normalize(context: ControllerContext<SalarySlipData>): Promise<SalarySlipData> {
    const input = context.command.document;
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
