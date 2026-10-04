import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
  ProcurementEntry,
  StockBundleUsageEntry,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import type {
  PurchaseItem,
  PurchaseOrderData,
  StockEntryData,
  StockEntryItem,
} from "../../clouderp-core/src/types.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { domainEvent } from "../../outbox/src/index.js";
import {
  buildTrackedStockLines,
  deriveOutgoingValuation,
  requireLeafWarehouse,
} from "../../clouderp-stock/src/index.js";
import type { BillOfMaterialsData } from "./types.js";
import { StockEntryIntegrityController } from "./stock-entry-integrity.js";
import { assertStockPlanRespectsReservations } from "./outbound-reservation-guard.js";

interface SubcontractingOrderSuppliedItem extends JsonObject {
  row_id: string;
  bom_row_id: string;
  item_code: string;
  required_qty: string;
  required_qty_micros: number;
  source_warehouse: string;
}

interface SubcontractingOrderData extends JsonObject {
  supplier: string;
  company: string;
  currency: string;
  currency_scale: number;
  transaction_date: string;
  purchase_order: string;
  purchase_order_row_id: string;
  service_item: string;
  production_item: string;
  bom_no: string;
  qty: string;
  qty_micros: number;
  source_warehouse?: string;
  supplier_warehouse: string;
  target_warehouse: string;
  service_rate: string;
  service_rate_minor: number;
  service_amount_minor: number;
  supplied_items: SubcontractingOrderSuppliedItem[];
}

interface SubcontractingReceiptSuppliedItem extends JsonObject {
  row_id: string;
  bom_row_id: string;
  item_code: string;
  consumed_qty: string;
  consumed_qty_micros: number;
  serial_and_batch_bundle?: string;
}

interface SubcontractingReceiptData extends JsonObject {
  subcontracting_order: string;
  purchase_order: string;
  purchase_order_row_id: string;
  service_item: string;
  production_item: string;
  supplier: string;
  company: string;
  currency: string;
  currency_scale: number;
  posting_at: string;
  received_qty: string;
  received_qty_micros: number;
  supplier_warehouse: string;
  target_warehouse: string;
  finished_good_bundle?: string;
  rejected_qty?: string;
  rejected_qty_micros?: number;
  accepted_qty?: string;
  accepted_qty_micros?: number;
  rejected_warehouse?: string;
  rejected_good_bundle?: string;
  rejected_service_policy?: string;
  rejected_value_minor?: number;
  accepted_value_minor?: number;
  stock_account?: string;
  stock_received_but_not_billed?: string;
  service_cost_minor: number;
  material_cost_minor?: number;
  finished_good_value_minor?: number;
  supplied_items: SubcontractingReceiptSuppliedItem[];
}

interface SubcontractingStockEntryData extends StockEntryData {
  subcontracting_order?: string;
  subcontracting_material_return?: boolean;
  items: Array<StockEntryItem & { bom_row_id?: string }>;
}

interface VersionedBomRow extends JsonObject {
  row_id?: string;
  item_code: string;
  qty: string | number;
  qty_micros?: number;
  stock_qty_micros?: number;
  qty_basis?: string;
  source_warehouse?: string;
}

interface VersionedBomData extends BillOfMaterialsData {
  bom_status?: string;
  is_active?: boolean | number;
  effective_from?: string;
  effective_to?: string;
  items: VersionedBomRow[] & BillOfMaterialsData["items"];
}

export class SubcontractingOrderController implements DocumentController<SubcontractingOrderData> {
  readonly doctype = "Subcontracting Order";

  async buildPlan(context: ControllerContext<SubcontractingOrderData>): Promise<MutationPlan<SubcontractingOrderData>> {
    const data = context.command.action === "cancel"
      ? structuredClone(requireExisting(context).data)
      : await this.normalize(context);

    if (context.command.action === "cancel") {
      await assertOrderHasNoActiveExecution(context, context.command.aggregate.name);
    }

    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : docstatus === 1 ? "Open" : "Cancelled";
    const document: CanonicalDocument<SubcontractingOrderData> = {
      tenant_id: context.command.tenant_id,
      doctype: this.doctype,
      name: context.command.aggregate.name,
      owner: context.existing?.owner ?? context.command.actor.user_id,
      docstatus,
      status,
      version: context.nextVersion,
      created_at: context.existing?.created_at ?? context.now,
      modified_at: context.now,
      data,
      children: extractChildren(this.doctype, data),
    };
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [domainEvent({
        type: `subcontracting_order.${context.command.action}`,
        tenantId: context.command.tenant_id,
        aggregate: context.command.aggregate,
        aggregateVersion: context.nextVersion,
        actor: context.command.actor.user_id,
        commandId: context.command.command_id,
        occurredAt: context.now,
        payload: { status, purchase_order: data.purchase_order },
      })],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }

