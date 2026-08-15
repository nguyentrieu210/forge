import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { CreditNoteController, DebitNoteController, AssetController, AssetDepreciationController } from "./controllers.js";
import { StockReturnIntegrityController } from "./stock-return-integrity.js";
import { WarehouseScopedDeliveryNoteController, WarehouseScopedPurchaseReceiptController } from "./stock-document-warehouse-integrity.js";
import { VersionedBillOfMaterialsController } from "./manufacturing-lifecycle.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";
import { StockEntryIntegrityController } from "./stock-entry-integrity.js";
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
    .register(new VersionedBillOfMaterialsController())
    .register(new StockUomSnapshotWorkOrderController())
    .register(new StockEntryIntegrityController())
    .register(new ManufacturingRoutingController())
    .register(new WorkstationCapacityCalendarController())
    .register(new ManufacturingDowntimeController())
    .register(new AssetController())
    .register(new AssetDepreciationController())
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
