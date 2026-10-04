import type {
  CanonicalDocument,
  ChildRow,
  GeneralLedgerEntry,
  JsonObject,
  MutationPlan,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  planProcurementLandedCost,
  type ProcurementLandedCostBasis,
  type PurchaseReceiptData,
} from "../../clouderp-core/src/index.js";
import type { ControllerContext, DocumentController } from "../../document-kernel/src/index.js";
import { nextDocStatus } from "../../document-kernel/src/index.js";
import { reverseGl, reverseStock } from "../../ledger/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { valueIssue, replayValuation } from "../../clouderp-stock/src/valuation.js";
import { domainEvent } from "../../outbox/src/index.js";

export interface LandedCostVoucherReceiptRef extends JsonObject {
  row_id: string;
  purchase_receipt: string;
}

interface StockHistoryFingerprint extends JsonObject {
  item_code: string;
  warehouse: string;
  history_until: string;
  history_row_count: number;
  history_qty_micros: number;
  history_value_minor: number;
}

interface ChronologicalRepost extends JsonObject {
  posting_at: string;
  difference_minor: number;
  consumer: string;
  voucher_type: string;
  voucher_no: string;
  voucher_revision: number;
  row_id: string;
  kind?: "expense" | "transfer";
  target_warehouse?: string;
  target_voucher_type?: string;
  target_voucher_no?: string;
  target_voucher_revision?: number;
  target_row_id?: string;
}

export interface LandedCostVoucherAllocation extends JsonObject {
  row_id: string;
  purchase_receipt: string;
  purchase_receipt_revision: number;
  purchase_receipt_row_id: string;
  item_code: string;
  warehouse: string;
  stock_account: string;
  basis_units: number;
  allocated_cost_minor: number;
  source_qty_micros: number;
  remaining_qty_micros: number;
  inventory_cost_minor: number;
  consumed_cost_minor: number;
  history_until: string;
  chronological_reposts: ChronologicalRepost[];
  propagation_fingerprints?: StockHistoryFingerprint[];
  history_row_count: number;
  history_qty_micros: number;
  history_value_minor: number;
}

export interface LandedCostVoucherData extends JsonObject {
  posting_at: string;
  basis: ProcurementLandedCostBasis;
  total_cost: string;
  total_cost_minor?: number;
  landed_cost_account: string;
  /**
   * Required only when part of a receipt FIFO layer has already been consumed
   * before this voucher posts. That consumed landed-cost share is an expense/COGS
   * correction, not inventory.
   */
  repost_difference_account?: string;
  company?: string;
  currency?: string;
  currency_scale?: number;
  purchase_receipts: LandedCostVoucherReceiptRef[];
  allocations?: LandedCostVoucherAllocation[];
}

export class LandedCostVoucherController implements DocumentController<LandedCostVoucherData> {
  readonly doctype = "Landed Cost Voucher";

