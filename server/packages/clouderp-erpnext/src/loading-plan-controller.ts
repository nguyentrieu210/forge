import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import type { DeliveryNoteData } from "../../clouderp-selling/src/types.js";
import { SuiteController } from "./suite-controllers.js";

interface LoadingPlanData extends JsonObject {
  delivery_trip: string;
  loaded_at: string;
  company?: string;
  vehicle?: string;
  items?: JsonObject[];
}

async function submitted<T extends JsonObject>(context: ControllerContext<JsonObject>, doctype: string, name: string): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

export class LoadingPlanController extends SuiteController<LoadingPlanData> {
  readonly doctype = "Loading Plan";

  override async normalize(context: ControllerContext<LoadingPlanData>): Promise<LoadingPlanData> {
    const input = context.command.document;
    if (!input.delivery_trip || !input.loaded_at) throw errors.validation("Delivery Trip and loaded_at are required");
    if (!Number.isFinite(Date.parse(input.loaded_at))) throw errors.validation("loaded_at must be a valid timestamp");

    const baseName = `LOAD-${input.delivery_trip}`;
    if (!context.command.amended_from && context.command.aggregate.name !== baseName) throw errors.validation(`Initial Loading Plan name must be ${baseName}`);
    if (context.command.amended_from && !context.command.aggregate.name.startsWith(`${baseName}-`)) throw errors.validation(`Amended Loading Plan name must start with ${baseName}-`);

    const trip = await submitted<JsonObject>(context as unknown as ControllerContext<JsonObject>, "Delivery Trip", input.delivery_trip);
    const stops = Array.isArray(trip.data.delivery_stops) ? trip.data.delivery_stops : [];
    if (stops.length === 0) throw errors.reference("Delivery Trip has no delivery stops to load");

    const items: JsonObject[] = [];
    for (const [stopIndex, rawStop] of stops.entries()) {
      if (!rawStop || typeof rawStop !== "object" || Array.isArray(rawStop)) throw errors.reference(`Delivery Trip stop ${stopIndex + 1} is invalid`);
      const stop = rawStop as JsonObject;
      const deliveryNoteName = String(stop.delivery_note ?? "").trim();
      if (!deliveryNoteName) throw errors.reference(`Delivery Trip stop ${stopIndex + 1} has no Delivery Note`);
      const note = await submitted<DeliveryNoteData>(context as unknown as ControllerContext<JsonObject>, "Delivery Note", deliveryNoteName);
      if (note.data.company !== trip.data.company) throw errors.reference(`Delivery Note ${deliveryNoteName} company does not match Delivery Trip`);
      if (!Array.isArray(note.data.items) || note.data.items.length === 0) throw errors.reference(`Delivery Note ${deliveryNoteName} has no items`);
      for (const [itemIndex, rawItem] of note.data.items.entries()) {
        const itemCode = String(rawItem.item_code ?? "").trim();
        if (!itemCode) throw errors.reference(`Delivery Note ${deliveryNoteName} item ${itemIndex + 1} is invalid`);
        items.push({
          row_id: `${deliveryNoteName}:${rawItem.row_id || itemIndex + 1}`,
          delivery_note: deliveryNoteName,
          item_code: itemCode,
          qty: String(rawItem.qty),
          ...(rawItem.warehouse ? { warehouse: rawItem.warehouse } : {}),
        });
      }
    }

    return {
      ...input,
      company: String(trip.data.company ?? ""),
      vehicle: String(trip.data.vehicle ?? ""),
      items,
    };
  }

  override status(context: ControllerContext<LoadingPlanData>, _data: LoadingPlanData): string {
    const docstatus = nextDocStatus(context.command.action);
    return docstatus === 1 ? "Loaded" : docstatus === 2 ? "Cancelled" : "Draft";
  }
}