  private async normalize(context: ControllerContext<SubcontractingOrderData>): Promise<SubcontractingOrderData> {
    const input = context.command.document;
    if (!input.purchase_order || !input.service_item || !input.production_item || !input.bom_no
      || !input.transaction_date || !input.supplier_warehouse || !input.target_warehouse) {
      throw errors.validation("Purchase Order, service item, finished item, BOM, date, supplier warehouse and target warehouse are required");
    }
    const qtyMicros = positiveMicros(input.qty, "qty");
    const po = await requireSubmitted<PurchaseOrderData>(context, "Purchase Order", input.purchase_order);
    if (!checked(po.data.is_subcontracted)) {
      throw errors.reference(`Purchase Order ${po.name} is not marked for subcontracting`);
    }

    const line = selectServiceLine(po, input.service_item, input.purchase_order_row_id);
    const poQty = line.qty_micros ?? toScaledInt(line.qty, 6, "Purchase Order service quantity");
    const previousOrders = await context.reader.listDocumentsByDoctype<SubcontractingOrderData>(
      context.command.tenant_id,
      "Subcontracting Order",
    );
    const alreadyOrdered = previousOrders
      .filter((document) => document.name !== context.command.aggregate.name
        && document.docstatus === 1
        && document.data.purchase_order === po.name
        && document.data.purchase_order_row_id === line.row_id)
      .reduce((sum, document) => safeAdd(sum, document.data.qty_micros), 0);
    if (alreadyOrdered + qtyMicros > poQty) {
      throw errors.reference("Subcontracting Order quantity exceeds the approved Purchase Order service line", {
        approved_qty_micros: poQty,
        already_subcontracted_qty_micros: alreadyOrdered,
        requested_qty_micros: qtyMicros,
      });
    }

    const serviceMaster = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", input.service_item);
    if (!serviceMaster) throw errors.reference(`Item ${input.service_item} does not exist`);
    if (checked(serviceMaster.is_stock_item)) throw errors.validation("Subcontracting service item must be non-stock");

    const bom = await requireSubmitted<VersionedBomData>(context, "Bill of Materials", input.bom_no);
    if (bom.data.company !== po.data.company || bom.data.item !== input.production_item) {
      throw errors.reference("Subcontracting finished item/company does not match BOM");
    }
    assertBomEffective(bom, input.transaction_date);
    const bomQty = positiveMicros(bom.data.quantity, "BOM quantity");
    const suppliedItems: SubcontractingOrderSuppliedItem[] = [];
    for (const [index, raw] of bom.data.items.entries()) {
      const basis = text(raw.qty_basis || "Cố định");
      if (basis && basis !== "Cố định" && basis.toLowerCase() !== "fixed") {
        throw errors.validation(`Subcontracting currently requires fixed BOM quantity basis; row ${index + 1} uses ${basis}`);
      }
      const rawQty = raw.stock_qty_micros ?? raw.qty_micros ?? positiveMicros(raw.qty, `BOM row ${index + 1} quantity`);
      const requiredQty = ratio(rawQty, qtyMicros, bomQty);
      const sourceWarehouse = text(raw.source_warehouse) || text(input.source_warehouse);
      if (!sourceWarehouse) throw errors.validation(`Source warehouse is required for BOM row ${index + 1}`);
      if (sourceWarehouse === input.supplier_warehouse) {
        throw errors.validation("Source warehouse must differ from supplier warehouse");
      }
      suppliedItems.push({
        row_id: `SUPPLIED-${index + 1}`,
        bom_row_id: text(raw.row_id) || `ROW-${index + 1}`,
        item_code: raw.item_code,
        required_qty: fromScaledInt(requiredQty, 6),
        required_qty_micros: requiredQty,
        source_warehouse: sourceWarehouse,
      });
    }

    const currencyScale = await currencyScaleFor(context, po.data.currency);
    const serviceRate = line.rate_minor ?? toScaledInt(line.rate, currencyScale, "service rate");
    const serviceAmount = ratio(serviceRate, qtyMicros, 1_000_000);

    if (context.command.action === "submit") {
      await assertMaster(context, "Supplier", po.data.supplier);
      await assertMaster(context, "Company", po.data.company);
      await assertMaster(context, "Currency", po.data.currency);
      await assertMaster(context, "Item", input.production_item);
      await assertMaster(context, "Item", input.service_item);
      for (const row of suppliedItems) await assertMaster(context, "Item", row.item_code);
      await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, input.supplier_warehouse, po.data.company);
      await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, input.target_warehouse, po.data.company);
      for (const row of suppliedItems) {
        await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, row.source_warehouse, po.data.company);
      }
    }

    return {
      ...input,
      supplier: po.data.supplier,
      company: po.data.company,
      currency: po.data.currency,
      currency_scale: currencyScale,
      purchase_order: po.name,
      purchase_order_row_id: line.row_id,
      qty: fromScaledInt(qtyMicros, 6),
      qty_micros: qtyMicros,
      service_rate: fromScaledInt(serviceRate, currencyScale),
      service_rate_minor: serviceRate,
      service_amount_minor: serviceAmount,
      supplied_items: suppliedItems,
    };
  }
}

