import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, MaterialRequestController, PurchaseInvoiceController, StockEntryController } from "./controllers.js";
import { ProcurementPurchaseOrderController, ProcurementRequestForQuotationController, ProcurementSupplierQuotationController } from "./procurement-integrity-controllers.js";
import { PurchaseAllocationOverrideController } from "./purchase-allocation-action-controllers.js";
import { RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";
import { PurchaseSettlementLifecycleController } from "./purchase-settlement-lifecycle-controller.js";
import { SupplierContractController, SupplierQualificationController, SupplierRatingController } from "./supplier-lifecycle-controllers.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new JournalEntryController())
    .register(new MaterialRequestController())
    .register(new ProcurementRequestForQuotationController())
    .register(new ProcurementSupplierQuotationController())
    .register(new ProcurementPurchaseOrderController())
    .register(new RolloutPurchaseReceiptController())
    .register(new SupplierQualificationController())
    .register(new SupplierRatingController())
    .register(new SupplierContractController())
    .register(new PurchaseSettlementLifecycleController())
    .register(new PurchaseAllocationOverrideController())
    .register(new PurchaseInvoiceController())
    .register(new StockEntryController());
}
