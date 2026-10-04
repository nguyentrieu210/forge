import type { JsonObject } from "../../contracts/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { applyOrderCommercialPricingPolicy } from "./order-commercial-policy.js";
import { snapshotCustomerCreditPolicy } from "./credit-policy.js";
import { QuotationController } from "./quotation-controller.js";
import type { QuotationData } from "./quotation-types.js";
import { SalesOrderClosureController } from "./sales-order-closure-controller.js";
import type { SalesOrderData } from "./types.js";

/** Full Sales Order composition: line pricing -> source closure -> order policy. */
export class CompleteSalesOrderController extends SalesOrderClosureController {
  override async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const data = await super.normalize(context);
    const commercial = await applyOrderCommercialPricingPolicy(
      context as unknown as ControllerContext<JsonObject>,
      data,
    );
    return snapshotCustomerCreditPolicy(context, commercial, "Sales Order");
  }
}

/** Quotation keeps the existing line-commercial contract; order aggregates currently apply at Sales Order. */
export class CompleteQuotationController extends QuotationController {
  override async normalize(context: ControllerContext<QuotationData>): Promise<QuotationData> {
    return super.normalize(context);
  }
}
