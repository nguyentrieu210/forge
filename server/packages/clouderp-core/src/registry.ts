import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, MaterialRequestController, PurchaseInvoiceController, RequestForQuotationController, StockEntryController, SupplierQuotationController } from "./controllers.js";
import { AllocatingPurchaseOrderController, AllocatingPurchaseReceiptController } from "./purchase-allocation-controllers.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new JournalEntryController())
    .register(new MaterialRequestController())
    .register(new RequestForQuotationController())
    .register(new SupplierQuotationController())
    .register(new AllocatingPurchaseOrderController())
    .register(new AllocatingPurchaseReceiptController())
    .register(new PurchaseInvoiceController())
    .register(new StockEntryController());
}
