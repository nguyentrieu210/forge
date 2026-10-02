import type { CanonicalDocument, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { addMinor, fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";

const BUDGET_APPROVER_ROLES = new Set(["Accounts Manager", "Chief Accountant", "Kế toán trưởng", "System Manager"]);
const BUDGET_SCOPES = new Set(["Company", "Cost Center", "Project", "Branch"]);
const COMMITMENT_SOURCES = new Set(["Material Request", "Purchase Order", "Expense Claim"]);

type BudgetScope = "Company" | "Cost Center" | "Project" | "Branch";
type CommitmentType = "Reserve" | "Release";
type ControlAction = "Stop" | "Warn" | "Ignore";
type DistributionFrequency = "Monthly" | "Quarterly" | "Half-Yearly" | "Yearly";

interface FinanceBudgetDistributionRow extends JsonObject {
  row_id: string;
  start_date: string;
  end_date: string;
  percent_bps: number;
  percent: string;
  allocation_weight: number;
  amount_minor: number;
  amount: string;
}

type BudgetDimensionFields = Partial<Pick<FinanceBudgetData, "cost_center" | "project" | "branch">>;

interface FinanceBudgetData extends JsonObject {
  company: string;
  account: string;
  budget_against: BudgetScope;
  cost_center?: string;
  project?: string;
  branch?: string;
  start_date: string;
  end_date: string;
  budget_amount: string | number;
  control_action?: ControlAction;
  note?: string;
  currency?: string;
  currency_scale?: number;
  budget_amount_minor?: number;
  scope_key?: string;
  fiscal_distribution_enabled?: boolean;
  distribution_frequency?: DistributionFrequency;
  distribute_equally?: boolean;
  budget_distribution?: FinanceBudgetDistributionRow[];
  budget_distribution_total_minor?: number;
  budget_distribution_total?: string;
  distribution_weight_total?: number;
}

interface FinanceBudgetRevisionData extends JsonObject {
  budget: string;
  posting_date: string;
  delta_amount: string | number;
  reason: string;
  currency?: string;
  currency_scale?: number;
  delta_amount_minor?: number;
  resulting_budget_amount?: string;
  resulting_budget_amount_minor?: number;
}

interface FinanceBudgetCommitmentData extends JsonObject {
  budget: string;
  posting_date: string;
  commitment_type: CommitmentType;
  amount: string | number;
  source_doctype: string;
  source_name: string;
  reason?: string;
  currency?: string;
  currency_scale?: number;
  amount_minor?: number;
  effective_budget_amount?: string;
  effective_budget_amount_minor?: number;
  annual_effective_budget_amount?: string;
  annual_effective_budget_amount_minor?: number;
  committed_after?: string;
  committed_after_minor?: number;
  available_after?: string;
  available_after_minor?: number;
  budget_exceeded?: boolean;
  exceeded_by_minor?: number;
}

export class FinanceBudgetController implements DocumentController<FinanceBudgetData> {
  readonly doctype = "Finance Budget";

  async buildPlan(context: ControllerContext<FinanceBudgetData>): Promise<MutationPlan<FinanceBudgetData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      const [revisions, commitments] = await Promise.all([
        listSubmitted<FinanceBudgetRevisionData>(context, "Finance Budget Revision"),
        listSubmitted<FinanceBudgetCommitmentData>(context, "Finance Budget Commitment"),
      ]);
      if (revisions.some((doc) => doc.data.budget === existing.name)) {
        throw errors.lifecycle("Finance Budget cannot be cancelled while submitted revisions exist");
      }
      if (commitments.some((doc) => doc.data.budget === existing.name)) {
        throw errors.lifecycle("Finance Budget cannot be cancelled while submitted commitments exist");
      }
      return plan(context, document(context, structuredClone(existing.data), 2, "Cancelled"));
    }

    const data = await normalizeBudget(context);
    const docstatus = nextDocStatus(context.command.action);
    if (docstatus === 1) {
      assertApprover(context, true);
      await assertNoOverlappingBudget(context, data);
    }
    return plan(context, document(context, data, docstatus, docstatus === 1 ? "Approved" : "Draft"));
  }
}

