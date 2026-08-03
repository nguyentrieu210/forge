import type { FulfillmentEntry, GeneralLedgerEntry, JsonObject, PaymentLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reversePayment } from "../../ledger/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { SalesInvoiceController } from "./controllers.js";
import type { SalesInvoiceData } from "./types.js";

/**
 * RC-021 AR hardening for Sales Invoice credit/return notes.
 *
 * A credit note is still a Sales Invoice and never becomes a competing AR source.
 * Its GL reverses revenue/receivable from the canonical Sales Invoice posting,
 * while its Payment Ledger row is an append-only negative allocation against the
 * original invoice. Outstanding therefore remains SUM(Payment Ledger), exactly
 * like Payment Entry and Payment Allocation.
 */
export class ArSalesInvoiceController extends SalesInvoiceController {
  override async normalize(context: ControllerContext<SalesInvoiceData>): Promise<SalesInvoiceData> {
    const data = await super.normalize(context);
    const isReturn = isCreditNote(data);
    const returnAgainst = text((data as JsonObject).return_against);

    if (!isReturn) {
      if (returnAgainst) throw errors.validation("return_against requires is_return=true");
      return data;
    }

    if (!returnAgainst) throw errors.validation("Credit/return Sales Invoice requires return_against");
    if (returnAgainst === context.command.aggregate.name) {
      throw errors.validation("Credit/return Sales Invoice cannot reference itself");
    }
    if (data.against_sales_order) {
      throw errors.validation("Credit/return Sales Invoice uses return_against and must not advance Sales Order billing");
    }

    const scale = data.currency_scale ?? 2;
    const creditMinor = data.grand_total_minor ?? toScaledInt(data.grand_total ?? "0", scale, "grand_total");
    if (creditMinor <= 0) throw errors.validation("Credit/return amount must be positive");

    if (context.command.action === "submit") {
      const original = await context.reader.getDocument<SalesInvoiceData>(
        context.command.tenant_id,
        "Sales Invoice",
        returnAgainst,
      );
      if (!original) throw errors.reference(`Sales Invoice ${returnAgainst} does not exist`);
      if (original.docstatus !== 1) throw errors.reference(`Sales Invoice ${returnAgainst} must be submitted`);
      if (isCreditNote(original.data)) throw errors.reference("Credit/return note must reference an original Sales Invoice");
      assertSameArContext(data, original.data, returnAgainst);

      const outstanding = await context.reader.getOutstandingMinor(
        context.command.tenant_id,
        "Sales Invoice",
        returnAgainst,
      );
      const baseOutstanding = await context.reader.getBaseOutstandingMinor(
        context.command.tenant_id,
        "Sales Invoice",
        returnAgainst,
      );
      const baseCredit = requiredBaseGrand(data);
      if (creditMinor > outstanding || baseCredit > baseOutstanding) {
        throw errors.reference("Credit/return amount exceeds outstanding receivable", {
          return_against: returnAgainst,
          outstanding_minor: outstanding,
          credit_minor: creditMinor,
          base_outstanding_minor: baseOutstanding,
          base_credit_minor: baseCredit,
        });
      }
    }

    return {
      ...data,
      is_return: true,
      return_against: returnAgainst,
      // A credit note settles the referenced invoice. It is not a second open
      // receivable and therefore has no standalone outstanding balance.
      outstanding_amount_minor: 0,
      outstanding_amount: zeroAmount(scale),
    } as SalesInvoiceData;
  }

  protected override status(context: ControllerContext<SalesInvoiceData>, data: SalesInvoiceData): string {
    if (!isCreditNote(data)) return super.status(context, data);
    const docstatus = nextDocStatus(context.command.action);
    return docstatus === 0 ? "Draft" : docstatus === 1 ? "Submitted" : "Cancelled";
  }

