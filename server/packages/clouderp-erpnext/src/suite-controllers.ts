import type {
  AssetLifecycleEntry, BankReconciliationEntry, CanonicalDocument, ChildRow, GeneralLedgerEntry, JsonObject, MutationPlan,
  PaymentLedgerEntry, PosSalesEntry, ProjectTimeEntry, StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment, reverseStock } from "../../ledger/src/index.js";
import { fromScaledInt, multiplyScaled, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import { calculateSalesTotals } from "../../clouderp-selling/src/totals.js";
import { resolveServerPrice } from "../../clouderp-pricing/src/index.js";
import { buildTrackedStockLines, deriveOutgoingValuation } from "../../clouderp-stock/src/index.js";
import type {
  AssetDisposalData, AssetMaintenanceData, AssetMovementData, ExpenseClaimData, ExpenseClaimItem,
  IssueData, JobCardData, JobCardTimeLog, PosClosingEntryData, PosInvoiceData, PosOpeningEntryData,
  ProductionPlanData, ProductionPlanItem, QualityInspectionData, QualityReading, TimesheetData, TimesheetDetail,
} from "./types.js";

type SuiteLedgers = {
  gl?: GeneralLedgerEntry[];
  stock?: StockLedgerEntry[];
  payment?: PaymentLedgerEntry[];
  assetLifecycle?: AssetLifecycleEntry[];
  projectTime?: ProjectTimeEntry[];
  posSales?: PosSalesEntry[];
  bankReconciliation?: BankReconciliationEntry[];
};

export abstract class SuiteController<T extends JsonObject> implements DocumentController<T> {
  abstract readonly doctype: string;
  abstract normalize(context: ControllerContext<T>): Promise<T>;
  async ledgers(_context: ControllerContext<T>, _data: T): Promise<SuiteLedgers> { return {}; }
  status(context: ControllerContext<T>, _data: T): string {
    const docstatus = nextDocStatus(context.command.action);
    return docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
  }
  async buildPlan(context: ControllerContext<T>): Promise<MutationPlan<T>> {
    const data = context.command.action === "cancel" ? structuredClone(requireExisting(context).data) : await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    const status = this.status(context, data);
    const ledgers = await this.ledgers(context, data);
    const document: CanonicalDocument<T> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: extractChildren(this.doctype, data),
    };
    return {
      command: context.command,
      document,
      gl_entries: ledgers.gl ?? [],
      stock_entries: ledgers.stock ?? [],
      payment_entries: ledgers.payment ?? [],
      fulfillment_entries: [],
      asset_lifecycle_entries: ledgers.assetLifecycle ?? [],
      project_time_entries: ledgers.projectTime ?? [],
      pos_sales_entries: ledgers.posSales ?? [],
      bank_reconciliation_entries: ledgers.bankReconciliation ?? [],
      events: [domainEvent({
        type: `${slug(this.doctype)}.${context.command.action}`,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { status },
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }
}

export class ProductionPlanController extends SuiteController<ProductionPlanData> {
  readonly doctype = "Production Plan";
  async normalize(context: ControllerContext<ProductionPlanData>): Promise<ProductionPlanData> {
    const input = context.command.document;
    if (!input.company || !input.posting_at || !Array.isArray(input.items) || input.items.length === 0) {
      throw errors.validation("Company, posting_at and production plan items are required");
    }
    const items: ProductionPlanItem[] = [];
    let total = 0;
    for (const [index, raw] of input.items.entries()) {
      const qty = toScaledInt(raw.planned_qty, 6, `items[${index}].planned_qty`);
      if (qty <= 0 || !raw.item_code || !raw.bom_no) throw errors.validation(`Valid item, BOM and quantity are required at row ${index + 1}`);
      if (context.command.action === "submit") {
        const bom = await requireSubmitted<JsonObject>(context, "Bill of Materials", raw.bom_no);
        if (bom.data.company !== input.company || bom.data.item !== raw.item_code) throw errors.reference(`BOM ${raw.bom_no} does not match planned item/company`);
      }
      total = safeAdd(total, qty);
      items.push({ ...raw, row_id: raw.row_id || `ROW-${index + 1}`, planned_qty: fromScaledInt(qty, 6), planned_qty_micros: qty });
    }
    if (context.command.action === "submit") await assertMasters(context, [["Company", input.company], ...items.map((item): [string, string] => ["Item", item.item_code])]);
    return { ...input, items, total_planned_qty: fromScaledInt(total, 6), total_planned_qty_micros: total };
  }
  status(context: ControllerContext<ProductionPlanData>): string {
    return nextDocStatus(context.command.action) === 1 ? "Planned" : super.status(context, {} as ProductionPlanData);
  }
}

export class JobCardController extends SuiteController<JobCardData> {
  readonly doctype = "Job Card";
  async normalize(context: ControllerContext<JobCardData>): Promise<JobCardData> {
    const input = context.command.document;
    if (!input.company || !input.work_order || !input.operation || !input.workstation || !input.posting_at) {
      throw errors.validation("Company, work order, operation, workstation and posting_at are required");
    }
    const completed = toScaledInt(input.completed_qty, 6, "completed_qty");
    if (completed <= 0) throw errors.validation("completed_qty must be positive");
    const workOrder = await requireSubmitted<JsonObject>(context, "Work Order", input.work_order);
    if (workOrder.data.company !== input.company) throw errors.reference("Job Card company does not match Work Order");
    const target = typeof workOrder.data.qty_micros === "number" ? workOrder.data.qty_micros : toScaledInt(String(workOrder.data.qty ?? 0), 6);
    const previouslyCompleted = await context.reader.getJobCardCompletedQuantityMicros(context.command.tenant_id, input.work_order, context.command.aggregate.name);
    if (previouslyCompleted + completed > target) throw errors.reference("Cumulative Job Card completion exceeds Work Order quantity");
    const logs = normalizeTimeLogs(input.time_logs ?? []);
    const hours = logs.reduce((sum, row) => safeAdd(sum, row.hours_micros ?? 0), 0);
    if (context.command.action === "submit") await assertMasters(context, [["Company", input.company], ["Operation", input.operation], ["Workstation", input.workstation], ...(input.employee ? [["Employee", input.employee] as [string, string]] : [])]);
    return { ...input, completed_qty: fromScaledInt(completed, 6), completed_qty_micros: completed, time_logs: logs, total_hours: fromScaledInt(hours, 6), total_hours_micros: hours };
  }
  status(context: ControllerContext<JobCardData>): string {
    return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, {} as JobCardData);
  }
}

export class AssetMovementController extends SuiteController<AssetMovementData> {
  readonly doctype = "Asset Movement";
  async normalize(context: ControllerContext<AssetMovementData>): Promise<AssetMovementData> {
    const input = context.command.document;
    if (!input.asset || !input.company || !input.posting_at || !input.target_location) throw errors.validation("Asset, company, posting_at and target location are required");
    const asset = await requireSubmitted<JsonObject>(context, "Asset", input.asset);
    if (asset.data.company !== input.company) throw errors.reference("Asset belongs to another company");
    if (await context.reader.isAssetDisposed(context.command.tenant_id, input.asset)) throw errors.reference("Disposed asset cannot be moved");
    if (context.command.action === "submit") await assertMasters(context, [["Company", input.company], ["Location", input.target_location], ...(input.target_custodian ? [["Employee", input.target_custodian] as [string, string]] : [])]);
    return { ...input };
  }
  async ledgers(context: ControllerContext<AssetMovementData>, data: AssetMovementData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    const line: AssetLifecycleEntry = { line_key: "MOVEMENT", asset: data.asset, kind: "Movement", posting_at: data.posting_at, location: data.target_location, ...(data.target_custodian ? { custodian: data.target_custodian } : {}) };
    return { assetLifecycle: [context.command.action === "cancel" ? { ...line, line_key: "REV-MOVEMENT" } : line] };
  }
  status(context: ControllerContext<AssetMovementData>): string { return nextDocStatus(context.command.action) === 1 ? "Moved" : super.status(context, {} as AssetMovementData); }
}

export class AssetMaintenanceController extends SuiteController<AssetMaintenanceData> {
  readonly doctype = "Asset Maintenance";
  async normalize(context: ControllerContext<AssetMaintenanceData>): Promise<AssetMaintenanceData> {
    const input = context.command.document;
    if (!input.asset || !input.company || !input.posting_at || !input.description || !["Preventive", "Corrective", "Calibration"].includes(input.maintenance_type)) throw errors.validation("Valid asset maintenance details are required");
    const asset = await requireSubmitted<JsonObject>(context, "Asset", input.asset);
    if (asset.data.company !== input.company) throw errors.reference("Asset belongs to another company");
    if (await context.reader.isAssetDisposed(context.command.tenant_id, input.asset)) throw errors.reference("Disposed asset cannot be maintained");
    return { ...input };
  }
  async ledgers(context: ControllerContext<AssetMaintenanceData>, data: AssetMaintenanceData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    return { assetLifecycle: [{ line_key: context.command.action === "cancel" ? "REV-MAINTENANCE" : "MAINTENANCE", asset: data.asset, kind: "Maintenance", posting_at: data.posting_at }] };
  }
  status(context: ControllerContext<AssetMaintenanceData>): string { return nextDocStatus(context.command.action) === 1 ? "Completed" : super.status(context, {} as AssetMaintenanceData); }
}

export class AssetDisposalController extends SuiteController<AssetDisposalData> {
  readonly doctype = "Asset Disposal";
  async normalize(context: ControllerContext<AssetDisposalData>): Promise<AssetDisposalData> {
    const input = context.command.document;
    if (!input.asset || !input.company || !input.posting_at || !input.cash_or_receivable_account || !input.gain_account || !input.loss_account) throw errors.validation("Asset disposal accounts and posting details are required");
    const asset = await requireSubmitted<JsonObject>(context, "Asset", input.asset);
    if (asset.data.company !== input.company) throw errors.reference("Asset belongs to another company");
    if (await context.reader.isAssetDisposed(context.command.tenant_id, input.asset)) throw errors.reference("Asset is already disposed");
    const scale = typeof asset.data.currency_scale === "number" ? asset.data.currency_scale : 2;
    const gross = typeof asset.data.gross_purchase_amount_minor === "number" ? asset.data.gross_purchase_amount_minor : toScaledInt(String(asset.data.gross_purchase_amount ?? 0), scale);
    const depreciated = await context.reader.getAssetDepreciatedMinor(context.command.tenant_id, input.asset);
    const proceeds = toScaledInt(input.proceeds, scale, "proceeds");
    if (proceeds < 0) throw errors.validation("Disposal proceeds cannot be negative");
    const nbv = gross - depreciated;
    const gainOrLoss = proceeds - nbv;
    const currency = typeof asset.data.currency === "string" ? asset.data.currency : "USD";
    const fixedAssetAccount = String(asset.data.fixed_asset_account ?? "");
    const accumulatedAccount = String(asset.data.accumulated_depreciation_account ?? "");
    if (!fixedAssetAccount || !accumulatedAccount) throw errors.reference("Asset accounts are incomplete");
    if (context.command.action === "submit") {
      await assertUnlocked(context, input.company, input.posting_at);
      await assertMasters(context, [["Company", input.company], ["Account", fixedAssetAccount], ["Account", accumulatedAccount], ["Account", input.cash_or_receivable_account], ["Account", input.gain_account], ["Account", input.loss_account]]);
    }
    return { ...input, proceeds: fromScaledInt(proceeds, scale), proceeds_minor: proceeds, gross_amount_minor: gross, accumulated_depreciation_minor: depreciated, net_book_value_minor: nbv, gain_or_loss_minor: gainOrLoss, currency, currency_scale: scale, fixed_asset_account: fixedAssetAccount, accumulated_depreciation_account: accumulatedAccount };
  }
  async ledgers(context: ControllerContext<AssetDisposalData>, data: AssetDisposalData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    await assertUnlocked(context, data.company, data.posting_at);
    const proceeds = data.proceeds_minor ?? 0;
    const gross = data.gross_amount_minor ?? 0;
    const depreciated = data.accumulated_depreciation_minor ?? 0;
    const gainOrLoss = data.gain_or_loss_minor ?? 0;
    const currency = data.currency ?? "USD";
    const scale = data.currency_scale ?? 2;
    const gl: GeneralLedgerEntry[] = [];
    if (proceeds > 0) gl.push({ line_key: "PROCEEDS", account: data.cash_or_receivable_account, debit_minor: proceeds, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at });
    if (depreciated > 0) gl.push({ line_key: "ACCUMULATED", account: data.accumulated_depreciation_account!, debit_minor: depreciated, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at });
    if (gainOrLoss < 0) gl.push({ line_key: "LOSS", account: data.loss_account, debit_minor: -gainOrLoss, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at });
    gl.push({ line_key: "ASSET", account: data.fixed_asset_account!, debit_minor: 0, credit_minor: gross, currency, currency_scale: scale, posting_at: data.posting_at });
    if (gainOrLoss > 0) gl.push({ line_key: "GAIN", account: data.gain_account, debit_minor: 0, credit_minor: gainOrLoss, currency, currency_scale: scale, posting_at: data.posting_at });
    const lifecycle: AssetLifecycleEntry = { line_key: "DISPOSAL", asset: data.asset, kind: "Disposal", posting_at: data.posting_at, amount_minor: proceeds, currency, currency_scale: scale };
    return context.command.action === "cancel" ? { gl: reverseGl(gl), assetLifecycle: [{ ...lifecycle, line_key: "REV-DISPOSAL", amount_minor: -proceeds }] } : { gl, assetLifecycle: [lifecycle] };
  }
  status(context: ControllerContext<AssetDisposalData>): string { return nextDocStatus(context.command.action) === 1 ? "Disposed" : super.status(context, {} as AssetDisposalData); }
}

export class TimesheetController extends SuiteController<TimesheetData> {
  readonly doctype = "Timesheet";
  async normalize(context: ControllerContext<TimesheetData>): Promise<TimesheetData> {
    const input = context.command.document;
    if (!input.company || !input.employee || !input.posting_at || !Array.isArray(input.time_logs) || input.time_logs.length === 0) throw errors.validation("Company, employee, posting_at and time logs are required");
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    const currency = typeof company?.default_currency === "string" ? company.default_currency : "";
    if (!currency) throw errors.reference(`Company ${input.company} must define default_currency`);
    const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const scale = typeof currencyData?.currency_scale === "number" ? currencyData.currency_scale : 2;
    const logs: TimesheetDetail[] = [];
    let totalHours = 0; let totalCost = 0; let totalBilling = 0;
    for (const [index, raw] of input.time_logs.entries()) {
      if (!raw.project || !raw.activity_type || !raw.from_time || !raw.to_time) throw errors.validation(`Project, activity type and times are required at row ${index + 1}`);
      const project = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Project", raw.project);
      const projectMaster = project ? project.data : await context.reader.getMasterRecordData(context.command.tenant_id, "Project", raw.project);
      if (!projectMaster || project?.docstatus === 2) throw errors.reference(`Project ${raw.project} does not exist`);
      if (raw.task) {
        const task = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Task", raw.task);
        const taskMaster = task ? task.data : await context.reader.getMasterRecordData(context.command.tenant_id, "Task", raw.task);
        if (!taskMaster || task?.docstatus === 2 || taskMaster.project !== raw.project) throw errors.reference(`Task ${raw.task} does not belong to Project ${raw.project}`);
      }
      const hours = durationHoursMicros(raw.from_time, raw.to_time);
      const activity = await context.reader.getMasterRecordData(context.command.tenant_id, "Activity Type", raw.activity_type);
      if (!activity) throw errors.reference(`Activity Type ${raw.activity_type} does not exist`);
      const costRate = toScaledInt(decimal(activity.costing_rate ?? raw.cost_rate ?? 0, "costing rate"), scale);
      const billingRate = toScaledInt(decimal(activity.billing_rate ?? raw.billing_rate ?? 0, "billing rate"), scale);
      const cost = multiplyScaled(fromScaledInt(hours, 6), 6, fromScaledInt(costRate, scale), scale, scale);
      const billing = multiplyScaled(fromScaledInt(hours, 6), 6, fromScaledInt(billingRate, scale), scale, scale);
      totalHours = safeAdd(totalHours, hours); totalCost = safeAdd(totalCost, cost); totalBilling = safeAdd(totalBilling, billing);
      logs.push({ ...raw, row_id: raw.row_id || `ROW-${index + 1}`, hours: fromScaledInt(hours, 6), hours_micros: hours, cost_rate: fromScaledInt(costRate, scale), billing_rate: fromScaledInt(billingRate, scale), cost_amount_minor: cost, billing_amount_minor: billing });
    }
    if (context.command.action === "submit") await assertMasters(context, [["Company", input.company], ["Employee", input.employee]]);
    return { ...input, currency, currency_scale: scale, time_logs: logs, total_hours: fromScaledInt(totalHours, 6), total_hours_micros: totalHours, total_cost_minor: totalCost, total_billing_minor: totalBilling };
  }
  async ledgers(context: ControllerContext<TimesheetData>, data: TimesheetData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    const sign = context.command.action === "cancel" ? -1 : 1;
    const entries = data.time_logs.map((row, index): ProjectTimeEntry => ({ line_key: `${sign < 0 ? "REV-" : ""}TIME-${row.row_id || index + 1}`, project: row.project, ...(row.task ? { task: row.task } : {}), hours_micros: sign * (row.hours_micros ?? 0), cost_minor: sign * (row.cost_amount_minor ?? 0), billing_minor: sign * (row.billing_amount_minor ?? 0), currency: data.currency ?? "USD", currency_scale: data.currency_scale ?? 2, posting_at: data.posting_at }));
    return { projectTime: entries };
  }
  status(context: ControllerContext<TimesheetData>): string { return nextDocStatus(context.command.action) === 1 ? "Submitted" : super.status(context, {} as TimesheetData); }
}

export class QualityInspectionController extends SuiteController<QualityInspectionData> {
  readonly doctype = "Quality Inspection";
  async normalize(context: ControllerContext<QualityInspectionData>): Promise<QualityInspectionData> {
    const input = context.command.document;
    if (!input.item_code || !input.posting_at || !["Incoming", "Outgoing", "In Process"].includes(input.inspection_type) || !Array.isArray(input.readings) || input.readings.length === 0) throw errors.validation("Inspection type, item, posting_at and readings are required");
    if (input.reference_type && input.reference_name) {
      const reference = await context.reader.getDocument<JsonObject>(context.command.tenant_id, input.reference_type, input.reference_name);
      if (!reference || reference.docstatus === 2) throw errors.reference(`${input.reference_type} ${input.reference_name} does not exist`);
    }
    let accepted = true;
    const readings: QualityReading[] = input.readings.map((raw, index) => {
      if (!raw.specification) throw errors.validation(`Specification is required at row ${index + 1}`);
      const value = toScaledInt(raw.value, 6, `readings[${index}].value`);
      const minimum = raw.minimum === undefined ? null : toScaledInt(raw.minimum, 6, `readings[${index}].minimum`);
      const maximum = raw.maximum === undefined ? null : toScaledInt(raw.maximum, 6, `readings[${index}].maximum`);
      const rowAccepted = (minimum === null || value >= minimum) && (maximum === null || value <= maximum);
      accepted = accepted && rowAccepted;
      return { ...raw, row_id: raw.row_id || `ROW-${index + 1}`, value: fromScaledInt(value, 6), ...(minimum === null ? {} : { minimum: fromScaledInt(minimum, 6) }), ...(maximum === null ? {} : { maximum: fromScaledInt(maximum, 6) }), accepted: rowAccepted };
    });
    if (context.command.action === "submit") await assertMasters(context, [["Item", input.item_code]]);
    return { ...input, readings, status: accepted ? "Accepted" : "Rejected" };
  }
  status(context: ControllerContext<QualityInspectionData>, data: QualityInspectionData): string { return nextDocStatus(context.command.action) === 1 ? String(data.status ?? "Accepted") : super.status(context, data); }
}

export class IssueController extends SuiteController<IssueData> {
  readonly doctype = "Issue";
  async normalize(context: ControllerContext<IssueData>): Promise<IssueData> {
    const input = context.command.document;
    if (!input.subject || !input.opened_at || !["Low", "Medium", "High", "Urgent"].includes(input.priority)) throw errors.validation("Subject, opened_at and a valid priority are required");
    const status = input.status ?? "Open";
    if (!["Open", "Replied", "On Hold", "Resolved", "Closed"].includes(status)) throw errors.validation("Issue status is invalid");
    let responseMinutes = input.priority === "Urgent" ? 30 : input.priority === "High" ? 120 : input.priority === "Medium" ? 480 : 1440;
    let resolutionMinutes = input.priority === "Urgent" ? 240 : input.priority === "High" ? 480 : input.priority === "Medium" ? 1440 : 4320;
    if (input.service_level_agreement) {
      const sla = await context.reader.getMasterRecordData(context.command.tenant_id, "Service Level Agreement", input.service_level_agreement);
      if (!sla) throw errors.reference(`Service Level Agreement ${input.service_level_agreement} does not exist`);
      const responseKey = `${input.priority.toLowerCase()}_response_minutes`;
      const resolutionKey = `${input.priority.toLowerCase()}_resolution_minutes`;
      if (typeof sla[responseKey] === "number") responseMinutes = sla[responseKey] as number;
      if (typeof sla[resolutionKey] === "number") resolutionMinutes = sla[resolutionKey] as number;
    }
    if ((status === "Resolved" || status === "Closed") && !input.resolution_details) throw errors.validation("Resolution details are required when resolving an Issue");
    return { ...input, status, first_response_due_at: addMinutes(input.opened_at, responseMinutes), resolution_due_at: addMinutes(input.opened_at, resolutionMinutes) };
  }
  status(_context: ControllerContext<IssueData>, data: IssueData): string { return String(data.status ?? "Open"); }
}

export class ExpenseClaimController extends SuiteController<ExpenseClaimData> {
  readonly doctype = "Expense Claim";
  async normalize(context: ControllerContext<ExpenseClaimData>): Promise<ExpenseClaimData> {
    const input = context.command.document;
    if (!input.employee || !input.company || !input.posting_at || !input.payable_account || !Array.isArray(input.expenses) || input.expenses.length === 0) throw errors.validation("Employee, company, posting_at, payable account and expenses are required");
    const company = await context.reader.getMasterRecordData(context.command.tenant_id, "Company", input.company);
    const currency = typeof company?.default_currency === "string" ? company.default_currency : "";
    if (!currency) throw errors.reference(`Company ${input.company} must define default_currency`);
    const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const scale = typeof currencyData?.currency_scale === "number" ? currencyData.currency_scale : 2;
    let total = 0;
    const expenses: ExpenseClaimItem[] = input.expenses.map((raw, index) => {
      if (!raw.expense_type || !raw.expense_account) throw errors.validation(`Expense type and account are required at row ${index + 1}`);
      const amount = toScaledInt(raw.amount, scale, `expenses[${index}].amount`);
      if (amount <= 0) throw errors.validation(`Expense amount must be positive at row ${index + 1}`);
      total = safeAdd(total, amount);
      return { ...raw, row_id: raw.row_id || `ROW-${index + 1}`, amount: fromScaledInt(amount, scale), amount_minor: amount };
    });
    if (context.command.action === "submit") {
      await assertUnlocked(context, input.company, input.posting_at);
      await assertMasters(context, [["Company", input.company], ["Employee", input.employee], ["Account", input.payable_account], ...expenses.map((item): [string, string] => ["Account", item.expense_account])]);
    }
    return { ...input, currency, currency_scale: scale, expenses, total_claimed_amount: fromScaledInt(total, scale), total_claimed_amount_minor: total };
  }
  async ledgers(context: ControllerContext<ExpenseClaimData>, data: ExpenseClaimData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    await assertUnlocked(context, data.company, data.posting_at);
    const currency = data.currency ?? "USD"; const scale = data.currency_scale ?? 2; const total = data.total_claimed_amount_minor ?? 0;
    const gl: GeneralLedgerEntry[] = data.expenses.map((item, index) => ({ line_key: `EXPENSE-${item.row_id || index + 1}`, account: item.expense_account, debit_minor: item.amount_minor ?? 0, credit_minor: 0, currency, currency_scale: scale, ...(item.cost_center ? { cost_center: item.cost_center } : {}), posting_at: data.posting_at }));
    gl.push({ line_key: "PAYABLE", account: data.payable_account, party_type: "Employee", party: data.employee, debit_minor: 0, credit_minor: total, currency, currency_scale: scale, posting_at: data.posting_at });
    const payment: PaymentLedgerEntry[] = [{ line_key: "PAYABLE", account_type: "Payable", party_type: "Employee", party: data.employee, account: data.payable_account, amount_minor: total, base_amount_minor: total, currency, currency_scale: scale, against_voucher_type: "Expense Claim", against_voucher_no: context.command.aggregate.name, posting_at: data.posting_at }];
    return context.command.action === "cancel" ? { gl: reverseGl(gl), payment: reversePayment(payment) } : { gl, payment };
  }
  status(context: ControllerContext<ExpenseClaimData>): string { return nextDocStatus(context.command.action) === 1 ? "Unpaid" : super.status(context, {} as ExpenseClaimData); }
}

export class PosOpeningEntryController extends SuiteController<PosOpeningEntryData> {
  readonly doctype = "POS Opening Entry";
  async normalize(context: ControllerContext<PosOpeningEntryData>): Promise<PosOpeningEntryData> {
    const input = context.command.document;
    if (!input.pos_profile || !input.posting_at) throw errors.validation("POS Profile and posting_at are required");
    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "POS Profile", input.pos_profile);
    if (!profile) throw errors.reference(`POS Profile ${input.pos_profile} does not exist`);
    const company = String(profile.company ?? ""); const currency = String(profile.currency ?? "");
    if (!company || !currency) throw errors.reference("POS Profile must define company and currency");
    const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const scale = typeof currencyData?.currency_scale === "number" ? currencyData.currency_scale : 2;
    const opening = toScaledInt(input.opening_cash, scale, "opening_cash");
    if (opening < 0) throw errors.validation("Opening cash cannot be negative");
    if (context.command.action === "submit" && await context.reader.hasOpenPosSessionForProfile(context.command.tenant_id, input.pos_profile, context.command.aggregate.name)) {
      throw errors.reference(`POS Profile ${input.pos_profile} already has an open session`);
    }
    return { ...input, company, currency, currency_scale: scale, opening_cash: fromScaledInt(opening, scale), opening_cash_minor: opening };
  }
  async ledgers(context: ControllerContext<PosOpeningEntryData>, data: PosOpeningEntryData): Promise<SuiteLedgers> {
    if (context.command.action !== "cancel") return {};
    if (await context.reader.isPosSessionClosed(context.command.tenant_id, context.command.aggregate.name)) throw errors.reference("Cancel POS Closing Entry before cancelling its opening session");
    const totals = await context.reader.getPosSessionSales(context.command.tenant_id, context.command.aggregate.name);
    if (totals.grand_total_minor !== 0 || totals.net_total_minor !== 0 || totals.tax_total_minor !== 0) throw errors.reference("Cancel all POS Invoices before cancelling the opening session");
    return {};
  }
  status(context: ControllerContext<PosOpeningEntryData>): string { return nextDocStatus(context.command.action) === 1 ? "Open" : super.status(context, {} as PosOpeningEntryData); }
}

export class PosInvoiceController extends SuiteController<PosInvoiceData> {
  readonly doctype = "POS Invoice";
  async normalize(context: ControllerContext<PosInvoiceData>): Promise<PosInvoiceData> {
    const input = context.command.document;
    if (!input.pos_profile || !input.opening_entry || !input.customer || !input.posting_at || !Array.isArray(input.items) || input.items.length === 0) throw errors.validation("POS profile, opening entry, customer, posting_at and items are required");
    const profile = await context.reader.getMasterRecordData(context.command.tenant_id, "POS Profile", input.pos_profile);
    if (!profile) throw errors.reference(`POS Profile ${input.pos_profile} does not exist`);
    const opening = await requireSubmitted<PosOpeningEntryData>(context, "POS Opening Entry", input.opening_entry);
    if (opening.data.pos_profile !== input.pos_profile) throw errors.reference("POS Opening Entry belongs to another profile");
    if (await context.reader.isPosSessionClosed(context.command.tenant_id, input.opening_entry)) throw errors.reference("POS session is already closed");
    const company = String(profile.company ?? ""); const currency = String(profile.currency ?? ""); const warehouse = String(profile.warehouse ?? "");
    const cashAccount = String(profile.cash_account ?? input.cash_account ?? "");
    const incomeAccount = String(profile.income_account ?? input.default_income_account ?? "");
    const stockAccount = String(profile.stock_account ?? input.stock_account ?? "");
    const cogsAccount = String(profile.cogs_account ?? input.cogs_account ?? "");
    const priceList = String(profile.selling_price_list ?? "");
    if (!company || !currency || !warehouse || !cashAccount || !incomeAccount || !stockAccount || !cogsAccount) throw errors.reference("POS Profile accounting and warehouse setup is incomplete");
    const currencyData = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
    const scale = typeof currencyData?.currency_scale === "number" ? currencyData.currency_scale : 2;
    const customer = await context.reader.getMasterRecordData(context.command.tenant_id, "Customer", input.customer);
    if (!customer) throw errors.reference(`Customer ${input.customer} does not exist`);
    const items = [];
    for (const [index, raw] of input.items.entries()) {
      if (!raw.item_code) throw errors.validation(`Item is required at row ${index + 1}`);
      const qty = toScaledInt(raw.qty, 6, `items[${index}].qty`);
      if (qty <= 0) throw errors.validation(`Quantity must be positive at row ${index + 1}`);
      let rate = toScaledInt(raw.rate, scale, `items[${index}].rate`); let pricing: JsonObject = {};
      if (priceList) {
        const customerGroup = typeof customer.customer_group === "string" ? customer.customer_group : null;
        const resolved = await resolveServerPrice(context as unknown as ControllerContext<JsonObject>, { priceList, itemCode: raw.item_code, documentCurrency: currency, partyType: "Customer", party: input.customer, ...(customerGroup ? { customerGroup } : {}), postingDate: input.posting_at, qtyMicros: qty });
        rate = resolved.rate_minor; pricing = { item_price: resolved.item_price, ...(resolved.pricing_rule ? { pricing_rule: resolved.pricing_rule } : {}) };
      }
      items.push({ ...raw, ...pricing, row_id: raw.row_id || `ROW-${index + 1}`, qty: fromScaledInt(qty, 6), qty_micros: qty, rate: fromScaledInt(rate, scale), rate_minor: rate, warehouse, income_account: incomeAccount });
    }
    const totals = calculateSalesTotals(items as never, input.taxes ?? [], scale);
    if (context.command.action === "submit") await assertMasters(context, [["Company", company], ["Currency", currency], ["Warehouse", warehouse], ["Customer", input.customer], ["Account", cashAccount], ["Account", incomeAccount], ["Account", stockAccount], ["Account", cogsAccount], ...items.map((item): [string, string] => ["Item", item.item_code]), ...totals.taxes.map((tax): [string, string] => ["Account", tax.account])]);
    return { ...input, company, currency, currency_scale: scale, cash_account: cashAccount, default_income_account: incomeAccount, stock_account: stockAccount, cogs_account: cogsAccount, items: totals.items as unknown as PosInvoiceData["items"], taxes: totals.taxes, net_total: totals.net_total, net_total_minor: totals.net_total_minor, total_taxes_and_charges: totals.total_taxes_and_charges, total_taxes_and_charges_minor: totals.total_taxes_and_charges_minor, grand_total: totals.grand_total, grand_total_minor: totals.grand_total_minor };
  }
  async ledgers(context: ControllerContext<PosInvoiceData>, data: PosInvoiceData): Promise<SuiteLedgers> {
    if (!["submit", "cancel"].includes(context.command.action)) return {};
    await assertUnlocked(context, data.company, data.posting_at);
    if (context.command.action === "cancel" && await context.reader.isPosSessionClosed(context.command.tenant_id, data.opening_entry)) {
      throw errors.reference("Cancel POS Closing Entry before cancelling a POS Invoice");
    }
    const currency = data.currency; const scale = data.currency_scale ?? 2;
    const stock: StockLedgerEntry[] = []; let stockValue = 0;
    for (const [index, item] of data.items.entries()) {
      const qty = item.qty_micros ?? toScaledInt(item.qty, 6);
      const valuation = await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>, { itemCode: item.item_code, warehouse: item.warehouse, qtyMicros: qty, postingAt: data.posting_at, currencyScale: scale });
      const tracked = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, { itemCode: item.item_code, warehouse: item.warehouse, qtyMicros: qty, direction: "Outward", postingAt: data.posting_at, currency, currencyScale: scale, valuationRateMinor: valuation.valuation_rate_minor, stockValueMinor: -valuation.stock_value_difference_minor, lineKey: `ITEM-${item.row_id || index + 1}` });
      stock.push(...tracked.stock); stockValue = safeAdd(stockValue, -valuation.stock_value_difference_minor);
    }
    const gl: GeneralLedgerEntry[] = [
      { line_key: "CASH", account: data.cash_account, debit_minor: data.grand_total_minor ?? 0, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at },
      { line_key: "INCOME", account: data.default_income_account, debit_minor: 0, credit_minor: data.net_total_minor ?? 0, currency, currency_scale: scale, posting_at: data.posting_at },
    ];
    for (const [index, tax] of (data.taxes ?? []).entries()) {
      const amount = tax.tax_amount_minor ?? 0; if (amount === 0) continue;
      gl.push({ line_key: `TAX-${tax.row_id || index + 1}`, account: tax.account, debit_minor: amount < 0 ? -amount : 0, credit_minor: amount > 0 ? amount : 0, currency, currency_scale: scale, posting_at: data.posting_at });
    }
    if (stockValue > 0) {
      gl.push({ line_key: "COGS", account: data.cogs_account, debit_minor: stockValue, credit_minor: 0, currency, currency_scale: scale, posting_at: data.posting_at });
      gl.push({ line_key: "STOCK", account: data.stock_account, debit_minor: 0, credit_minor: stockValue, currency, currency_scale: scale, posting_at: data.posting_at });
    }
    const pos: PosSalesEntry = { line_key: "SALE", pos_profile: data.pos_profile, opening_entry: data.opening_entry, invoice: context.command.aggregate.name, net_total_minor: data.net_total_minor ?? 0, tax_total_minor: data.total_taxes_and_charges_minor ?? 0, grand_total_minor: data.grand_total_minor ?? 0, currency, currency_scale: scale, posting_at: data.posting_at };
    return context.command.action === "cancel" ? { gl: reverseGl(gl), stock: reverseStock(stock), posSales: [{ ...pos, line_key: "REV-SALE", net_total_minor: -pos.net_total_minor, tax_total_minor: -pos.tax_total_minor, grand_total_minor: -pos.grand_total_minor }] } : { gl, stock, posSales: [pos] };
  }
  status(context: ControllerContext<PosInvoiceData>): string { return nextDocStatus(context.command.action) === 1 ? "Paid" : super.status(context, {} as PosInvoiceData); }
}