export class FinanceBudgetRevisionController implements DocumentController<FinanceBudgetRevisionData> {
  readonly doctype = "Finance Budget Revision";

  async buildPlan(context: ControllerContext<FinanceBudgetRevisionData>): Promise<MutationPlan<FinanceBudgetRevisionData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      const budget = await requireSubmittedBudget(context, requiredText(existing.data.budget, "budget"));
      const effectiveAfterCancel = await effectiveBudgetAmount(context, budget, existing.name);
      const committed = await committedAmount(context, budget.name);
      if (committed > effectiveAfterCancel) {
        throw errors.lifecycle("Cancelling this budget revision would leave commitments above the effective budget", {
          committed_minor: committed,
          effective_budget_minor: effectiveAfterCancel,
        });
      }
      return plan(context, document(context, structuredClone(existing.data), 2, "Cancelled"));
    }

    const data = await normalizeRevision(context);
    const docstatus = nextDocStatus(context.command.action);
    if (docstatus === 1) assertApprover(context, true);
    return plan(context, document(context, data, docstatus, docstatus === 1 ? "Approved" : "Draft"));
  }
}

export class FinanceBudgetCommitmentController implements DocumentController<FinanceBudgetCommitmentData> {
  readonly doctype = "Finance Budget Commitment";

  async buildPlan(context: ControllerContext<FinanceBudgetCommitmentData>): Promise<MutationPlan<FinanceBudgetCommitmentData>> {
    if (context.command.action === "cancel") {
      const existing = requireExisting(context);
      assertApprover(context, false);
      const budget = await requireSubmittedBudget(context, requiredText(existing.data.budget, "budget"));
      const current = await committedAmount(context, budget.name);
      const effect = signedCommitment(existing.data);
      const next = addMinor([current, -effect], "budget commitment cancel");
      if (next < 0) throw errors.lifecycle("Cancelling this commitment would make committed budget negative");
      const postingDate = dateText(existing.data.posting_date, "posting_date");
      const annualEffective = await effectiveBudgetAmount(context, budget, undefined, postingDate);
      const effective = budgetLimitThroughDate(budget.data, annualEffective, postingDate);
      if ((budget.data.control_action ?? "Stop") === "Stop" && next > effective) {
        throw errors.lifecycle("Cancelling this release would exceed the effective budget", {
          committed_minor: next,
          effective_budget_minor: effective,
          annual_effective_budget_minor: annualEffective,
        });
      }
      return plan(context, document(context, structuredClone(existing.data), 2, "Cancelled"));
    }

    const data = await normalizeCommitment(context);
    const docstatus = nextDocStatus(context.command.action);
    return plan(context, document(context, data, docstatus, docstatus === 1 ? "Committed" : "Draft"));
  }
}