  async buildPlan(context: ControllerContext<LandedCostVoucherData>): Promise<MutationPlan<LandedCostVoucherData>> {
    if (context.command.action === "cancel") return this.cancelPlan(context);

    const data = await this.normalize(context);
    const docstatus = nextDocStatus(context.command.action);
    const status = docstatus === 0 ? "Draft" : "Submitted";
    const document = canonicalDocument(context, data, docstatus, status);
    const ledger = context.command.action === "submit" ? await this.submitLedger(context, data) : { stock: [], gl: [] };

    return {
      command: context.command,
      document,
      gl_entries: ledger.gl,
      stock_entries: ledger.stock,
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [landedCostEvent(context, status, data)],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }

  private async normalize(context: ControllerContext<LandedCostVoucherData>): Promise<LandedCostVoucherData> {
    const input = context.command.document;
    const postingAt = requiredText(input.posting_at, "posting_at");
    const account = requiredText(input.landed_cost_account, "landed_cost_account");
    const repostDifferenceAccount = optionalText(input.repost_difference_account);
    const basis = input.basis;
    if (!["amount", "quantity", "weight"].includes(basis)) throw errors.validation("Landed Cost basis must be amount, quantity or weight");

    const refs = normalizeReceiptRefs(input.purchase_receipts);
    const receipts = await Promise.all(refs.map((row) =>
      requireSubmitted<PurchaseReceiptData>(context, "Purchase Receipt", row.purchase_receipt)));

    const first = receipts[0]!;
    const scale = safeScale(first.data.currency_scale ?? 2);
    const totalMinor = toScaledInt(input.total_cost, scale, "total_cost");
    if (totalMinor === 0) throw errors.validation("Landed Cost total cannot be zero");

    const allocationPlan = planProcurementLandedCost(totalMinor, basis, receipts);
    if (context.command.action === "submit") {
      assertNotFuture(postingAt, context.now);
      await assertUnlocked(context, allocationPlan.company, postingAt);
      await assertPostingAccount(context, account, allocationPlan.company);
      if (repostDifferenceAccount) await assertPostingAccount(context, repostDifferenceAccount, allocationPlan.company);
    }

    const receiptByName = new Map(receipts.map((receipt) => [receipt.name, receipt]));
    const stockByReceipt = new Map<string, StockLedgerEntry[]>();
    for (const receipt of receipts) {
      if (postingAt < receipt.data.posting_at) {
        throw errors.reference(`Landed Cost cannot post before Purchase Receipt ${receipt.name}`);
      }
      const rows = await context.reader.getVoucherStockEntries(
        context.command.tenant_id, "Purchase Receipt", receipt.name, receipt.version,
      );
      stockByReceipt.set(receipt.name, rows);
    }

    const allocations: LandedCostVoucherAllocation[] = [];
    for (const [index, allocation] of allocationPlan.allocations.entries()) {
      const receipt = receiptByName.get(allocation.purchase_receipt)!;
      const stockAccount = requiredText(receipt.data.stock_account, `Purchase Receipt ${receipt.name} stock_account`);
      if (context.command.action === "submit") await assertPostingAccount(context, stockAccount, allocationPlan.company);
      const sourceRows = (stockByReceipt.get(receipt.name) ?? []).filter((line) =>
        line.source_row_id === allocation.row_id && line.actual_qty_micros > 0);
      if (sourceRows.length === 0) {
        throw errors.reference(
          `Purchase Receipt ${receipt.name} row ${allocation.row_id} has no canonical source-row stock identity; landed-cost application is unsafe`,
        );
      }
      if (sourceRows.some((line) => line.item_code !== allocation.item_code || line.warehouse !== allocation.warehouse)) {
        throw errors.reference(`Purchase Receipt ${receipt.name} row ${allocation.row_id} stock identity is inconsistent`);
      }
      if (context.command.action === "submit" && sourceRows.some((line) => line.batch_no || line.serial_no)) {
        throw errors.reference("Landed Cost batch/serial propagation requires a dimension-aware repost and is not supported");
      }
      const sourceValue = sourceRows.reduce((sum, line) => safeAdd(sum, line.stock_value_difference_minor), 0);
      if (safeAdd(sourceValue, allocation.allocated_cost_minor) < 0) {
        throw errors.validation(`Landed Cost would make Purchase Receipt ${receipt.name} row ${allocation.row_id} negative in value`);
      }

      const history = await context.reader.getStockLedgerHistory(
        context.command.tenant_id,
        allocation.item_code,
        allocation.warehouse,
      );

      const historyThroughPosting = history.filter((line) => line.posting_at <= postingAt);
      const sourceQty = sourceRows.reduce((sum, line) => safeAdd(sum, line.actual_qty_micros), 0);
      const position = fifoSourcePosition(
        historyThroughPosting,
        "Purchase Receipt",
        receipt.name,
        receipt.version,
        allocation.row_id,
      );
      if (position.remaining_qty_micros > sourceQty) {
        throw errors.ledger(`Purchase Receipt ${receipt.name} row ${allocation.row_id} FIFO position exceeds its source quantity`);
      }

      if (context.command.action === "submit" && position.consumed_by.length > 0) {
        await assertSupportedHistoricalConsumers(context, allocation.item_code, position.consumed_by);
      }

      const inventoryCost = prorateMinor(
        allocation.allocated_cost_minor,
        position.remaining_qty_micros,
        sourceQty,
      );
      const consumedCost = safeAdd(allocation.allocated_cost_minor, -inventoryCost);
      if (context.command.action === "submit" && consumedCost !== 0 && !repostDifferenceAccount) {
        throw errors.reference(
          `Landed Cost for ${receipt.name} row ${allocation.row_id} has already-consumed FIFO quantity; repost_difference_account is required for the historical COGS/expense correction`,
        );
      }

      if (context.command.action === "submit") {
        const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", allocation.item_code);
        if (String(item?.valuation_method ?? "FIFO").trim().toLowerCase() !== "fifo") {
          throw errors.reference("Landed Cost receipt-row allocation currently supports FIFO items only");
        }
      }
      const chronologicalReposts: ChronologicalRepost[] = [];
      const propagationFingerprints: StockHistoryFingerprint[] = [];
      if (context.command.action === "submit" && inventoryCost !== 0) {
        const adjustment: StockLedgerEntry = {
          line_key: "PLANNED-LCV", item_code: allocation.item_code, warehouse: allocation.warehouse,
          actual_qty_micros: 0, valuation_rate_minor: 0, stock_value_difference_minor: inventoryCost,
          qty_scale: 6, currency_scale: scale, currency: allocationPlan.currency, posting_at: postingAt,
          valuation_target_voucher_type: "Purchase Receipt", valuation_target_voucher_no: receipt.name,
          valuation_target_voucher_revision: receipt.version, valuation_target_row_id: allocation.row_id,
        };
        const updated = replayValuation([...historyThroughPosting, adjustment], "FIFO", scale);
        if (updated.layers.some((layer) => layer.value_minor < 0)) {
          throw errors.validation("Landed Cost cumulative adjustments would make an open FIFO layer negative");
        }
        for (let i = 0; i < history.length; i++) {
          const line = history[i]!;
          if (line.posting_at <= postingAt || line.actual_qty_micros >= 0) continue;
          const prefix = history.slice(0, i);
          const oldValue = valueIssue(prefix, -line.actual_qty_micros, "FIFO", scale).stock_value_difference_minor;
          const newValue = valueIssue([...prefix, adjustment], -line.actual_qty_micros, "FIFO", scale).stock_value_difference_minor;
          const difference = safeAdd(newValue, -oldValue);
          if (difference === 0) continue;
          const consumerPlan = await planChronologicalConsumer(
            context,
            allocation.item_code,
            line,
            difference,
            scale,
            allocationPlan.currency,
          );
          await assertUnlocked(context, allocationPlan.company, line.posting_at);
          if (consumerPlan.kind === "expense" && !repostDifferenceAccount) {
            throw errors.reference("repost_difference_account is required for chronological COGS correction");
          }
          chronologicalReposts.push({
            posting_at: line.posting_at,
            difference_minor: difference,
            consumer: `${line.source_voucher_type}:${line.source_voucher_no}:${line.line_key}`,
            voucher_type: requiredText(line.source_voucher_type, "consumer voucher type"),
            voucher_no: requiredText(line.source_voucher_no, "consumer voucher no"),
            voucher_revision: line.source_voucher_revision ?? 0,
            row_id: line.source_row_id ?? line.line_key,
            kind: consumerPlan.kind,
            ...(consumerPlan.target ? {
              target_warehouse: consumerPlan.target.warehouse,
              target_voucher_type: consumerPlan.target.voucher_type,
              target_voucher_no: consumerPlan.target.voucher_no,
              target_voucher_revision: consumerPlan.target.voucher_revision,
              target_row_id: consumerPlan.target.row_id,
            } : {}),
          });
          if (consumerPlan.fingerprint) {
            const key = `${consumerPlan.fingerprint.item_code}\u0000${consumerPlan.fingerprint.warehouse}`;
            if (!propagationFingerprints.some((fingerprint) =>
              `${fingerprint.item_code}\u0000${fingerprint.warehouse}` === key)) {
              propagationFingerprints.push(consumerPlan.fingerprint);
            }
          }
        }
        const before = replayValuation(history, "FIFO", scale);
        const after = replayValuation([...history, adjustment], "FIFO", scale);
        const ledgerChange = chronologicalReposts.reduce((sum, row) => safeAdd(sum, row.difference_minor), inventoryCost);
        if (after.layers.some((layer) => layer.value_minor < 0) || safeAdd(after.value_minor, -before.value_minor) !== ledgerChange) {
          throw errors.ledger("Chronological Landed Cost ledger and FIFO replay do not reconcile");
        }
      }

      if (chronologicalReposts.length > 0 && allocationPlan.allocations.filter((other) =>
        other.item_code === allocation.item_code && other.warehouse === allocation.warehouse).length > 1) {
        throw errors.reference("Chronological Landed Cost requires one source allocation per item and warehouse to preserve sequential rounding");
      }
      allocations.push({
        row_id: `ALLOC-${index + 1}`,
        purchase_receipt: receipt.name,
        purchase_receipt_revision: receipt.version,
        purchase_receipt_row_id: allocation.row_id,
        item_code: allocation.item_code,
        warehouse: allocation.warehouse,
        stock_account: stockAccount,
        basis_units: allocation.basis_units,
        allocated_cost_minor: allocation.allocated_cost_minor,
        source_qty_micros: sourceQty,
        remaining_qty_micros: position.remaining_qty_micros,
        inventory_cost_minor: inventoryCost,
        consumed_cost_minor: consumedCost,
        history_until: "9999-12-31T23:59:59.999Z",
        chronological_reposts: chronologicalReposts,
        propagation_fingerprints: propagationFingerprints,
        history_row_count: history.length,
        history_qty_micros: history.reduce((sum, line) => safeAdd(sum, line.actual_qty_micros), 0),
        history_value_minor: history.reduce((sum, line) => safeAdd(sum, line.stock_value_difference_minor), 0),
      });
    }

    return {
      ...input,
      posting_at: postingAt,
      basis,
      total_cost: fromScaledInt(totalMinor, scale),
      total_cost_minor: totalMinor,
      landed_cost_account: account,
      ...(repostDifferenceAccount ? { repost_difference_account: repostDifferenceAccount } : {}),
      company: allocationPlan.company,
      currency: allocationPlan.currency,
      currency_scale: allocationPlan.currency_scale,
      purchase_receipts: refs,
      allocations,
    };
  }

  private async submitLedger(
    _context: ControllerContext<LandedCostVoucherData>,
    data: LandedCostVoucherData,
  ): Promise<{ stock: StockLedgerEntry[]; gl: GeneralLedgerEntry[] }> {
    const currency = requiredText(data.currency, "currency");
    const scale = safeScale(data.currency_scale ?? 2);
    const allocations = data.allocations ?? [];
    const stock: StockLedgerEntry[] = [];
    const gl: GeneralLedgerEntry[] = [];

    for (const allocation of allocations) {
      const amount = allocation.allocated_cost_minor;
      const inventoryAmount = allocation.inventory_cost_minor ?? amount;
      const consumedAmount = allocation.consumed_cost_minor ?? 0;
      if (amount === 0) continue;

      if (inventoryAmount !== 0) {
        stock.push({
          line_key: `LCV-${allocation.row_id}`,
          source_row_id: allocation.row_id,
          valuation_target_voucher_type: "Purchase Receipt",
          valuation_target_voucher_no: allocation.purchase_receipt,
          valuation_target_voucher_revision: allocation.purchase_receipt_revision,
          valuation_target_row_id: allocation.purchase_receipt_row_id,
          item_code: allocation.item_code,
          warehouse: allocation.warehouse,
          actual_qty_micros: 0,
          valuation_rate_minor: 0,
          stock_value_difference_minor: inventoryAmount,
          qty_scale: 6,
          currency_scale: scale,
          currency,
          posting_at: data.posting_at,
        });
        gl.push({
          line_key: `STOCK-${allocation.row_id}`,
          account: allocation.stock_account,
          debit_minor: inventoryAmount > 0 ? inventoryAmount : 0,
          credit_minor: inventoryAmount < 0 ? -inventoryAmount : 0,
          currency,
          currency_scale: scale,
          posting_at: data.posting_at,
          remarks: `Landed Cost inventory share for ${allocation.purchase_receipt} row ${allocation.purchase_receipt_row_id}`,
        });
      }

      if (consumedAmount !== 0) {
        const differenceAccount = requiredText(data.repost_difference_account, "repost_difference_account");
        gl.push({
          line_key: `REPOST-${allocation.row_id}`,
          account: differenceAccount,
          debit_minor: consumedAmount > 0 ? consumedAmount : 0,
          credit_minor: consumedAmount < 0 ? -consumedAmount : 0,
          currency,
          currency_scale: scale,
          posting_at: data.posting_at,
          remarks: `Historical landed-cost COGS/expense correction for ${allocation.purchase_receipt} row ${allocation.purchase_receipt_row_id}`,
        });
      }

      for (const [index, repost] of (allocation.chronological_reposts ?? []).entries()) {
        const difference = repost.difference_minor;
        stock.push({
          line_key: `LCV-REPOST-${allocation.row_id}-${index + 1}`, source_row_id: allocation.row_id,
          valuation_target_voucher_type: repost.voucher_type, valuation_target_voucher_no: repost.voucher_no,
          valuation_target_voucher_revision: repost.voucher_revision, valuation_target_row_id: repost.row_id,
          item_code: allocation.item_code, warehouse: allocation.warehouse, actual_qty_micros: 0,
          valuation_rate_minor: 0, stock_value_difference_minor: difference,
          qty_scale: 6, currency_scale: scale, currency, posting_at: repost.posting_at,
        });
        if (repost.kind === "transfer") {
          stock.push({
            line_key: `LCV-TRANSFER-IN-${allocation.row_id}-${index + 1}`,
            source_row_id: allocation.row_id,
            valuation_target_voucher_type: requiredText(repost.target_voucher_type, "transfer target voucher type"),
            valuation_target_voucher_no: requiredText(repost.target_voucher_no, "transfer target voucher no"),
            valuation_target_voucher_revision: repost.target_voucher_revision ?? 0,
            valuation_target_row_id: requiredText(repost.target_row_id, "transfer target row"),
            item_code: allocation.item_code,
            warehouse: requiredText(repost.target_warehouse, "transfer target warehouse"),
            actual_qty_micros: 0,
            valuation_rate_minor: 0,
            stock_value_difference_minor: -difference,
            qty_scale: 6,
            currency_scale: scale,
            currency,
            posting_at: repost.posting_at,
          });
          continue;
        }
        gl.push({ line_key: `CHRONO-STOCK-${allocation.row_id}-${index + 1}`, account: allocation.stock_account,
          debit_minor: difference > 0 ? difference : 0, credit_minor: difference < 0 ? -difference : 0,
          currency, currency_scale: scale, posting_at: repost.posting_at, remarks: `Chronological stock correction for ${repost.consumer}` });
        gl.push({ line_key: `CHRONO-COGS-${allocation.row_id}-${index + 1}`, account: requiredText(data.repost_difference_account, "repost_difference_account"),
          debit_minor: difference < 0 ? -difference : 0, credit_minor: difference > 0 ? difference : 0,
          currency, currency_scale: scale, posting_at: repost.posting_at, remarks: `Chronological COGS correction for ${repost.consumer}` });
      }

      gl.push({
        line_key: `LANDED-${allocation.row_id}`,
        account: data.landed_cost_account,
        debit_minor: amount < 0 ? -amount : 0,
        credit_minor: amount > 0 ? amount : 0,
        currency,
        currency_scale: scale,
        posting_at: data.posting_at,
        remarks: `Landed Cost capitalization for ${allocation.purchase_receipt}`,
      });
    }
    return { stock, gl };
  }

  private async cancelPlan(context: ControllerContext<LandedCostVoucherData>): Promise<MutationPlan<LandedCostVoucherData>> {
    const existing = context.existing;
    if (!existing || existing.docstatus !== 1) throw errors.lifecycle("Only a submitted Landed Cost Voucher can be cancelled");
    const data = structuredClone(existing.data);
    await assertUnlocked(context, requiredText(data.company, "company"), data.posting_at);
    await assertNoDownstreamConsumptionAfterVoucher(context, existing);

    const [stock, gl] = await Promise.all([
      context.reader.getVoucherStockEntries(
        context.command.tenant_id, this.doctype, context.command.aggregate.name, existing.version,
      ),
      context.reader.getVoucherGlEntries(
        context.command.tenant_id, this.doctype, context.command.aggregate.name, existing.version,
      ),
    ]);
    const expectsStock = (data.allocations ?? []).some((allocation) =>
      (allocation.inventory_cost_minor ?? allocation.allocated_cost_minor) !== 0);
    if ((expectsStock && stock.length === 0) || gl.length === 0) {
      throw errors.ledger("Committed Landed Cost ledger evidence is missing");
    }

    const docstatus = nextDocStatus("cancel");
    const status = "Cancelled";
    const document = canonicalDocument(context, data, docstatus, status);
    return {
      command: context.command,
      document,
      stock_entries: reverseStock(stock),
      gl_entries: reverseGl(gl),
      payment_entries: [],
      fulfillment_entries: [],
      procurement_entries: [],
      stock_bundle_usages: [],
      events: [landedCostEvent(context, status, data)],
      result: { doctype: this.doctype, name: document.name, version: document.version, docstatus, status },
    };
  }
}

interface FifoSourcePosition {
  remaining_qty_micros: number;
  consumed_by: StockLedgerEntry[];
}

function fifoSourcePosition(
  history: StockLedgerEntry[],
  voucherType: string,
  voucherName: string,
  voucherRevision: number,
  rowId: string,
): FifoSourcePosition {
  const layers: Array<{ qty_micros: number; target: boolean }> = [];
  const consumedBy: StockLedgerEntry[] = [];
  for (const line of history) {
    if (line.actual_qty_micros > 0) {
      layers.push({
        qty_micros: line.actual_qty_micros,
        target: line.source_voucher_type === voucherType
          && line.source_voucher_no === voucherName
          && line.source_voucher_revision === voucherRevision
          && line.source_row_id === rowId,
      });
      continue;
    }
    if (line.actual_qty_micros >= 0) continue;
    let remaining = -line.actual_qty_micros;
    let consumedTarget = false;
    while (remaining > 0) {
      const layer = layers[0];
      if (!layer) throw errors.reference("Historical FIFO layers are incomplete during Landed Cost repost planning");
      const take = Math.min(remaining, layer.qty_micros);
      if (layer.target && take > 0) consumedTarget = true;
      layer.qty_micros -= take;
      remaining -= take;
      if (layer.qty_micros === 0) layers.shift();
    }
    if (consumedTarget) consumedBy.push(line);
  }
  return {
    remaining_qty_micros: layers.filter((layer) => layer.target)
      .reduce((sum, layer) => safeAdd(sum, layer.qty_micros), 0),
    consumed_by: consumedBy,
  };
}

async function planChronologicalConsumer(
  context: ControllerContext<LandedCostVoucherData>,
  itemCode: string,
  line: StockLedgerEntry,
  difference: number,
  currencyScale: number,
  currency: string,
): Promise<{
  kind: "expense" | "transfer";
  target?: { warehouse: string; voucher_type: string; voucher_no: string; voucher_revision: number; row_id: string };
  fingerprint?: StockHistoryFingerprint;
}> {
  if (line.source_voucher_type !== "Stock Entry" || !line.source_voucher_no) {
    await assertSupportedHistoricalConsumers(context, itemCode, [line]);
    return { kind: "expense" };
  }

  const source = await context.reader.getDocument<JsonObject>(
    context.command.tenant_id,
    "Stock Entry",
    line.source_voucher_no,
  );
  if (!source || source.docstatus !== 1 || source.data.purpose !== "Material Transfer") {
    await assertSupportedHistoricalConsumers(context, itemCode, [line]);
    return { kind: "expense" };
  }

  const rowId = requiredText(line.source_row_id, "Material Transfer source row identity");
  const revision = line.source_voucher_revision ?? 0;
  if (revision <= 0) throw errors.reference("Material Transfer source revision is required for Landed Cost propagation");
  const voucherRows = await context.reader.getVoucherStockEntries(
    context.command.tenant_id,
    "Stock Entry",
    line.source_voucher_no,
    revision,
  );
  const targets = voucherRows.filter((row) =>
    row.item_code === itemCode
    && row.source_row_id === rowId
    && row.actual_qty_micros > 0
    && row.warehouse !== line.warehouse);
  if (targets.length !== 1) {
    throw errors.reference(
      `Material Transfer ${line.source_voucher_no} row ${rowId} must have exactly one destination stock row for Landed Cost propagation`,
    );
  }
  const target = targets[0]!;
  if (target.batch_no || target.serial_no) {
    throw errors.reference("Material Transfer Landed Cost propagation does not yet support batch/serial destination layers");
  }

  const targetHistory = await context.reader.getStockLedgerHistory(
    context.command.tenant_id,
    itemCode,
    target.warehouse,
  );
  const targetPosition = fifoSourcePosition(
    targetHistory,
    "Stock Entry",
    line.source_voucher_no,
    revision,
    rowId,
  );
  if (targetPosition.remaining_qty_micros !== target.actual_qty_micros) {
    throw errors.reference(
      `Material Transfer ${line.source_voucher_no} destination layer has downstream consumption; recursive Landed Cost propagation is required`,
    );
  }
  const targetAdjustment: StockLedgerEntry = {
    line_key: "PLANNED-LCV-TRANSFER-IN",
    item_code: itemCode,
    warehouse: target.warehouse,
    actual_qty_micros: 0,
    valuation_rate_minor: 0,
    stock_value_difference_minor: -difference,
    qty_scale: 6,
    currency_scale: currencyScale,
    currency,
    posting_at: line.posting_at,
    valuation_target_voucher_type: "Stock Entry",
    valuation_target_voucher_no: line.source_voucher_no,
    valuation_target_voucher_revision: revision,
    valuation_target_row_id: rowId,
  };
  const after = replayValuation([...targetHistory, targetAdjustment], "FIFO", currencyScale);
  if (after.layers.some((layer) => layer.value_minor < 0)) {
    throw errors.validation("Landed Cost transfer propagation would make a destination FIFO layer negative");
  }

  return {
    kind: "transfer",
    target: {
      warehouse: target.warehouse,
      voucher_type: "Stock Entry",
      voucher_no: line.source_voucher_no,
      voucher_revision: revision,
      row_id: rowId,
    },
    fingerprint: {
      item_code: itemCode,
      warehouse: target.warehouse,
      history_until: "9999-12-31T23:59:59.999Z",
      history_row_count: targetHistory.length,
      history_qty_micros: targetHistory.reduce((sum, row) => safeAdd(sum, row.actual_qty_micros), 0),
      history_value_minor: targetHistory.reduce((sum, row) => safeAdd(sum, row.stock_value_difference_minor), 0),
    },
  };
}

async function assertSupportedHistoricalConsumers(
  context: ControllerContext<LandedCostVoucherData>,
  itemCode: string,
  consumers: StockLedgerEntry[],
): Promise<void> {
  const item = await context.reader.getMasterRecordData(context.command.tenant_id, "Item", itemCode);
  const method = String(item?.valuation_method ?? "FIFO").trim().toLowerCase();
  if (method !== "fifo") {
    throw errors.reference("Historical Landed Cost repost currently supports FIFO items only");
  }
  for (const line of consumers) {
    if (!line.source_voucher_no) {
      throw errors.reference("Historical Landed Cost repost consumer has no source voucher identity");
    }
    if (line.source_voucher_type === "Delivery Note") {
      const delivery = await context.reader.getDocument<JsonObject>(
        context.command.tenant_id,
        "Delivery Note",
        line.source_voucher_no,
      );
      if (!delivery || delivery.docstatus !== 1) {
        throw errors.reference(
          `Historical Landed Cost repost cannot expense cancelled or missing Delivery Note ${line.source_voucher_no}`,
        );
      }
      continue;
    }
    if (line.source_voucher_type !== "Stock Entry") {
      throw errors.reference(
        `Historical Landed Cost repost cannot expense ${line.source_voucher_type} ${line.source_voucher_no}; transfer/manufacturing chains still require chronological repost`,
      );
    }
    const source = await context.reader.getDocument<JsonObject>(
      context.command.tenant_id,
      "Stock Entry",
      line.source_voucher_no,
    );
    if (!source || source.docstatus !== 1 || source.data.purpose !== "Material Issue") {
      throw errors.reference(
        `Historical Landed Cost repost cannot expense ${line.source_voucher_type} ${line.source_voucher_no}; transfer/manufacturing/cancelled chains still require chronological repost`,
      );
    }
  }
}

function prorateMinor(amount: number, numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)
    || numerator < 0 || denominator <= 0 || numerator > denominator) {
    throw errors.validation("Landed Cost repost ratio is invalid");
  }
  const negative = amount < 0;
  const absolute = BigInt(negative ? -amount : amount) * BigInt(numerator);
  const divisor = BigInt(denominator);
  const rounded = absolute / divisor + ((absolute % divisor) * 2n >= divisor ? 1n : 0n);
  const result = Number(negative ? -rounded : rounded);
  if (!Number.isSafeInteger(result)) throw errors.validation("Landed Cost repost arithmetic exceeds safe integer range");
  return result;
}