  override async ledger(
    context: ControllerContext<SalesInvoiceData>,
    data: SalesInvoiceData,
  ): Promise<{ gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[]; fulfillment: FulfillmentEntry[] }> {
    if (!isCreditNote(data)) return super.ledger(context, data);
    if (context.command.action !== "submit" && context.command.action !== "cancel") {
      return { gl: [], payment: [], fulfillment: [] };
    }

    const returnAgainst = text((data as JsonObject).return_against);
    if (!returnAgainst) throw errors.validation("Credit/return Sales Invoice requires return_against");
    const scale = data.currency_scale ?? 2;
    const grandMinor = data.grand_total_minor ?? toScaledInt(data.grand_total ?? "0", scale, "grand_total");
    const baseGrand = requiredBaseGrand(data);
    const payment: PaymentLedgerEntry[] = [{
      line_key: "CREDIT-NOTE",
      account_type: "Receivable",
      party_type: "Customer",
      party: data.customer,
      account: data.debit_to,
      amount_minor: -grandMinor,
      base_amount_minor: -baseGrand,
      currency: data.currency,
      currency_scale: scale,
      against_voucher_type: "Sales Invoice",
      against_voucher_no: returnAgainst,
      posting_at: data.posting_at,
    }];

    if (context.command.action === "submit") {
      // Reuse the already-audited canonical Sales Invoice calculation and reverse
      // only the accounting direction. Its own positive receivable row is ignored;
      // the credit settles return_against instead.
      const canonical = await super.ledger(context, data);
      return { gl: reverseGl(canonical.gl), payment, fulfillment: [] };
    }

    if (!context.existing) throw errors.notFound();
    const originalGl = await context.reader.getVoucherGlEntries(
      context.command.tenant_id,
      "Sales Invoice",
      context.command.aggregate.name,
      context.existing.version,
    );
    if (originalGl.length === 0) {
      throw errors.reference(`Original GL posting for Sales Invoice ${context.command.aggregate.name} was not found`);
    }
    return { gl: reverseGl(originalGl), payment: reversePayment(payment), fulfillment: [] };
  }

  override eventTypes(context: ControllerContext<SalesInvoiceData>): string[] {
    const data = context.command.action === "cancel" ? context.existing?.data : context.command.document;
    if (!data || !isCreditNote(data)) return super.eventTypes(context);
    if (context.command.action === "submit") {
      return ["gl.posted", "receivable.updated", "sales_credit_note.submitted"];
    }
    if (context.command.action === "cancel") {
      return ["gl.reversed", "receivable.updated", "sales_credit_note.cancelled"];
    }
    return ["sales_credit_note.updated"];
  }
}

function assertSameArContext(credit: SalesInvoiceData, original: SalesInvoiceData, name: string): void {
  if (credit.customer !== original.customer) throw errors.reference(`Sales Invoice ${name} belongs to another customer`);
  if (credit.company !== original.company) throw errors.reference(`Sales Invoice ${name} belongs to another company`);
  if (credit.currency !== original.currency) throw errors.reference(`Sales Invoice ${name} uses another currency`);
  if (credit.debit_to !== original.debit_to) throw errors.reference(`Sales Invoice ${name} uses another receivable account`);
  if ((credit.company_currency ?? credit.currency) !== (original.company_currency ?? original.currency)) {
    throw errors.reference(`Sales Invoice ${name} uses another company currency`);
  }
}

function requiredBaseGrand(data: SalesInvoiceData): number {
  if (typeof data.base_grand_total_minor !== "number" || !Number.isSafeInteger(data.base_grand_total_minor)) {
    throw errors.validation("Credit/return Sales Invoice requires server-computed base_grand_total_minor");
  }
  return data.base_grand_total_minor;
}

function isCreditNote(data: SalesInvoiceData | JsonObject): boolean {
  const raw = (data as JsonObject).is_return;
  return raw === true || raw === 1 || raw === "1";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function zeroAmount(scale: number): string {
  return scale === 0 ? "0" : `0.${"0".repeat(scale)}`;
}
