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
  SalarySlipController, SubscriptionController,
} from "./enterprise-controllers.js";
import {
  CutOrderController, StockReconciliationController, StockReservationController,
} from "./alumdoor-inventory.js";
import { VersionedBillOfMaterialsController } from "./manufacturing-lifecycle.js";
import { ReportingManufacturingStockEntryController } from "./manufacturing-reporting.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";

export function registerErpNextCoreControllers(registry: ControllerRegistry): ControllerRegistry {
  return registry
    .register(new CreditNoteController())
    .register(new DebitNoteController())
    .register(new StockReturnController())
    .register(new VersionedBillOfMaterialsController())
    .register(new StockUomSnapshotWorkOrderController())
    .register(new ReportingManufacturingStockEntryController())
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
    .register(new EInvoiceSubmissionController())
    .register(new CutOrderController())
    .register(new StockReservationController())
    .register(new StockReconciliationController());
}