async function normalizeBudget(context: ControllerContext<FinanceBudgetData>): Promise<FinanceBudgetData> {
  const input = context.command.document;
  const company = requiredText(input.company, "company");
  const account = requiredText(input.account, "account");
  const budgetAgainst = requiredText(input.budget_against, "budget_against") as BudgetScope;
  if (!BUDGET_SCOPES.has(budgetAgainst)) throw errors.validation("budget_against must be Company, Cost Center, Project or Branch");
  const startDate = dateText(input.start_date, "start_date");
  const endDate = dateText(input.end_date, "end_date");
  if (startDate > endDate) throw errors.validation("Finance Budget start_date must be on or before end_date");

  const companyData = await requireMaster(context, "Company", company);
  const currency = requiredText(companyData.default_currency, `Company ${company} default_currency`);
  const currencyData = await requireMaster(context, "Currency", currency);
  const scale = currencyScale(currencyData, currency);
  const accountData = await requireMaster(context, "Account", account);
  if (typeof accountData.company === "string" && accountData.company && accountData.company !== company) {
    throw errors.reference(`Account ${account} belongs to another company`);
  }
  if (Boolean(accountData.is_group)) throw errors.reference(`Account ${account} must be a posting account`);

  const scope = await normalizeScope(context, budgetAgainst, input, company);
  const amountMinor = positiveMoney(input.budget_amount, scale, "budget_amount");
  const controlAction = optionalText(input.control_action) || "Stop";
  if (!new Set(["Stop", "Warn", "Ignore"]).has(controlAction)) throw errors.validation("control_action must be Stop, Warn or Ignore");
  const distribution = normalizeBudgetDistribution(input, startDate, endDate, amountMinor, scale);

  const sanitizedInput: FinanceBudgetData = { ...input };
  delete sanitizedInput.cost_center;
  delete sanitizedInput.project;
  delete sanitizedInput.branch;

  return {
    ...sanitizedInput,
    company,
    account,
    budget_against: budgetAgainst,
    ...scope.fields,
    start_date: startDate,
    end_date: endDate,
    currency,
    currency_scale: scale,
    budget_amount_minor: amountMinor,
    budget_amount: fromScaledInt(amountMinor, scale),
    scope_key: scope.key,
    control_action: controlAction as ControlAction,
    ...distribution,
  };
}

async function normalizeRevision(context: ControllerContext<FinanceBudgetRevisionData>): Promise<FinanceBudgetRevisionData> {
  const input = context.command.document;
  const budget = await requireSubmittedBudget(context, requiredText(input.budget, "budget"));
  const postingDate = dateText(input.posting_date, "posting_date");
  assertWithinBudgetPeriod(postingDate, budget);
  const reason = requiredText(input.reason, "reason");
  const scale = requiredScale(budget.data);
  const deltaMinor = nonZeroMoney(input.delta_amount, scale, "delta_amount");
  const current = await effectiveBudgetAmount(context, budget, context.existing?.name);
  const resulting = addMinor([current, deltaMinor], "budget revision resulting amount");
  if (resulting < 0) throw errors.validation("Budget revision cannot make the effective budget negative");
  if (context.command.action === "submit") {
    const committed = await committedAmount(context, budget.name);
    if (committed > resulting) {
      throw errors.lifecycle("Budget revision cannot reduce the budget below existing commitments", {
        committed_minor: committed,
        resulting_budget_minor: resulting,
      });
    }
  }
  return {
    ...input,
    budget: budget.name,
    posting_date: postingDate,
    reason,
    currency: requiredText(budget.data.currency, "Finance Budget currency"),
    currency_scale: scale,
    delta_amount_minor: deltaMinor,
    delta_amount: fromScaledInt(deltaMinor, scale),
    resulting_budget_amount_minor: resulting,
    resulting_budget_amount: fromScaledInt(resulting, scale),
  };
}