export class SubcontractingStockEntryController extends StockEntryIntegrityController {
  override async normalize(context: ControllerContext<StockEntryData>): Promise<StockEntryData> {
    const raw = context.command.document as SubcontractingStockEntryData;
    if (!raw.subcontracting_order) {
      if (checked(raw.subcontracting_material_return)) throw errors.validation("Subcontracting Order is required for supplier material return");
      return super.normalize(context);
    }
    if (raw.purpose !== "Material Transfer") {
      throw errors.validation("Subcontracting material supply must use Material Transfer");
    }
    const order = await requireSubmitted<SubcontractingOrderData>(
      context as unknown as ControllerContext<JsonObject>,
      "Subcontracting Order",
      raw.subcontracting_order,
    );
    if (raw.company !== order.data.company) throw errors.reference("Stock Entry company does not match Subcontracting Order");

    const isReturn = checked(raw.subcontracting_material_return);
    const preparedItems = raw.items.map((row, index) => {
      const required = selectSuppliedRow(order.data, row.item_code, row.bom_row_id);
      return {
        ...row,
        row_id: row.row_id || `ROW-${index + 1}`,
        bom_row_id: required.bom_row_id,
        source_warehouse: isReturn ? order.data.supplier_warehouse : required.source_warehouse,
        target_warehouse: isReturn ? required.source_warehouse : order.data.supplier_warehouse,
      };
    });

    // Enforce the frozen BOM ceiling before stock valuation. Once a prior transfer has
    // exhausted the source warehouse, asking the valuation engine first would surface
    // "insufficient stock" and hide the more authoritative subcontracting over-transfer error.
    if (context.command.action === "submit") {
      const priorByBom = await transferredByBomRow(
        context as unknown as ControllerContext<JsonObject>, order.name, context.command.aggregate.name,
      );
      const consumedByBom = await consumedByBomRow(context as unknown as ControllerContext<JsonObject>, order.name);
      const currentByBom = sumTransferRows(preparedItems);
      for (const required of order.data.supplied_items) {
        const prior = priorByBom.get(required.bom_row_id) ?? 0;
        const current = currentByBom.get(required.bom_row_id) ?? 0;
        const after = safeAdd(prior, isReturn ? -current : current);
        if (isReturn && after < (consumedByBom.get(required.bom_row_id) ?? 0)) {
          throw errors.reference(`Material return exceeds unconsumed supplier material for BOM row ${required.bom_row_id}`);
        }
        if (after > required.required_qty_micros) {
          throw errors.reference(`Transferred quantity exceeds Subcontracting Order requirement for BOM row ${required.bom_row_id}`, {
            required_qty_micros: required.required_qty_micros,
            prior_qty_micros: prior,
            requested_qty_micros: current,
          });
        }
      }
    }

    const adjusted = {
      ...context,
      command: {
        ...context.command,
        document: { ...raw, items: preparedItems },
      },
    } as ControllerContext<StockEntryData>;
    const normalized = await super.normalize(adjusted) as SubcontractingStockEntryData;
    return { ...normalized, subcontracting_order: order.name, subcontracting_material_return: isReturn };
  }

  override async buildPlan(context: ControllerContext<StockEntryData>): Promise<MutationPlan<StockEntryData>> {
    if (context.command.action === "cancel") {
      const data = context.existing?.data as SubcontractingStockEntryData | undefined;
      if (data?.subcontracting_order) await assertTransferCancellationSafe(context, data);
    }
    const plan = await super.buildPlan(context);
    const order = text((plan.document.data as SubcontractingStockEntryData).subcontracting_order);
    if (!order) return plan;
    return {
      ...plan,
      events: [
        ...plan.events,
        domainEvent({
          type: context.command.action === "submit"
            ? checked((plan.document.data as SubcontractingStockEntryData).subcontracting_material_return)
              ? "subcontracting.material_returned"
              : "subcontracting.material_transferred"
            : context.command.action === "cancel"
              ? "subcontracting.material_transfer_reversed"
              : "subcontracting.material_transfer_updated",
          tenantId: context.command.tenant_id,
          aggregate: context.command.aggregate,
          aggregateVersion: context.nextVersion,
          actor: context.command.actor.user_id,
          commandId: context.command.command_id,
          occurredAt: context.now,
          payload: { subcontracting_order: order },
        }),
      ],
    };
  }
}

export class SubcontractingReceiptController implements DocumentController<SubcontractingReceiptData> {
  readonly doctype = "Subcontracting Receipt";

  async buildPlan(context: ControllerContext<SubcontractingReceiptData>): Promise<MutationPlan<SubcontractingReceiptData>> {
    if (context.command.action === "cancel") return this.buildCancelPlan(context);

    const data = await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    if (docstatus !== 1) return this.emptyPlan(context, data, docstatus === 0 ? "Draft" : "Cancelled");

    await assertUnlocked(context as unknown as ControllerContext<JsonObject>, data.company, data.posting_at);
    const stock: StockLedgerEntry[] = [];
    const usages: StockBundleUsageEntry[] = [];
    let materialCost = 0;

    for (const row of data.supplied_items) {
      const priorIssues = stock.filter((line) =>
        line.item_code === row.item_code
        && line.warehouse === data.supplier_warehouse
        && line.actual_qty_micros < 0
      );
      const valuation = await deriveOutgoingValuation(context as unknown as ControllerContext<JsonObject>, {
        itemCode: row.item_code,
        warehouse: data.supplier_warehouse,
        qtyMicros: row.consumed_qty_micros,
        postingAt: data.posting_at,
        currencyScale: data.currency_scale,
        ...(priorIssues.length ? { priorIssues } : {}),
      });
      const outgoing = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, {
        itemCode: row.item_code,
        warehouse: data.supplier_warehouse,
        qtyMicros: row.consumed_qty_micros,
        direction: "Outward",
        postingAt: data.posting_at,
        currency: data.currency,
        currencyScale: data.currency_scale,
        valuationRateMinor: valuation.valuation_rate_minor,
        stockValueMinor: Math.abs(valuation.stock_value_difference_minor),
        lineKey: `RAW-${row.bom_row_id}`,
        ...(row.serial_and_batch_bundle
          ? { bundleName: row.serial_and_batch_bundle }
          : valuation.fifo_allocations?.length
            ? { automaticFifoAllocations: valuation.fifo_allocations }
            : {}),
      });
      stock.push(...outgoing.stock);
      usages.push(...outgoing.usages);
      materialCost = safeAdd(materialCost, outgoing.stockValueMinor);
    }

