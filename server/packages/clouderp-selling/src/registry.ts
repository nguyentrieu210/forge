
import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { DeliveryNoteController, PaymentEntryController, SalesInvoiceController, SalesOrderController } from "./controllers.js";

export function createO2CControllerRegistry(): ControllerRegistry {
  return new ControllerRegistry()
    .register(new SalesOrderController())
    .register(new DeliveryNoteController())
    .register(new SalesInvoiceController())
    .register(new PaymentEntryController());
}