export class PosClosingEntryController extends SuiteController<PosClosingEntryData> {
  readonly doctype = "POS Closing Entry";
  async normalize(context: ControllerContext<PosClosingEntryData>): Promise<PosClosingEntryData> {
    const input = context.command.document;
    if (!input.pos_profile || !input.opening_entry || !input.posting_at) throw errors.validation("POS profile, opening entry and posting_at are required");
    const opening = await requireSubmitted<PosOpeningEntryData>(context, "POS Opening Entry", input.opening_entry);
    if (opening.data.pos_profile !== input.pos_profile) throw errors.reference("POS Closing Entry profile does not match opening entry");
    if (await context.reader.isPosSessionClosed(context.command.tenant_id, input.opening_entry)) throw errors.reference("POS session is already closed");
    const totals = await context.reader.getPosSessionSales(context.command.tenant_id, input.opening_entry);
    const scale = opening.data.currency_scale ?? 2;
    const currency = String(opening.data.currency ?? "");
    if (!currency) throw errors.reference("POS Opening Entry currency is missing");
    const closingCash = toScaledInt(input.closing_cash, scale, "closing_cash");
    const expectedCash = (opening.data.opening_cash_minor ?? 0) + totals.grand_total_minor;
    return { ...input, company: opening.data.company, currency, currency_scale: scale, expected_net_total_minor: totals.net_total_minor, expected_tax_total_minor: totals.tax_total_minor, expected_grand_total_minor: totals.grand_total_minor, closing_cash: fromScaledInt(closingCash, scale), closing_cash_minor: closingCash, difference_minor: closingCash - expectedCash };
  }
  status(context: ControllerContext<PosClosingEntryData>): string { return nextDocStatus(context.command.action) === 1 ? "Closed" : super.status(context, {} as PosClosingEntryData); }
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> { if (!context.existing) throw errors.notFound(); return context.existing; }
async function requireSubmitted<T extends JsonObject>(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<CanonicalDocument<T>> { const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name); if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`); return document; }
async function assertMasters(context: ControllerContext<JsonObject>, records: Array<[string, string]>): Promise<void> { for (const [type, name] of new Map(records.map((record) => [`${record[0]}:${record[1]}`, record])).values()) if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) throw errors.reference(`${type} ${name} does not exist or is disabled`); }
async function assertUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> { if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return; const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company); if (lock && postingAt.slice(0, 10) <= lock) throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`, { lock_date: lock }); }
function extractChildren(doctype: string, data: JsonObject): ChildRow[] { const result: ChildRow[] = []; for (const [fieldname, value] of Object.entries(data)) { if (!Array.isArray(value)) continue; value.forEach((row, index) => { if (!row || typeof row !== "object" || Array.isArray(row)) return; const object = row as JsonObject; result.push({ fieldname, child_doctype: `${doctype} ${fieldname}`, row_id: String(object.row_id ?? `${fieldname}-${index + 1}`), idx: index + 1, data: structuredClone(object) }); }); } return result; }
function normalizeTimeLogs(logs: JobCardTimeLog[]): JobCardTimeLog[] { if (!Array.isArray(logs) || logs.length === 0) throw errors.validation("At least one time log is required"); return logs.map((row, index) => { if (!row.from_time || !row.to_time) throw errors.validation(`Time log timestamps are required at row ${index + 1}`); const hours = durationHoursMicros(row.from_time, row.to_time); return { ...row, row_id: row.row_id || `ROW-${index + 1}`, hours: fromScaledInt(hours, 6), hours_micros: hours }; }); }
function durationHoursMicros(from: string, to: string): number { const start = Date.parse(from); const end = Date.parse(to); if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw errors.validation("Time range is invalid"); const milliseconds = end - start; if (milliseconds > 24 * 60 * 60 * 1000) throw errors.validation("A time row cannot exceed 24 hours"); return Math.round((milliseconds * 1_000_000) / 3_600_000); }
function addMinutes(value: string, minutes: number): string { const timestamp = Date.parse(value); if (!Number.isFinite(timestamp) || !Number.isSafeInteger(minutes) || minutes < 0) throw errors.validation("SLA timestamp or duration is invalid"); return new Date(timestamp + minutes * 60_000).toISOString(); }
function decimal(value: unknown, field: string): string | number { if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`); return value; }
function safeAdd(left: number, right: number): number { const value = left + right; if (!Number.isSafeInteger(value)) throw errors.validation("Arithmetic exceeds safe integer bounds"); return value; }
function slug(value: string): string { return value.toLowerCase().replaceAll(" ", "_"); }