async function assertNoDownstreamConsumptionAfterVoucher(
  context: ControllerContext<LandedCostVoucherData>,
  existing: CanonicalDocument<LandedCostVoucherData>,
): Promise<void> {
  for (const allocation of existing.data.allocations ?? []) {
    if ((allocation.inventory_cost_minor ?? allocation.allocated_cost_minor) === 0) continue;
    const history = await context.reader.getStockLedgerHistory(
      context.command.tenant_id, allocation.item_code, allocation.warehouse,
    );
    if ((allocation.chronological_reposts ?? []).length > 0) {
      const external = history.filter((line) => !(line.source_voucher_type === "Landed Cost Voucher" && line.source_voucher_no === existing.name));
      if (external.length !== allocation.history_row_count
        || external.reduce((sum, line) => safeAdd(sum, line.actual_qty_micros), 0) !== allocation.history_qty_micros
        || external.reduce((sum, line) => safeAdd(sum, line.stock_value_difference_minor), 0) !== allocation.history_value_minor) {
        throw errors.reference("Chronological Landed Cost cannot cancel after additional stock mutations; repost is required");
      }
      continue;
    }
    const index = history.findIndex((line) =>
      line.source_voucher_type === "Landed Cost Voucher"
      && line.source_voucher_no === existing.name
      && line.source_voucher_revision === existing.version
      && line.source_row_id === allocation.row_id);
    if (index < 0) throw errors.ledger(`Landed Cost stock evidence for ${allocation.row_id} is missing`);
    if (history.slice(index + 1).some((line) => line.actual_qty_micros < 0)) {
      throw errors.reference(
        `Landed Cost Voucher ${existing.name} has downstream stock consumption; historical COGS repost is required before cancellation`,
      );
    }
  }
}

