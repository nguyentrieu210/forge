import type { CanonicalDocument, GeneralLedgerEntry, JsonObject, MutationPlan, MutationReceipt, MutationSnapshot, StockLedgerEntry } from "../../contracts/src/index.js";

export interface SubmittedQuantityQuery {
  tenantId: string;
  parentDoctype: string;
  referenceField: string;
  referenceName: string;
  itemCode: string;
  excludeName?: string;
  /** Stock/procurement progress uses canonical stock quantity; billing uses transaction quantity. */
  quantityKind?: "stock" | "transaction";
}

export interface TrackedStockState {
  qty_micros: number;
  /** NULL means no catch-weight measurement has ever been posted for this slice. */
  weight_micros: number | null;
  stock_value_minor: number;
}

export interface TrackedStockPosition extends TrackedStockState {
  item_code: string;
  warehouse: string;
  batch_no: string;
}

/**
 * Narrow read ports exposed by the kernel package.
 *
 * `DomainReader` remains the backwards-compatible aggregate while controllers are
 * migrated incrementally. New controller/service code should depend on the smallest
 * port that describes what it actually reads instead of importing the whole kernel
 * projection surface. That keeps domain capability growth from turning this package
 * into one giant cross-domain service locator.
 */
export interface DocumentReader {
  getDocument<T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null>;
  /** Bounded controller-side scan for state overlays such as stock reservations. */
  listDocumentsByDoctype<T extends JsonObject>(tenantId: string, doctype: string): Promise<Array<CanonicalDocument<T>>>;
}

export interface SubmittedQuantityReader {
  sumSubmittedChildQuantityMicros(query: SubmittedQuantityQuery): Promise<number>;
}

export interface PaymentLedgerReader {
  getOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  /** Outstanding in company-currency minor units, derived from the payment ledger. */
  getBaseOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  /** Các dòng sổ cái gốc của đúng một lần ghi chứng từ; dùng để huỷ bằng đối dấu nguyên trạng. */
  getVoucherGlEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<GeneralLedgerEntry[]>;
}

export interface StockLedgerReader {
  getStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string): Promise<number>;
  getTrackedStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string, batchNo?: string, serialNo?: string): Promise<number>;
  /** Quantity, catch weight and value from the same append-only ledger slice. */
  getTrackedStockState(
    tenantId: string,
    itemCode: string,
    warehouse: string,
    batchNo?: string,
    throughPostingAt?: string,
  ): Promise<TrackedStockState>;
  /** Current batch positions grouped from the ledger; never infer location from Batch.received_warehouse. */
  listTrackedStockPositions(tenantId: string, itemCode?: string): Promise<TrackedStockPosition[]>;
  /** Các dòng sổ gốc của đúng một lần ghi chứng từ; dùng để huỷ bằng đối dấu nguyên trạng. */
  getVoucherStockEntries(tenantId: string, voucherType: string, voucherNo: string, voucherRevision: number): Promise<StockLedgerEntry[]>;
  /**
   * `batchNo` thu hẹp lịch sử về ĐÚNG một lô.
   *
   * Đó chính là cách làm "giá đích danh": phát lại FIFO trên một lô duy nhất thì lớp đầu tiên
   * cũng là lớp duy nhất, nên giá trả về là giá của chính lô đó. Không cần thêm phương pháp
   * thứ ba vào hệ thống — chỉ cần hỏi đúng câu hỏi hẹp hơn.
   *
   * Cần vì lúc cắt, xưởng CỐ Ý chọn lô khổ nhỏ nhất còn đủ dài để phế ít nhất — thường không
   * phải lô cũ nhất. Định giá bỏ qua lô thì vật lý tiêu thụ lô này còn kế toán trừ lô kia,
   * lệch âm thầm. ERPNext dính đúng lỗi này (PR #29804).
   */
  getStockLedgerHistory(tenantId: string, itemCode: string, warehouse: string, throughPostingAt?: string, batchNo?: string): Promise<StockLedgerEntry[]>;
  isStockBundleUsed(tenantId: string, bundleName: string): Promise<boolean>;
}

export interface ReturnProgressReader {
  getReturnedQuantityMicros(tenantId: string, referenceDoctype: string, referenceName: string, kind: string, itemCode: string): Promise<number>;
}

export interface ManufacturingProgressReader {
  getManufacturedQuantityMicros(tenantId: string, workOrder: string, kind?: "Material Transfer" | "Consumption" | "Manufacture", itemCode?: string): Promise<number>;
  getJobCardCompletedQuantityMicros(tenantId: string, workOrder: string, excludeName?: string): Promise<number>;
}

export interface AssetProgressReader {
  getAssetDepreciatedMinor(tenantId: string, asset: string): Promise<number>;
  getAssetDisposalMinor(tenantId: string, asset: string): Promise<number>;
  isAssetDisposed(tenantId: string, asset: string): Promise<boolean>;
}

export interface ProjectProgressReader {
  getProjectTimeSummary(tenantId: string, project: string): Promise<{ hours_micros: number; cost_minor: number; billing_minor: number }>;
}

export interface PosProgressReader {
  getPosSessionSales(tenantId: string, openingEntry: string): Promise<{ net_total_minor: number; tax_total_minor: number; grand_total_minor: number }>;
  isPosSessionClosed(tenantId: string, openingEntry: string): Promise<boolean>;
  hasOpenPosSessionForProfile(tenantId: string, posProfile: string, excludeOpeningEntry?: string): Promise<boolean>;
}

export interface BankReconciliationReader {
  getBankReconciledMinor(tenantId: string, bankTransaction: string): Promise<number>;
}

export interface SalesFulfillmentReader {
  getFulfilledQuantityMicros(tenantId: string, salesOrder: string, kind?: "Delivery" | "Billing", itemCode?: string): Promise<number>;
}

export interface ProcurementProgressReader {
  getProcuredQuantityMicros(tenantId: string, purchaseOrder: string, kind?: "Receipt" | "Billing", itemCode?: string): Promise<number>;
}

export interface MasterDataReader {
  hasMasterRecord(tenantId: string, recordType: string, name: string): Promise<boolean>;
  getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null>;
  listMasterRecordData(tenantId: string, recordType: string): Promise<Array<{ name: string; data: JsonObject }>>;
}

export interface PeriodLockReader {
  getPeriodLockDate(tenantId: string, company: string): Promise<string | null>;
}

/**
 * Compatibility aggregate for existing controllers.
 *
 * Keep this interface while domain owners migrate to narrow ports. It must not gain
 * new domain-specific methods by default: add a focused port first, then compose it
 * here only when existing compatibility requires the aggregate surface.
 */
export interface DomainReader
  extends DocumentReader,
    SubmittedQuantityReader,
    PaymentLedgerReader,
    StockLedgerReader,
    ReturnProgressReader,
    ManufacturingProgressReader,
    AssetProgressReader,
    ProjectProgressReader,
    PosProgressReader,
    BankReconciliationReader,
    SalesFulfillmentReader,
    ProcurementProgressReader,
    MasterDataReader,
    PeriodLockReader {}

export interface MutationStore extends DomainReader {
  getReceipt(tenantId: string, commandId: string): Promise<MutationReceipt | null>;
  execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt>;
  snapshot?(): MutationSnapshot;
}