    const finishedValue = safeAdd(materialCost, data.service_cost_minor);
    const finishedRate = ratePerUnitMinor(finishedValue, data.received_qty_micros);
    const rejectedQty = data.rejected_qty_micros ?? 0;
    const acceptedQty = data.received_qty_micros - rejectedQty;
    const rejectedValue = ratio(finishedValue, rejectedQty, data.received_qty_micros);
    const acceptedValue = finishedValue - rejectedValue;
    for (const output of [
      { qty: acceptedQty, value: acceptedValue, warehouse: data.target_warehouse, line: "FINISHED", bundle: data.finished_good_bundle },
      { qty: rejectedQty, value: rejectedValue, warehouse: data.rejected_warehouse, line: "REJECTED", bundle: data.rejected_good_bundle },
    ]) {
      if (output.qty === 0) continue;
      const finished = await buildTrackedStockLines(context as unknown as ControllerContext<JsonObject>, {
        itemCode: data.production_item,
        warehouse: output.warehouse!,
        qtyMicros: output.qty,
        direction: "Inward",
        postingAt: data.posting_at,
        currency: data.currency,
        currencyScale: data.currency_scale,
        valuationRateMinor: finishedRate,
        stockValueMinor: output.value,
        lineKey: output.line,
        ...(output.bundle ? { bundleName: output.bundle } : {}),
      });
      stock.push(...finished.stock);
      usages.push(...finished.usages);
    }
    data.accepted_value_minor = acceptedValue;
    data.rejected_value_minor = rejectedValue;

    data.material_cost_minor = materialCost;
    data.finished_good_value_minor = finishedValue;

    const gl: GeneralLedgerEntry[] = [];
    if (data.service_cost_minor > 0) {
      gl.push(
        {
          line_key: "SERVICE-STOCK",
          account: data.stock_account!,
          debit_minor: data.service_cost_minor,
          credit_minor: 0,
          currency: data.currency,
          currency_scale: data.currency_scale,
          posting_at: data.posting_at,
        },
        {
          line_key: "SERVICE-SRBNB",
          account: data.stock_received_but_not_billed!,
          debit_minor: 0,
          credit_minor: data.service_cost_minor,
          currency: data.currency,
          currency_scale: data.currency_scale,
          posting_at: data.posting_at,
        },
      );
    }
    const procurement: ProcurementEntry[] = [{
      line_key: "SUBCONTRACT-RECEIPT",
      purchase_order: data.purchase_order,
      purchase_order_item_row_id: data.purchase_order_row_id,
      kind: "Receipt",
      item_code: data.service_item,
      qty_micros: data.received_qty_micros,
      posting_at: data.posting_at,
    }];