function normalizeReceiptRefs(value: unknown): LandedCostVoucherReceiptRef[] {
  if (!Array.isArray(value) || value.length === 0) throw errors.validation("At least one Purchase Receipt is required");
  const seen = new Set<string>();
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw errors.validation(`purchase_receipts[${index}] is invalid`);
    const source = raw as JsonObject;
    const name = requiredText(source.purchase_receipt, `purchase_receipts[${index}].purchase_receipt`);
    if (seen.has(name)) throw errors.validation(`Duplicate Purchase Receipt ${name}`);
    seen.add(name);
    return { row_id: requiredText(source.row_id ?? `RECEIPT-${index + 1}`, "row_id"), purchase_receipt: name };
  });
}

async function requireSubmitted<T extends JsonObject>(
  context: ControllerContext<LandedCostVoucherData>,
  doctype: string,
  name: string,
): Promise<CanonicalDocument<T>> {
  const document = await context.reader.getDocument<T>(context.command.tenant_id, doctype, name);
  if (!document || document.docstatus !== 1) throw errors.reference(`Submitted ${doctype} ${name} is required`);
  return document;
}

async function assertPostingAccount(
  context: ControllerContext<LandedCostVoucherData>, name: string, company: string,
): Promise<void> {
  // An edited/cancelled canonical Account overrides legacy master data of the same name.
  const document = await context.reader.getDocument<JsonObject>(context.command.tenant_id, "Account", name);
  const account = document?.data ?? await context.reader.getMasterRecordData(context.command.tenant_id, "Account", name);
  if (!account || document?.docstatus === 2 || checked(account.disabled)) {
    throw errors.reference(`Account ${name} does not exist or is disabled`);
  }
  if (checked(account.is_group)) throw errors.reference(`Account ${name} must be a posting account`);
  const ownerCompany = optionalText(account.company);
  if (ownerCompany && ownerCompany !== company) throw errors.reference(`Account ${name} belongs to another company`);
}

