import type { Actor, JsonObject } from "../../contracts/src/index.js";
import { errors } from "../../core/src/index.js";
import {
  MAX_BULK_BOM_ROWS,
  previewBulkBomDraft,
  type BulkBomDraftInput,
  type BulkBomDraftPreview,
  type BulkBomRowInput,
} from "./manufacturing-bom-bulk.js";

export const MANUFACTURING_BOM_BATCH_INPUT_TABLE = "components";

/** One pasted component table creates/previews one canonical BOM Draft transaction. */
export const MANUFACTURING_BOM_BATCH_CONTRACT = Object.freeze({
  contract_version: 1,
  input_table: MANUFACTURING_BOM_BATCH_INPUT_TABLE,
  itemization: "table",
  atomicity: "independent",
  max_items: MAX_BULK_BOM_ROWS,
} as const);

export interface ManufacturingBomBatchExecutorValue {
  shared_inputs: JsonObject;
  item: JsonObject;
}

export interface ManufacturingBomBatchTrustedContext {
  tenantId: string;
  actor: Actor;
  traceId: string;
  batchId: string;
  itemId: string;
  itemIndex: number;
  operationId: string;
}

export interface ManufacturingBomBatchGateway<TResult = JsonObject> {
  assertCanCreate(context: ManufacturingBomBatchTrustedContext, input: BulkBomDraftInput): Promise<void>;
  previewCanonicalDraft?(context: ManufacturingBomBatchTrustedContext, input: BulkBomDraftInput): Promise<TResult>;
  commitCanonicalDraft(context: ManufacturingBomBatchTrustedContext, input: BulkBomDraftInput): Promise<TResult>;
}

export interface ManufacturingBomBatchDomainExecutor<TResult = JsonObject | BulkBomDraftPreview> {
  preview(value: ManufacturingBomBatchExecutorValue, context: ManufacturingBomBatchTrustedContext): Promise<TResult>;
  commit(value: ManufacturingBomBatchExecutorValue, context: ManufacturingBomBatchTrustedContext): Promise<TResult>;
}

export function createManufacturingBomBatchDomainExecutor<TResult = JsonObject | BulkBomDraftPreview>(
  gateway: ManufacturingBomBatchGateway<TResult>,
): ManufacturingBomBatchDomainExecutor<TResult> {
  return {
    async preview(value, context) {
      const input = parseManufacturingBomBatchExecutorValue(value, context);
      await gateway.assertCanCreate(context, input);
      if (gateway.previewCanonicalDraft) return gateway.previewCanonicalDraft(context, input);
      return await previewBulkBomDraft(input) as TResult;
    },
    async commit(value, context) {
      const input = parseManufacturingBomBatchExecutorValue(value, context);
      await gateway.assertCanCreate(context, input);
      return gateway.commitCanonicalDraft(context, input);
    },
  };
}

export function parseManufacturingBomBatchExecutorValue(
  value: ManufacturingBomBatchExecutorValue,
  context: ManufacturingBomBatchTrustedContext,
): BulkBomDraftInput {
  assertTrustedContext(context);
  rejectClientAuthority(value.shared_inputs, "shared_inputs");
  rejectClientAuthority(value.item, "item");

  const rows = componentRows(value.item[MANUFACTURING_BOM_BATCH_INPUT_TABLE]);
  const shared = value.shared_inputs;
  const allowed = new Set([
    "company", "item", "quantity", "currency", "operating_cost", "revision",
    "effective_from", "effective_to", "output_uom", "output_conversion_factor",
  ]);
  for (const key of Object.keys(shared)) {
    if (!allowed.has(key)) throw errors.validation(`Unknown BOM batch shared input: ${key}`);
  }

  return {
    company: requiredText(shared.company, "shared_inputs.company"),
    item: requiredText(shared.item, "shared_inputs.item"),
    ...(shared.quantity === undefined ? {} : { quantity: decimal(shared.quantity, "shared_inputs.quantity") }),
    ...(shared.currency === undefined ? {} : { currency: requiredText(shared.currency, "shared_inputs.currency") }),
    ...(shared.operating_cost === undefined ? {} : { operating_cost: decimal(shared.operating_cost, "shared_inputs.operating_cost") }),
    ...(shared.revision === undefined ? {} : { revision: positiveInteger(shared.revision, "shared_inputs.revision") }),
    effective_from: requiredText(shared.effective_from, "shared_inputs.effective_from"),
    ...(shared.effective_to === undefined ? {} : { effective_to: requiredText(shared.effective_to, "shared_inputs.effective_to") }),
    ...(shared.output_uom === undefined ? {} : { output_uom: requiredText(shared.output_uom, "shared_inputs.output_uom") }),
    ...(shared.output_conversion_factor === undefined
      ? {}
      : { output_conversion_factor: decimal(shared.output_conversion_factor, "shared_inputs.output_conversion_factor") }),
    rows,
  };
}

function componentRows(value: unknown): BulkBomRowInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw errors.validation(`item.${MANUFACTURING_BOM_BATCH_INPUT_TABLE} must be a non-empty array`);
  }
  if (value.length > MAX_BULK_BOM_ROWS) {
    throw errors.validation(`item.${MANUFACTURING_BOM_BATCH_INPUT_TABLE} supports at most ${MAX_BULK_BOM_ROWS} rows`);
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw errors.validation(`item.${MANUFACTURING_BOM_BATCH_INPUT_TABLE}[${index}] must be an object`);
    }
    return structuredClone(row) as BulkBomRowInput;
  });
}

function assertTrustedContext(context: ManufacturingBomBatchTrustedContext): void {
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

function decimal(value: unknown, field: string): string | number {
  if (typeof value !== "string" && typeof value !== "number") throw errors.validation(`${field} must be a decimal value`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw errors.validation(`${field} must be a positive integer`);
  return parsed;
}
