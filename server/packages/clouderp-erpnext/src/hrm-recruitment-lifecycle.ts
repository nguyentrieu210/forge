import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { HiringCompletionController } from "./hrm-lifecycle-closure-controllers.js";
import * as H from "./hrm-shared.js";

type HrmContext = H.HrmContext;

export class AcceptedHiringCompletionController extends HiringCompletionController {
  async normalize(context: HrmContext): Promise<JsonObject> {
    const normalized = await super.normalize(context);
    const offerName = H.requiredText(normalized.job_offer, "Hiring Completion job_offer");
    const responses = await context.reader.listDocumentsByDoctype<JsonObject>(context.command.tenant_id, "Job Offer Response");
    const accepted = responses.filter((item) => item.docstatus === 1 && H.text(item.data.job_offer) === offerName && H.text(item.data.response) === "Accepted");
    if (accepted.length !== 1) throw errors.reference(`Hiring Completion requires exactly one accepted Job Offer Response for ${offerName}`);
    return {
      ...normalized,
      lineage_snapshot_json: JSON.stringify({
        ...JSON.parse(H.requiredText(normalized.lineage_snapshot_json, "Hiring Completion lineage_snapshot_json")),
        job_offer_response: accepted[0]!.name,
        response_date: H.text(accepted[0]!.data.response_date),
      }),
    };
  }
}
