import type {
  CanonicalDocument,
  DomainEvent,
  GeneralLedgerEntry,
  FulfillmentEntry,
  JsonObject,
  MutationCommand,
  MutationPlan,
  MutationReceipt,
  MutationSnapshot,
  PaymentLedgerEntry,
  ProcurementEntry,
  StockBundleUsageEntry,
  ReturnEntry,
  ManufacturingEntry,
  AssetDepreciationEntry,
  AssetLifecycleEntry,
  ProjectTimeEntry,
  PosSalesEntry,
  BankReconciliationEntry,
  StockLedgerEntry,
} from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import { fromScaledInt, toScaledInt } from "../../money/src/index.js";
import { deriveDeliveryNoteStatus, deriveO2CStatus } from "./status.js";
import { deriveSalesOrderProgress } from "./sales-order-progress.js";
import type { MutationStore, SubmittedQuantityQuery, TrackedStockPosition, TrackedStockState } from "./store.js";

class KeyedMutex {
  private tails = new Map<string, Promise<void>>();

  async run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    try { return await work(); }
    finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

interface BundleCheckpoint {
  documents: Array<[string, CanonicalDocument]>;
  receipts: Array<[string, MutationReceipt]>;
  glEntriesLength: number;
  voucherGlEntriesLength: number;
  stockEntriesLength: number;
  voucherStockEntriesLength: number;
  paymentEntriesLength: number;
  fulfillmentEntriesLength: number;
  lineFulfillmentEntriesLength: number;
  procurementEntriesLength: number;
  stockBundleUsagesLength: number;
  returnEntriesLength: number;
  manufacturingEntriesLength: number;
  assetDepreciationEntriesLength: number;
  assetLifecycleEntriesLength: number;
  projectTimeEntriesLength: number;
  posSalesEntriesLength: number;
  bankReconciliationEntriesLength: number;
  eventsLength: number;
}

export class InMemoryMutationStore implements MutationStore {
  private readonly documents = new Map<string, CanonicalDocument>();
  private readonly receipts = new Map<string, MutationReceipt>();
  private readonly glEntries: GeneralLedgerEntry[] = [];
  private readonly voucherGlEntries: Array<{
    tenant_id: string;
    voucher_type: string;
    voucher_no: string;
    voucher_revision: number;
    line: GeneralLedgerEntry;
  }> = [];
  private readonly stockEntries: StockLedgerEntry[] = [];
  private readonly voucherStockEntries: Array<{
    tenant_id: string;
    voucher_type: string;
    voucher_no: string;
    voucher_revision: number;
    line: StockLedgerEntry;
  }> = [];
  private readonly paymentEntries: PaymentLedgerEntry[] = [];
  private readonly fulfillmentEntries: FulfillmentEntry[] = [];
  private readonly lineFulfillmentEntries: FulfillmentEntry[] = [];
  private readonly procurementEntries: ProcurementEntry[] = [];
  private readonly stockBundleUsages: StockBundleUsageEntry[] = [];
  private readonly returnEntries: ReturnEntry[] = [];
  private readonly manufacturingEntries: ManufacturingEntry[] = [];
  private readonly assetDepreciationEntries: AssetDepreciationEntry[] = [];
  private readonly assetLifecycleEntries: AssetLifecycleEntry[] = [];
  private readonly projectTimeEntries: ProjectTimeEntry[] = [];
  private readonly posSalesEntries: PosSalesEntry[] = [];
  private readonly bankReconciliationEntries: BankReconciliationEntry[] = [];
  private readonly events: DomainEvent[] = [];
  private readonly masterRecords = new Map<string, JsonObject>();
  private readonly periodLocks = new Map<string, string>();
  private readonly mutex = new KeyedMutex();

  private docKey(tenantId: string, doctype: string, name: string): string {
    return `${tenantId}:${doctype}:${name}`;
  }

  private receiptKey(tenantId: string, commandId: string): string {
    return `${tenantId}:${commandId}`;
  }

  async getDocument<T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null> {
    const raw = this.documents.get(this.docKey(tenantId, doctype, name));
    if (!raw) return null;
    const document = structuredClone(raw) as CanonicalDocument<T>;
    await this.hydrateDerived(document);
    return document;
  }

  async listDocumentsByDoctype<T extends JsonObject>(
    tenantId: string,
    doctype: string,
  ): Promise<Array<CanonicalDocument<T>>> {
    const result: Array<CanonicalDocument<T>> = [];
    for (const raw of this.documents.values()) {
      if (raw.tenant_id !== tenantId || raw.doctype !== doctype) continue;
      const document = structuredClone(raw) as CanonicalDocument<T>;
      await this.hydrateDerived(document);
      result.push(document);
    }
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }

  async getReceipt(tenantId: string, commandId: string): Promise<MutationReceipt | null> {
    return structuredClone(this.receipts.get(this.receiptKey(tenantId, commandId)) ?? null);
  }

  async sumSubmittedChildQuantityMicros(query: SubmittedQuantityQuery): Promise<number> {
    let total = 0;
    for (const document of this.documents.values()) {
      if (document.tenant_id !== query.tenantId || document.doctype !== query.parentDoctype || document.docstatus !== 1) continue;
      if (query.excludeName && document.name === query.excludeName) continue;
      if (document.data[query.referenceField] !== query.referenceName) continue;
      for (const child of document.children) {
        if (child.fieldname !== "items" || child.data.item_code !== query.itemCode) continue;
        // Quy về đơn vị tồn trước khi cộng — xem chú thích ở `d1-store.ts`.
        const value = query.quantityKind === "transaction"
          ? child.data.qty_micros
          : child.data.stock_qty_micros ?? child.data.qty_micros;
        total += typeof value === "number" && Number.isSafeInteger(value)
          ? value
          : toScaledInt(String(query.quantityKind === "transaction"
            ? child.data.qty ?? 0
            : child.data.stock_qty ?? child.data.qty ?? 0), 6, "child qty");
      }
    }
    return total;
  }

  async getOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number> {
    return this.paymentEntries
      .filter((line) => line.against_voucher_type === voucherType && line.against_voucher_no === voucherNo)
      .reduce((total, line) => total + line.amount_minor, 0);
  }

  async getBaseOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number> {
    return this.paymentEntries
      .filter((line) => line.against_voucher_type === voucherType && line.against_voucher_no === voucherNo)
      .reduce((total, line) => total + line.base_amount_minor, 0);
  }

  async getStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string): Promise<number> {
    return this.stockEntries
      .filter((line) => line.item_code === itemCode && line.warehouse === warehouse)
      .reduce((total, line) => total + line.actual_qty_micros, 0);
  }

