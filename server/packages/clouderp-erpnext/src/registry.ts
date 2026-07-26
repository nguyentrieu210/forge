import type { ControllerRegistry } from "../../document-kernel/src/index.js";
import {
  AdvancedStockEntryController, AssetController, AssetDepreciationController, BillOfMaterialsController,
  CreditNoteController, DebitNoteController, StockReturnController, WorkOrderController,
} from "./controllers.js";
import {
  AssetDisposalController, AssetMaintenanceController, AssetMovementController, ExpenseClaimController,
  IssueController, JobCardController, PosClosingEntryController, PosInvoiceController, PosOpeningEntryController,
  ProductionPlanController, QualityInspectionController, TimesheetController,
} from "./suite-controllers.js";
import {
  BankReconciliationController, BankTransactionController, EInvoiceSubmissionController, PayrollEntryController,
  SalarySlipController, SubscriptionController,
} from "./enterprise-controllers.js";

export function registerErpNextCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CreditNoteController())
    .register(new DebitNoteController())
    .register(new StockReturnController())
    .register(new BillOfMaterialsController())
    .register(new WorkOrderController())
    .register(new AdvancedStockEntryController())
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
    .register(new PosOpeningEntryController())
    .register(new PosInvoiceController())
    .register(new PosClosingEntryController())
    .register(new BankTransactionController())
    .register(new BankReconciliationController())
    .register(new SalarySlipController())
    .register(new PayrollEntryController())
    .register(new SubscriptionController())
    .register(new EInvoiceSubmissionController());
}
