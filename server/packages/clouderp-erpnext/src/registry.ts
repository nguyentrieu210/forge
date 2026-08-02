import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import {
  AssetController, AssetDepreciationController,
  CreditNoteController, DebitNoteController, StockReturnController,
} from "./controllers.js";
import {
  AssetDisposalController, AssetMaintenanceController, AssetMovementController, ExpenseClaimController,
  IssueController, JobCardController, PosClosingEntryController, PosInvoiceController, PosOpeningEntryController,
  ProductionPlanController, QualityInspectionController, TimesheetController,
} from "./suite-controllers.js";
import {
  BankReconciliationController, BankTransactionController, EInvoiceSubmissionController, PayrollEntryController,
  SubscriptionController,
} from "./enterprise-controllers.js";
import {
  EmployeeOnboardingController, EmployeePromotionController, EmployeeSeparationController,
  EmployeeTransferController, EmploymentContractController, InterviewController, JobApplicantController,
  JobOfferController, JobOpeningController,
} from "./hrm-core-controllers.js";
import {
  AttendanceController, AttendanceRequestController, EmployeeCheckinController, ShiftAssignmentController, ShiftTypeController,
} from "./hrm-shift-attendance-controllers.js";
import {
  HolidayListController, LeaveAllocationController, LeaveApplicationController, LeavePolicyController, OvertimeRequestController,
} from "./hrm-leave-overtime-controllers.js";
import {
  AdditionalSalaryController, EmployeeAdvanceController, TrainingEventController, TravelRequestController,
} from "./hrm-benefit-controllers.js";
import {
  GoalController, HrmAppraisalController, HrmPayrollPeriodController, HrmSalaryStructureAssignmentController,
  SalaryStructureController,
} from "./hrm-policy-controllers.js";
import { HrmSalarySlipController } from "./hrm-salary-slip.js";
import {
  CutOrderController, StockReservationController,
} from "./alumdoor-inventory.js";
import { StockReconciliationIntegrityController } from "./stock-reconciliation-integrity.js";
import { VersionedBillOfMaterialsController } from "./manufacturing-lifecycle.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";
import { RolloutManufacturingStockEntryController } from "./manufacturing-rollout.js";
import {
  WarehouseCashCountController, WarehouseCashFundController,
  WarehouseCashTransferController, WarehouseCashVoucherController,
} from "./warehouse-cash.js";

export function registerErpNextCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CreditNoteController())
    .register(new DebitNoteController())
    .register(new StockReturnController())
    .register(new VersionedBillOfMaterialsController())
    .register(new StockUomSnapshotWorkOrderController())
    .register(new RolloutManufacturingStockEntryController())
    .register(new AssetController())
    .register(new AssetDepreciationController())
    .register(new ProductionPlanController())
    .register(new JobCardController())
    .register(new AssetMovementController())
    .register(new AssetMaintenanceController())
    .register(new AssetDisposalController())
    .register(new TimesheetController())
    .register(new QualityInspectionController())
    .register(new IssueController())
    .register(new ExpenseClaimController())
    .register(new EmploymentContractController())
    .register(new EmployeeOnboardingController())
    .register(new EmployeeTransferController())
    .register(new EmployeePromotionController())
    .register(new EmployeeSeparationController())
    .register(new JobOpeningController())
    .register(new JobApplicantController())
    .register(new InterviewController())
    .register(new JobOfferController())
    .register(new ShiftTypeController())
    .register(new ShiftAssignmentController())
    .register(new EmployeeCheckinController())
    .register(new AttendanceRequestController())
    .register(new OvertimeRequestController())
    .register(new HolidayListController())
    .register(new LeavePolicyController())
    .register(new LeaveAllocationController())
    .register(new LeaveApplicationController())
    .register(new AttendanceController())
    .register(new SalaryStructureController())
    .register(new HrmSalaryStructureAssignmentController())
    .register(new HrmPayrollPeriodController())
    .register(new AdditionalSalaryController())
    .register(new EmployeeAdvanceController())
    .register(new TravelRequestController())
    .register(new GoalController())
    .register(new HrmAppraisalController())
    .register(new TrainingEventController())
    .register(new PosOpeningEntryController())
    .register(new PosInvoiceController())
    .register(new PosClosingEntryController())
    .register(new BankTransactionController())
    .register(new BankReconciliationController())
    .register(new HrmSalarySlipController())
    .register(new PayrollEntryController())
    .register(new SubscriptionController())
    .register(new EInvoiceSubmissionController())
    .register(new WarehouseCashFundController())
    .register(new WarehouseCashVoucherController())
    .register(new WarehouseCashTransferController())
    .register(new WarehouseCashCountController())
    .register(new CutOrderController())
    .register(new StockReservationController())
    .register(new StockReconciliationIntegrityController());
}
