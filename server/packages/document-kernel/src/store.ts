import type { CanonicalDocument, JsonObject, MutationPlan, MutationReceipt, MutationSnapshot, StockLedgerEntry } from "../../contracts/src/index.js";

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

export interface DomainReader {
  getDocument<T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null>;
  sumSubmittedChildQuantityMicros(query: SubmittedQuantityQuery): Promise<number>;
  getOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  /** Outstanding in company-currency minor units, derived from the payment ledger. */
  getBaseOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  getStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string): Promise<number>;
  getTrackedStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string, batchNo?: string, serialNo?: string): Promise<number>;
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
  getReturnedQuantityMicros(tenantId: string, referenceDoctype: string, referenceName: string, kind: string, itemCode: string): Promise<number>;
  getManufacturedQuantityMicros(tenantId: string, workOrder: string, kind?: "Material Transfer" | "Consumption" | "Manufacture", itemCode?: string): Promise<number>;
  getJobCardCompletedQuantityMicros(tenantId: string, workOrder: string, excludeName?: string): Promise<number>;
  getAssetDepreciatedMinor(tenantId: string, asset: string): Promise<number>;
  getAssetDisposalMinor(tenantId: string, asset: string): Promise<number>;
  isAssetDisposed(tenantId: string, asset: string): Promise<boolean>;
  getProjectTimeSummary(tenantId: string, project: string): Promise<{ hours_micros: number; cost_minor: number; billing_minor: number }>;
  getPosSessionSales(tenantId: string, openingEntry: string): Promise<{ net_total_minor: number; tax_total_minor: number; grand_total_minor: number }>;
  isPosSessionClosed(tenantId: string, openingEntry: string): Promise<boolean>;
  hasOpenPosSessionForProfile(tenantId: string, posProfile: string, excludeOpeningEntry?: string): Promise<boolean>;
  getBankReconciledMinor(tenantId: string, bankTransaction: string): Promise<number>;
  getFulfilledQuantityMicros(tenantId: string, salesOrder: string, kind?: "Delivery" | "Billing", itemCode?: string): Promise<number>;
  getProcuredQuantityMicros(tenantId: string, purchaseOrder: string, kind?: "Receipt" | "Billing", itemCode?: string): Promise<number>;
  hasMasterRecord(tenantId: string, recordType: string, name: string): Promise<boolean>;
  getMasterRecordData(tenantId: string, recordType: string, name: string): Promise<JsonObject | null>;
  listMasterRecordData(tenantId: string, recordType: string): Promise<Array<{ name: string; data: JsonObject }>>;
  getPeriodLockDate(tenantId: string, company: string): Promise<string | null>;
}

export interface MutationStore extends DomainReader {
  getReceipt(tenantId: string, commandId: string): Promise<MutationReceipt | null>;
  execute<T extends JsonObject>(plan: MutationPlan<T>): Promise<MutationReceipt>;
  snapshot?(): MutationSnapshot;
}