    await assertStockPlanRespectsReservations(context, stock, [context.command.aggregate.name]);
    const status = "Completed";
    const document = canonicalDocument(context, this.doctype, data, 1, status);
    return {
      command: context.command,
      document,
      gl_entries: gl,
      stock_entries: stock,
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: procurement,
      stock_bundle_usages: usages,
      events: [receiptEvent(context, data, status)],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus: 1, status },
    };
  }

  private async normalize(context: ControllerContext<SubcontractingReceiptData>): Promise<SubcontractingReceiptData> {
    const input = context.command.document;
    if (!input.subcontracting_order || !input.posting_at) {
      throw errors.validation("Subcontracting Order and posting_at are required");
    }
    const order = await requireSubmitted<SubcontractingOrderData>(
      context as unknown as ControllerContext<JsonObject>,
      "Subcontracting Order",
      input.subcontracting_order,
    );
    const receivedQty = positiveMicros(input.received_qty, "received_qty");
    const rejectedQty = input.rejected_qty === undefined || input.rejected_qty === ""
      ? 0 : toScaledInt(input.rejected_qty, 6, "rejected_qty");
    if (rejectedQty < 0 || rejectedQty > receivedQty) {
      throw errors.validation("rejected_qty must be between zero and total received_qty");
    }
    if (rejectedQty > 0) {
      if (input.rejected_service_policy !== "Pay Full Service") {
        throw errors.validation("Rejected finished goods require explicit Pay Full Service policy; supplier credit/return is unsupported");
      }
      if (!input.rejected_warehouse || input.rejected_warehouse === order.data.target_warehouse
        || input.rejected_warehouse === order.data.supplier_warehouse) {
        throw errors.validation("Rejected finished goods require a separate rejected warehouse");
      }
      await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, input.rejected_warehouse, order.data.company);
    } else if (input.rejected_good_bundle || input.rejected_warehouse || input.rejected_service_policy) {
      throw errors.validation("Rejected warehouse, bundle and policy require positive rejected_qty");
    }
    if (rejectedQty === receivedQty && input.finished_good_bundle) {
      throw errors.validation("Accepted finished-good bundle requires positive accepted quantity");
    }
    const priorReceipts = (await context.reader.listDocumentsByDoctype<SubcontractingReceiptData>(
      context.command.tenant_id,
      "Subcontracting Receipt",
    )).filter((document) => document.name !== context.command.aggregate.name
      && document.docstatus === 1
      && document.data.subcontracting_order === order.name);
    const priorReceived = priorReceipts.reduce((sum, receipt) => safeAdd(sum, receipt.data.received_qty_micros), 0);
    const afterReceived = safeAdd(priorReceived, receivedQty);
    if (afterReceived > order.data.qty_micros) {
      throw errors.reference("Subcontracting Receipt exceeds Subcontracting Order quantity", {
        ordered_qty_micros: order.data.qty_micros,
        prior_received_qty_micros: priorReceived,
        requested_qty_micros: receivedQty,
      });
    }

    const expectedRows: SubcontractingReceiptSuppliedItem[] = [];
    for (const required of order.data.supplied_items) {
      const cumulativeRequired = ratio(required.required_qty_micros, afterReceived, order.data.qty_micros);
      const priorConsumed = priorReceipts
        .flatMap((receipt) => receipt.data.supplied_items)
        .filter((row) => row.bom_row_id === required.bom_row_id)
        .reduce((sum, row) => safeAdd(sum, row.consumed_qty_micros), 0);
      const current = cumulativeRequired - priorConsumed;
      if (current < 0) throw errors.ledger("Prior subcontracting consumption exceeds cumulative BOM requirement");
      expectedRows.push({
        row_id: `SUPPLIED-${required.bom_row_id}`,
        bom_row_id: required.bom_row_id,
        item_code: required.item_code,
        consumed_qty: fromScaledInt(current, 6),
        consumed_qty_micros: current,
      });
    }

    const supplied = reconcileSuppliedInput(expectedRows, input.supplied_items);
    const transferred = await transferredByBomRow(context as unknown as ControllerContext<JsonObject>, order.name);
    for (const row of supplied) {
      const priorConsumed = priorReceipts
        .flatMap((receipt) => receipt.data.supplied_items)
        .filter((item) => item.bom_row_id === row.bom_row_id)
        .reduce((sum, item) => safeAdd(sum, item.consumed_qty_micros), 0);
      if ((transferred.get(row.bom_row_id) ?? 0) < priorConsumed + row.consumed_qty_micros) {
        throw errors.reference(`Insufficient material transferred to supplier for BOM row ${row.bom_row_id}`, {
          transferred_qty_micros: transferred.get(row.bom_row_id) ?? 0,
          required_consumption_qty_micros: priorConsumed + row.consumed_qty_micros,
        });
      }
    }

    const cumulativeService = ratio(order.data.service_amount_minor, afterReceived, order.data.qty_micros);
    const priorService = priorReceipts.reduce((sum, receipt) => safeAdd(sum, receipt.data.service_cost_minor), 0);
    const serviceCost = cumulativeService - priorService;
    if (serviceCost < 0) throw errors.ledger("Prior subcontracting service cost exceeds cumulative order service cost");

    const po = await requireSubmitted<PurchaseOrderData>(
      context as unknown as ControllerContext<JsonObject>,
      "Purchase Order",
      order.data.purchase_order,
    );
    const currentReceiptProgress = await context.reader.getProcuredQuantityMicros(
      context.command.tenant_id,
      po.name,
      "Receipt",
      order.data.service_item,
      order.data.purchase_order_row_id,
    );
    const serviceLine = selectServiceLine(po, order.data.service_item, order.data.purchase_order_row_id);
    const approvedQty = serviceLine.qty_micros ?? toScaledInt(serviceLine.qty, 6);
    if (currentReceiptProgress + receivedQty > approvedQty) {
      throw errors.reference("Subcontracting receipt would exceed approved Purchase Order service quantity");
    }

    if (context.command.action === "submit") {
      await assertMaster(context as unknown as ControllerContext<JsonObject>, "Item", order.data.production_item);
      await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, order.data.supplier_warehouse, order.data.company);
      await requireLeafWarehouse(context as unknown as ControllerContext<JsonObject>, order.data.target_warehouse, order.data.company);
      if (serviceCost > 0) {
        if (!input.stock_account || !input.stock_received_but_not_billed) {
          throw errors.validation("Stock and stock-received-but-not-billed accounts are required for subcontracting service cost");
        }
        await assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", input.stock_account);
        await assertMaster(context as unknown as ControllerContext<JsonObject>, "Account", input.stock_received_but_not_billed);
      }
    }

    return {
      ...input,
      subcontracting_order: order.name,
      purchase_order: order.data.purchase_order,
      purchase_order_row_id: order.data.purchase_order_row_id,
      service_item: order.data.service_item,
      production_item: order.data.production_item,
      supplier: order.data.supplier,
      company: order.data.company,
      currency: order.data.currency,
      currency_scale: order.data.currency_scale,
      received_qty: fromScaledInt(receivedQty, 6),
      received_qty_micros: receivedQty,
      rejected_qty: fromScaledInt(rejectedQty, 6),
      rejected_qty_micros: rejectedQty,
      accepted_qty: fromScaledInt(receivedQty - rejectedQty, 6),
      accepted_qty_micros: receivedQty - rejectedQty,
      supplier_warehouse: order.data.supplier_warehouse,
      target_warehouse: order.data.target_warehouse,
      service_cost_minor: serviceCost,
      supplied_items: supplied,
    };
  }

  private emptyPlan(
    context: ControllerContext<SubcontractingReceiptData>,
    data: SubcontractingReceiptData,
    status: string,
  ): MutationPlan<SubcontractingReceiptData> {
    const docstatus = nextDocStatus(context.command.action);
    const document = canonicalDocument(context, this.doctype, data, docstatus, status);
    return {
      command: context.command,
      document,
      gl_entries: [],
      stock_entries: [],
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [receiptEvent(context, data, status)],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }

  private async buildCancelPlan(context: ControllerContext<SubcontractingReceiptData>): Promise<MutationPlan<SubcontractingReceiptData>> {
    const existing = requireExisting(context);
    const data = structuredClone(existing.data);
    await assertUnlocked(context as unknown as ControllerContext<JsonObject>, data.company, data.posting_at);
    const po = await requireSubmitted<PurchaseOrderData>(
      context as unknown as ControllerContext<JsonObject>,
      "Purchase Order",
      data.purchase_order,
    );
    if (checked((po.data as JsonObject).receipt_match_required)) {
      const [receiptProgress, billedProgress] = await Promise.all([
        context.reader.getProcuredQuantityMicros(
          context.command.tenant_id,
          po.name,
          "Receipt",
          data.service_item,
          data.purchase_order_row_id,
        ),
        context.reader.getProcuredQuantityMicros(
          context.command.tenant_id,
          po.name,
          "Billing",
          data.service_item,
          data.purchase_order_row_id,
        ),
      ]);
      if (billedProgress > receiptProgress - data.received_qty_micros) {
        throw errors.reference("Cannot cancel Subcontracting Receipt while matched Purchase Invoice quantity depends on it");
      }
    }

    const [stock, gl] = await Promise.all([
      context.reader.getVoucherStockEntries(context.command.tenant_id, this.doctype, context.command.aggregate.name, existing.version),
      context.reader.getVoucherGlEntries(context.command.tenant_id, this.doctype, context.command.aggregate.name, existing.version),
    ]);
    if (stock.length === 0) throw errors.reference("Original Subcontracting Receipt stock posting was not found");

    const bundleUsages: StockBundleUsageEntry[] = [];
    for (const row of data.supplied_items) {
      if (!row.serial_and_batch_bundle) continue;
      bundleUsages.push({
        line_key: `REV-BUNDLE-RAW-${row.bom_row_id}`,
        bundle_name: row.serial_and_batch_bundle,
        item_code: row.item_code,
        warehouse: data.supplier_warehouse,
        direction: "Outward",
        usage_delta: -1,
        posting_at: data.posting_at,
      });
    }
    if (data.finished_good_bundle) {
      bundleUsages.push({
        line_key: "REV-BUNDLE-FINISHED",
        bundle_name: data.finished_good_bundle,
        item_code: data.production_item,
        warehouse: data.target_warehouse,
        direction: "Inward",
        usage_delta: -1,
        posting_at: data.posting_at,
      });
    }

    if (data.rejected_good_bundle) {
      bundleUsages.push({
        line_key: "REV-BUNDLE-REJECTED",
        bundle_name: data.rejected_good_bundle,
        item_code: data.production_item,
        warehouse: data.rejected_warehouse!,
        direction: "Inward",
        usage_delta: -1,
        posting_at: data.posting_at,
      });
    }

    const procurement: ProcurementEntry[] = [{
      line_key: "REV-SUBCONTRACT-RECEIPT",
      purchase_order: data.purchase_order,
      purchase_order_item_row_id: data.purchase_order_row_id,
      kind: "Receipt",
      item_code: data.service_item,
      qty_micros: -data.received_qty_micros,
      posting_at: data.posting_at,
    }];
    const reversedStock = reverseStock(stock);
    await assertStockPlanRespectsReservations(context, reversedStock, [context.command.aggregate.name]);
    const status = "Cancelled";
    const document = canonicalDocument(context, this.doctype, data, 2, status);
    return {
      command: context.command,
      document,
      gl_entries: reverseGl(gl),
      stock_entries: reversedStock,
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: procurement,
      stock_bundle_usages: bundleUsages,
      events: [receiptEvent(context, data, status)],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus: 2, status },
    };
  }
}