  async getTrackedStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string, batchNo?: string, serialNo?: string): Promise<number> {
    return this.stockEntries
      .filter((line) => line.item_code === itemCode && line.warehouse === warehouse
        && (!batchNo || line.batch_no === batchNo) && (!serialNo || line.serial_no === serialNo))
      .reduce((total, line) => total + line.actual_qty_micros, 0);
  }

  async getTrackedStockState(
    tenantId: string,
    itemCode: string,
    warehouse: string,
    batchNo?: string,
    throughPostingAt?: string,
  ): Promise<TrackedStockState> {
    const rows = this.stockEntries.filter((line) =>
      line.item_code === itemCode
      && line.warehouse === warehouse
      && (!batchNo || line.batch_no === batchNo)
      && (!throughPostingAt || line.posting_at <= throughPostingAt));
    const measured = rows.filter((line) => line.actual_weight_micros !== undefined);
    return {
      qty_micros: rows.reduce((total, line) => total + line.actual_qty_micros, 0),
      weight_micros: measured.length
        ? measured.reduce((total, line) => total + (line.actual_weight_micros ?? 0), 0)
        : null,
      stock_value_minor: rows.reduce((total, line) => total + line.stock_value_difference_minor, 0),
    };
  }

  async listTrackedStockPositions(_tenantId: string, itemCode?: string): Promise<TrackedStockPosition[]> {
    const grouped = new Map<string, TrackedStockPosition & { measured: boolean }>();
    for (const line of this.stockEntries) {
      if (!line.batch_no || (itemCode && line.item_code !== itemCode)) continue;
      const key = `${line.item_code}\u0000${line.warehouse}\u0000${line.batch_no}`;
      const row = grouped.get(key) ?? {
        item_code: line.item_code,
        warehouse: line.warehouse,
        batch_no: line.batch_no,
        qty_micros: 0,
        weight_micros: null,
        stock_value_minor: 0,
        measured: false,
      };
      row.qty_micros += line.actual_qty_micros;
      row.stock_value_minor += line.stock_value_difference_minor;
      if (line.actual_weight_micros !== undefined) {
        row.measured = true;
        row.weight_micros = (row.weight_micros ?? 0) + line.actual_weight_micros;
      }
      grouped.set(key, row);
    }
    return [...grouped.values()]
      .filter((row) => row.qty_micros !== 0 || (row.weight_micros ?? 0) !== 0)
      .map(({ measured: _measured, ...row }) => structuredClone(row));
  }

  async getVoucherGlEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<GeneralLedgerEntry[]> {
    return structuredClone(this.voucherGlEntries
      .filter((entry) => entry.tenant_id === tenantId
        && entry.voucher_type === voucherType
        && entry.voucher_no === voucherNo
        && entry.voucher_revision === voucherRevision)
      .map((entry) => entry.line));
  }

  async getVoucherStockEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<StockLedgerEntry[]> {
    return structuredClone(this.voucherStockEntries
      .filter((entry) => entry.tenant_id === tenantId
        && entry.voucher_type === voucherType
        && entry.voucher_no === voucherNo
        && entry.voucher_revision === voucherRevision)
      .map((entry) => entry.line));
  }

  async getStockLedgerHistory(tenantId: string, itemCode: string, warehouse: string, throughPostingAt?: string, batchNo?: string): Promise<StockLedgerEntry[]> {
    return structuredClone(this.stockEntries
      .filter((line) => line.item_code === itemCode && line.warehouse === warehouse
        && (!throughPostingAt || line.posting_at <= throughPostingAt)
        && (!batchNo || line.batch_no === batchNo))
      .sort((a,b) => a.posting_at.localeCompare(b.posting_at)));
  }

  async isStockBundleUsed(tenantId: string, bundleName: string): Promise<boolean> {
    return this.stockBundleUsages.filter((line) => line.bundle_name === bundleName).reduce((sum,line)=>sum+line.usage_delta,0)>0;
  }

  async getReturnedQuantityMicros(tenantId: string, referenceDoctype: string, referenceName: string, kind: string, itemCode: string): Promise<number> {
    return this.returnEntries.filter((line) => line.reference_doctype === referenceDoctype && line.reference_name === referenceName && line.kind === kind && line.item_code === itemCode)
      .reduce((total,line) => total + line.qty_micros, 0);
  }

  async getManufacturedQuantityMicros(tenantId: string, workOrder: string, kind?: "Material Transfer" | "Consumption" | "Manufacture", itemCode?: string): Promise<number> {
    return this.manufacturingEntries.filter((line) => line.work_order === workOrder && (!kind || line.kind === kind) && (!itemCode || line.item_code === itemCode))
      .reduce((total,line) => total + line.qty_micros, 0);
  }

  async getJobCardCompletedQuantityMicros(tenantId: string, workOrder: string, excludeName?: string): Promise<number> {
    return [...this.documents.values()]
      .filter((document) => document.tenant_id === tenantId && document.doctype === "Job Card" && document.docstatus === 1
        && document.data.work_order === workOrder && (!excludeName || document.name !== excludeName))
      .reduce((total, document) => total + (typeof document.data.completed_qty_micros === "number" ? document.data.completed_qty_micros : 0), 0);
  }

  async getAssetDepreciatedMinor(tenantId: string, asset: string): Promise<number> {
    return this.assetDepreciationEntries.filter((line) => line.asset === asset).reduce((total,line) => total + line.amount_minor, 0);
  }

  async getAssetDisposalMinor(tenantId: string, asset: string): Promise<number> {
    return this.assetLifecycleEntries
      .filter((line) => line.asset === asset && line.kind === "Disposal")
      .reduce((total, line) => total + (line.amount_minor ?? 0), 0);
  }

  async isAssetDisposed(tenantId: string, asset: string): Promise<boolean> {
    return this.assetLifecycleEntries.filter((line) => line.asset === asset && line.kind === "Disposal").reduce((count, line) => count + (line.line_key.startsWith("REV-") ? -1 : 1), 0) > 0;
  }

  async getProjectTimeSummary(tenantId: string, project: string): Promise<{ hours_micros: number; cost_minor: number; billing_minor: number }> {
    return this.projectTimeEntries.filter((line) => line.project === project).reduce((summary, line) => ({
      hours_micros: summary.hours_micros + line.hours_micros,
      cost_minor: summary.cost_minor + line.cost_minor,
      billing_minor: summary.billing_minor + line.billing_minor,
    }), { hours_micros: 0, cost_minor: 0, billing_minor: 0 });
  }

  async getPosSessionSales(tenantId: string, openingEntry: string): Promise<{ net_total_minor: number; tax_total_minor: number; grand_total_minor: number }> {
    return this.posSalesEntries.filter((line) => line.opening_entry === openingEntry).reduce((summary, line) => ({
      net_total_minor: summary.net_total_minor + line.net_total_minor,
      tax_total_minor: summary.tax_total_minor + line.tax_total_minor,
      grand_total_minor: summary.grand_total_minor + line.grand_total_minor,
    }), { net_total_minor: 0, tax_total_minor: 0, grand_total_minor: 0 });
  }

  async isPosSessionClosed(tenantId: string, openingEntry: string): Promise<boolean> {
    return [...this.documents.values()].some((document) => document.tenant_id === tenantId && document.doctype === "POS Closing Entry" && document.docstatus === 1 && document.data.opening_entry === openingEntry);
  }

  async hasOpenPosSessionForProfile(tenantId: string, posProfile: string, excludeOpeningEntry?: string): Promise<boolean> {
    const openings = [...this.documents.values()].filter((document) => document.tenant_id === tenantId && document.doctype === "POS Opening Entry"
      && document.docstatus === 1 && document.data.pos_profile === posProfile && (!excludeOpeningEntry || document.name !== excludeOpeningEntry));
    return openings.some((opening) => ![...this.documents.values()].some((closing) => closing.tenant_id === tenantId
      && closing.doctype === "POS Closing Entry" && closing.docstatus === 1 && closing.data.opening_entry === opening.name));
  }


  async getBankReconciledMinor(tenantId: string, bankTransaction: string): Promise<number> {
    return this.bankReconciliationEntries
      .filter((entry) => entry.bank_transaction === bankTransaction)
      .reduce((total, entry) => total + entry.amount_minor, 0);
  }

  async getFulfilledQuantityMicros(
    tenantId: string,
    salesOrder: string,
    kind?: "Delivery" | "Billing",
    itemCode?: string,
  ): Promise<number> {
    return this.fulfillmentEntries
      .filter((line) => line.sales_order === salesOrder && (!kind || line.kind === kind) && (!itemCode || line.item_code === itemCode))
      .reduce((total, line) => total + line.qty_micros, 0);
  }

  async getFulfilledLineQuantityMicros(
    tenantId: string,
    salesOrder: string,
    kind: "Delivery" | "Billing",
    salesOrderLineKey: string,
    packageComponentKey?: string,
  ): Promise<number> {
    return this.lineFulfillmentEntries
      .filter((line) => line.sales_order === salesOrder
        && line.kind === kind
        && line.sales_order_line_key === salesOrderLineKey
        && (packageComponentKey === undefined || (line.package_component_key ?? "") === packageComponentKey))
      .reduce((total, line) => total + line.qty_micros, 0);
  }

  async getProcuredQuantityMicros(
    tenantId: string,
    purchaseOrder: string,
    kind?: "Receipt" | "Billing",
    itemCode?: string,
    purchaseOrderItemRowId?: string,
  ): Promise<number> {
    return this.procurementEntries
      .filter((line) => line.purchase_order === purchaseOrder
        && (!kind || line.kind === kind)
        && (!itemCode || line.item_code === itemCode)
        && (!purchaseOrderItemRowId || line.purchase_order_item_row_id === purchaseOrderItemRowId))
      .reduce((total, line) => total + line.qty_micros, 0);
  }

  async hasMasterRecord(tenantId: string, recordType: string, name: string): Promise<boolean> {
    if (this.masterRecords.has(`${tenantId}:${recordType}:${name}`)) return true;
    const document = this.documents.get(this.docKey(tenantId, recordType, name));
    return Boolean(document && document.docstatus !== 2 && document.data.disabled !== true && document.data.disabled !== 1);
  }

  async getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null> {
    const data = this.masterRecords.get(`${tenantId}:${recordType}:${name}`);
    if (data) return structuredClone(data);
    const document = this.documents.get(this.docKey(tenantId, recordType, name));
    if (!document || document.docstatus === 2 || document.data.disabled === true || document.data.disabled === 1) return null;
    return structuredClone(document.data);
  }

  async listMasterRecordData(tenantId: string, recordType: string): Promise<Array<{ name: string; data: JsonObject }>> {
    const result = new Map<string,JsonObject>();
    const prefix=`${tenantId}:${recordType}:`;
    for(const [key,data] of this.masterRecords) if(key.startsWith(prefix)) result.set(key.slice(prefix.length),structuredClone(data));
    for(const document of this.documents.values()) if(document.tenant_id===tenantId&&document.doctype===recordType&&document.docstatus!==2&&document.data.disabled!==true&&document.data.disabled!==1)result.set(document.name,structuredClone(document.data));
    return [...result.entries()].map(([name,data])=>({name,data}));
  }

  async getPeriodLockDate(tenantId: string, company: string): Promise<string | null> {
    return this.periodLocks.get(`${tenantId}:${company}`) ?? null;
  }

  seedMaster(recordType: string, name: string, tenantId = "demo", data: JsonObject = {}): void {
    this.masterRecords.set(`${tenantId}:${recordType}:${name}`, structuredClone(data));
  }

  /** Test/fixture helper for lifecycle-aware references that must be real documents, not master rows. */
  seedDocument(doctype: string, name: string, tenantId = "demo", data: JsonObject = {}, docstatus: 0 | 1 | 2 = 0): void {
    const now = "1970-01-01T00:00:00.000Z";
    this.documents.set(this.docKey(tenantId, doctype, name), {
      tenant_id: tenantId,
      doctype,
      name,
      owner: "fixture",
      docstatus,
      status: docstatus === 1 ? "Submitted" : docstatus === 2 ? "Cancelled" : "Draft",
      version: 1,
      created_at: now,
      modified_at: now,
      data: structuredClone(data),
      children: [],
    });
  }

  seedO2CMasters(input: {
    tenantId?: string; company: string; customer: string; currency: string; items: string[];
    warehouses?: string[]; accounts?: string[]; companyCurrency?: string; companyCurrencyScale?: number; currencyScale?: number;
  }): void {
    const tenant = input.tenantId ?? "demo";
    const companyCurrency = input.companyCurrency ?? input.currency;
    const companyCurrencyScale = input.companyCurrencyScale ?? 2;
    const transactionScale = input.currencyScale ?? (companyCurrency === input.currency ? companyCurrencyScale : 2);
    this.seedMaster("Company", input.company, tenant, { default_currency: companyCurrency });
    this.seedMaster("Customer", input.customer, tenant);
    this.seedMaster("Currency", input.currency, tenant, { currency_scale: transactionScale });
    this.seedMaster("Currency", companyCurrency, tenant, { currency_scale: companyCurrencyScale });
    for (const item of input.items) this.seedMaster("Item", item, tenant);
    for (const warehouse of input.warehouses ?? []) this.seedMaster("Warehouse", warehouse, tenant);
    for (const account of input.accounts ?? []) this.seedMaster("Account", account, tenant);
  }

  setPeriodLock(company: string, lockDate: string, tenantId = "demo"): void {
    this.periodLocks.set(`${tenantId}:${company}`, lockDate);
  }

  seedStock(input: { tenantId?: string; itemCode: string; warehouse: string; qty: string | number; valuationRate?: string | number; currency?: string }): void {
    const qty = toScaledInt(input.qty, 6, "opening stock qty");
    const valuation = toScaledInt(input.valuationRate ?? 0, 2, "opening valuation");
    this.stockEntries.push({
      line_key: `OPENING-${this.stockEntries.length + 1}`,
      item_code: input.itemCode,
      warehouse: input.warehouse,
      actual_qty_micros: qty,
      valuation_rate_minor: valuation,
      stock_value_difference_minor: 0,
      qty_scale: 6,
      currency_scale: 2,
      currency: input.currency ?? "USD",
      posting_at: "1970-01-01T00:00:00.000Z",
    });
  }

  async execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt> {
    const [receipt] = await this.executeBundle([plan]);
    return receipt!;
  }

  async executeBundle(plans: readonly MutationPlan[]): Promise<MutationReceipt[]> {
    this.assertBundlePlans(plans);
    // The in-memory adapter models one transactional database.  Keep the lock
    // over the complete ordered bundle so tests retain the same aggregate and
    // cross-aggregate race behaviour as one D1 batch.
    return this.mutex.run("__database__", async () => {
      const replayed = this.resolveBundleReceipts(plans);
      if (replayed) return replayed;

      const checkpoint = this.captureBundleCheckpoint();
      try {
        const receipts: MutationReceipt[] = [];
        for (const plan of plans) {
          this.assertPlanCanCommit(plan);
          receipts.push(this.commitPlan(plan));
        }
        return receipts.map((receipt) => structuredClone(receipt));
      } catch (error) {
        this.restoreBundleCheckpoint(checkpoint);
        throw error;
      }
    });
  }

  private assertBundlePlans(plans: readonly MutationPlan[]): void {
    if (!Array.isArray(plans) || plans.length === 0) {
      throw errors.validation("Mutation bundle must contain at least one plan");
    }
    const tenantId = plans[0]!.command.tenant_id;
    const commandIds = new Set<string>();
    for (const plan of plans) {
      const command = plan.command;
      if (command.tenant_id !== tenantId) throw errors.validation("Mutation bundle plans must belong to one tenant");
      if (commandIds.has(command.command_id)) throw errors.validation("Mutation bundle command_id values must be unique");
      commandIds.add(command.command_id);
    }
  }

  private resolveBundleReceipts(plans: readonly MutationPlan[]): MutationReceipt[] | null {
    const receipts = plans.map((plan) => this.receipts.get(this.receiptKey(plan.command.tenant_id, plan.command.command_id)) ?? null);
    const committedCount = receipts.filter((receipt) => receipt !== null).length;
    if (committedCount === 0) return null;
    for (let index = 0; index < plans.length; index += 1) {
      const receipt = receipts[index];
      if (!receipt) continue;
      const command = plans[index]!.command;
      if (receipt.payload_hash !== command.payload_hash || receipt.actor_user_id !== command.actor.user_id) {
        throw errors.idempotency();
      }
    }
    if (committedCount !== plans.length) {
      throw errors.validation("Mutation bundle has an incomplete receipt set; it cannot be replayed safely");
    }
    return receipts.map((receipt) => structuredClone(receipt!));
  }

  private assertPlanCanCommit<T extends JsonObject>(plan: MutationPlan<T>): void {
    const command = plan.command;
    const key = this.docKey(command.tenant_id, command.aggregate.doctype, command.aggregate.name);
    const current = this.documents.get(key);
    if (command.expected_version === null) {
      if (current) throw errors.exists();
    } else {
      if (!current) throw errors.notFound();
      if (current.version !== command.expected_version) throw errors.version(current.version);
    }

    this.assertStockInvariants(plan);
    this.assertFulfillmentInvariants(plan);
    this.assertOutstandingInvariants(plan);
    this.assertProcurementInvariants(plan);
    this.assertStockBundleInvariants(plan);
    this.assertReturnInvariants(plan);
    this.assertManufacturingInvariants(plan);
    this.assertAssetDepreciationInvariants(plan);
    this.assertSuiteBreadthInvariants(plan);
    this.assertBankReconciliationInvariants(plan);
    this.assertAmendChain(command);
  }

  private commitPlan<T extends JsonObject>(plan: MutationPlan<T>): MutationReceipt {
    const command = plan.command;
    const key = this.docKey(command.tenant_id, command.aggregate.doctype, command.aggregate.name);
    const previous = this.documents.get(key);
    // Attribution is stamped by the store, not the controller, so the in-memory
    // adapter must match D1 exactly or tests would pass against behaviour that
    // does not exist in production.
    this.documents.set(key, {
      ...structuredClone(plan.document),
      modified_by: command.actor.user_id,
      // Amendment lineage is supplied only by the create command.  Later submit/save
      // commands must retain it, exactly as the D1 UPDATE does by not changing its
      // `amended_from` column.
      ...(command.amended_from
        ? { amended_from: command.amended_from }
        : previous?.amended_from ? { amended_from: previous.amended_from } : {}),
    });
    this.glEntries.push(...structuredClone(plan.gl_entries));
    this.voucherGlEntries.push(...plan.gl_entries.map((line) => ({
      tenant_id: command.tenant_id,
      voucher_type: command.aggregate.doctype,
      voucher_no: command.aggregate.name,
      voucher_revision: plan.document.version,
      line: structuredClone(line),
    })));
    const committedStock = plan.stock_entries.map((line) => ({
      ...structuredClone(line),
      source_voucher_type: command.aggregate.doctype,
      source_voucher_no: command.aggregate.name,
      source_voucher_revision: plan.document.version,
    }));
    this.stockEntries.push(...committedStock);
    this.voucherStockEntries.push(...committedStock.map((line) => ({
      tenant_id: command.tenant_id,
      voucher_type: command.aggregate.doctype,
      voucher_no: command.aggregate.name,
      voucher_revision: plan.document.version,
      line: structuredClone(line),
    })));
    this.paymentEntries.push(...structuredClone(plan.payment_entries));
    const fulfillment = structuredClone(plan.fulfillment_entries);
    this.lineFulfillmentEntries.push(...fulfillment.filter((line) => Boolean(line.sales_order_line_key)));
    this.fulfillmentEntries.push(...fulfillment.filter((line) => !line.skip_legacy_projection));
    this.procurementEntries.push(...structuredClone(plan.procurement_entries ?? []));
    this.stockBundleUsages.push(...structuredClone(plan.stock_bundle_usages ?? []));
    this.returnEntries.push(...structuredClone(plan.return_entries ?? []));
    this.manufacturingEntries.push(...structuredClone(plan.manufacturing_entries ?? []));
    this.assetDepreciationEntries.push(...structuredClone(plan.asset_depreciation_entries ?? []));
    this.assetLifecycleEntries.push(...structuredClone(plan.asset_lifecycle_entries ?? []));
    this.projectTimeEntries.push(...structuredClone(plan.project_time_entries ?? []));
    this.posSalesEntries.push(...structuredClone(plan.pos_sales_entries ?? []));
    this.bankReconciliationEntries.push(...structuredClone(plan.bank_reconciliation_entries ?? []));
    this.events.push(...structuredClone(plan.events));
    const receipt: MutationReceipt = {
      command_id: command.command_id,
      tenant_id: command.tenant_id,
      actor_user_id: command.actor.user_id,
      aggregate: command.aggregate,
      aggregate_version: plan.document.version,
      payload_hash: command.payload_hash,
      committed_at: plan.document.modified_at,
      result: structuredClone(plan.result),
    };
    this.receipts.set(this.receiptKey(command.tenant_id, command.command_id), receipt);
    return receipt;
  }

  private captureBundleCheckpoint(): BundleCheckpoint {
    return {
      documents: [...this.documents.entries()].map(([key, document]) => [key, structuredClone(document)]),
      receipts: [...this.receipts.entries()].map(([key, receipt]) => [key, structuredClone(receipt)]),
      glEntriesLength: this.glEntries.length,
      voucherGlEntriesLength: this.voucherGlEntries.length,
      stockEntriesLength: this.stockEntries.length,
      voucherStockEntriesLength: this.voucherStockEntries.length,
      paymentEntriesLength: this.paymentEntries.length,
      fulfillmentEntriesLength: this.fulfillmentEntries.length,
      lineFulfillmentEntriesLength: this.lineFulfillmentEntries.length,
      procurementEntriesLength: this.procurementEntries.length,
      stockBundleUsagesLength: this.stockBundleUsages.length,
      returnEntriesLength: this.returnEntries.length,
      manufacturingEntriesLength: this.manufacturingEntries.length,
      assetDepreciationEntriesLength: this.assetDepreciationEntries.length,
      assetLifecycleEntriesLength: this.assetLifecycleEntries.length,
      projectTimeEntriesLength: this.projectTimeEntries.length,
      posSalesEntriesLength: this.posSalesEntries.length,
      bankReconciliationEntriesLength: this.bankReconciliationEntries.length,
      eventsLength: this.events.length,
    };
  }

  private restoreBundleCheckpoint(checkpoint: BundleCheckpoint): void {
    this.documents.clear();
    for (const [key, document] of checkpoint.documents) this.documents.set(key, document);
    this.receipts.clear();
    for (const [key, receipt] of checkpoint.receipts) this.receipts.set(key, receipt);
    this.glEntries.splice(checkpoint.glEntriesLength);
    this.voucherGlEntries.splice(checkpoint.voucherGlEntriesLength);
    this.stockEntries.splice(checkpoint.stockEntriesLength);
    this.voucherStockEntries.splice(checkpoint.voucherStockEntriesLength);
    this.paymentEntries.splice(checkpoint.paymentEntriesLength);
    this.fulfillmentEntries.splice(checkpoint.fulfillmentEntriesLength);
    this.lineFulfillmentEntries.splice(checkpoint.lineFulfillmentEntriesLength);
    this.procurementEntries.splice(checkpoint.procurementEntriesLength);
    this.stockBundleUsages.splice(checkpoint.stockBundleUsagesLength);
    this.returnEntries.splice(checkpoint.returnEntriesLength);
    this.manufacturingEntries.splice(checkpoint.manufacturingEntriesLength);
    this.assetDepreciationEntries.splice(checkpoint.assetDepreciationEntriesLength);
    this.assetLifecycleEntries.splice(checkpoint.assetLifecycleEntriesLength);
    this.projectTimeEntries.splice(checkpoint.projectTimeEntriesLength);
    this.posSalesEntries.splice(checkpoint.posSalesEntriesLength);
    this.bankReconciliationEntries.splice(checkpoint.bankReconciliationEntriesLength);
    this.events.splice(checkpoint.eventsLength);
  }

  snapshot(): MutationSnapshot {
    return {
      documents: structuredClone([...this.documents.values()]),
      receipts: structuredClone([...this.receipts.values()]),
      gl_entries: structuredClone(this.glEntries),
      stock_entries: structuredClone(this.stockEntries),
      payment_entries: structuredClone(this.paymentEntries),
      fulfillment_entries: structuredClone(this.fulfillmentEntries),
      procurement_entries: structuredClone(this.procurementEntries),
      stock_bundle_usages: structuredClone(this.stockBundleUsages),
      return_entries: structuredClone(this.returnEntries),
      manufacturing_entries: structuredClone(this.manufacturingEntries),
      asset_depreciation_entries: structuredClone(this.assetDepreciationEntries),
      asset_lifecycle_entries: structuredClone(this.assetLifecycleEntries),
      project_time_entries: structuredClone(this.projectTimeEntries),
      pos_sales_entries: structuredClone(this.posSalesEntries),
      bank_reconciliation_entries: structuredClone(this.bankReconciliationEntries),
      events: structuredClone(this.events),
    };
  }

  private async hydrateDerived<T extends JsonObject>(document: CanonicalDocument<T>): Promise<void> {
    if (document.doctype === "Sales Invoice" || document.doctype === "Purchase Invoice") {
      const scale = typeof document.data.currency_scale === "number" ? document.data.currency_scale : 2;
      const outstanding = await this.getOutstandingMinor(document.tenant_id, document.doctype, document.name);
      const data = document.data as JsonObject;
      data.outstanding_amount_minor = outstanding;
      data.outstanding_amount = fromScaledInt(outstanding, scale);
      if (document.docstatus === 1) {
        const grand = typeof data.grand_total_minor === "number"
          ? data.grand_total_minor : toScaledInt(String(data.grand_total ?? "0"), scale);
        document.status = deriveO2CStatus(document.doctype, document.docstatus,
          { outstandingMinor: outstanding, grandTotalMinor: grand });
      }
    }
    if (document.doctype === "Salary Slip") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const outstanding = await this.getOutstandingMinor(document.tenant_id, "Salary Slip", document.name);
      const net = typeof data.net_pay_minor === "number" ? data.net_pay_minor : toScaledInt(String(data.net_pay ?? 0), scale);
      data.outstanding_amount_minor = outstanding;
      data.outstanding_amount = fromScaledInt(outstanding, scale);
      if (document.docstatus === 1) document.status = outstanding <= 0 ? "Paid" : outstanding < net ? "Partly Paid" : "Unpaid";
    }
    if (document.doctype === "Bank Transaction") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const amount = Math.abs(typeof data.amount_minor === "number" ? data.amount_minor : toScaledInt(String(data.amount ?? 0), scale));
      const reconciled = await this.getBankReconciledMinor(document.tenant_id, document.name);
      data.reconciled_amount_minor = reconciled;
      data.reconciled_amount = fromScaledInt(reconciled, scale);
      data.unreconciled_amount_minor = Math.max(0, amount - reconciled);
      data.unreconciled_amount = fromScaledInt(Math.max(0, amount - reconciled), scale);
      if (document.docstatus === 1) document.status = reconciled <= 0 ? "Unreconciled" : reconciled >= amount ? "Reconciled" : "Partly Reconciled";
    }
    if (document.doctype === "Delivery Note" && document.docstatus === 1) {
      document.status = deriveDeliveryNoteStatus(
        document.docstatus,
        typeof document.data.issue_purpose === "string" ? document.data.issue_purpose : undefined,
      );
    }
    if (document.doctype === "Purchase Order") {
      const items = Array.isArray(document.data.items) ? document.data.items : [];
      let ordered = 0; let received = 0; let billed = 0;
      for (const value of items) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const item = value as JsonObject; const itemCode = String(item.item_code ?? "");
        ordered += typeof item.qty_micros === "number" ? item.qty_micros : toScaledInt(String(item.qty ?? 0), 6);
        received += await this.getProcuredQuantityMicros(document.tenant_id, document.name, "Receipt", itemCode);
        billed += await this.getProcuredQuantityMicros(document.tenant_id, document.name, "Billing", itemCode);
      }
      if (ordered > 0) {
        const receivedPercentage = (received * 100) / ordered; const billedPercentage = (billed * 100) / ordered;
        const data = document.data as JsonObject; data.received_percentage = receivedPercentage.toFixed(2); data.billed_percentage = billedPercentage.toFixed(2);
        if (document.docstatus === 1) document.status = deriveO2CStatus("Purchase Order", document.docstatus, { receivedPercentage, billedPercentage });
      }
    }
    if (document.doctype === "Work Order") {
      const data = document.data as JsonObject;
      const target = typeof data.qty_micros === "number" ? data.qty_micros : toScaledInt(String(data.qty ?? 0), 6);
      const item = typeof data.production_item === "string" ? data.production_item : "";
      const produced = item ? await this.getManufacturedQuantityMicros(document.tenant_id, document.name, "Manufacture", item) : 0;
      data.produced_qty_micros = produced;
      data.produced_qty = fromScaledInt(produced, 6);
      data.produced_percentage = target > 0 ? ((produced * 100) / target).toFixed(2) : "0.00";
      if (document.docstatus === 1) document.status = produced <= 0 ? "Not Started" : produced >= target ? "Completed" : "In Process";
    }
    if (document.doctype === "Asset") {
      const data = document.data as JsonObject;
      const scale = typeof data.currency_scale === "number" ? data.currency_scale : 2;
      const gross = typeof data.gross_purchase_amount_minor === "number" ? data.gross_purchase_amount_minor : toScaledInt(String(data.gross_purchase_amount ?? 0), scale);
      const salvage = typeof data.salvage_value_minor === "number" ? data.salvage_value_minor : toScaledInt(String(data.salvage_value ?? 0), scale);
      const depreciated = await this.getAssetDepreciatedMinor(document.tenant_id, document.name);
      data.accumulated_depreciation_minor = depreciated;
      data.accumulated_depreciation = fromScaledInt(depreciated, scale);
      data.net_book_value_minor = gross - depreciated;
      data.net_book_value = fromScaledInt(gross - depreciated, scale);
      const disposed = await this.getAssetDisposalMinor(document.tenant_id, document.name);
      const isDisposed = await this.isAssetDisposed(document.tenant_id, document.name);
      data.disposal_proceeds_minor = disposed;
      data.disposal_proceeds = fromScaledInt(disposed, scale);
      if (document.docstatus === 1) document.status = isDisposed ? "Disposed" : depreciated >= gross - salvage ? "Fully Depreciated" : "Active";
    }
    if (document.doctype === "Project") {
      const data = document.data as JsonObject;
      const summary = await this.getProjectTimeSummary(document.tenant_id, document.name);
      data.actual_hours_micros = summary.hours_micros;
      data.actual_hours = fromScaledInt(summary.hours_micros, 6);
      data.actual_cost_minor = summary.cost_minor;
      data.actual_billing_minor = summary.billing_minor;
    }
    if (document.doctype === "Sales Order") {
      const items = Array.isArray(document.data.items) ? document.data.items : [];
      const progress = await deriveSalesOrderProgress(items, {
        getLine: (kind, rowKey, componentKey) => this.getFulfilledLineQuantityMicros(
          document.tenant_id, document.name, kind, rowKey, componentKey,
        ),
        getLegacy: (kind, itemCode) => this.getFulfilledQuantityMicros(
          document.tenant_id, document.name, kind, itemCode,
        ),
      });
      if (progress.ordered_micros > 0) {
        const data = document.data as JsonObject;
        data.delivered_percentage = progress.delivered_percentage.toFixed(2);
        data.billed_percentage = progress.billed_percentage.toFixed(2);
        if (document.docstatus === 1) {
          document.status = deriveO2CStatus("Sales Order", document.docstatus, {
            deliveredPercentage: progress.delivered_percentage,
            billedPercentage: progress.billed_percentage,
          });
        }
      }
    }
  }
  private assertStockInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string, number>();
    const pendingSerial = new Map<string, number>();
    const pendingBatch = new Map<string, number>();
    for (const line of plan.stock_entries) {
      // Song sinh của `stock_weight_sign_guard` (migration 0024). Hai kho phải kể CÙNG một
      // câu chuyện: nếu chỉ D1 chặn, test chạy trên kho trong bộ nhớ sẽ XANH cho đúng cái
      // bút toán mà production ABORT. Luật viết hai nơi thì phải sửa cả hai, cùng lúc —
      // migration 0023 đã ghi lại đúng bài học này.
      if (line.actual_weight_micros != null
        && ((line.actual_qty_micros > 0 && line.actual_weight_micros < 0)
          || (line.actual_qty_micros < 0 && line.actual_weight_micros > 0))) {
        throw errors.reference(`Stock weight sign does not match quantity for ${line.item_code}`, {
          actual_qty_micros: line.actual_qty_micros, actual_weight_micros: line.actual_weight_micros,
        });
      }
      if (line.serial_no) {
        if (Math.abs(line.actual_qty_micros) !== 1_000_000) throw errors.reference("Serial quantity must equal one");
        const serialKey = `${line.item_code}:${line.serial_no}`;
        const existingSerial = this.stockEntries
          .filter((entry) => entry.item_code === line.item_code && entry.serial_no === line.serial_no)
          .reduce((total, entry) => total + entry.actual_qty_micros, 0);
        const nextSerial = existingSerial + (pendingSerial.get(serialKey) ?? 0) + line.actual_qty_micros;
        if (nextSerial !== 0 && nextSerial !== 1_000_000) throw errors.reference(`Serial stock state is invalid for ${line.serial_no}`);
        pendingSerial.set(serialKey, (pendingSerial.get(serialKey) ?? 0) + line.actual_qty_micros);
      }
      if (line.batch_no) {
        const batchKey = `${line.item_code}:${line.warehouse}:${line.batch_no}`;
        const existingBatch = this.stockEntries
          .filter((entry) => entry.item_code === line.item_code && entry.warehouse === line.warehouse && entry.batch_no === line.batch_no)
          .reduce((total, entry) => total + entry.actual_qty_micros, 0);
        const nextBatch = existingBatch + (pendingBatch.get(batchKey) ?? 0) + line.actual_qty_micros;
        if (nextBatch < 0) throw errors.reference(`Insufficient batch stock for ${line.batch_no}`);
        pendingBatch.set(batchKey, (pendingBatch.get(batchKey) ?? 0) + line.actual_qty_micros);
      }
      if (line.allow_negative_stock && !line.serial_no && !line.batch_no) continue;
      const stockKey = `${line.item_code}:${line.warehouse}`;
      const existing = this.stockEntries
        .filter((entry) => entry.item_code === line.item_code && entry.warehouse === line.warehouse)
        .reduce((total, entry) => total + entry.actual_qty_micros, 0);
      const next = existing + (pending.get(stockKey) ?? 0) + line.actual_qty_micros;
      if (next < 0) throw errors.reference(`Insufficient stock for ${line.item_code} in ${line.warehouse}`, { available_qty_micros: existing, requested_delta_micros: line.actual_qty_micros });
      pending.set(stockKey, (pending.get(stockKey) ?? 0) + line.actual_qty_micros);
    }
  }

  private assertFulfillmentInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string, number>();
    for (const line of plan.fulfillment_entries) {
      if (line.skip_legacy_projection) continue;
      const source = this.documents.get(this.docKey(plan.command.tenant_id, "Sales Order", line.sales_order));
      if (!source || source.docstatus !== 1) throw errors.reference(`Submitted Sales Order ${line.sales_order} is required`);
      const ordered = source.children
        .filter((child) => child.fieldname === "items" && child.data.item_code === line.item_code)
        .reduce((total, child) => total + (typeof child.data.qty_micros === "number"
          ? child.data.qty_micros
          : toScaledInt(String(child.data.qty ?? 0), 6, "ordered qty")), 0);
      if (ordered <= 0) throw errors.reference(`Item ${line.item_code} is not present in Sales Order ${line.sales_order}`);
      const fulfillmentKey = `${line.sales_order}:${line.kind}:${line.item_code}`;
      const existing = this.fulfillmentEntries
        .filter((entry) => entry.sales_order === line.sales_order && entry.kind === line.kind && entry.item_code === line.item_code)
        .reduce((total, entry) => total + entry.qty_micros, 0);
      const next = existing + (pending.get(fulfillmentKey) ?? 0) + line.qty_micros;
      if (next < 0) throw errors.reference(`Reversal quantity exceeds committed ${line.kind.toLowerCase()} quantity`, { sales_order: line.sales_order, item_code: line.item_code });
      if (next > ordered) throw errors.reference(`${line.kind} quantity for ${line.item_code} exceeds Sales Order quantity`, { ordered_qty_micros: ordered, committed_qty_micros: existing, requested_delta_micros: line.qty_micros });
      pending.set(fulfillmentKey, (pending.get(fulfillmentKey) ?? 0) + line.qty_micros);
    }
  }

  private assertOutstandingInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string, number>();
    for (const line of plan.payment_entries) {
      if (!line.against_voucher_type || !line.against_voucher_no) continue;
      const referenceKey = `${line.against_voucher_type}:${line.against_voucher_no}`;
      const existing = this.paymentEntries
        .filter((entry) => entry.against_voucher_type === line.against_voucher_type && entry.against_voucher_no === line.against_voucher_no)
        .reduce((total, entry) => total + entry.amount_minor, 0);
      const next = existing + (pending.get(referenceKey) ?? 0) + line.amount_minor;
      if (next < 0) throw errors.reference(`Allocation exceeds outstanding for ${referenceKey}`, { outstanding_minor: existing, requested_delta_minor: line.amount_minor });
      const existingBase = this.paymentEntries
        .filter((entry) => entry.against_voucher_type === line.against_voucher_type && entry.against_voucher_no === line.against_voucher_no)
        .reduce((total, entry) => total + entry.base_amount_minor, 0);
      const pendingBaseKey = `${referenceKey}:base`;
      const nextBase = existingBase + (pending.get(pendingBaseKey) ?? 0) + line.base_amount_minor;
      if (nextBase < 0) throw errors.reference(`Base allocation exceeds outstanding for ${referenceKey}`, { base_outstanding_minor: existingBase, requested_base_delta_minor: line.base_amount_minor });
      pending.set(referenceKey, (pending.get(referenceKey) ?? 0) + line.amount_minor);
      pending.set(pendingBaseKey, (pending.get(pendingBaseKey) ?? 0) + line.base_amount_minor);
    }
  }

  private assertProcurementInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string, number>();
    for (const line of plan.procurement_entries ?? []) {
      const storedSource = this.documents.get(this.docKey(plan.command.tenant_id, "Purchase Order", line.purchase_order));
      const currentSource = plan.document.doctype === "Purchase Order"
        && plan.document.name === line.purchase_order
        && plan.document.docstatus === 1
        ? plan.document
        : null;
      const source = storedSource?.docstatus === 1 ? storedSource : currentSource;
      if (!source) throw errors.reference(`Submitted Purchase Order ${line.purchase_order} is required`);
      // Theo ĐƠN VỊ TỒN — phải khớp từng chữ với trigger `purchase_progress_reference_guard`
      // (migrations/tenant/0023). Hai bản kiểm cùng một luật mà lệch nhau thì test xanh trên
      // bản in-memory rồi ABORT ở SQLite lúc chạy thật.
      const ordered = source.children.filter((child) => child.fieldname === "items" && child.data.item_code === line.item_code)
        .reduce((total, child) => {
          const declared = child.data.stock_qty_micros ?? child.data.qty_micros;
          return total + (typeof declared === "number" ? declared : toScaledInt(String(child.data.stock_qty ?? child.data.qty ?? 0), 6));
        }, 0);
      const key = `${line.purchase_order}:${line.kind}:${line.item_code}`;
      const existing = this.procurementEntries.filter((entry) => entry.purchase_order === line.purchase_order && entry.kind === line.kind && entry.item_code === line.item_code).reduce((total, entry) => total + entry.qty_micros, 0);
      const next = existing + (pending.get(key) ?? 0) + line.qty_micros;
      const supplier = String(plan.document.data.supplier ?? source.data.supplier ?? "");
      const supplierData = this.masterRecords.get(`${plan.command.tenant_id}:Supplier:${supplier}`);
      const tolerancePct = line.kind === "Receipt" ? Number(supplierData?.receipt_tolerance_pct ?? 0) : 0;
      if (!Number.isFinite(tolerancePct) || tolerancePct < 0 || tolerancePct > 50) {
        throw errors.validation("Supplier receipt tolerance must be between 0 and 50%");
      }
      const permitted = Math.floor(ordered * (1 + tolerancePct / 100));
      if (ordered <= 0) throw errors.reference(`Item ${line.item_code} is not present in Purchase Order ${line.purchase_order}`);
      if (next < 0) throw errors.reference(`Reversal exceeds committed ${line.kind.toLowerCase()} quantity`);
      if (next > permitted) {
        const tolerance = tolerancePct > 0 ? ` plus ${tolerancePct}% supplier tolerance` : "";
        throw errors.reference(`${line.kind} quantity for ${line.item_code} exceeds Purchase Order quantity${tolerance}`);
      }
      pending.set(key, (pending.get(key) ?? 0) + line.qty_micros);
    }
  }


  private assertStockBundleInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string,number>();
    for (const line of plan.stock_bundle_usages ?? []) {
      const bundle = this.documents.get(this.docKey(plan.command.tenant_id, "Serial and Batch Bundle", line.bundle_name));
      if (!bundle || bundle.docstatus !== 1) throw errors.reference(`Submitted Serial and Batch Bundle ${line.bundle_name} is required`);
      const existing = this.stockBundleUsages.filter((used)=>used.bundle_name===line.bundle_name).reduce((sum,used)=>sum+used.usage_delta,0);
      const next = existing + (pending.get(line.bundle_name)??0) + line.usage_delta;
      if (next < 0 || next > 1) throw errors.reference(`Serial and Batch Bundle ${line.bundle_name} usage state is invalid`);
      pending.set(line.bundle_name,(pending.get(line.bundle_name)??0)+line.usage_delta);
    }
  }

  private assertReturnInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string,number>();
    for (const line of plan.return_entries ?? []) {
      const source = this.documents.get(this.docKey(plan.command.tenant_id,line.reference_doctype,line.reference_name));
      if (!source || source.docstatus !== 1) throw errors.reference(`Submitted ${line.reference_doctype} ${line.reference_name} is required`);
      const original = source.children.filter((child) => child.fieldname === "items" && child.data.item_code === line.item_code)
        .reduce((total,child) => total + (typeof child.data.qty_micros === "number" ? child.data.qty_micros : toScaledInt(String(child.data.qty ?? 0),6)),0);
      const key = `${line.reference_doctype}:${line.reference_name}:${line.kind}:${line.item_code}`;
      const existing = this.returnEntries.filter((entry) => entry.reference_doctype === line.reference_doctype && entry.reference_name === line.reference_name && entry.kind === line.kind && entry.item_code === line.item_code)
        .reduce((total,entry) => total + entry.qty_micros,0);
      const next = existing + (pending.get(key) ?? 0) + line.qty_micros;
      if (original <= 0 || next < 0 || next > original) throw errors.reference(`Return quantity for ${line.item_code} exceeds source quantity`);
      pending.set(key,(pending.get(key) ?? 0)+line.qty_micros);
    }
  }

  private assertManufacturingInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string,number>();
    for (const line of plan.manufacturing_entries ?? []) {
      const workOrder = this.documents.get(this.docKey(plan.command.tenant_id,"Work Order",line.work_order));
      if (!workOrder || workOrder.docstatus !== 1) throw errors.reference(`Submitted Work Order ${line.work_order} is required`);
      const key = `${line.work_order}:${line.kind}:${line.item_code}`;
      const existing = this.manufacturingEntries.filter((entry) => entry.work_order === line.work_order && entry.kind === line.kind && entry.item_code === line.item_code)
        .reduce((total,entry) => total + entry.qty_micros,0);
      const next = existing + (pending.get(key) ?? 0) + line.qty_micros;
      let maximum = Number.MAX_SAFE_INTEGER;
      if (line.kind === "Manufacture") maximum = typeof workOrder.data.qty_micros === "number" ? workOrder.data.qty_micros : toScaledInt(String(workOrder.data.qty ?? 0),6);
      else {
        const required = Array.isArray(workOrder.data.required_items) ? workOrder.data.required_items : [];
        maximum = required.filter((value) => value && typeof value === "object" && !Array.isArray(value) && (value as JsonObject).item_code === line.item_code)
          .reduce<number>((total,value) => { const row=value as JsonObject; return total + (typeof row.required_qty_micros === "number" ? row.required_qty_micros : toScaledInt(String(row.required_qty ?? 0),6)); },0);
      }
      if (maximum <= 0 || next < 0 || next > maximum) throw errors.reference(`Manufacturing quantity for ${line.item_code} exceeds Work Order requirement`);
      pending.set(key,(pending.get(key) ?? 0)+line.qty_micros);
    }
  }

  private assertSuiteBreadthInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const document = plan.document;
    if (document.docstatus !== 1) return;
    if (document.doctype === "Job Card") {
      const workOrderName = String(document.data.work_order ?? "");
      const workOrder = this.documents.get(this.docKey(document.tenant_id, "Work Order", workOrderName));
      if (!workOrder || workOrder.docstatus !== 1) throw errors.reference(`Submitted Work Order ${workOrderName} is required`);
      const target = typeof workOrder.data.qty_micros === "number" ? workOrder.data.qty_micros : 0;
      const existing = [...this.documents.values()].filter((candidate) => candidate.tenant_id === document.tenant_id
        && candidate.doctype === "Job Card" && candidate.docstatus === 1 && candidate.name !== document.name
        && candidate.data.work_order === workOrderName).reduce((sum, candidate) => sum + (typeof candidate.data.completed_qty_micros === "number" ? candidate.data.completed_qty_micros : 0), 0);
      const current = typeof document.data.completed_qty_micros === "number" ? document.data.completed_qty_micros : 0;
      if (existing + current > target) throw errors.reference(`Job Card completion exceeds Work Order ${workOrderName}`);
    }
    if (document.doctype === "Payroll Entry") {
      const slips = Array.isArray(document.data.salary_slips) ? document.data.salary_slips : [];
      for (const value of slips) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;
        const slip = String((value as JsonObject).salary_slip ?? "");
        const duplicate = [...this.documents.values()].some((candidate) => candidate.tenant_id === document.tenant_id
          && candidate.doctype === "Payroll Entry" && candidate.docstatus === 1 && candidate.name !== document.name
          && Array.isArray(candidate.data.salary_slips) && candidate.data.salary_slips.some((row) => row && typeof row === "object" && !Array.isArray(row) && (row as JsonObject).salary_slip === slip));
        if (duplicate) throw errors.reference(`Salary Slip ${slip} is already included in another submitted Payroll Entry`);
      }
    }
    if (document.doctype === "E-Invoice Submission") {
      const duplicate = [...this.documents.values()].some((candidate) => candidate.tenant_id === document.tenant_id
        && candidate.doctype === "E-Invoice Submission" && candidate.docstatus === 1 && candidate.name !== document.name
        && candidate.data.source_doctype === document.data.source_doctype && candidate.data.source_name === document.data.source_name);
      if (duplicate) throw errors.reference(`An active e-invoice submission already exists for ${String(document.data.source_doctype)} ${String(document.data.source_name)}`);
    }
    if (document.doctype === "POS Opening Entry") {
      const profile = String(document.data.pos_profile ?? "");
      const anotherOpen = [...this.documents.values()].filter((candidate) => candidate.tenant_id === document.tenant_id
        && candidate.doctype === "POS Opening Entry" && candidate.docstatus === 1 && candidate.name !== document.name
        && candidate.data.pos_profile === profile).some((opening) => ![...this.documents.values()].some((closing) => closing.tenant_id === document.tenant_id
          && closing.doctype === "POS Closing Entry" && closing.docstatus === 1 && closing.data.opening_entry === opening.name));
      if (anotherOpen) throw errors.reference(`POS Profile ${profile} already has an open session`);
    }
  }

  /**
   * Mirrors the `documents_amend_guard` SQL trigger.
   *
   * Kept in step deliberately: if the in-memory adapter were lenient here, the
   * whole domain suite would pass against behaviour D1 rejects, and the failure
   * would only appear in production.
   */
  private assertAmendChain(command: MutationCommand): void {
    const source = command.amended_from;
    if (!source) return;
    const doctype = command.aggregate.doctype;
    const original = this.documents.get(this.docKey(command.tenant_id, doctype, source));
    if (!original || original.docstatus !== 2) {
      throw errors.reference("AMEND_SOURCE_NOT_CANCELLED", { amended_from: source });
    }
    for (const [, document] of this.documents) {
      if (document.tenant_id !== command.tenant_id || document.doctype !== doctype) continue;
      if (document.amended_from === source && document.name !== command.aggregate.name) {
        throw errors.reference("AMEND_SOURCE_ALREADY_AMENDED", { amended_from: source });
      }
    }
  }

  private assertBankReconciliationInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string, number>();
    for (const line of plan.bank_reconciliation_entries ?? []) {
      const transaction = this.documents.get(this.docKey(plan.command.tenant_id, "Bank Transaction", line.bank_transaction));
      if (!transaction || transaction.docstatus !== 1) throw errors.reference(`Submitted Bank Transaction ${line.bank_transaction} is required`);
      const maximum = Math.abs(typeof transaction.data.amount_minor === "number" ? transaction.data.amount_minor : toScaledInt(String(transaction.data.amount ?? 0), line.currency_scale));
      const existing = this.bankReconciliationEntries.filter((entry) => entry.bank_transaction === line.bank_transaction).reduce((sum, entry) => sum + entry.amount_minor, 0);
      const next = existing + (pending.get(line.bank_transaction) ?? 0) + line.amount_minor;
      if (next < 0 || next > maximum) throw errors.reference(`Bank reconciliation exceeds statement amount for ${line.bank_transaction}`);
      pending.set(line.bank_transaction, (pending.get(line.bank_transaction) ?? 0) + line.amount_minor);
    }
  }

  private assertAssetDepreciationInvariants<T extends JsonObject>(plan: MutationPlan<T>): void {
    const pending = new Map<string,number>();
    for (const line of plan.asset_depreciation_entries ?? []) {
      const asset = this.documents.get(this.docKey(plan.command.tenant_id,"Asset",line.asset));
      if (!asset || asset.docstatus === 2) throw errors.reference(`Active Asset ${line.asset} is required`);
      const gross = typeof asset.data.gross_purchase_amount_minor === "number" ? asset.data.gross_purchase_amount_minor : toScaledInt(String(asset.data.gross_purchase_amount ?? 0),line.currency_scale);
      const salvage = typeof asset.data.salvage_value_minor === "number" ? asset.data.salvage_value_minor : toScaledInt(String(asset.data.salvage_value ?? 0),line.currency_scale);
      const cap = gross-salvage; const existing=this.assetDepreciationEntries.filter((entry)=>entry.asset===line.asset).reduce((total,entry)=>total+entry.amount_minor,0);
      const next=existing+(pending.get(line.asset)??0)+line.amount_minor;
      if (line.amount_minor <= 0 || next > cap) throw errors.reference(`Depreciation exceeds depreciable value for Asset ${line.asset}`);
      pending.set(line.asset,(pending.get(line.asset)??0)+line.amount_minor);
    }
  }

}
