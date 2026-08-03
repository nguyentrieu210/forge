import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import {
  AssetController, AssetDepreciationController,
  CreditNoteController, DebitNoteController,
} from "./controllers.js";
import {
  AssetDisposalController, AssetMaintenanceController, AssetMovementController, ExpenseClaimController,
  IssueController, JobCardController,
  ProductionPlanController, QualityInspectionController, TimesheetController,
} from "./suite-controllers.js";
import {
  HardenedPosClosingEntryController, HardenedPosOpeningEntryController,
} from "./pos-session-hardening.js";
import { ExactCancelPosInvoiceController } from "./pos-cancel-exact.js";
import { DeliveryTripController, ProofOfDeliveryController } from "./logistics-controllers.js";
import { FreightEstimateController, TransportContractController } from "./freight-controllers.js";
import {
  BankReconciliationController, BankTransactionController, EInvoiceSubmissionController, PayrollEntryController,
  SubscriptionController,
} from "./enterprise-controllers.js";
import {
  FinanceBudgetCommitmentController,
  FinanceBudgetController,
  FinanceBudgetRevisionController,
} from "./finance-budget.js";
import {
  EmployeeOnboardingController, EmployeePromotionController, EmployeeSeparationController,
  EmployeeTransferController, EmploymentContractController, InterviewController,
  JobOfferController,
} from "./hrm-core-controllers.js";
import {
  AttendanceController, AttendanceRequestController, ShiftAssignmentController,
} from "./hrm-shift-attendance-controllers.js";
import {
  AttendanceGeofenceController, GeofencedEmployeeCheckinController, GeofencedShiftTypeController,
} from "./hrm-geofence-controllers.js";
import {
  HolidayListController, LeaveAllocationController, LeaveApplicationController, LeavePolicyController, OvertimeRequestController,
} from "./hrm-leave-overtime-controllers.js";
import {
  AdditionalSalaryController, EmployeeAdvanceController, TrainingEventController, TravelRequestController,
} from "./hrm-benefit-controllers.js";
import {
  HrmAppraisalController, HrmPayrollPeriodController, HrmSalaryStructureAssignmentController,
  SalaryStructureController,
} from "./hrm-policy-controllers.js";
import {
  EmployeeBenefitEnrollmentController, EmployeeLoanController, EmployeeLoanRepaymentController,
  SalaryBankBatchController, WorkforcePlanController,
} from "./hrm-workforce-finance-controllers.js";
import { EmployeeLoanDisbursementController } from "./hrm-loan-disbursement-controller.js";
import { EmployeeFinalSettlementController } from "./hrm-lifecycle-closure-controllers.js";
import { AcceptedHiringCompletionController } from "./hrm-recruitment-lifecycle.js";
import {
  CareerPostingController, CandidateMatchController, CandidateProfileController, ExtendedJobApplicantController,
  ExtendedJobOpeningController, InterviewScorecardController, JobOfferResponseController,
} from "./hrm-recruitment-depth-controllers.js";
import { EmployeePositionAssignmentController, OrganizationPositionController } from "./hrm-organization-controllers.js";
import { EmployeeDisciplineController, PersonnelDocumentController } from "./hrm-personnel-controllers.js";
import {
  CompetencyAssessmentController, CompetencyController, EmployeeCertificateController, ExtendedGoalController,
  Review360Controller, SuccessionPlanController, TalentPoolController, TrainingAssessmentController, TrainingCourseController,
} from "./hrm-talent-controllers.js";
import { HrmSalarySlipController } from "./hrm-salary-slip.js";
import { CutOrderController } from "./alumdoor-inventory.js";
import { StockReservationIntegrityController } from "./stock-reservation-integrity.js";
import { StockReconciliationIntegrityController } from "./stock-reconciliation-integrity.js";
import { StockReturnIntegrityController } from "./stock-return-integrity.js";
import {
  ManufacturingDowntimeController, ManufacturingRoutingController, WorkstationCapacityCalendarController,
} from "./manufacturing-capacity.js";
import { VersionedBillOfMaterialsController } from "./manufacturing-lifecycle.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";
import { StockEntryIntegrityController } from "./stock-entry-integrity.js";
import {
  CapaController, NonConformanceReportController,
  QualityPlanController, RootCauseAnalysisController,
} from "./qms-controllers.js";
import { ManufacturingCalibrationRecordController } from "./qms-calibration.js";
import {
  WarehouseCashCountController, WarehouseCashFundController,
  WarehouseCashTransferController, WarehouseCashVoucherController,
} from "./warehouse-cash.js";

export function registerErpNextCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CreditNoteController())
    .register(new DebitNoteController())
    .register(new StockReturnIntegrityController())
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
    .register(new EmployeeSeparationController())
    .register(new EmployeeDisciplineController())
    .register(new PersonnelDocumentController())
    .register(new CandidateProfileController())
    .register(new ExtendedJobOpeningController())
    .register(new ExtendedJobApplicantController())
    .register(new CandidateMatchController())
    .register(new InterviewController())
    .register(new InterviewScorecardController())
    .register(new JobOfferController())
    .register(new JobOfferResponseController())
    .register(new CareerPostingController())
    .register(new AcceptedHiringCompletionController())
    .register(new GeofencedShiftTypeController())
    .register(new AttendanceGeofenceController())
    .register(new ShiftAssignmentController())
    .register(new GeofencedEmployeeCheckinController())
    .register(new AttendanceRequestController())
    .register(new OvertimeRequestController())
    .register(new HolidayListController())
    .register(new LeavePolicyController())
    .register(new LeaveAllocationController())
    .register(new LeaveApplicationController())
    .register(new AttendanceController())
    .register(new WorkforcePlanController())
    .register(new SalaryStructureController())
    .register(new HrmSalaryStructureAssignmentController())
    .register(new HrmPayrollPeriodController())
    .register(new AdditionalSalaryController())
    .register(new EmployeeBenefitEnrollmentController())
    .register(new EmployeeLoanDisbursementController())
    .register(new EmployeeLoanController())
    .register(new EmployeeLoanRepaymentController())
    .register(new EmployeeAdvanceController())
    .register(new TravelRequestController())
    .register(new EmployeeFinalSettlementController())
    .register(new ExtendedGoalController())
    .register(new HrmAppraisalController())
    .register(new Review360Controller())
    .register(new CompetencyController())
    .register(new CompetencyAssessmentController())
    .register(new TalentPoolController())
    .register(new SuccessionPlanController())
    .register(new TrainingCourseController())
    .register(new TrainingEventController())
    .register(new TrainingAssessmentController())
    .register(new EmployeeCertificateController())
    .register(new HardenedPosOpeningEntryController())
    .register(new ExactCancelPosInvoiceController())
    .register(new HardenedPosClosingEntryController())
    .register(new DeliveryTripController())
    .register(new ProofOfDeliveryController())
    .register(new TransportContractController())
    .register(new FreightEstimateController())
    .register(new BankTransactionController())
    .register(new BankReconciliationController())
    .register(new FinanceBudgetController())
    .register(new FinanceBudgetRevisionController())
    .register(new FinanceBudgetCommitmentController())
    .register(new HrmSalarySlipController())
    .register(new PayrollEntryController())
    .register(new SalaryBankBatchController())
    .register(new SubscriptionController())
    .register(new EInvoiceSubmissionController())
    .register(new WarehouseCashFundController())
    .register(new WarehouseCashVoucherController())
    .register(new WarehouseCashTransferController())
    .register(new WarehouseCashCountController())
    .register(new CutOrderController())
    .register(new StockReservationIntegrityController())
    .register(new StockReconciliationIntegrityController());
}
