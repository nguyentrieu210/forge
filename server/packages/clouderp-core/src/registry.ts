import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { JournalEntryController, MaterialRequestController, PurchaseInvoiceController, PurchaseOrderController, PurchaseReceiptController, RequestForQuotationController, StockEntryController, SupplierQuotationController } from "./controllers.js";

export function registerErpCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry.register(new JournalEntryController()).register(new MaterialRequestController()).register(new RequestForQuotationController()).register(new SupplierQuotationController()).register(new PurchaseOrderController()).register(new PurchaseReceiptController()).register(new PurchaseInvoiceController()).register(new StockEntryController());
}
