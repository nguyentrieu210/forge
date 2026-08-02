import type { MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { SupplierQuotationController } from "./controllers.js";
import {
  compareSupplierQuotations,
  validatePurchaseOrderAgainstQuotation,
} from "./procurement-decisions.js";
import { RolloutPurchaseOrderController } from "./purchase-allocation-rollout-controllers.js";
import type {
  PurchaseOrderData,
  RequestForQuotationData,
  SupplierQuotationData,
} from "./types.js";

/**
 * Adds RFQ-line integrity on top of the existing Supplier Quotation lifecycle/totals controller.
 * The base controller remains authoritative for currency, totals, invited supplier and master checks.
 */
export class ProcurementSupplierQuotationController extends SupplierQuotationController {
  override async normalize(context: ControllerContext<SupplierQuotationData>): Promise<SupplierQuotationData> {
    const normalized = await super.normalize(context);
    if (context.command.action !== "submit" || !normalized.request_for_quotation) return normalized;
    const rfq = await context.reader.getDocument<RequestForQuotationData>(
      context.command.tenant_id,
      "Request for Quotation",
      normalized.request_for_quotation,
    );
    if (!rfq || rfq.docstatus !== 1) {
      throw errors.reference(`Submitted Request for Quotation ${normalized.request_for_quotation} is required`);
    }
    compareSupplierQuotations(
      normalized.request_for_quotation,
      rfq.data,
      [{
        name: context.command.aggregate.name,
        data: normalized,
        docstatus: 1,
      }],
      normalized.transaction_date,
    );
    return normalized;
  }
}

/**
 * Validates the selected quotation only after the rollout controller has built the canonical PO plan.
 * No writes have happened yet, so a mismatch fails the whole command before kernel execution.
 */
export class ProcurementPurchaseOrderController extends RolloutPurchaseOrderController {
  override async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    const plan = await super.buildPlan(context);
    if (context.command.action !== "submit" || !plan.document.data.supplier_quotation) return plan;
    const quotationName = plan.document.data.supplier_quotation;
    const quotation = await context.reader.getDocument<SupplierQuotationData>(
      context.command.tenant_id,
      "Supplier Quotation",
      quotationName,
    );
    if (!quotation || quotation.docstatus !== 1) {
      throw errors.reference(`Submitted Supplier Quotation ${quotationName} is required`);
    }
    validatePurchaseOrderAgainstQuotation(plan.document.data, quotationName, quotation.data);
    return plan;
  }
}
