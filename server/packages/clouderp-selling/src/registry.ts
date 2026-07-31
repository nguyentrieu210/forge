import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { DeliveryNoteController, SalesInvoiceController, SalesOrderController } from "./controllers.js";
import { FinancePaymentEntryController, PaymentAllocationController } from "./finance-controllers.js";

export function createO2CControllerRegistry(): ControllerRegistry {
  return new ControllerRegistry()
    .register(new SalesOrderController())
    .register(new DeliveryNoteController())
    .register(new SalesInvoiceController())
    .register(new FinancePaymentEntryController())
    .register(new PaymentAllocationController());
}
