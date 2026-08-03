import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toLowerCase() === "true";
}

export interface WarehouseScopeResult {
  name: string;
  company?: string;
  stockRole?: string;
  data: JsonObject;
}

/**
 * Canonical stock-side warehouse guard.
 *
 * A group/disabled warehouse may remain in historical documents, but it must not
 * receive a new authoritative stock posting. Company validation is optional so
 * callers that derive company from the warehouse can still reuse the leaf guard.
 */
export async function requireLeafWarehouse(
  context: ControllerContext<JsonObject>,
  warehouseName: string,
  expectedCompany?: string,
): Promise<WarehouseScopeResult> {
  const name = text(warehouseName);
  if (!name) throw errors.validation("Warehouse is required");
  const warehouse = await context.reader.getMasterRecordData(
    context.command.tenant_id,
    "Warehouse",
    name,
  );
  if (!warehouse) throw errors.reference(`Warehouse ${name} does not exist`);
  if (checked(warehouse.disabled) || checked(warehouse.is_group)) {
    throw errors.reference(`Warehouse ${name} is disabled or is a group`);
  }
  const company = text(warehouse.company);
  const expected = text(expectedCompany);
  if (company && expected && company !== expected) {
    throw errors.reference(`Warehouse ${name} belongs to ${company}, not ${expected}`);
  }
  return {
    name,
    ...(company ? { company } : {}),
    ...(text(warehouse.stock_role ?? warehouse.warehouse_role)
      ? { stockRole: text(warehouse.stock_role ?? warehouse.warehouse_role) }
      : {}),
    data: warehouse,
  };
}
