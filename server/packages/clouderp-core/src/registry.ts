import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, PurchaseInvoiceController, PurchaseOrderController, PurchaseReceiptController, StockEntryController } from "./controllers.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry.register(new JournalEntryController()).register(new PurchaseOrderController()).register(new PurchaseReceiptController()).register(new PurchaseInvoiceController()).register(new StockEntryController());
}