async function normalizeCommitment(context: ControllerContext<FinanceBudgetCommitmentData>): Promise<FinanceBudgetCommitmentData> {
  const input = context.command.document;
  const budget = await requireSubmittedBudget(context, requiredText(input.budget, "budget"));
  const postingDate = dateText(input.posting_date, "posting_date");
  assertWithinBudgetPeriod(postingDate, budget);
  const type = requiredText(input.commitment_type, "commitment_type") as CommitmentType;
  if (type !== "Reserve" && type !== "Release") throw errors.validation("commitment_type must be Reserve or Release");
  const sourceDoctype = requiredText(input.source_doctype, "source_doctype");
  if (!COMMITMENT_SOURCES.has(sourceDoctype)) {
    throw errors.validation(`source_doctype must be one of ${[...COMMITMENT_SOURCES].join(", ")}`);
  }
  const sourceName = requiredText(input.source_name, "source_name");
  const source = await context.reader.getDocument<JsonObject>(context.command.tenant_id, sourceDoctype, sourceName);
  if (!source || source.docstatus !== 1) throw errors.reference(`${sourceDoctype} ${sourceName} must exist and be submitted`);
  if (typeof source.data.company === "string" && source.data.company && source.data.company !== budget.data.company) {
    throw errors.reference(`${sourceDoctype} ${sourceName} belongs to another company`);
  }
  const scale = requiredScale(budget.data);
  const amountMinor = positiveMoney(input.amount, scale, "amount");
  const annualEffective = await effectiveBudgetAmount(context, budget, undefined, postingDate);
  const effective = budgetLimitThroughDate(budget.data, annualEffective, postingDate);
  const current = await committedAmount(context, budget.name, context.existing?.name);
  const sourceOutstanding = await sourceCommittedAmount(context, budget.name, sourceDoctype, sourceName, context.existing?.name);
  if (type === "Release" && amountMinor > sourceOutstanding) {
    throw errors.lifecycle("Budget release exceeds the amount reserved for the source document", {
      source_outstanding_minor: sourceOutstanding,
      release_minor: amountMinor,
    });
  }
  const next = addMinor([current, type === "Reserve" ? amountMinor : -amountMinor], "budget committed amount");
  if (next < 0) throw errors.lifecycle("Budget committed amount cannot be negative");
  const available = effective - next;
  const exceeded = Math.max(0, -available);
  const controlAction = budget.data.control_action ?? "Stop";
  if (context.command.action === "submit" && controlAction === "Stop" && exceeded > 0) {
    throw errors.lifecycle("Budget commitment exceeds the effective budget", {
      effective_budget_minor: effective,
      committed_after_minor: next,
      exceeded_by_minor: exceeded,
    });
  }
  return {
    ...input,
    budget: budget.name,
    posting_date: postingDate,
    commitment_type: type,
    source_doctype: sourceDoctype,
    source_name: sourceName,
    currency: requiredText(budget.data.currency, "Finance Budget currency"),
    currency_scale: scale,
    amount_minor: amountMinor,
    amount: fromScaledInt(amountMinor, scale),
    effective_budget_amount_minor: effective,
    effective_budget_amount: fromScaledInt(effective, scale),
    annual_effective_budget_amount_minor: annualEffective,
    annual_effective_budget_amount: fromScaledInt(annualEffective, scale),
    committed_after_minor: next,
    committed_after: fromScaledInt(next, scale),
    available_after_minor: available,
    available_after: fromScaledInt(available, scale),
    budget_exceeded: exceeded > 0,
    exceeded_by_minor: exceeded,
  };
}

async function normalizeScope(
  context: ControllerContext<FinanceBudgetData>,
  scope: BudgetScope,
  input: FinanceBudgetData,
  company: string,
): Promise<{ key: string; fields: BudgetDimensionFields }> {
  if (scope === "Company") return { key: "Company:*", fields: {} };
  if (scope === "Cost Center") {
    const name = requiredText(input.cost_center, "cost_center");
    const data = await requireMaster(context, "Cost Center", name);
    assertCompanyReference(data, company, "Cost Center", name);
    return { key: `Cost Center:${name}`, fields: { cost_center: name } };
  }
  if (scope === "Branch") {
    const name = requiredText(input.branch, "branch");
    const data = await requireMaster(context, "Branch", name);
    assertCompanyReference(data, company, "Branch", name);
    return { key: `Branch:${name}`, fields: { branch: name } };
  }
  const name = requiredText(input.project, "project");
  const projectDocument = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Project", name);
  const projectData = projectDocument?.data
    ?? await context.reader.getMasterRecordData(context.command.tenant_id, "Project", name);
  if (!projectData) throw errors.reference(`Project ${name} does not exist or is unavailable`);
  assertCompanyReference(projectData, company, "Project", name);
  return { key: `Project:${name}`, fields: { project: name } };
}

