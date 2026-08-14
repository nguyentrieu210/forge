import type { CanonicalDocument, JsonObject } from "../../contracts/src/index.js";
import { errors, sha256Hex } from "../../core/src/index.js";
import type { ControllerContext } from "../../document-kernel/src/index.js";
import { toScaledInt } from "../../money/src/index.js";
import type { SalesItem, SalesOrderData } from "../../clouderp-selling/src/types.js";
import { StockUomSnapshotWorkOrderController } from "./manufacturing-work-order-guard.js";
import { ProductionPlanController } from "./suite-controllers.js";
import type { ProductionPlanData, ProductionPlanItem, WorkOrderData } from "./types.js";

interface SalesLinkedProductionPlanItem extends ProductionPlanItem {
  sales_order?: string;
  sales_order_row_id?: string;
  sales_order_document_version?: number;
  sales_order_revision_no?: number;
  production_source_snapshot?: JsonObject;
  production_source_checksum?: string;
}

interface SalesLinkedProductionPlanData extends ProductionPlanData {
  items: SalesLinkedProductionPlanItem[];
}

interface SalesLinkedWorkOrderData extends WorkOrderData {
  production_plan?: string;
  production_plan_row_id?: string;
  production_plan_document_version?: number;
  sales_order?: string;
  sales_order_row_id?: string;
  sales_order_document_version?: number;
  sales_order_revision_no?: number;
  production_source_snapshot?: JsonObject;
  production_source_checksum?: string;
}

interface SalesSource {
  order: CanonicalDocument<SalesOrderData>;
  row: SalesItem;
  rowId: string;
  orderedQtyMicros: number;
  snapshot: JsonObject;
  checksum: string;
}

/**
 * Freezes exact Sales Order child-row identity onto Production Plan demand.
 *
 * Generic production remains valid without a sales source. When a row declares a sales
 * source, both the order and stable child row are mandatory; matching by item_code alone
 * is intentionally forbidden because one order may contain repeated commercial rows.
 */
export class SalesLinkedProductionPlanController extends ProductionPlanController {
  override async normalize(context: ControllerContext<ProductionPlanData>): Promise<ProductionPlanData> {
    const normalized = await super.normalize(context) as SalesLinkedProductionPlanData;
    const items: SalesLinkedProductionPlanItem[] = [];

    for (const [index, raw] of normalized.items.entries()) {
      const salesOrder = text(raw.sales_order);
      const salesOrderRowId = text(raw.sales_order_row_id);
      if (!salesOrder && !salesOrderRowId) {
        items.push(raw);
        continue;
      }
      if (!salesOrder || !salesOrderRowId) {
        throw errors.validation(`Production Plan row ${index + 1} requires both sales_order and sales_order_row_id`);
      }

      const source = await resolveSalesSource(context, normalized.company, raw.item_code, salesOrder, salesOrderRowId);
      const plannedQty = quantityMicros(raw.planned_qty_micros, raw.planned_qty, `items[${index}].planned_qty`);
      if (plannedQty > source.orderedQtyMicros) {
        throw errors.reference(`Production Plan row ${index + 1} exceeds Sales Order row ${salesOrderRowId}`);
      }
      if (context.command.action === "submit") {
        const prior = await submittedProductionPlanQty(
          context,
          salesOrder,
          salesOrderRowId,
          context.command.aggregate.name,
        );
        if (safeAdd(prior, plannedQty, "sales-linked planned quantity") > source.orderedQtyMicros) {
          throw errors.reference(`Cumulative Production Plan quantity exceeds Sales Order ${salesOrder}/${salesOrderRowId}`);
        }
      }

      items.push({
        ...raw,
        sales_order: salesOrder,
        sales_order_row_id: salesOrderRowId,
        sales_order_document_version: source.order.version,
        ...(typeof source.order.data.revision_no === "number" ? { sales_order_revision_no: source.order.data.revision_no } : {}),
        production_source_snapshot: source.snapshot,
        production_source_checksum: source.checksum,
      });
    }

    return { ...normalized, items };
  }
}

/**
 * Makes Production Plan row identity the release authority for a sales-linked Work Order.
 *
 * Work Orders that do not reference a Production Plan keep the legacy path unchanged. Once
 * a Production Plan is referenced, item/BOM/sales lineage is derived from the submitted plan
 * rather than trusted from the client, and cumulative submitted release cannot exceed plan qty.
 */
