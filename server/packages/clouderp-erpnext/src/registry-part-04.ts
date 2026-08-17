import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { SalaryBankBatchController } from "./hrm-workforce-finance-controllers.js";
import { SubscriptionController, EInvoiceSubmissionController } from "./enterprise-controllers.js";
import { WarehouseCashFundController, WarehouseCashVoucherController, WarehouseCashTransferController, WarehouseCashCountController } from "./warehouse-cash.js";
import { AlumDoorPayProfileController } from "./alumdoor-payroll.js";
import { AlumDoorAttendanceDeviceController } from "./alumdoor-attendance.js";
import { AlumDoorLiteAttendanceDayController } from "./alumdoor-attendance-lite.js";
import { CutOrderReservationIntegrityController } from "./cut-order-reservation-integrity.js";
import { StockReservationIntegrityController } from "./stock-reservation-integrity.js";
import { StockReconciliationIntegrityController } from "./stock-reconciliation-integrity.js";
import { SalesLinkedProductionPlanController, SalesLinkedWorkOrderController } from "./manufacturing-sales-lineage.js";
import { ManufacturingReleaseAuthorityWorkOrderController } from "./manufacturing-release-authority.js";

export function registerErpNextControllersPart04(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new SalaryBankBatchController())
    .register(new SubscriptionController())
    .register(new EInvoiceSubmissionController())
    .register(new WarehouseCashFundController())
    .register(new WarehouseCashVoucherController())
    .register(new WarehouseCashTransferController())
    .register(new WarehouseCashCountController())
    .register(new AlumDoorPayProfileController())
    .register(new AlumDoorLiteAttendanceDayController())
    .register(new AlumDoorAttendanceDeviceController())
    .register(new CutOrderReservationIntegrityController())
    .register(new StockReservationIntegrityController())
    .register(new StockReconciliationIntegrityController())
    .register(new SalesLinkedProductionPlanController())
    .register(new SalesLinkedWorkOrderController())
    .register(new ManufacturingReleaseAuthorityWorkOrderController());
}
