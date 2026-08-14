import type { JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { CommercialSalesOrderController } from "./commercial-sales-order-controller.js";
import { parseSalesPackageSnapshot, resolveSalesPackage, type ResolvedSalesPackage } from "./sales-package-resolver.js";
import type { SalesItem, SalesOrderData } from "./types.js";

export interface PackageSnapshotDocument extends JsonObject {
  transaction_date: string;
  items: SalesItem[];
}

/**
 * Freeze fulfillment composition after pricing has resolved Sales Option -> Sales Package.
 * Existing valid snapshots win over mutable master data, which is required for quote/order
 * audit continuity. An ALL package never derives commercial price from components. A
 * SELECTABLE split package may allocate the already-resolved full-set price between its
 * parent and selected priced children in the later split-pricing pass.
 */
export async function applySalesPackageSnapshots<T extends PackageSnapshotDocument>(
  context: ControllerContext<JsonObject>,
  data: T,
): Promise<T> {
  const items: SalesItem[] = [];
  for (const item of data.items) {
    const packageName = text((item as JsonObject).sales_package);
    const suppliedSnapshot = parseSalesPackageSnapshot((item as JsonObject).sales_package_snapshot);
    if (!packageName) {
      const clean = { ...item } as SalesItem;
      delete (clean as JsonObject).sales_package_version;
      delete (clean as JsonObject).sales_package_checksum;
      delete (clean as JsonObject).sales_package_snapshot;
      items.push(clean);
      continue;
    }
    if (suppliedSnapshot) {
      if (suppliedSnapshot.sales_package !== packageName) {
        throw errors.validation(`Sales Package snapshot ${suppliedSnapshot.sales_package} does not match ${packageName}`);
      }
      items.push(withSnapshot(item, suppliedSnapshot));
      continue;
    }
    const resolved = await resolveSalesPackage(context, {
      packageName,
      postingDate: data.transaction_date,
      itemCode: item.item_code,
      facts: item as unknown as Record<string, unknown>,
    });
    items.push(withSnapshot(item, resolved));
  }
  return { ...data, items };
}

/** Canonical pricing + package wrapper, useful to consumers that do not need closure checks. */
export class PackagedCommercialSalesOrderController extends CommercialSalesOrderController {
  override async normalize(context: ControllerContext<SalesOrderData>): Promise<SalesOrderData> {
    const data = await super.normalize(context);
    return applySalesPackageSnapshots(
      context as unknown as ControllerContext<JsonObject>,
      data as SalesOrderData & PackageSnapshotDocument,
    ) as Promise<SalesOrderData>;
  }
}

function withSnapshot(item: SalesItem, snapshot: ResolvedSalesPackage): SalesItem {
  return {
    ...item,
    sales_package: snapshot.sales_package,
    ...(snapshot.sales_package_version !== undefined ? { sales_package_version: snapshot.sales_package_version } : {}),
    sales_package_checksum: snapshot.sales_package_checksum,
    sales_package_snapshot: snapshot,
  } as SalesItem;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
