import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { CreditNoteController, DebitNoteController, AssetController, AssetDepreciationController } from "./controllers.js";
import { StockReturnIntegrityController } from "./stock-return-integrity.js";
import { WarehouseScopedDeliveryNoteController, WarehouseScopedPurchaseReceiptController } from "./stock-document-warehouse-integrity.js";
import { SourceCompleteBillOfMaterialsController } from "./source-complete-bom.js";
import { SubcontractingOrderController, SubcontractingReceiptController, SubcontractingStockEntryController } from "./subcontracting.js";
import { LandedCostVoucherController } from "./landed-cost-voucher.js";
import { ManufacturingRoutingController, WorkstationCapacityCalendarController, ManufacturingDowntimeController } from "./manufacturing-capacity.js";
import { ProductionPlanController, JobCardController, AssetMovementController, AssetMaintenanceController, AssetDisposalController, TimesheetController, QualityInspectionController, IssueController, ExpenseClaimController } from "./suite-controllers.js";
import { QualityPlanController, NonConformanceReportController, RootCauseAnalysisController, CapaController } from "./qms-controllers.js";
import { ManufacturingCalibrationRecordController } from "./qms-calibration.js";
import { OrganizationPositionController, EmployeePositionAssignmentController } from "./hrm-organization-controllers.js";
import { EmploymentContractController, EmployeeOnboardingController, EmployeeTransferController, EmployeePromotionController, EmployeeSeparationController } from "./hrm-core-controllers.js";

export function registerErpNextControllersPart01(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CreditNoteController())
    .register(new DebitNoteController())
    .register(new StockReturnIntegrityController())
    .register(new WarehouseScopedDeliveryNoteController())
    .register(new WarehouseScopedPurchaseReceiptController())
    .register(new LandedCostVoucherController())
    .register(new SourceCompleteBillOfMaterialsController())
    // "Work Order" KHÔNG được register ở đây nữa (vá 21/08/2026 — xem
    // docs/audits/ALUMDOOR-SAN-XUAT-SAU-VONG2-20260821.md §1 S6). `StockUomSnapshotWorkOrderController`
    // vẫn tồn tại và vẫn cần thiết — nó là superclass thật của chuỗi kế thừa
    // `ManufacturingReleaseAuthorityWorkOrderController extends SalesLinkedWorkOrderController extends
    // StockUomSnapshotWorkOrderController` (xem `manufacturing-release-authority.ts`) — chỉ riêng việc
    // TỰ NÓ register vào `ControllerRegistry` là dư: `registerErpNextControllersPart04()` luôn chạy
    // SAU part-01 và register lại đúng key "Work Order" bằng bản kế thừa cuối, nên bản ở đây trước đó
    // chưa từng được `registry.get("Work Order")` trả về ở runtime dù có đứng đây hay không.
    .register(new SubcontractingStockEntryController())
    .register(new ManufacturingRoutingController())
    .register(new WorkstationCapacityCalendarController())
    .register(new ManufacturingDowntimeController())
    .register(new AssetController())
    .register(new AssetDepreciationController())
    .register(new SubcontractingOrderController())
    .register(new SubcontractingReceiptController())
    .register(new ProductionPlanController())
    .register(new JobCardController())
    .register(new AssetMovementController())
    .register(new AssetMaintenanceController())
    .register(new AssetDisposalController())
    .register(new TimesheetController())
    .register(new QualityInspectionController())
    .register(new QualityPlanController())
    .register(new NonConformanceReportController())
    .register(new RootCauseAnalysisController())
    .register(new CapaController())
    .register(new ManufacturingCalibrationRecordController())
    .register(new IssueController())
    .register(new ExpenseClaimController())
    .register(new OrganizationPositionController())
    .register(new EmployeePositionAssignmentController())
    .register(new EmploymentContractController())
    .register(new EmployeeOnboardingController())
    .register(new EmployeeTransferController())
    .register(new EmployeePromotionController())
    .register(new EmployeeSeparationController());
}
