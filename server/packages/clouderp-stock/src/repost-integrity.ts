import { errors } from "../../core/src/index.js";
import { RepostItemValuationController } from "./controllers.js";

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
      const warehouse = await context.reader.getMasterRecordData(
        context.command.tenant_id,
        "Warehouse",
        input.warehouse,
      );
      if (warehouse) {
        if (warehouse.is_group === true || warehouse.is_group === 1) {
          throw errors.validation(`Warehouse ${input.warehouse} is a group and cannot receive stock valuation postings`);
        }
        const warehouseCompany = text(warehouse.company);
        const requestedCompany = text(input.company);
        if (warehouseCompany && requestedCompany && warehouseCompany !== requestedCompany) {
          throw errors.validation(
            `Warehouse ${input.warehouse} belongs to ${warehouseCompany}, not valuation company ${requestedCompany}`,
          );
        }
      }
    }

    return super.normalize(context);
  }
}