function selectServiceLine(
  po: CanonicalDocument<PurchaseOrderData>,
  serviceItem: string,
  requestedRowId?: string,
): PurchaseItem {
  const matches = po.data.items.filter((row) => row.item_code === serviceItem);
  if (requestedRowId) {
    const exact = matches.find((row) => row.row_id === requestedRowId);
    if (!exact) throw errors.reference(`Purchase Order row ${requestedRowId} does not match service item ${serviceItem}`);
    return exact;
  }
  if (matches.length !== 1) {
    throw errors.reference(`Purchase Order must contain exactly one ${serviceItem} service row or purchase_order_row_id must be supplied`);
  }
  return matches[0]!;
}

function selectSuppliedRow(
  order: SubcontractingOrderData,
  itemCode: string,
  bomRowId?: string,
): SubcontractingOrderSuppliedItem {
  if (bomRowId) {
    const exact = order.supplied_items.find((row) => row.bom_row_id === bomRowId && row.item_code === itemCode);
    if (!exact) throw errors.reference(`BOM row ${bomRowId} does not match subcontracting supplied item ${itemCode}`);
    return exact;
  }
  const matches = order.supplied_items.filter((row) => row.item_code === itemCode);
  if (matches.length !== 1) throw errors.reference(`bom_row_id is required for repeated subcontracting item ${itemCode}`);
  return matches[0]!;
}

