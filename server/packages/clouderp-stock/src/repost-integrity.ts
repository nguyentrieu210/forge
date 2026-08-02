import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
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

/**
 * Stock-owned guards for valuation repost. Finance-owned account resolution and
 * future COGS/GL propagation intentionally stay outside this controller until the
 * WS01 reconciliation contract is settled.
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
}
