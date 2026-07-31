import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, MaterialRequestController, PurchaseInvoiceController, RequestForQuotationController, StockEntryController, SupplierQuotationController } from "./controllers.js";
import { PurchaseAllocationOverrideController, PurchaseSettlementController } from "./purchase-allocation-action-controllers.js";
import { RolloutPurchaseOrderController, RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new JournalEntryController())
    .register(new MaterialRequestController())
    .register(new RequestForQuotationController())
    .register(new SupplierQuotationController())
    .register(new RolloutPurchaseOrderController())
    .register(new RolloutPurchaseReceiptController())
    .register(new PurchaseSettlementController())
    .register(new PurchaseAllocationOverrideController())
    .register(new PurchaseInvoiceController())
    .register(new StockEntryController());
}