async function assertNoOverlappingBudget(context: ControllerContext<FinanceBudgetData>, data: FinanceBudgetData): Promise<void> {
  const budgets = await listSubmitted<FinanceBudgetData>(context, "Finance Budget");
  const conflict = budgets.find((doc) =>
    doc.name !== context.existing?.name
    && doc.data.company === data.company
    && doc.data.account === data.account
    && doc.data.scope_key === data.scope_key
    && requiredText(doc.data.start_date, "existing start_date") <= data.end_date
    && requiredText(doc.data.end_date, "existing end_date") >= data.start_date
  );
  if (conflict) throw errors.validation(`Finance Budget overlaps submitted budget ${conflict.name} for the same company/account/scope`);
}

async function requireSubmittedBudget<T extends JsonObject>(
  context: ControllerContext<T>,
  name: string,
): Promise<CanonicalDocument<FinanceBudgetData>> {
  const budget = await context.reader.getDocument<FinanceBudgetData>(context.command.tenant_id, "Finance Budget", name);
  if (!budget) throw errors.reference(`Finance Budget ${name} does not exist`);
  if (budget.docstatus !== 1) throw errors.lifecycle(`Finance Budget ${name} must be approved`);
  if (!Number.isSafeInteger(budget.data.budget_amount_minor)) throw errors.lifecycle(`Finance Budget ${name} has invalid fixed-point amount`);
  return budget;
}

async function effectiveBudgetAmount<T extends JsonObject>(
  context: ControllerContext<T>,
  budget: CanonicalDocument<FinanceBudgetData>,
  excludeRevision?: string,
  throughDate?: string,
): Promise<number> {
  const revisions = await listSubmitted<FinanceBudgetRevisionData>(context, "Finance Budget Revision");
  const deltas = revisions
    .filter((doc) =>
      doc.name !== excludeRevision
      && doc.data.budget === budget.name
      && (!throughDate || (typeof doc.data.posting_date === "string" && doc.data.posting_date <= throughDate))
    )
    .map((doc) => safeInteger(doc.data.delta_amount_minor, `Finance Budget Revision ${doc.name} delta_amount_minor`));
  return addMinor([safeInteger(budget.data.budget_amount_minor, "budget_amount_minor"), ...deltas], "effective budget amount");
}


