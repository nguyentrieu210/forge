import type { GeneralLedgerEntry, JsonObject, MutationPlan } from "../../contracts/src/index.js";
import type { StockEntryData } from "../../clouderp-core/src/types.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { errors, divideRoundedBig, safeAddInt } from "../../core/src/index.js";
import { reverseGl } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";

interface OperationCostRow extends JsonObject {
  row_id: string;
  cost_type: "Labor" | "Machine" | "Overhead";
  amount: string | number;
  amount_minor?: number;
  clearing_account: string;
}
interface CostData extends StockEntryData {
  actual_operation_costs?: OperationCostRow[];
  operation_cost_stock_account?: string;
  actual_operation_cost_minor?: number;
}

/** Explicit costs belong to this manufacture receipt, in company currency.
 * Clearing credits capitalize costs already accrued elsewhere; they do not create payroll
 * liabilities. Stock and GL are committed atomically by the existing document kernel.
 */
export async function applyManufacturingOperationCosts(
  context: ControllerContext<StockEntryData>, plan: MutationPlan<StockEntryData>,
): Promise<MutationPlan<StockEntryData>> {
  const data = plan.document.data as CostData;
  if (data.actual_operation_costs === undefined) return plan;
  if (data.purpose !== "Manufacture") throw errors.validation("Actual operation costs require a Manufacture receipt");
  if (context.command.action === "cancel") {
    const original = await context.reader.getVoucherGlEntries(context.command.tenant_id, "Stock Entry", plan.document.name, context.existing!.version);
    if (original.length === 0) throw errors.reference("Original manufacturing operation-cost GL posting was not found");
    return { ...plan, gl_entries: reverseGl(original) };
  }
  if (!Array.isArray(data.actual_operation_costs) || data.actual_operation_costs.length === 0) {
    throw errors.validation("Actual operation costs require at least one cost row");
  }
  const scale = data.currency_scale ?? 2;
  const seen = new Set<string>();
  const rows = data.actual_operation_costs.map((row) => {
    if (!row || typeof row !== "object" || !["Labor", "Machine", "Overhead"].includes(row.cost_type)
      || typeof row.row_id !== "string" || !row.row_id.trim() || seen.has(row.row_id.trim())
      || typeof row.clearing_account !== "string" || !row.clearing_account.trim()) {
      throw errors.validation("Operation costs require unique row IDs, cost type and clearing account");
    }
    seen.add(row.row_id.trim());
    const amount = toScaledInt(row.amount, scale, "Operation cost amount");
    if (amount <= 0) throw errors.validation("Operation cost amount must be positive");
    return { ...row, row_id: row.row_id.trim(), clearing_account: row.clearing_account.trim(), amount: fromScaledInt(amount, scale), amount_minor: amount };
  });
  const total = rows.reduce((sum, row) => safeAddInt(sum, row.amount_minor), 0);
  const stockAccount = data.operation_cost_stock_account?.trim();
  if (!stockAccount || rows.some((row) => row.clearing_account === stockAccount)) {
    throw errors.validation("Manufacturing operation costs require distinct stock and clearing accounts");
  }
  const normalized = { ...data, actual_operation_costs: rows, operation_cost_stock_account: stockAccount, actual_operation_cost_minor: total };
  const result = { ...plan, document: { ...plan.document, data: normalized } };
  if (context.command.action !== "submit") return result;
  for (const account of new Set([stockAccount, ...rows.map((row) => row.clearing_account)])) {
    const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Account", account);
    const master = document
      ? document.docstatus === 2 ? null : document.data
      : await context.reader.getMasterRecordData(context.command.tenant_id, "Account", account);
    if (!master || checked(master.is_group) || checked(master.disabled)
      || (master.company && master.company !== data.company)) {
      throw errors.reference(`Operation-cost account ${account} must be active, a leaf and belong to ${data.company}`);
    }
  }
  // Remove the standard operation value already embedded by the existing stock planner.
  // The net movement of all stock rows is exactly that value, including scrap recovery.
  const stock = plan.stock_entries;
  const priorOperation = stock.reduce((sum, row) => safeAddInt(sum, row.stock_value_difference_minor), 0);
  const finished = stock.filter((row) => row.line_key.startsWith("FINISHED") && row.actual_qty_micros > 0);
  const priorFinished = finished.reduce((sum, row) => safeAddInt(sum, row.stock_value_difference_minor), 0);
  const value = safeAddInt(safeAddInt(priorFinished, -priorOperation), total);
  if (finished.length === 0 || value < 0) throw errors.validation("Operation costs cannot produce negative finished-good value");
  const quantity = finished.reduce((sum, row) => safeAddInt(sum, row.actual_qty_micros), 0);
  let cumulativeQty = 0;
  let assigned = 0;
  const replacements = new Map<string, { value: number; rate: number }>();
  for (const row of finished) {
    cumulativeQty = safeAddInt(cumulativeQty, row.actual_qty_micros);
    const cumulativeValue = safeNumber(divideRoundedBig(BigInt(value) * BigInt(cumulativeQty), BigInt(quantity)));
    const rowValue = cumulativeValue - assigned;
    assigned = cumulativeValue;
    replacements.set(row.line_key, { value: rowValue, rate: safeNumber(divideRoundedBig(BigInt(rowValue) * 1_000_000n, BigInt(row.actual_qty_micros))) });
  }
  const gl: GeneralLedgerEntry[] = [
    { line_key: "OPERATION-STOCK", account: stockAccount, debit_minor: total, credit_minor: 0, currency: data.currency!, currency_scale: scale, posting_at: data.posting_at },
    ...rows.map((row) => ({ line_key: `OPERATION-${row.row_id}`, account: row.clearing_account, debit_minor: 0, credit_minor: row.amount_minor, currency: data.currency!, currency_scale: scale, posting_at: data.posting_at })),
  ];
  return { ...result, stock_entries: stock.map((row) => {
    const replacement = replacements.get(row.line_key);
    return replacement ? { ...row, stock_value_difference_minor: replacement.value, valuation_rate_minor: replacement.rate } : row;
  }), gl_entries: [...plan.gl_entries, ...gl] };
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Manufacturing operation-cost value exceeds safe integer range");
  return number;
}
