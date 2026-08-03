import type { GeneralLedgerEntry, JsonObject, StockLedgerEntry } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { RepostItemValuationController } from "./controllers.js";
import { requireLeafWarehouse } from "./warehouse-scope.js";

type RepostContext = Parameters<RepostItemValuationController["normalize"]>[0];
type RepostData = Awaited<ReturnType<RepostItemValuationController["normalize"]>>;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function time(value: unknown, field: string): number | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) throw errors.validation(`${field} must be a valid timestamp`);
  return parsed;
}

async function assertHistoricalReversalOpen(context: RepostContext, data: RepostData): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, data.company);
  if (lock && data.posting_at.slice(0, 10) <= lock) {
    throw errors.validation(`Posting date ${data.posting_at.slice(0, 10)} is locked for ${data.company}`, { lock_date: lock });
  }
}

/**
 * Stock-owned guards for valuation repost.
 *
 * Submit delegates valuation calculation and balanced Stock/GL adjustment to the
 * canonical controller. Cancellation deliberately reverses the exact ledger rows
 * of the submitted revision instead of recomputing them from today's code. That
 * keeps correction append-only and deterministic even after valuation code evolves.
 * Historical COGS/account reclassification remains a Finance-owned dependency.
 */
export class RepostItemValuationIntegrityController extends RepostItemValuationController {
  override async normalize(context: RepostContext): Promise<RepostData> {
    const input = context.command.document;
    const postingAt = time(input.posting_at, "posting_at");
    const now = time(context.now, "now");
    if (postingAt != null && now != null && postingAt > now) {
      throw errors.validation("Valuation repost posting_at cannot be in the future");
    }

    if (input.warehouse) {
      await requireLeafWarehouse(
        context as unknown as ControllerContext<JsonObject>,
        input.warehouse,
        input.company,
      );
    }

    return super.normalize(context);
  }

  override async ledgers(
    context: RepostContext,
    data: RepostData,
  ): Promise<{ gl?: GeneralLedgerEntry[]; stock?: StockLedgerEntry[] }> {
    if (context.command.action !== "cancel") return super.ledgers(context, data);
    if (!context.existing || context.existing.docstatus !== 1) {
      throw errors.lifecycle("Only a submitted valuation repost can be cancelled");
    }
    await assertHistoricalReversalOpen(context, data);
    const [stock, gl] = await Promise.all([
      context.reader.getVoucherStockEntries(
        context.command.tenant_id,
        this.doctype,
        context.command.aggregate.name,
        context.existing.version,
      ),
      context.reader.getVoucherGlEntries(
        context.command.tenant_id,
        this.doctype,
        context.command.aggregate.name,
        context.existing.version,
      ),
    ]);
    return { stock: reverseStock(stock), gl: reverseGl(gl) };
  }
}
