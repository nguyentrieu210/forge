import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { CrmTeamAwareLeadController } from "./crm-team-controllers.js";
import type { LeadData } from "./crm-types.js";

/** Exact duplicate guard. Fuzzy/ambiguous merge stays a reviewed workflow; this only
 * prevents the obvious case from silently creating two canonical leads. */
export class CrmDeduplicatingLeadController extends CrmTeamAwareLeadController {
  async normalize(context: ControllerContext<LeadData>): Promise<LeadData> {
    const data = await super.normalize(context);
    const email = normalizeEmail(data.email_id);
    const mobile = normalizePhone(data.mobile_no);
    if (!email && !mobile) return data;
    const leads = await context.reader.listDocumentsByDoctype<LeadData>(context.command.tenant_id, "CRM Lead");
    const duplicate = leads.find((candidate) => {
      if (candidate.name === context.command.aggregate.name || candidate.data.company !== data.company) return false;
      const candidateEmail = normalizeEmail(candidate.data.email_id);
      const candidateMobile = normalizePhone(candidate.data.mobile_no);
      return Boolean((email && candidateEmail === email) || (mobile && candidateMobile === mobile));
    });
    if (duplicate) throw errors.validation(`Possible duplicate CRM Lead ${duplicate.name} matches email or mobile; review the existing lead instead of creating a parallel record`);
    return data;
  }
}

function normalizeEmail(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined;
}
function normalizePhone(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const plus = value.trim().startsWith("+") ? "+" : "";
  const digits = value.replace(/\D/g, "");
  return digits ? `${plus}${digits}` : undefined;
}