function normalizeBudgetDistribution(
  input: FinanceBudgetData,
  startDate: string,
  endDate: string,
  budgetAmountMinor: number,
  scale: number,
): Pick<FinanceBudgetData,
  "fiscal_distribution_enabled" | "distribution_frequency" | "distribute_equally"
  | "budget_distribution" | "budget_distribution_total_minor" | "budget_distribution_total"
  | "distribution_weight_total"> {
  const enabled = input.fiscal_distribution_enabled === true;
  if (!enabled) {
    return {
      fiscal_distribution_enabled: false,
      distribute_equally: false,
      budget_distribution: [],
      budget_distribution_total_minor: 0,
      budget_distribution_total: fromScaledInt(0, scale),
      distribution_weight_total: 0,
    };
  }

  const frequency = optionalText(input.distribution_frequency) as DistributionFrequency;
  if (!new Set(["Monthly", "Quarterly", "Half-Yearly", "Yearly"]).has(frequency)) {
    throw errors.validation("distribution_frequency must be Monthly, Quarterly, Half-Yearly or Yearly");
  }
  const periods = budgetPeriods(startDate, endDate, frequency);
  if (periods.length === 0) throw errors.validation("Finance Budget distribution has no periods");
  const distributeEqually = input.distribute_equally !== false;
  const supplied = Array.isArray(input.budget_distribution) ? input.budget_distribution : [];

  let percentages: number[];
  let weights: number[];
  let weightTotal: number;
  if (distributeEqually) {
    percentages = splitBasisPointsEvenly(periods.length);
    weights = Array.from({ length: periods.length }, () => 1);
    weightTotal = periods.length;
  } else {
    if (supplied.length !== periods.length) {
      throw errors.validation("Manual budget_distribution must contain exactly one row per distribution period");
    }
    percentages = supplied.map((row, index) => {
      const expected = periods[index]!;
      if (dateText(row.start_date, `budget_distribution[${index}].start_date`) !== expected.start_date
        || dateText(row.end_date, `budget_distribution[${index}].end_date`) !== expected.end_date) {
        throw errors.validation(`budget_distribution[${index}] dates must match the ${frequency} fiscal period`);
      }
      return distributionPercentBps(row, index);
    });
    if (percentages.reduce((sum, value) => sum + value, 0) !== 10_000) {
      throw errors.validation("Manual budget distribution percentages must total exactly 100%");
    }
    weights = [...percentages];
    weightTotal = 10_000;
  }

  let cumulativeBps = 0;
  let cumulativeWeight = 0;
  let previousAllocated = 0;
  const rows: FinanceBudgetDistributionRow[] = periods.map((period, index) => {
    cumulativeBps += percentages[index]!;
    cumulativeWeight += weights[index]!;
    const cumulativeAllocated = proportionalMinorRatio(budgetAmountMinor, cumulativeWeight, weightTotal);
    const amountMinor = cumulativeAllocated - previousAllocated;
    previousAllocated = cumulativeAllocated;
    return {
      row_id: `DIST-${index + 1}`,
      start_date: period.start_date,
      end_date: period.end_date,
      percent_bps: percentages[index]!,
      percent: fromScaledInt(percentages[index]!, 2),
      allocation_weight: weights[index]!,
      amount_minor: amountMinor,
      amount: fromScaledInt(amountMinor, scale),
    };
  });
  if (cumulativeBps !== 10_000 || cumulativeWeight !== weightTotal || previousAllocated !== budgetAmountMinor) {
    throw errors.lifecycle("Finance Budget distribution normalization did not close to the annual budget");
  }
  return {
    fiscal_distribution_enabled: true,
    distribution_frequency: frequency,
    distribute_equally: distributeEqually,
    budget_distribution: rows,
    budget_distribution_total_minor: budgetAmountMinor,
    budget_distribution_total: fromScaledInt(budgetAmountMinor, scale),
    distribution_weight_total: weightTotal,
  };
}

function distributionPercentBps(row: FinanceBudgetDistributionRow, index: number): number {
  if (Number.isSafeInteger(row.percent_bps) && row.percent_bps > 0) return row.percent_bps;
  const value = (row as JsonObject).percent;
  if (typeof value !== "string" && typeof value !== "number") {
    throw errors.validation(`budget_distribution[${index}].percent is required for manual distribution`);
  }
  const bps = toScaledInt(value, 2, `budget_distribution[${index}].percent`);
  if (!Number.isSafeInteger(bps) || bps <= 0 || bps > 10_000) {
    throw errors.validation(`budget_distribution[${index}].percent must be within 0-100`);
  }
  return bps;
}

