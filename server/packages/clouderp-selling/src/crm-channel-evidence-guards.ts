import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { CrmPromotionExecutionController, CrmSellInSnapshotController } from "./crm-channel-evidence-controllers.js";
import type { CrmPromotionExecutionData, CrmSellInSnapshotData } from "./crm-channel-evidence-types.js";
import type { CrmFieldCheckInData } from "./crm-channel-types.js";

/**
 * Tightens the evidence controllers without coupling them to event projection.
 * Current sell-in reporting is deliberately snapshot evidence, not a live projection;
 * automatic submit/cancel projection belongs to the integration workstream.
 */
export class CrmSubmittedSellInSnapshotController extends CrmSellInSnapshotController {
  async normalize(context: ControllerContext<CrmSellInSnapshotData>): Promise<CrmSellInSnapshotData> {
    const data = await super.normalize(context);
    if (data.order_docstatus !== 1) throw errors.lifecycle("CRM Sell In Snapshot requires a submitted Sales Order");
    const snapshots = await context.reader.listDocumentsByDoctype<CrmSellInSnapshotData>(context.command.tenant_id, "CRM Sell In Snapshot");
    const duplicateOrder = snapshots.find((candidate) => candidate.name !== context.command.aggregate.name && candidate.data.sales_order === data.sales_order);
    if (duplicateOrder) throw errors.validation(`Sales Order ${data.sales_order} already has sell-in evidence ${duplicateOrder.name}`);
    return data;
  }
}

export class CrmGeoVerifiedPromotionExecutionController extends CrmPromotionExecutionController {
  async normalize(context: ControllerContext<CrmPromotionExecutionData>): Promise<CrmPromotionExecutionData> {
    const data = await super.normalize(context);
    if (data.status !== "Executed") return data;
    if (!data.field_check_in) throw errors.validation("Executed CRM Promotion Execution requires field check-in evidence");
    const checkin = await context.reader.getDocument<CrmFieldCheckInData>(context.command.tenant_id, "CRM Field Check-In", data.field_check_in);
    if (!checkin) throw errors.reference(`CRM Field Check-In ${data.field_check_in} does not exist or is unavailable`);
    if (checkin.data.result !== "Inside Radius") throw errors.lifecycle("Promotion execution requires an Inside Radius geo check-in");
    return data;
  }
}