function sumTransferRows(items: SubcontractingStockEntryData["items"]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of items) {
    const key = text(row.bom_row_id);
    if (!key) continue;
    result.set(key, safeAdd(result.get(key) ?? 0, row.qty_micros ?? toScaledInt(row.qty, 6)));
  }
  return result;
}

async function transferredByBomRow(
  context: ControllerContext<JsonObject>,
  orderName: string,
  excludeStockEntry?: string,
): Promise<Map<string, number>> {
  const transfers = await context.reader.listDocumentsByDoctype<SubcontractingStockEntryData>(
    context.command.tenant_id,
    "Stock Entry",
  );
  const result = new Map<string, number>();
  for (const document of transfers) {
    if (document.docstatus !== 1 || document.name === excludeStockEntry || document.data.subcontracting_order !== orderName) continue;
    for (const row of document.data.items) {
      const key = text(row.bom_row_id);
      if (!key) continue;
      const qty = row.qty_micros ?? toScaledInt(row.qty, 6);
      result.set(key, safeAdd(result.get(key) ?? 0, checked(document.data.subcontracting_material_return) ? -qty : qty));
    }
  }
  return result;
}

async function consumedByBomRow(
  context: ControllerContext<JsonObject>, orderName: string,
): Promise<Map<string, number>> {
  const receipts = await context.reader.listDocumentsByDoctype<SubcontractingReceiptData>(context.command.tenant_id, "Subcontracting Receipt");
  const result = new Map<string, number>();
  for (const receipt of receipts) {
    if (receipt.docstatus !== 1 || receipt.data.subcontracting_order !== orderName) continue;
    for (const row of receipt.data.supplied_items) {
      result.set(row.bom_row_id, safeAdd(result.get(row.bom_row_id) ?? 0, row.consumed_qty_micros));
    }
  }
  return result;
}

async function assertTransferCancellationSafe(
  context: ControllerContext<StockEntryData>,
  data: SubcontractingStockEntryData,
): Promise<void> {
  const remainingTransferred = await transferredByBomRow(
    context as unknown as ControllerContext<JsonObject>,
    data.subcontracting_order!,
    context.command.aggregate.name,
  );
  const consumed = await consumedByBomRow(context as unknown as ControllerContext<JsonObject>, data.subcontracting_order!);
  for (const rowId of new Set([...remainingTransferred.keys(), ...consumed.keys()])) {
    if ((remainingTransferred.get(rowId) ?? 0) < (consumed.get(rowId) ?? 0)) {
      throw errors.reference(`Cannot cancel material transfer: active Subcontracting Receipt or material return depends on BOM row ${rowId}`);
    }
  }
  if (checked(data.subcontracting_material_return)) {
    const order = await requireSubmitted<SubcontractingOrderData>(
      context as unknown as ControllerContext<JsonObject>, "Subcontracting Order", data.subcontracting_order!,
    );
    for (const required of order.data.supplied_items) {
      if ((remainingTransferred.get(required.bom_row_id) ?? 0) > required.required_qty_micros) {
        throw errors.reference(`Cannot cancel material return: replacement transfer depends on BOM row ${required.bom_row_id}`);
      }
    }
  }
}

async function assertOrderHasNoActiveExecution(
  context: ControllerContext<SubcontractingOrderData>,
  orderName: string,
): Promise<void> {
  const [transfers, receipts] = await Promise.all([
    context.reader.listDocumentsByDoctype<SubcontractingStockEntryData>(context.command.tenant_id, "Stock Entry"),
    context.reader.listDocumentsByDoctype<SubcontractingReceiptData>(context.command.tenant_id, "Subcontracting Receipt"),
  ]);
  if (transfers.some((document) => document.docstatus === 1 && document.data.subcontracting_order === orderName)) {
    throw errors.reference("Cancel subcontracting material transfers before cancelling the Subcontracting Order");
  }
  if (receipts.some((document) => document.docstatus === 1 && document.data.subcontracting_order === orderName)) {
    throw errors.reference("Cancel Subcontracting Receipts before cancelling the Subcontracting Order");
  }
}

