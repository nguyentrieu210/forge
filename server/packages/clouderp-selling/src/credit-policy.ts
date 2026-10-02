import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";

interface CreditAwareDocument extends JsonObject {
  customer: string;
  company: string;
  company_currency_scale?: number;
}

interface CreditPolicySnapshot {
  credit_limit_minor: number;
  credit_limit: string;
  credit_limit_source: "Customer" | "Customer Group" | "Company" | "None";
  credit_limit_bypass_sales_order: boolean;
  credit_limit_enforced: boolean;
}

interface LimitResolution {
  value: unknown;
  bypassSalesOrder: boolean;
  source: CreditPolicySnapshot["credit_limit_source"];
}

/**
 * Freeze the credit policy that will be enforced atomically by D1.
 *
 * The controller resolves ERPNext-style precedence (Customer -> Customer Group -> Company)
 * and converts the limit into company-currency minor units.  D1 never re-parses money from
 * mutable master data while committing a sale; it validates the immutable snapshot against
 * the authoritative Payment Ledger + still-unbilled Sales Order exposure in the same batch.
 */
export async function snapshotCustomerCreditPolicy<T extends CreditAwareDocument>(
  context: ControllerContext<T>,
  data: T,
  documentKind: "Sales Order" | "Sales Invoice",
): Promise<T> {
  if (context.command.action !== "submit") return data;

  const customer = await context.reader.getMasterRecordData(
    context.command.tenant_id,
    "Customer",
    data.customer,
  );
  if (!customer) throw errors.reference(`Customer ${data.customer} does not exist`);

  assertCustomerNotHeld(customer, data.customer, context.now);

  const resolved = await resolveLimit(context, customer, data.company);
  const companyScale = Number.isSafeInteger(data.company_currency_scale)
    ? data.company_currency_scale!
    : 2;
  const limitMinor = normalizeLimitMinor(resolved.value, companyScale);
  const enforced = limitMinor > 0
    && (documentKind !== "Sales Order" || !resolved.bypassSalesOrder);

  return {
    ...data,
    credit_limit_minor: limitMinor,
    credit_limit: fromScaledInt(limitMinor, companyScale),
    credit_limit_source: resolved.source,
    credit_limit_bypass_sales_order: resolved.bypassSalesOrder,
    credit_limit_enforced: enforced,
  };
}

async function resolveLimit<T extends CreditAwareDocument>(
  context: ControllerContext<T>,
  customer: JsonObject,
  company: string,
): Promise<LimitResolution> {
  const direct = limitFromRecord(customer, company);
  if (hasPositiveOrExplicitLimit(direct.value)) return { ...direct, source: "Customer" };

  const customerGroup = text(customer.customer_group);
  if (customerGroup) {
    const group = await context.reader.getMasterRecordData(
      context.command.tenant_id,
      "Customer Group",
      customerGroup,
    );
    if (group) {
      const grouped = limitFromRecord(group, company);
      if (hasPositiveOrExplicitLimit(grouped.value) && !grouped.bypassSalesOrder) {
        return { ...grouped, source: "Customer Group" };
      }
    }
  }

  const companyRecord = await context.reader.getMasterRecordData(
    context.command.tenant_id,
    "Company",
    company,
  );
  const companyLimit = companyRecord?.credit_limit;
  if (hasPositiveOrExplicitLimit(companyLimit)) {
    return { value: companyLimit, bypassSalesOrder: false, source: "Company" };
  }

  return { value: 0, bypassSalesOrder: false, source: "None" };
}

function limitFromRecord(record: JsonObject, company: string): Omit<LimitResolution, "source"> {
  const rows = Array.isArray(record.credit_limits) ? record.credit_limits : [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as JsonObject;
    if (text(row.company) !== company) continue;
    return {
      value: row.credit_limit ?? 0,
      bypassSalesOrder: checked(row.bypass_credit_limit_check),
    };
  }
  return {
    value: record.credit_limit ?? 0,
    bypassSalesOrder: checked(record.bypass_credit_limit_check),
  };
}

function normalizeLimitMinor(value: unknown, scale: number): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value !== "string" && typeof value !== "number") {
    throw errors.validation("Customer credit limit must be numeric");
  }
  const minor = toScaledInt(value, scale, "credit_limit");
  if (minor < 0) throw errors.validation("Customer credit limit cannot be negative");
  return minor;
}

function hasPositiveOrExplicitLimit(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

function assertCustomerNotHeld(customer: JsonObject, customerName: string, now: string): void {
  if (!checked(customer.on_hold)) return;
  const releaseDate = text(customer.release_date);
  const today = now.slice(0, 10);
  if (!releaseDate || today <= releaseDate.slice(0, 10)) {
    throw errors.reference(`Customer ${customerName} is on credit hold`);
  }
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
