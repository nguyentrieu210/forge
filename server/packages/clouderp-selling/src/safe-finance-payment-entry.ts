import type { GeneralLedgerEntry, JsonObject, PaymentLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { FinancePaymentEntryController } from "./finance-controllers.js";
import type { PaymentEntryData } from "./types.js";

/**
 * Makes creation of a customer/supplier advance an explicit operator decision.
 * Fully allocated payments remain unchanged. Partial or fully unallocated
 * payments require allow_unallocated=true and are then posted to the immutable
 * Payment Ledger by FinancePaymentEntryController.
 */
export class SafeFinancePaymentEntryController extends FinancePaymentEntryController {
  override async normalize(context: ControllerContext<PaymentEntryData>): Promise<PaymentEntryData> {
    const normalized = await super.normalize(context);
    const unallocated = normalized.unallocated_amount_minor ?? 0;
    const allowUnallocated = (context.command.document as JsonObject).allow_unallocated === true;
    if (unallocated > 0 && !allowUnallocated) {
      const allocated = (normalized.paid_amount_minor ?? 0) - unallocated;
      throw errors.validation("Unallocated payment requires explicit advance confirmation", {
        paid_minor: normalized.paid_amount_minor ?? 0,
        allocated_minor: allocated,
        unallocated_minor: unallocated,
        required_field: "allow_unallocated",
      });
    }
    return { ...normalized, allow_unallocated: allowUnallocated };
  }

  override ledger(
    context: ControllerContext<PaymentEntryData>,
    data: PaymentEntryData,
  ): { gl: GeneralLedgerEntry[]; payment: PaymentLedgerEntry[] } {
    const result = super.ledger(context, data);
    const partyLineKey = data.payment_type === "Receive" ? "RECEIVABLE" : "PAYABLE";
    return {
      ...result,
      gl: result.gl.map((line) => line.line_key === "PARTY" ? { ...line, line_key: partyLineKey } : line),
    };
  }
}
