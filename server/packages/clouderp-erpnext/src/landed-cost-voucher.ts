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
import { domainEvent } from "../../outbox/src/index.js";

export interface LandedCostVoucherReceiptRef extends JsonObject {
  row_id: string;
  purchase_receipt: string;
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
}

export interface LandedCostVoucherData extends JsonObject {
  posting_at: string;
  basis: ProcurementLandedCostBasis;
  total_cost: string;
  total_cost_minor?: number;
  landed_cost_account: string;
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
      await assertMaster(context, "Account", account);
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
      const sourceValue = sourceRows.reduce((sum, line) => safeAdd(sum, line.stock_value_difference_minor), 0);
      if (safeAdd(sourceValue, allocation.allocated_cost_minor) < 0) {
        throw errors.validation(`Landed Cost would make Purchase Receipt ${receipt.name} row ${allocation.row_id} negative in value`);
      }
      if (context.command.action === "submit") {
        await assertNoDownstreamConsumption(
          context,
          receipt.name,
          receipt.version,
          allocation.row_id,
          allocation.item_code,
          allocation.warehouse,
        );
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
      });
    }

    return {
      ...input,
      posting_at: postingAt,
      basis,
      total_cost: fromScaledInt(totalMinor, scale),
      total_cost_minor: totalMinor,
      landed_cost_account: account,
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
      if (amount === 0) continue;
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
        stock_value_difference_minor: amount,
        qty_scale: 6,
        currency_scale: scale,
        currency,
        posting_at: data.posting_at,
      });
      gl.push({
        line_key: `STOCK-${allocation.row_id}`,
        account: allocation.stock_account,
        debit_minor: amount > 0 ? amount : 0,
        credit_minor: amount < 0 ? -amount : 0,
        currency,
        currency_scale: scale,
        posting_at: data.posting_at,
        remarks: `Landed Cost for ${allocation.purchase_receipt} row ${allocation.purchase_receipt_row_id}`,
      });
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
    if (stock.length === 0 || gl.length === 0) throw errors.ledger("Committed Landed Cost ledger evidence is missing");

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

async function assertNoDownstreamConsumption(
  context: ControllerContext<LandedCostVoucherData>,
  receiptName: string,
  receiptRevision: number,
  rowId: string,
  itemCode: string,
  warehouse: string,
): Promise<void> {
  const history = await context.reader.getStockLedgerHistory(context.command.tenant_id, itemCode, warehouse);
  const indexes: number[] = [];
  history.forEach((line, index) => {
    if (line.source_voucher_type === "Purchase Receipt"
      && line.source_voucher_no === receiptName
      && line.source_voucher_revision === receiptRevision
      && line.source_row_id === rowId
      && line.actual_qty_micros > 0) indexes.push(index);
  });
  if (indexes.length === 0) throw errors.reference(`Purchase Receipt ${receiptName} row ${rowId} is absent from canonical Stock Ledger`);
  const last = Math.max(...indexes);
  if (history.slice(last + 1).some((line) => line.actual_qty_micros < 0)) {
    throw errors.reference(
      `Purchase Receipt ${receiptName} row ${rowId} has downstream stock consumption; historical COGS repost is required before Landed Cost can be applied safely`,
    );
  }
}

async function assertNoDownstreamConsumptionAfterVoucher(
  context: ControllerContext<LandedCostVoucherData>,
  existing: CanonicalDocument<LandedCostVoucherData>,
): Promise<void> {
  for (const allocation of existing.data.allocations ?? []) {
    if (allocation.allocated_cost_minor === 0) continue;
    const history = await context.reader.getStockLedgerHistory(
      context.command.tenant_id, allocation.item_code, allocation.warehouse,
    );
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

async function assertMaster(context: ControllerContext<LandedCostVoucherData>, type: string, name: string): Promise<void> {
  if (!await context.reader.hasMasterRecord(context.command.tenant_id, type, name)) {
    throw errors.reference(`${type} ${name} does not exist or is disabled`);
  }
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
  const text = typeof value === "string" || typeof value === "number" ? String(value).normalize("NFC").trim() : "";
  if (!text) throw errors.validation(`${field} is required`);
  return text;
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
