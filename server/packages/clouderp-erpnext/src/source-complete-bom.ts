import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import { VersionedBillOfMaterialsController } from "./manufacturing-lifecycle.js";
import type { BillOfMaterialsData, BomItem } from "./types.js";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && text(value) !== "";
}

function sourcePending(row: BomItem): boolean {
  const raw = row as unknown as JsonObject;
  return text(raw.source_value_status).toUpperCase() === "PENDING";
}

/**
 * Canonical Alumdoor source rows are allowed to exist in a Draft BOM before every
 * engineering value is known.  This is intentionally narrower than making qty
 * optional for every BOM: a row must carry source_value_status=PENDING plus a
 * source_pending_reason.  The component Item itself must already exist.
 *
 * As soon as no source-pending rows remain (or on submit), the normal versioned
 * BOM lifecycle runs unchanged and therefore requires positive quantities,
 * authoritative conversions and all of the normal manufacturing invariants.
 */
export class SourceCompleteBillOfMaterialsController extends VersionedBillOfMaterialsController {
  override async normalize(context: ControllerContext<BillOfMaterialsData>): Promise<BillOfMaterialsData> {
    const input = context.command.document;
    const rows = Array.isArray(input.items) ? input.items : [];
    const pending = rows.filter(sourcePending);

    if (context.command.action === "submit" || pending.length === 0) {
      return super.normalize(context);
    }

    if (!input.company || !input.item || rows.length === 0) {
      throw errors.validation("Company, finished item and raw materials are required");
    }
    const outputQty = toScaledInt(input.quantity, 6);
    if (outputQty <= 0) throw errors.validation("BOM quantity must be positive");

    const finished = await context.reader.getMasterRecordData(
      context.command.tenant_id,
      "Item",
      input.item,
    );
    if (!finished) throw errors.reference(`Item ${input.item} does not exist`);

    const normalizedRows: BomItem[] = [];
    for (const [index, row] of rows.entries()) {
      const raw = row as unknown as JsonObject;
      const itemCode = text(row.item_code);
      if (!itemCode) throw errors.validation(`Raw material Item is required at row ${index + 1}`);
      if (itemCode === input.item) {
        throw errors.validation(`BOM row ${index + 1} cannot consume its own output Item`);
      }
      const material = await context.reader.getMasterRecordData(
        context.command.tenant_id,
        "Item",
        itemCode,
      );
      if (!material) throw errors.reference(`Item ${itemCode} does not exist`);

      if (hasValue(raw.qty)) {
        const qty = toScaledInt(raw.qty as string | number, 6);
        if (qty <= 0) throw errors.validation(`BOM quantity must be positive at row ${index + 1}`);
      }
      if (hasValue(raw.conversion_factor)) {
        const factor = Number(raw.conversion_factor);
        if (!Number.isFinite(factor) || factor <= 0) {
          throw errors.validation(`BOM conversion_factor must be positive at row ${index + 1}`);
        }
      }

      if (sourcePending(row) && !text(raw.source_pending_reason)) {
        throw errors.validation(`source_pending_reason is required at pending BOM row ${index + 1}`);
      }

      normalizedRows.push({
        ...row,
        item_code: itemCode,
        row_id: row.row_id || `ROW-${index + 1}`,
      } as BomItem);
    }

    return {
      ...input,
      bom_status: "Draft",
      items: normalizedRows,
    } as BillOfMaterialsData;
  }
}
