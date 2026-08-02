import type { JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { RequestForQuotationController, SupplierQuotationController } from "./controllers.js";
import {
  compareSupplierQuotations,
  validatePurchaseOrderAgainstQuotation,
} from "./procurement-decisions.js";
import { evaluatePurchaseOrderSupplierContract } from "./supplier-contract-enforcement.js";
import { RolloutPurchaseOrderController } from "./purchase-allocation-rollout-controllers.js";
import {
  assertSupplierQualificationEligible,
  SupplierContractController,
  type SupplierContractData,
  type SupplierQualificationData,
} from "./supplier-lifecycle-controllers.js";
import {
  validatePurchaseOrderSupplierSelection,
  type SupplierSelectionData,
} from "./supplier-selection-controller.js";
import { assertSupplierEligible } from "./supplier-policy.js";
import type {
  PurchaseOrderData,
  RequestForQuotationData,
  SupplierQuotationData,
} from "./types.js";

/**
 * Submitted Supplier Qualification documents are authoritative. A cancelled prior approval still
 * proves that the tenant adopted qualification lifecycle, so it cannot silently fall back to a
 * permissive legacy Supplier master.
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
      if (hasQualificationHistory(qualifications, row.supplier, normalized.company)) {
        throw errors.reference(`Supplier ${row.supplier} has no active approved qualification`);
      }
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
 * Validates supplier eligibility, optional contract release, optional approved selection and the
 * selected quotation only after the rollout controller has built the canonical PO plan. No writes
 * have happened yet, so every mismatch fails the whole command before kernel execution.
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
      if (hasQualificationHistory(qualifications, data.supplier, data.company)) {
        throw errors.reference(`Supplier ${data.supplier} has no active approved qualification`);
      }
      const supplier = await context.reader.getMasterRecordData(
        context.command.tenant_id,
        "Supplier",
        data.supplier,
      );
      assertSupplierEligible(data.supplier, supplier, data.transaction_date, data.supplier_group);
    }

    const raw = data as JsonObject;
    const contractName = typeof raw.supplier_contract === "string" ? raw.supplier_contract.trim() : "";
    if (contractName) {
      const contract = await context.reader.getDocument<SupplierContractData>(
        context.command.tenant_id,
        "Supplier Contract",
        contractName,
      );
      if (!contract || contract.docstatus !== 1) {
        throw errors.reference(`Submitted Supplier Contract ${contractName} is required`);
      }
      const orders = await context.reader.listDocumentsByDoctype<PurchaseOrderData>(
        context.command.tenant_id,
        "Purchase Order",
      );
      evaluatePurchaseOrderSupplierContract(
        context.command.aggregate.name,
        data,
        contractName,
        contract.data,
        orders,
      );
    }

    const selectionName = typeof raw.supplier_selection === "string" ? raw.supplier_selection.trim() : "";
    let selection: SupplierSelectionData | null = null;
    if (selectionName) {
      const document = await context.reader.getDocument<SupplierSelectionData>(
        context.command.tenant_id,
        "Supplier Selection",
        selectionName,
      );
      if (!document || document.docstatus !== 1) {
        throw errors.reference(`Submitted Supplier Selection ${selectionName} is required`);
      }
      selection = document.data;
    }

    if (!data.supplier_quotation) {
      if (selectionName) throw errors.reference(`Purchase Order using Supplier Selection ${selectionName} must reference its Supplier Quotation`);
      return plan;
    }
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
    if (selectionName && selection) {
      validatePurchaseOrderSupplierSelection(data, selectionName, selection);
    }
    return plan;
  }
}

/** Quantity ceilings are meaningless without their unit, so the registered contract path rejects it. */
export class ProcurementSupplierContractController extends SupplierContractController {
  override async normalize(context: ControllerContext<SupplierContractData>): Promise<SupplierContractData> {
    const normalized = await super.normalize(context);
    const raw = normalized as JsonObject;
    const uom = typeof raw.quantity_uom === "string" ? raw.quantity_uom.trim() : "";
    if (normalized.maximum_qty_micros !== undefined && !uom) {
      throw errors.validation("quantity_uom is required when maximum_qty is configured");
    }
    if (context.command.action === "submit" && uom) {
      if (!await context.reader.hasMasterRecord(context.command.tenant_id, "UOM", uom)) {
        throw errors.reference(`UOM ${uom} does not exist or is disabled`);
      }
    }
    return normalized;
  }
}

function hasQualificationHistory(
  qualifications: Array<{ docstatus: number; data: SupplierQualificationData }>,
  supplier: string,
  company: string,
): boolean {
  return qualifications.some((doc) =>
    doc.docstatus !== 0
    && doc.data.supplier === supplier
    && doc.data.company === company);
}
