import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { EmployeeDisciplineController, PersonnelDocumentController } from "./hrm-personnel-controllers.js";
import { CandidateProfileController, ExtendedJobOpeningController, ExtendedJobApplicantController, CandidateMatchController, InterviewScorecardController, JobOfferResponseController, CareerPostingController } from "./hrm-recruitment-depth-controllers.js";
import { InterviewController, JobOfferController } from "./hrm-core-controllers.js";
import { AcceptedHiringCompletionController } from "./hrm-recruitment-lifecycle.js";
import { GeofencedShiftTypeController, AttendanceGeofenceController, GeofencedEmployeeCheckinController } from "./hrm-geofence-controllers.js";
import { ShiftAssignmentController, AttendanceRequestController, AttendanceController } from "./hrm-shift-attendance-controllers.js";
import { OvertimeRequestController, HolidayListController, LeavePolicyController, LeaveAllocationController, LeaveApplicationController } from "./hrm-leave-overtime-controllers.js";
import { WorkforcePlanController, EmployeeBenefitEnrollmentController, EmployeeLoanController } from "./hrm-workforce-finance-controllers.js";
import { SalaryStructureController, HrmSalaryStructureAssignmentController, HrmPayrollPeriodController } from "./hrm-policy-controllers.js";
import { AdditionalSalaryController, EmployeeAdvanceController, TravelRequestController } from "./hrm-benefit-controllers.js";
import { ReconciledEmployeeLoanDisbursementController, ReconciledEmployeeLoanRepaymentController } from "./hrm-loan-finance-reconciliation.js";
import { EmployeeFinalSettlementController } from "./hrm-lifecycle-closure-controllers.js";

export function registerErpNextControllersPart02(registry: ControllerRegistry): ControllerRegistry {
  return registry
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
    .register(new ReconciledEmployeeLoanDisbursementController())
    .register(new EmployeeLoanController())
    .register(new ReconciledEmployeeLoanRepaymentController())
    .register(new EmployeeAdvanceController())
    .register(new TravelRequestController())
    .register(new EmployeeFinalSettlementController());
}
