import type { JsonObject, MutationPlan, PaymentLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { InMemoryMutationStore as BaseInMemoryMutationStore } from "./in-memory-store.js";

type OutstandingInvariantTarget = {
  assertOutstandingInvariants(plan: MutationPlan<JsonObject>): void;
};

/**
 * Keeps the in-memory commit guard aligned with migration 0031.
 *
 * Invoice balances begin positive and may only move toward zero. Payment Entry
 * advances begin negative and may only be consumed toward zero. D1 enforces the
 * same two-sided model with payment_invoice_* and payment_advance_* triggers.
 */
export class InMemoryMutationStore extends BaseInMemoryMutationStore {
  constructor() {
    super();
    const target = this as unknown as OutstandingInvariantTarget;
    target.assertOutstandingInvariants = (plan) => this.assertFinanceOutstandingInvariants(plan);
  }

  private assertFinanceOutstandingInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const persisted = this.snapshot().payment_entries;
    const pending: PaymentLedgerEntry[] = [];

    for (const line of plan.payment_entries) {
      if (!line.against_voucher_type || !line.against_voucher_no) continue;

      const referenceKey = `${line.against_voucher_type}:${line.against_voucher_no}`;
      const sameReference = (entry: PaymentLedgerEntry): boolean =>
        entry.against_voucher_type === line.against_voucher_type
        && entry.against_voucher_no === line.against_voucher_no;
      const rows = [...persisted.filter(sameReference), ...pending.filter(sameReference)];
      const existing = rows.reduce((total, entry) => total + entry.amount_minor, 0);
      const existingBase = rows.reduce((total, entry) => total + entry.base_amount_minor, 0);
      const next = existing + line.amount_minor;
      const nextBase = existingBase + line.base_amount_minor;

      if (line.against_voucher_type === "Payment Entry") {
        const contextMismatch = rows.some((entry) =>
          entry.account_type !== line.account_type
          || entry.party_type !== line.party_type
          || entry.party !== line.party
          || entry.account !== line.account
          || entry.currency !== line.currency
          || entry.currency_scale !== line.currency_scale);
        if (contextMismatch) {
          throw errors.reference(`Payment advance context mismatch for ${referenceKey}`);
        }
        if (next > 0) {
          throw errors.reference(`Allocation exceeds remaining source advance for ${referenceKey}`, {
            advance_minor: -existing,
            requested_delta_minor: line.amount_minor,
          });
        }
        if (nextBase > 0) {
          throw errors.reference(`Base allocation exceeds remaining source advance for ${referenceKey}`, {
            base_advance_minor: -existingBase,
            requested_base_delta_minor: line.base_amount_minor,
          });
        }
      } else {
        if (next < 0) {
          throw errors.reference(`Allocation exceeds outstanding for ${referenceKey}`, {
            outstanding_minor: existing,
            requested_delta_minor: line.amount_minor,
          });
        }
        if (nextBase < 0) {
          throw errors.reference(`Base allocation exceeds outstanding for ${referenceKey}`, {
            base_outstanding_minor: existingBase,
            requested_base_delta_minor: line.base_amount_minor,
          });
        }
      }

      pending.push(line);
    }
  }
}
