import type { JsonObject, MutationCommand } from "../../../packages/contracts/src/index.js";

const INVENTORY_DOCTYPES = new Set(["Stock Entry", "Work Order"]);
const INVENTORY_ACTIONS = new Set(["submit", "cancel"]);

/**
 * Selects one company-wide inventory lock for every stock-affecting command.
 *
 * Document-level Durable Objects are insufficient for two differently named Stock
 * Entries competing for the same batch, serial or warehouse balance. A company key is
 * deliberately broader than an individual lot key so multi-row transfers cannot acquire
 * different lock sets in different orders and deadlock. The trade-off is less parallelism
 * inside one company, in exchange for deterministic stock and Work Order limits.
 */
export function inventoryCoordinatorKey(
  command: MutationCommand<JsonObject>,
  existing?: JsonObject | null,
): string | null {
  if (!INVENTORY_DOCTYPES.has(command.aggregate.doctype) || !INVENTORY_ACTIONS.has(command.action)) {
    return null;
  }
  const company = textField(command.document, "company") || textField(existing, "company");
  if (!company) return null;
  return `inventory:${command.tenant_id}:${encodeURIComponent(company)}`;
}

export function isInventoryCoordinatedCommand(command: MutationCommand<JsonObject>): boolean {
  return INVENTORY_DOCTYPES.has(command.aggregate.doctype) && INVENTORY_ACTIONS.has(command.action);
}

function textField(value: JsonObject | null | undefined, field: string): string {
  const candidate = value?.[field];
  return typeof candidate === "string" ? candidate.trim() : "";
}