function splitBasisPointsEvenly(count: number): number[] {
  if (!Number.isSafeInteger(count) || count <= 0) throw errors.validation("Budget distribution period count is invalid");
  const base = Math.floor(10_000 / count);
  const remainder = 10_000 % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function budgetPeriods(
  startDate: string,
  endDate: string,
  frequency: DistributionFrequency,
): Array<{ start_date: string; end_date: string }> {
  const increment = frequency === "Monthly" ? 1 : frequency === "Quarterly" ? 3 : frequency === "Half-Yearly" ? 6 : 12;
  const periods: Array<{ start_date: string; end_date: string }> = [];
  let cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  while (cursor.getTime() <= end.getTime()) {
    const periodStart = formatIsoDate(cursor);
    const calendarStart = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    const candidateEnd = new Date(Date.UTC(
      calendarStart.getUTCFullYear(),
      calendarStart.getUTCMonth() + increment,
      0,
    ));
    const periodEnd = candidateEnd.getTime() > end.getTime() ? end : candidateEnd;
    periods.push({ start_date: periodStart, end_date: formatIsoDate(periodEnd) });
    cursor = new Date(periodEnd.getTime() + 86_400_000);
  }
  return periods;
}

function budgetLimitThroughDate(data: FinanceBudgetData, annualEffectiveMinor: number, throughDate: string): number {
  if (data.fiscal_distribution_enabled !== true) return annualEffectiveMinor;
  const rows = Array.isArray(data.budget_distribution) ? data.budget_distribution : [];
  if (rows.length === 0) throw errors.lifecycle("Finance Budget fiscal distribution is enabled but missing");
  const weightTotal = safeInteger(data.distribution_weight_total, "distribution_weight_total");
  if (weightTotal <= 0 || weightTotal > 10_000) {
    throw errors.lifecycle("Finance Budget distribution weight total is invalid");
  }
  const cumulativeWeight = rows
    .filter((row) => typeof row.start_date === "string" && row.start_date <= throughDate)
    .reduce((sum, row) => sum + safeInteger(row.allocation_weight, "budget distribution allocation_weight"), 0);
  if (cumulativeWeight < 0 || cumulativeWeight > weightTotal) {
    throw errors.lifecycle("Finance Budget fiscal distribution cumulative weight is invalid");
  }
  return proportionalMinorRatio(annualEffectiveMinor, cumulativeWeight, weightTotal);
}

function proportionalMinorRatio(amountMinor: number, numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0
    || !Number.isSafeInteger(numerator) || numerator < 0
    || !Number.isSafeInteger(denominator) || denominator <= 0 || denominator > 10_000
    || numerator > denominator) {
    throw errors.lifecycle("Finance Budget proportional amount inputs are invalid");
  }
  const quotient = Math.floor(amountMinor / denominator);
  const remainder = amountMinor % denominator;
  const result = quotient * numerator + Math.floor((remainder * numerator + Math.floor(denominator / 2)) / denominator);
  if (!Number.isSafeInteger(result)) throw errors.lifecycle("Finance Budget proportional amount exceeds safe integer range");
  return result;
}

function parseIsoDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw errors.validation("Finance Budget distribution date is invalid");
  return parsed;
}

function formatIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function committedAmount<T extends JsonObject>(
  context: ControllerContext<T>,
  budgetName: string,
  excludeCommitment?: string,
): Promise<number> {
  const commitments = await listSubmitted<FinanceBudgetCommitmentData>(context, "Finance Budget Commitment");
  return addMinor(commitments
    .filter((doc) => doc.name !== excludeCommitment && doc.data.budget === budgetName)
    .map((doc) => signedCommitment(doc.data)), "budget committed amount");
}

async function sourceCommittedAmount<T extends JsonObject>(
  context: ControllerContext<T>,
  budgetName: string,
  sourceDoctype: string,
  sourceName: string,
  excludeCommitment?: string,
): Promise<number> {
  const commitments = await listSubmitted<FinanceBudgetCommitmentData>(context, "Finance Budget Commitment");
  return addMinor(commitments
    .filter((doc) =>
      doc.name !== excludeCommitment
      && doc.data.budget === budgetName
      && doc.data.source_doctype === sourceDoctype
      && doc.data.source_name === sourceName
    )
    .map((doc) => signedCommitment(doc.data)), "source committed amount");
}

function signedCommitment(data: FinanceBudgetCommitmentData): number {
  const amount = safeInteger(data.amount_minor, "commitment amount_minor");
  return data.commitment_type === "Release" ? -amount : amount;
}

async function listSubmitted<TDoc extends JsonObject, TContext extends JsonObject = JsonObject>(
  context: ControllerContext<TContext>,
  doctype: string,
): Promise<Array<CanonicalDocument<TDoc>>> {
  return (await context.reader.listDocumentsByDoctype<TDoc>(context.command.tenant_id, doctype)).filter((doc) => doc.docstatus === 1);
}

