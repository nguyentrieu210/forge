import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, MaterialRequestController, PurchaseInvoiceController, RequestForQuotationController, SupplierQuotationController } from "./controllers.js";
import { AccountingStockEntryController } from "./accounting-stock-entry-controller.js";
import { PurchaseAllocationOverrideController } from "./purchase-allocation-action-controllers.js";
import { RolloutPurchaseOrderController, RolloutPurchaseReceiptController } from "./purchase-allocation-rollout-controllers.js";
import { PurchaseSettlementLifecycleController } from "./purchase-settlement-lifecycle-controller.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new JournalEntryController())
    .register(new MaterialRequestController())
    .register(new RequestForQuotationController())
    .register(new SupplierQuotationController())
    .register(new RolloutPurchaseOrderController())
    .register(new RolloutPurchaseReceiptController())
    .register(new PurchaseSettlementLifecycleController())
    .register(new PurchaseAllocationOverrideController())
    .register(new PurchaseInvoiceController())
    .register(new AccountingStockEntryController());
}
