import { errors } from "../../core/src/index.js";
import { SerialAndBatchBundleController } from "./controllers.js";

type BundleContext = Parameters<SerialAndBatchBundleController["normalize"]>[0];
type BundleData = Awaited<ReturnType<SerialAndBatchBundleController["normalize"]>>;

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function trackedItem(record: Record<string, unknown> | null): string {
  if (!record) return "";
  return text(record.item_code ?? record.item);
}

/**
 * Cross-check tracking masters against the bundle item before the bundle can
 * become a reusable source for stock postings. This is especially important for
 * inward bundles: the ledger line gets its item from the stock document and its
 * batch/serial identity from the bundle, so a mismatched master would otherwise
 * persist a logically impossible item-tracking pair.
 */
export class SerialAndBatchBundleIntegrityController extends SerialAndBatchBundleController {
  override async normalize(context: BundleContext): Promise<BundleData> {
    const normalized = await super.normalize(context);
    if (context.command.action !== "submit") return normalized;

    for (const row of normalized.entries) {
      if (row.batch_no) {
        const batch = await context.reader.getMasterRecordData(
          context.command.tenant_id,
          "Batch",
          row.batch_no,
        ) as Record<string, unknown> | null;
        const item = trackedItem(batch);
        if (item && item !== normalized.item_code) {
          throw errors.reference(`Batch ${row.batch_no} belongs to ${item}, not ${normalized.item_code}`);
        }
      }

      if (row.serial_no) {
        const serial = await context.reader.getMasterRecordData(
          context.command.tenant_id,
          "Serial No",
          row.serial_no,
        ) as Record<string, unknown> | null;
        const item = trackedItem(serial);
        if (item && item !== normalized.item_code) {
          throw errors.reference(`Serial No ${row.serial_no} belongs to ${item}, not ${normalized.item_code}`);
        }
      }
    }

    return normalized;
  }
}