async function requireMaster<T extends JsonObject>(context: ControllerContext<T>, type: string, name: string): Promise<JsonObject> {
  const data = await context.reader.getMasterRecordData(context.command.tenant_id, type, name);
  if (!data || !await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
    throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
  return data;
}

function assertCompanyReference(data: JsonObject, company: string, type: string, name: string): void {
  if (typeof data.company === "string" && data.company && data.company !== company) {
    throw errors.reference(`${type} ${name} belongs to another company`);
  }
}

function assertWithinBudgetPeriod(date: string, budget: CanonicalDocument<FinanceBudgetData>): void {
  if (date < budget.data.start_date || date > budget.data.end_date) {
    throw errors.validation(`posting_date must be within Finance Budget ${budget.name} period`);
  }
}

function assertApprover<T extends JsonObject>(context: ControllerContext<T>, forbidSelfApproval: boolean): void {
  if (!context.command.actor.roles.some((role) => BUDGET_APPROVER_ROLES.has(role))) {
    throw errors.permission("Finance Budget approval requires Accounts Manager, Chief Accountant or System Manager");
  }
  if (forbidSelfApproval && context.existing?.owner === context.command.actor.user_id) {
    throw errors.permission("Finance Budget approval requires four-eyes review; creator cannot approve their own document");
  }
}

function currencyScale(currency: JsonObject, name: string): number {
  const scale = currency.currency_scale;
  if (typeof scale !== "number" || !Number.isSafeInteger(scale) || scale < 0 || scale > 6) {
    throw errors.reference(`Currency ${name} must define currency_scale 0-6`);
  }
  return scale;
}

function requiredScale(data: FinanceBudgetData): number {
  if (!Number.isSafeInteger(data.currency_scale) || Number(data.currency_scale) < 0 || Number(data.currency_scale) > 6) {
    throw errors.lifecycle("Finance Budget has invalid currency_scale");
  }
  return Number(data.currency_scale);
}

function positiveMoney(value: unknown, scale: number, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const amount = toScaledInt(value, scale, field);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw errors.validation(`${field} must be positive`);
  return amount;
}

function nonZeroMoney(value: unknown, scale: number, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be numeric`);
  const amount = toScaledInt(value, scale, field);
  if (!Number.isSafeInteger(amount) || amount === 0) throw errors.validation(`${field} must be non-zero`);
  return amount;
}

function safeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value)) throw errors.lifecycle(`${field} is missing or invalid`);
  return Number(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw errors.validation(`${field} is required`);
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dateText(value: unknown, field: string): string {
  const text = requiredText(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw errors.validation(`${field} must be YYYY-MM-DD`);
  }
  return text;
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

function document<T extends JsonObject>(
  context: ControllerContext<T>,
  data: T,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<T> {
  return {
    tenant_id: context.command.tenant_id,
    doctype: context.command.aggregate.doctype,
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children: [],
  };
}

function plan<T extends JsonObject>(context: ControllerContext<T>, doc: CanonicalDocument<T>): MutationPlan<T> {
  return {
    command: context.command,
    document: doc,
    gl_entries: [],
    stock_entries: [],
    payment_entries: [],
    fulfillment_entries: [],
    events: [domainEvent({
      type: `finance_budget.${doc.doctype.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.${context.command.action}`,
      tenantId: context.command.tenant_id,
      aggregate: context.command.aggregate,
      aggregateVersion: context.nextVersion,
      actor: context.command.actor.user_id,
      commandId: context.command.command_id,
      occurredAt: context.now,
      payload: { status: doc.status },
    })],
    result: { doctype: doc.doctype, name: doc.name, version: doc.version, docstatus: doc.docstatus, status: doc.status },
  };
}