function reconcileSuppliedInput(
  expected: SubcontractingReceiptSuppliedItem[],
  supplied: SubcontractingReceiptSuppliedItem[] | undefined,
): SubcontractingReceiptSuppliedItem[] {
  if (!Array.isArray(supplied) || supplied.length === 0) return expected;
  if (supplied.length !== expected.length) throw errors.validation("Subcontracting supplied-material rows must match the frozen BOM snapshot");
  return expected.map((row) => {
    const candidate = supplied.find((item) => item.bom_row_id === row.bom_row_id && item.item_code === row.item_code);
    if (!candidate) throw errors.reference(`Missing supplied-material row for BOM row ${row.bom_row_id}`);
    const qty = candidate.consumed_qty_micros ?? toScaledInt(candidate.consumed_qty, 6);
    if (qty !== row.consumed_qty_micros) {
      throw errors.reference(`Consumed quantity for BOM row ${row.bom_row_id} must equal the cumulative BOM requirement`);
    }
    return {
      ...row,
      ...(candidate.serial_and_batch_bundle ? { serial_and_batch_bundle: candidate.serial_and_batch_bundle } : {}),
    };
  });
}

function assertBomEffective(bom: CanonicalDocument<VersionedBomData>, transactionDate: string): void {
  const date = transactionDate.slice(0, 10);
  if (bom.data.bom_status === "Retired" || bom.data.is_active === false || bom.data.is_active === 0) {
    throw errors.reference(`BOM ${bom.name} is not active`);
  }
  if (bom.data.effective_from && date < bom.data.effective_from) throw errors.reference(`BOM ${bom.name} is not effective at ${date}`);
  if (bom.data.effective_to && date > bom.data.effective_to) throw errors.reference(`BOM ${bom.name} is not effective at ${date}`);
}

async function currencyScaleFor(context: ControllerContext<JsonObject>, currency: string): Promise<number> {
  const master = await context.reader.getMasterRecordData(context.command.tenant_id, "Currency", currency);
  if (!master) throw errors.reference(`Currency ${currency} does not exist`);
  const scale = master.currency_scale;
  return typeof scale === "number" && Number.isSafeInteger(scale) ? scale : 2;
}

async function assertMaster(context: ControllerContext<JsonObject>, type: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
    throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
}

async function assertUnlocked(context: ControllerContext<JsonObject>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`);
}

async function requireSubmitted<T extends JsonObject>(
  context: ControllerContext<JsonObject>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

function requireExisting<T extends JsonObject>(context: ControllerContext<T>): CanonicalDocument<T> {
  if (!context.existing) throw errors.notFound();
  return context.existing;
}

function canonicalDocument<T extends JsonObject>(
  context: ControllerContext<T>,
  doctype: string,
  data: T,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<T> {
  return {
    tenant_id: context.command.tenant_id,
    doctype,
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children: extractChildren(doctype, data),
  };
}

function receiptEvent(
  context: ControllerContext<SubcontractingReceiptData>,
  data: SubcontractingReceiptData,
  status: string,
) {
  return domainEvent({
    type: `subcontracting_receipt.${context.command.action}`,
    tenantId: context.command.tenant_id,
    aggregate: context.command.aggregate,
    aggregateVersion: context.nextVersion,
    actor: context.command.actor.user_id,
    commandId: context.command.command_id,
    occurredAt: context.now,
    payload: { status, subcontracting_order: data.subcontracting_order, purchase_order: data.purchase_order },
  });
}

function extractChildren(doctype: string, data: JsonObject): ChildRow[] {
  const result: ChildRow[] = [];
  for (const [fieldname, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    value.forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const object = row as JsonObject;
      result.push({
        fieldname,
        child_doctype: `${doctype} ${fieldname.replace(/(^|_)(\w)/g, (_match, separator, letter) => `${separator ? " " : ""}${String(letter).toUpperCase()}`)}`,
        row_id: String(object.row_id ?? `${fieldname}-${index + 1}`),
        idx: index + 1,
        data: structuredClone(object),
      });
    });
  }
  return result;
}

function positiveMicros(value: unknown, field: string): number {
  const micros = toScaledInt(value as string | number, 6, field);
  if (micros <= 0) throw errors.validation(`${field} must be positive`);
  return micros;
}

function ratio(value: number, numerator: number, denominator: number): number {
  if (![value, numerator, denominator].every(Number.isSafeInteger) || denominator <= 0) {
    throw errors.validation("Subcontracting arithmetic exceeds safe integer bounds");
  }
  const result = divideRounded(BigInt(value) * BigInt(numerator), BigInt(denominator));
  return safeNumber(result);
}

function ratePerUnitMinor(valueMinor: number, qtyMicros: number): number {
  if (!Number.isSafeInteger(valueMinor) || !Number.isSafeInteger(qtyMicros) || qtyMicros <= 0) {
    throw errors.validation("Subcontracting valuation arithmetic exceeds safe integer bounds");
  }
  return safeNumber(divideRounded(BigInt(valueMinor) * 1_000_000n, BigInt(qtyMicros)));
}

function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw errors.validation("Subcontracting divisor must be positive");
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  return sign * (quotient + (remainder * 2n >= denominator ? 1n : 0n));
}

function safeNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw errors.validation("Subcontracting arithmetic exceeds safe integer range");
  return number;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation("Subcontracting arithmetic exceeds safe integer range");
  return result;
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || String(value ?? "").toLowerCase() === "true";
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