export class SalesLinkedWorkOrderController extends StockUomSnapshotWorkOrderController {
  override async normalize(context: ControllerContext<WorkOrderData>): Promise<WorkOrderData> {
    const input = context.command.document as SalesLinkedWorkOrderData;
    const productionPlan = text(input.production_plan);
    const productionPlanRowId = text(input.production_plan_row_id);
    const clientSalesOrder = text(input.sales_order);
    const clientSalesOrderRowId = text(input.sales_order_row_id);

    if (!productionPlan && !productionPlanRowId) {
      if (clientSalesOrder || clientSalesOrderRowId) {
        throw errors.validation("Sales-linked Work Order requires production_plan and production_plan_row_id");
      }
      return super.normalize(context);
    }
    if (!productionPlan || !productionPlanRowId) {
      throw errors.validation("Work Order requires both production_plan and production_plan_row_id");
    }

    const plan = await context.reader.getDocument<SalesLinkedProductionPlanData>(
      context.command.tenant_id,
      "Production Plan",
      productionPlan,
    );
    if (!plan || plan.docstatus !== 1) throw errors.reference(`Submitted Production Plan ${productionPlan} is required`);
    if (plan.data.company !== input.company) throw errors.reference(`Production Plan ${productionPlan} belongs to another company`);

    const planRow = plan.data.items.find((row) => text(row.row_id) === productionPlanRowId);
    if (!planRow) throw errors.reference(`Production Plan row ${productionPlanRowId} does not belong to ${productionPlan}`);
    if (input.production_item && input.production_item !== planRow.item_code) {
      throw errors.reference(`Work Order production item does not match Production Plan row ${productionPlanRowId}`);
    }
    if (input.bom_no && input.bom_no !== planRow.bom_no) {
      throw errors.reference(`Work Order BOM must preserve Production Plan BOM ${planRow.bom_no}`);
    }

    const planQty = quantityMicros(planRow.planned_qty_micros, planRow.planned_qty, "Production Plan quantity");
    const requestedQty = quantityMicros(input.qty_micros, input.qty, "Work Order quantity");
    if (requestedQty > planQty) throw errors.reference(`Work Order quantity exceeds Production Plan row ${productionPlanRowId}`);

    const adjustedContext: ControllerContext<WorkOrderData> = {
      ...context,
      command: {
        ...context.command,
        document: {
          ...input,
          production_item: planRow.item_code,
          bom_no: planRow.bom_no,
        },
      },
    };
    const normalized = await super.normalize(adjustedContext) as SalesLinkedWorkOrderData;

    if (context.command.action === "submit") {
      const prior = await submittedWorkOrderQty(
        context,
        productionPlan,
        productionPlanRowId,
        context.command.aggregate.name,
      );
      if (safeAdd(prior, requestedQty, "production-plan released quantity") > planQty) {
        throw errors.reference(`Cumulative Work Order quantity exceeds Production Plan ${productionPlan}/${productionPlanRowId}`);
      }
    }

    const planSalesOrder = text(planRow.sales_order);
    const planSalesOrderRowId = text(planRow.sales_order_row_id);
    if ((clientSalesOrder && clientSalesOrder !== planSalesOrder)
      || (clientSalesOrderRowId && clientSalesOrderRowId !== planSalesOrderRowId)) {
      throw errors.reference("Work Order sales lineage must match the submitted Production Plan row");
    }

    return {
      ...normalized,
      production_plan: productionPlan,
      production_plan_row_id: productionPlanRowId,
      production_plan_document_version: plan.version,
      ...(planSalesOrder ? { sales_order: planSalesOrder } : {}),
      ...(planSalesOrderRowId ? { sales_order_row_id: planSalesOrderRowId } : {}),
      ...(typeof planRow.sales_order_document_version === "number"
        ? { sales_order_document_version: planRow.sales_order_document_version }
        : {}),
      ...(typeof planRow.sales_order_revision_no === "number"
        ? { sales_order_revision_no: planRow.sales_order_revision_no }
        : {}),
      ...(planRow.production_source_snapshot
        ? { production_source_snapshot: structuredClone(planRow.production_source_snapshot) }
        : {}),
      ...(text(planRow.production_source_checksum)
        ? { production_source_checksum: text(planRow.production_source_checksum) }
        : {}),
    };
  }
}

