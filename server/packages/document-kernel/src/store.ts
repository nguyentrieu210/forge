import type { CanonicalDocument, JsonObject, MutationPlan, MutationReceipt, MutationSnapshot, StockLedgerEntry } from "../../contracts/src/index.js";

export interface SubmittedQuantityQuery {
  tenantId: string;
  parentDoctype: string;
  referenceField: string;
  referenceName: string;
  itemCode: string;
  excludeName?: string;
}

export interface DomainReader {
  getDocument<T extends JsonObject>(tenantId: string, doctype: string, name: string): Promise<CanonicalDocument<T> | null>;
  sumSubmittedChildQuantityMicros(query: SubmittedQuantityQuery): Promise<number>;
  getOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  /** Outstanding in company-currency minor units, derived from the payment ledger. */
  getBaseOutstandingMinor(tenantId: string, voucherType: string, voucherNo: string): Promise<number>;
  getStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string): Promise<number>;
  getTrackedStockBalanceMicros(tenantId: string, itemCode: string, warehouse: string, batchNo?: string, serialNo?: string): Promise<number>;
  getStockLedgerHistory(tenantId: string, itemCode: string, warehouse: string, throughPostingAt?: string): Promise<StockLedgerEntry[]>;
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
