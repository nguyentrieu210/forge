import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { ArSalesInvoiceController } from "./ar-sales-invoice-controller.js";
import { DeliveryNoteController } from "./controllers.js";
import { PaymentAllocationController } from "./finance-controllers.js";
import { R5FinanceHcmPaymentEntryController } from "./r5-finance-hcm-payment-entry.js";
import { CompleteQuotationController, CompleteSalesOrderController } from "./sales-commercial-complete-controllers.js";

export function registerO2CControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CompleteQuotationController())
    .register(new CompleteSalesOrderController())
    .register(new DeliveryNoteController())
    .register(new ArSalesInvoiceController())
    .register(new R5FinanceHcmPaymentEntryController())
    .register(new PaymentAllocationController());
}
