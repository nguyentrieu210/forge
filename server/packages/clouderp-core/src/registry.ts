import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, StockEntryController } from "./controllers.js";
import { PurchaseFundingMaterialRequestController } from "./purchase-funding-material-request.js";
import { ProcurementRequestForQuotationController, ProcurementSupplierContractController, ProcurementSupplierQuotationController } from "./procurement-integrity-controllers.js";
import { ProcurementP2PPurchaseInvoiceController, ProcurementP2PPurchaseOrderController } from "./procurement-p2p-controllers.js";
import { PurchaseAllocationOverrideController } from "./purchase-allocation-action-controllers.js";
import { RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";
import { PurchaseSettlementLifecycleController } from "./purchase-settlement-lifecycle-controller.js";
import { SupplierQualificationController, SupplierRatingController } from "./supplier-lifecycle-controllers.js";
import { SupplierSelectionController } from "./supplier-selection-controller.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new JournalEntryController())
    .register(new PurchaseFundingMaterialRequestController())
    .register(new ProcurementRequestForQuotationController())
    .register(new ProcurementSupplierQuotationController())
    .register(new SupplierSelectionController())
    .register(new ProcurementP2PPurchaseOrderController())
    .register(new RolloutPurchaseReceiptController())
    .register(new SupplierQualificationController())
    .register(new SupplierRatingController())
    .register(new ProcurementSupplierContractController())
    .register(new PurchaseSettlementLifecycleController())
    .register(new PurchaseAllocationOverrideController())
    .register(new ProcurementP2PPurchaseInvoiceController())
    .register(new StockEntryController());
}