async function resolveSalesSource(
  context: ControllerContext<ProductionPlanData>,
  company: string,
  itemCode: string,
  salesOrder: string,
  salesOrderRowId: string,
): Promise<SalesSource> {
  const order = await context.reader.getDocument<SalesOrderData>(context.command.tenant_id, "Sales Order", salesOrder);
  if (!order || order.docstatus !== 1) throw errors.reference(`Submitted Sales Order ${salesOrder} is required`);
  if (order.data.company !== company) throw errors.reference(`Sales Order ${salesOrder} belongs to another company`);
  const row = order.data.items.find((candidate) => text(candidate.row_id) === salesOrderRowId);
  if (!row) throw errors.reference(`Sales Order row ${salesOrderRowId} does not belong to ${salesOrder}`);
  if (row.item_code !== itemCode) {
    throw errors.reference(`Production item ${itemCode} does not match Sales Order row ${salesOrderRowId}`);
  }

  const orderedQtyMicros = quantityMicros(row.qty_micros, row.qty, "Sales Order quantity");
  const snapshot: JsonObject = {
    schema_version: 1,
    source_doctype: "Sales Order",
    source_name: order.name,
    source_document_version: order.version,
    ...(typeof order.data.revision_no === "number" ? { source_revision_no: order.data.revision_no } : {}),
    source_row_id: salesOrderRowId,
    item_code: row.item_code,
    uom: text(row.uom),
    ordered_qty_micros: orderedQtyMicros,
    ...(text(row.warehouse) ? { warehouse: text(row.warehouse) } : {}),
    ...(text(row.sales_option_code) ? { sales_option_code: text(row.sales_option_code) } : {}),
    ...(typeof row.sales_option_version === "number" ? { sales_option_version: row.sales_option_version } : {}),
    ...(text(row.sales_package) ? { sales_package: text(row.sales_package) } : {}),
    ...(typeof row.sales_package_version === "number" ? { sales_package_version: row.sales_package_version } : {}),
    ...(text(row.sales_package_checksum) ? { sales_package_checksum: text(row.sales_package_checksum) } : {}),
  };
  return {
    order,
    row,
    rowId: salesOrderRowId,
    orderedQtyMicros,
    snapshot,
    checksum: await sha256Hex(JSON.stringify(snapshot)),
  };
}

async function submittedProductionPlanQty(
  context: ControllerContext<ProductionPlanData>,
  salesOrder: string,
  salesOrderRowId: string,
  excludeName: string,
): Promise<number> {
  const documents = await context.reader.listDocumentsByDoctype<SalesLinkedProductionPlanData>(
    context.command.tenant_id,
    "Production Plan",
  );
  let total = 0;
  for (const document of documents) {
    if (document.name === excludeName || document.docstatus !== 1) continue;
    for (const row of document.data.items ?? []) {
      if (text(row.sales_order) !== salesOrder || text(row.sales_order_row_id) !== salesOrderRowId) continue;
      total = safeAdd(total, quantityMicros(row.planned_qty_micros, row.planned_qty, "submitted Production Plan quantity"), "submitted Production Plan quantity");
    }
  }
  return total;
}

async function submittedWorkOrderQty(
  context: ControllerContext<WorkOrderData>,
  productionPlan: string,
  productionPlanRowId: string,
  excludeName: string,
): Promise<number> {
  const documents = await context.reader.listDocumentsByDoctype<SalesLinkedWorkOrderData>(
    context.command.tenant_id,
    "Work Order",
  );
  let total = 0;
  for (const document of documents) {
    if (document.name === excludeName || document.docstatus !== 1) continue;
    if (text(document.data.production_plan) !== productionPlan
      || text(document.data.production_plan_row_id) !== productionPlanRowId) continue;
    total = safeAdd(total, quantityMicros(document.data.qty_micros, document.data.qty, "submitted Work Order quantity"), "submitted Work Order quantity");
  }
  return total;
}

function quantityMicros(micros: unknown, decimal: unknown, field: string): number {
  if (typeof micros === "number" && Number.isSafeInteger(micros)) {
    if (micros <= 0) throw errors.validation(`${field} must be positive`);
    return micros;
  }
  if (typeof decimal !== "string" && typeof decimal !== "number") throw errors.validation(`${field} is required`);
  const value = toScaledInt(decimal, 6, field);
  if (value <= 0) throw errors.validation(`${field} must be positive`);
  return value;
}

function safeAdd(left: number, right: number, field: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) throw errors.validation(`${field} must use safe integers`);
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation(`${field} exceeds safe integer range`);
  return result;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : "";
}
