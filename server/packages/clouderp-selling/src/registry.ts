import { ControllerRegistry } from "../../document-kernel/src/index.js";
import { DeliveryNoteController, SalesInvoiceController, SalesOrderController } from "./controllers.js";
import { PaymentAllocationController } from "./finance-controllers.js";
import { SafeFinancePaymentEntryController } from "./safe-finance-payment-entry.js";

export function createO2CControllerRegistry(): ControllerRegistry {
  return new ControllerRegistry()
    .register(new SalesOrderController())
    .register(new DeliveryNoteController())
    .register(new SalesInvoiceController())
    .register(new SafeFinancePaymentEntryController())
    .register(new PaymentAllocationController());
}
