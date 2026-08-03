import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  MAX_STOCK_RECONCILIATION_BATCH_ROWS,
  buildStockReconciliationBatchDocument,
  type StockReconciliationBatchDocument,
  type StockReconciliationBatchRowInput,
} from "./stock-reconciliation-batch.js";

export const STOCK_RECONCILIATION_BATCH_INPUT_TABLE = "counts";

/**
 * Domain declaration consumed by App Factory / integration wiring.
 * Whole-table itemization is intentional: one count table updates one canonical
 * Stock Reconciliation document, not N unrelated stock transactions.
 */
export const STOCK_RECONCILIATION_BATCH_CONTRACT = Object.freeze({
  contract_version: 1,
  input_table: STOCK_RECONCILIATION_BATCH_INPUT_TABLE,
  itemization: "table",
  atomicity: "independent",
  max_items: MAX_STOCK_RECONCILIATION_BATCH_ROWS,
} as const);

export interface StockReconciliationBatchExecutorValue {
  shared_inputs: JsonObject;
  item: JsonObject;
}

/** Trusted A2 item context. None of these values are accepted from the action payload. */
export interface StockReconciliationBatchTrustedContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  batchId: string;
  itemId: string;
  itemIndex: number;
  operationId: string;
}

/**
 * Canonical authority gateway owned by the integration layer.
 * Implementations must load through permission-scoped document access and save through the
 * ordinary Stock Reconciliation/document-kernel path. This adapter never writes a ledger.
 */
export interface StockReconciliationBatchGateway<TResult = JsonObject> {
  assertCanSave(context: StockReconciliationBatchTrustedContext, name: string): Promise<void>;
  loadDraft(context: StockReconciliationBatchTrustedContext, name: string): Promise<StockReconciliationBatchDocument | null>;
  previewCanonicalSave(
    context: StockReconciliationBatchTrustedContext,
    name: string,
    document: StockReconciliationBatchDocument,
  ): Promise<TResult>;
  commitCanonicalSave(
    context: StockReconciliationBatchTrustedContext,
    name: string,
    document: StockReconciliationBatchDocument,
  ): Promise<TResult>;
}

export interface StockReconciliationBatchDomainExecutor<TResult = JsonObject> {
  preview(value: StockReconciliationBatchExecutorValue, context: StockReconciliationBatchTrustedContext): Promise<TResult>;
  commit(value: StockReconciliationBatchExecutorValue, context: StockReconciliationBatchTrustedContext): Promise<TResult>;
}

/** Create the A3 consumer that A2 invokes for one table-itemized transaction. */
export function createStockReconciliationBatchDomainExecutor<TResult = JsonObject>(
  gateway: StockReconciliationBatchGateway<TResult>,
): StockReconciliationBatchDomainExecutor<TResult> {
  return {
    preview: (value, context) => executeStockReconciliationBatch(gateway, "preview", value, context),
    commit: (value, context) => executeStockReconciliationBatch(gateway, "commit", value, context),
  };
}

async function executeStockReconciliationBatch<TResult>(
  gateway: StockReconciliationBatchGateway<TResult>,
  mode: "preview" | "commit",
  value: StockReconciliationBatchExecutorValue,
  context: StockReconciliationBatchTrustedContext,
): Promise<TResult> {
  assertTrustedContext(context);
  rejectClientAuthority(value.shared_inputs, "shared_inputs");
  rejectClientAuthority(value.item, "item");

  const name = requiredText(value.shared_inputs.reconciliation, "shared_inputs.reconciliation");
  const rows = tableRows(value.item[STOCK_RECONCILIATION_BATCH_INPUT_TABLE]);

  await gateway.assertCanSave(context, name);
  const draft = await gateway.loadDraft(context, name);
  if (!draft) throw errors.reference(`Stock Reconciliation draft does not exist: ${name}`);

  const mapped = buildStockReconciliationBatchDocument(draft, rows);
  return mode === "preview"
    ? gateway.previewCanonicalSave(context, name, mapped)
    : gateway.commitCanonicalSave(context, name, mapped);
}

function tableRows(value: unknown): StockReconciliationBatchRowInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw errors.validation(`item.${STOCK_RECONCILIATION_BATCH_INPUT_TABLE} must be a non-empty array`);
  }
  if (value.length > MAX_STOCK_RECONCILIATION_BATCH_ROWS) {
    throw errors.validation(
      `item.${STOCK_RECONCILIATION_BATCH_INPUT_TABLE} supports at most ${MAX_STOCK_RECONCILIATION_BATCH_ROWS} rows`,
    );
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw errors.validation(`item.${STOCK_RECONCILIATION_BATCH_INPUT_TABLE}[${index}] must be an object`);
    }
    return structuredClone(row) as StockReconciliationBatchRowInput;
  });
}

function assertTrustedContext(context: StockReconciliationBatchTrustedContext): void {
  if (!context.tenantId?.trim()) throw errors.permission("Trusted tenant context is required");
  if (!context.actor?.user_id?.trim()) throw errors.permission("Trusted actor context is required");
  if (!context.operationId?.trim()) throw errors.validation("Batch operation correlation is required");
}

function rejectClientAuthority(value: JsonObject, where: string): void {
  for (const key of ["tenant_id", "tenantId", "actor", "roles", "user_id", "userId"]) {
    if (Object.hasOwn(value, key)) {
      throw errors.validation(`${where}.${key} is server-authoritative and cannot be supplied by the batch payload`);
    }
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} is required`);
  const normalized = String(value).normalize("NFC").trim();
  if (!normalized || normalized.length > 240) throw errors.validation(`${field} is invalid`);
  return normalized;
}
