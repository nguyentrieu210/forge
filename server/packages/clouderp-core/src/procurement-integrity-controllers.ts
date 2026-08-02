import type { MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { RequestForQuotationController, SupplierQuotationController } from "./controllers.js";
import {
  compareSupplierQuotations,
  validatePurchaseOrderAgainstQuotation,
} from "./procurement-decisions.js";
import { RolloutPurchaseOrderController } from "./purchase-allocation-rollout-controllers.js";
import {
  assertSupplierQualificationEligible,
  type SupplierQualificationData,
} from "./supplier-lifecycle-controllers.js";
import { assertSupplierEligible } from "./supplier-policy.js";
import type {
  PurchaseOrderData,
  RequestForQuotationData,
  SupplierQuotationData,
} from "./types.js";

/**
 * Submitted Supplier Qualification documents are authoritative. Tenants with no qualification
 * document for a supplier/company fall back to legacy Supplier-master approval fields.
 */
export class ProcurementRequestForQuotationController extends RequestForQuotationController {
  override async normalize(context: ControllerContext<RequestForQuotationData>): Promise<RequestForQuotationData> {
    const normalized = await super.normalize(context);
    if (context.command.action !== "submit") return normalized;
    const qualifications = await context.reader.listDocumentsByDoctype<SupplierQualificationData>(
      context.command.tenant_id,
      "Supplier Qualification",
    );
    for (const row of normalized.suppliers) {
      const qualified = assertSupplierQualificationEligible(
        row.supplier,
        normalized.company,
        qualifications,
        normalized.transaction_date,
      );
      if (qualified) continue;
      const master = await context.reader.getMasterRecordData(
        context.command.tenant_id,
        "Supplier",
        row.supplier,
      );
      assertSupplierEligible(row.supplier, master, normalized.transaction_date);
    }
    return normalized;
  }
}

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
 * Validates supplier eligibility and selected quotation only after the rollout controller has built
 * the canonical PO plan. No writes have happened yet, so a mismatch fails the whole command.
 */
export class ProcurementPurchaseOrderController extends RolloutPurchaseOrderController {
  override async buildPlan(context: ControllerContext<PurchaseOrderData>): Promise<MutationPlan<PurchaseOrderData>> {
    const plan = await super.buildPlan(context);
    if (context.command.action !== "submit") return plan;
    const data = plan.document.data;
    const qualifications = await context.reader.listDocumentsByDoctype<SupplierQualificationData>(
      context.command.tenant_id,
      "Supplier Qualification",
    );
    const qualified = assertSupplierQualificationEligible(
      data.supplier,
      data.company,
      qualifications,
      data.transaction_date,
      data.supplier_group,
    );
    if (!qualified) {
      const supplier = await context.reader.getMasterRecordData(
        context.command.tenant_id,
        "Supplier",
        data.supplier,
      );
      assertSupplierEligible(data.supplier, supplier, data.transaction_date, data.supplier_group);
    }
    if (!data.supplier_quotation) return plan;
    const quotationName = data.supplier_quotation;
    const quotation = await context.reader.getDocument<SupplierQuotationData>(
      context.command.tenant_id,
      "Supplier Quotation",
      quotationName,
    );
    if (!quotation || quotation.docstatus !== 1) {
      throw errors.reference(`Submitted Supplier Quotation ${quotationName} is required`);
    }
    validatePurchaseOrderAgainstQuotation(data, quotationName, quotation.data);
    return plan;
  }
}
