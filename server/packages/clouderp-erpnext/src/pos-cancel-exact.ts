import type { JsonObject, PosSalesEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { HardenedPosInvoiceController } from "./pos-session-hardening.js";
import type { PosInvoiceData } from "./types.js";

/**
 * POS cancellation must reverse the exact committed valuation/accounting slice.
 * Re-running FIFO at cancellation time can select different layers after later
 * receipts and silently change COGS. The DomainReader already exposes voucher
 * revision history specifically for exact reversal, so use it.
 */
export class ExactCancelPosInvoiceController extends HardenedPosInvoiceController {
  override async ledgers(context: ControllerContext<PosInvoiceData>, data: PosInvoiceData) {
    if (context.command.action !== "cancel") return super.ledgers(context, data);
    if (await context.reader.isPosSessionClosed(context.command.tenant_id, data.opening_entry)) {
      throw errors.reference("Cancel POS Closing Entry before cancelling a POS Invoice");
    }
    await assertPostingUnlocked(context as unknown as ControllerContext<JsonObject>, data.company, data.posting_at);

    const sourceRevision = context.existing?.version;
    if (!sourceRevision || sourceRevision < 1) throw errors.ledger("POS Invoice source revision is missing for exact cancellation");
    const [gl, stock] = await Promise.all([
      context.reader.getVoucherGlEntries(context.command.tenant_id, "POS Invoice", context.command.aggregate.name, sourceRevision),
      context.reader.getVoucherStockEntries(context.command.tenant_id, "POS Invoice", context.command.aggregate.name, sourceRevision),
    ]);
    if (gl.length === 0) throw errors.ledger("Committed POS Invoice GL evidence is missing; exact cancellation is unsafe");

    const sale: PosSalesEntry = {
      line_key: "REV-SALE",
      pos_profile: data.pos_profile,
      opening_entry: data.opening_entry,
      invoice: context.command.aggregate.name,
      net_total_minor: -(data.net_total_minor ?? 0),
      tax_total_minor: -(data.total_taxes_and_charges_minor ?? 0),
      grand_total_minor: -(data.grand_total_minor ?? 0),
      currency: data.currency,
      currency_scale: data.currency_scale ?? 2,
      posting_at: data.posting_at,
    };
    return { gl: reverseGl(gl), stock: reverseStock(stock), posSales: [sale] };
  }
}

async function assertPostingUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.user_id === "Administrator" || context.command.actor.roles.includes("System Manager")) return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) {
    throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`, { lock_date: lock });
  }
}
