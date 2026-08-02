import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { requireLeafWarehouse } from "./warehouse-scope.js";

export interface WarehousePathNode {
  name: string;
  company?: string;
  stock_role?: string;
  is_group: boolean;
}

function text(value: unknown): string {
  return String(value ?? "").normalize("NFC").trim();
}
function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || text(value).toLowerCase() === "true";
}

/**
 * Resolves a physical Warehouse path from root to stock-carrying leaf.
 * Parent nodes may themselves be leaves because existing Alumdoor metadata uses
 * K36 -> K36-DT; cycle/company/disabled invariants matter more than forcing a new tree convention.
 */
export async function resolveWarehousePath(
  context: ControllerContext<JsonObject>,
  warehouseName: string,
  expectedCompany?: string,
  maxDepth = 32,
): Promise<WarehousePathNode[]> {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1 || maxDepth > 256) {
    throw errors.validation("maxDepth must be an integer between 1 and 256");
  }
  const leaf = await requireLeafWarehouse(context, warehouseName, expectedCompany);
  const reverse: WarehousePathNode[] = [{
    name: leaf.name,
    ...(leaf.company ? { company: leaf.company } : {}),
    ...(leaf.stockRole ? { stock_role: leaf.stockRole } : {}),
    is_group: false,
  }];
  const seen = new Set([leaf.name]);
  let current = leaf.data;
  let depth = 1;

  while (text(current.parent_warehouse)) {
    if (depth >= maxDepth) throw errors.validation(`Warehouse path exceeds maximum depth ${maxDepth}`);
    const parentName = text(current.parent_warehouse);
    if (seen.has(parentName)) throw errors.validation(`Warehouse hierarchy contains a cycle at ${parentName}`);
    seen.add(parentName);
    const parent = await context.reader.getMasterRecordData(context.command.tenant_id, "Warehouse", parentName);
    if (!parent) throw errors.reference(`Parent Warehouse ${parentName} does not exist`);
    if (checked(parent.disabled)) throw errors.reference(`Parent Warehouse ${parentName} is disabled`);
    const company = text(parent.company);
    const expected = text(expectedCompany ?? leaf.company);
    if (company && expected && company !== expected) {
      throw errors.reference(`Parent Warehouse ${parentName} belongs to ${company}, not ${expected}`);
    }
    reverse.push({
      name: parentName,
      ...(company ? { company } : {}),
      ...(text(parent.stock_role ?? parent.warehouse_role) ? { stock_role: text(parent.stock_role ?? parent.warehouse_role) } : {}),
      is_group: checked(parent.is_group),
    });
    current = parent;
    depth += 1;
  }
  return reverse.reverse();
}
