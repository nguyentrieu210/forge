import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SalarySlipController } from "./enterprise-controllers.js";
import type { SalarySlipData } from "./enterprise-types.js";
import { buildHrmSalarySlipInputs } from "./hrm-payroll.js";

export class HrmSalarySlipController extends SalarySlipController {
  async normalize(context: ControllerContext<SalarySlipData>): Promise<SalarySlipData> {
    const input = context.command.document;
    if (Array.isArray(input.earnings) && input.earnings.length > 0) {
      return super.normalize(context);
    }
    const generated = await buildHrmSalarySlipInputs(context, input);
    if (!generated) return super.normalize(context);
    const document = { ...input, ...generated } as SalarySlipData;
    const nextContext: ControllerContext<SalarySlipData> = {
      ...context,
      command: { ...context.command, document },
    };
    return super.normalize(nextContext);
  }
}
