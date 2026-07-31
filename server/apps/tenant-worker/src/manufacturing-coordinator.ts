import type { JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";

const MANUFACTURING_PURPOSES = new Set(["Material Transfer", "Manufacture"]);

/**
 * Every stock mutation competing for one Work Order must enter the same Durable Object
 * as that Work Order. The command aggregate remains the Stock Entry; this only chooses
 * the coordinator lock so controller reads and the D1 write happen in one ordered lane.
 */
export function manufacturingCoordinatorKey(
  command: MutationCommand<JsonObject>,
  existing?: JsonObject | null,
): string | null {
  if (command.aggregate.doctype !== "Stock Entry") return null;
  const purpose = textField(command.document, "purpose") || textField(existing, "purpose");
  const workOrder = textField(command.document, "work_order") || textField(existing, "work_order");
  if (!workOrder || !MANUFACTURING_PURPOSES.has(purpose)) return null;
  return `${command.tenant_id}:Work Order:${workOrder}`;
}

function textField(value: JsonObject | null | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
