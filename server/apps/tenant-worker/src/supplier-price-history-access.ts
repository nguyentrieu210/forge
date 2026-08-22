import type { CanonicalDocument } from "../../../packages/contracts/src/index.js";
import type { PurchaseOrderData } from "../../../packages/clouderp-core/src/index.js";

/**
 * A doctype-level read grant is not enough for an aggregate endpoint: user permissions,
 * ownership and policy conditions can still hide individual Purchase Orders. Filter every
 * source document before any rate/spend aggregation so hidden rows cannot leak through sums.
 */
export async function readableSubmittedSupplierOrders(
  rows: CanonicalDocument<PurchaseOrderData>[],
  supplier: string,
  canRead: (row: CanonicalDocument<PurchaseOrderData>) => Promise<boolean>,
): Promise<CanonicalDocument<PurchaseOrderData>[]> {
  const readable: CanonicalDocument<PurchaseOrderData>[] = [];
  for (const row of rows) {
    if (row.docstatus !== 1 || row.data.supplier !== supplier) continue;
    if (await canRead(row)) readable.push(row);
  }
  return readable;
}
