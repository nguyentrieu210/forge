import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import type { CrmContactData } from "./crm-directory-types.js";
import { CrmMarketingListMemberController } from "./crm-marketing-controllers.js";
import type { CrmMarketingListData, CrmMarketingListMemberData, CrmSegmentData } from "./crm-marketing-types.js";

/**
 * Consent is evaluated at the moment a membership becomes Active, not only when
 * the list was configured. A segment can tighten its policy after members were
 * imported, and a contact can withdraw consent after being added. Re-evaluating
 * the current canonical records keeps resubscribe/activation safe without copying
 * privacy policy into the client.
 */
export class CrmConsentAwareMarketingListMemberController extends CrmMarketingListMemberController {
  readonly doctype = "CRM Marketing List Member";

  async normalize(context: ControllerContext<CrmMarketingListMemberData>): Promise<CrmMarketingListMemberData> {
    const data = await super.normalize(context);
    if (data.status !== "Active") return data;

    const listDocument = await context.reader.getDocument<CrmMarketingListData>(
      context.command.tenant_id,
      "CRM Marketing List",
      data.marketing_list,
    );
    if (!listDocument) throw errors.reference(`CRM Marketing List ${data.marketing_list} does not exist or is unavailable`);
    if (!listDocument.data.segment) return data;

    const segmentDocument = await context.reader.getDocument<CrmSegmentData>(
      context.command.tenant_id,
      "CRM Segment",
      listDocument.data.segment,
    );
    if (!segmentDocument) throw errors.reference(`CRM Segment ${listDocument.data.segment} does not exist or is unavailable`);
    if ((segmentDocument.data.status ?? "Active") !== "Active") {
      throw errors.lifecycle("CRM Segment must remain Active while members are activated or resubscribed");
    }

    const contactDocument = await context.reader.getDocument<CrmContactData>(
      context.command.tenant_id,
      "CRM Contact",
      data.contact,
    );
    if (!contactDocument) throw errors.reference(`CRM Contact ${data.contact} does not exist or is unavailable`);
    if ((segmentDocument.data.consent_requirement ?? "Granted") === "Granted"
      && contactDocument.data.consent_status !== "Granted") {
      throw errors.lifecycle("CRM Segment requires explicit Granted contact consent");
    }
    return data;
  }
}
