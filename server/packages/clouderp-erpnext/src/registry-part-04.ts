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
import { SalesLinkedProductionPlanController } from "./manufacturing-sales-lineage.js";
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
    // "Work Order" chỉ register MỘT lần ở đây (vá 21/08/2026, §1 S6 cùng file nêu trên):
    // `ManufacturingReleaseAuthorityWorkOrderController` đã `extends SalesLinkedWorkOrderController`
    // nên tự mang đủ hành vi của lớp cha; register riêng `SalesLinkedWorkOrderController` trước đó chỉ
    // bị `Map.set("Work Order", …)` ghi đè ngay dòng dưới — không đổi hành vi nhưng đọc code dễ tưởng
    // nhầm nó là controller đang chạy.
    .register(new ManufacturingReleaseAuthorityWorkOrderController());
}
