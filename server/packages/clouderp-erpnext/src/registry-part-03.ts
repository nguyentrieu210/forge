import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import { ExtendedGoalController, Review360Controller, CompetencyController, CompetencyAssessmentController, TalentPoolController, SuccessionPlanController, TrainingCourseController, TrainingAssessmentController, EmployeeCertificateController } from "./hrm-talent-controllers.js";
import { HrmAppraisalController } from "./hrm-policy-controllers.js";
import { TrainingEventController } from "./hrm-benefit-controllers.js";
import { HardenedPosOpeningEntryController, HardenedPosClosingEntryController } from "./pos-session-hardening.js";
import { ExactCancelPosInvoiceController } from "./pos-cancel-exact.js";
import { DeliveryTripController, ProofOfDeliveryController } from "./logistics-controllers.js";
import { LoadingPlanController } from "./loading-plan-controller.js";
import { TransportContractController, FreightEstimateController } from "./freight-controllers.js";
import { BankTransactionController, BankReconciliationController } from "./enterprise-controllers.js";
import { FinanceBudgetController, FinanceBudgetRevisionController, FinanceBudgetCommitmentController } from "./finance-budget.js";
import { ExchangeRateRevaluationController } from "./exchange-rate-revaluation.js";
import { HrmSalarySlipController } from "./hrm-salary-slip.js";
import { AlumDoorAwarePayrollEntryController } from "./alumdoor-payroll-entry.js";

export function registerErpNextControllersPart03(registry: ControllerRegistry): ControllerRegistry {
  return registry
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
    .register(new LoadingPlanController())
    .register(new ProofOfDeliveryController())
    .register(new TransportContractController())
    .register(new FreightEstimateController())
    .register(new BankTransactionController())
    .register(new BankReconciliationController())
    .register(new FinanceBudgetController())
    .register(new FinanceBudgetRevisionController())
    .register(new FinanceBudgetCommitmentController())
    .register(new ExchangeRateRevaluationController())
    .register(new HrmSalarySlipController())
    .register(new AlumDoorAwarePayrollEntryController());
}
