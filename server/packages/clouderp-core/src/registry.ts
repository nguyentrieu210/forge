import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { MaterialRequestController, PurchaseInvoiceController, RequestForQuotationController, SupplierQuotationController } from "./controllers.js";
import { AccountingJournalEntryController } from "./accounting-journal-entry-controller.js";
import { AccountingPurchaseReceiptController } from "./accounting-purchase-receipt-controller.js";
import { AccountingStockEntryController } from "./accounting-stock-entry-controller.js";
import { PurchaseAllocationOverrideController } from "./purchase-allocation-action-controllers.js";
import { RolloutPurchaseOrderController } from "./purchase-allocation-rollout-controllers.js";
import { PurchaseSettlementLifecycleController } from "./purchase-settlement-lifecycle-controller.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new AccountingJournalEntryController())
    .register(new MaterialRequestController())
    .register(new RequestForQuotationController())
    .register(new SupplierQuotationController())
    .register(new RolloutPurchaseOrderController())
    .register(new AccountingPurchaseReceiptController())
    .register(new PurchaseSettlementLifecycleController())
    .register(new PurchaseAllocationOverrideController())
    .register(new PurchaseInvoiceController())
    .register(new AccountingStockEntryController());
}