function checked(value: unknown): boolean {
  return value === true || value === 1 || value === "1"
    || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

async function assertUnlocked(context: ControllerContext<LandedCostVoucherData>, company: string, postingAt: string): Promise<void> {
  if (context.command.actor.roles.includes("System Manager") || context.command.actor.user_id === "Administrator") return;
  const lock = await context.reader.getPeriodLockDate(context.command.tenant_id, company);
  if (lock && postingAt.slice(0, 10) <= lock) throw errors.validation(`Posting date ${postingAt.slice(0, 10)} is locked for ${company}`);
}

function assertNotFuture(postingAt: string, now: string): void {
  const posting = Date.parse(postingAt);
  const current = Date.parse(now);
  if (!Number.isFinite(posting) || !Number.isFinite(current)) throw errors.validation("Landed Cost posting_at must be a valid timestamp");
  if (posting > current) throw errors.validation("Landed Cost posting_at cannot be in the future");
}

function canonicalDocument(
  context: ControllerContext<LandedCostVoucherData>,
  data: LandedCostVoucherData,
  docstatus: 0 | 1 | 2,
  status: string,
): CanonicalDocument<LandedCostVoucherData> {
  return {
    tenant_id: context.command.tenant_id,
    doctype: "Landed Cost Voucher",
    name: context.command.aggregate.name,
    owner: context.existing?.owner ?? context.command.actor.user_id,
    docstatus,
    status,
    version: context.nextVersion,
    created_at: context.existing?.created_at ?? context.now,
    modified_at: context.now,
    data,
    children: extractChildren(data),
  };
}

function extractChildren(data: LandedCostVoucherData): ChildRow[] {
  const result: ChildRow[] = [];
  for (const [fieldname, value] of Object.entries(data)) {
    if (!Array.isArray(value)) continue;
    value.forEach((row, index) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      const object = row as JsonObject;
      result.push({
        fieldname,
        child_doctype: fieldname === "purchase_receipts" ? "Landed Cost Voucher Receipt" : "Landed Cost Voucher Allocation",
        row_id: String(object.row_id ?? `${fieldname}-${index + 1}`),
        idx: index + 1,
        data: structuredClone(object),
      });
    });
  }
  return result;
}

function landedCostEvent(context: ControllerContext<LandedCostVoucherData>, status: string, data: LandedCostVoucherData) {
  return domainEvent({
    type: `landed_cost_voucher.${context.command.action}`,
    tenantId: context.command.tenant_id,
    aggregate: context.command.aggregate,
    aggregateVersion: context.nextVersion,
    actor: context.command.actor.user_id,
    commandId: context.command.command_id,
    occurredAt: context.now,
    payload: {
      status,
      total_cost_minor: data.total_cost_minor ?? 0,
      purchase_receipts: data.purchase_receipts.map((row) => row.purchase_receipt),
    },
  });
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value);
  if (!text) throw errors.validation(`${field} is required`);
  return text;
}

function optionalText(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).normalize("NFC").trim()
    : "";
}

function safeScale(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 6) {
    throw errors.validation("Currency scale is invalid");
  }
  return value;
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw errors.validation("Landed Cost arithmetic exceeds safe integer range");
  return result;
}
