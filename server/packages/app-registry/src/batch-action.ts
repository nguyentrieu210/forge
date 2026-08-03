import { errors } from "../../core/src/index.js";
import type { JsonObject } from "../../contracts/src/index.js";
import type { AppActionInputTable, LegacyBulkTransactionField } from "./action-input-table.js";

export type BatchActionAtomicity = "atomic" | "independent";
export type BatchActionMode = "preview" | "commit";
export type BatchActionItemStatus = "success" | "error" | "rolled_back" | "skipped";

export const BATCH_ACTION_MAX_PAYLOAD_BYTES = 2_000_000;

/**
 * Canonical public metadata for repeatable AppAction execution.
 *
 * The contract is deliberately vertical-neutral. The bound input table describes transport
 * shape; the domain action/controller still owns validation, permission, lifecycle, ledger,
 * correction and side effects.
 */
export interface AppActionBatchContract {
  contract_version: 1;
  input_table: string;
  item_id_field: string;
  atomicity: BatchActionAtomicity;
  max_items: number;
}

/** Client/route envelope. Trusted tenant/actor/role context is never accepted here. */
export interface BatchActionRequestEnvelope {
  contract_version: 1;
  batch_id: string;
  idempotency_key?: string;
  payload: JsonObject;
}

export interface NormalizedBatchActionItem {
  item_id: string;
  index: number;
  operation_id: string;
  value: JsonObject;
}

export interface NormalizedBatchActionInvocation {
  contract_version: 1;
  batch_id: string;
  mode: BatchActionMode;
  atomicity: BatchActionAtomicity;
  idempotency_key?: string;
  items: NormalizedBatchActionItem[];
}

/** Structural adapter target matching A2's runtime-only execution plan without importing it. */
export interface BatchExecutorPlanLike {
  batchId: string;
  requestHash: string;
  mode: BatchActionMode;
  atomicity: BatchActionAtomicity;
  idempotencyKey?: string;
  items: Array<{ id: string; value: JsonObject }>;
}

export interface BatchActionError {
  code: string;
  message: string;
}

export type BatchActionItemResult<T = unknown> =
  | { index: number; item_id: string; operation_id: string; status: "success"; value: T }
  | { index: number; item_id: string; operation_id: string; status: "error"; error: BatchActionError }
  | { index: number; item_id: string; operation_id: string; status: "rolled_back" }
  | { index: number; item_id: string; operation_id: string; status: "skipped" };

export interface BatchActionResultEnvelope<T = unknown> {
  contract_version: 1;
  batch_id: string;
  mode: BatchActionMode;
  atomicity: BatchActionAtomicity;
  trace_id: string;
  replayed: boolean;
  items: BatchActionItemResult<T>[];
  error?: BatchActionError;
}

/** Minimal trace shape A2 or another executor can map into the public result envelope. */
export interface BatchRuntimeTraceLike<T = unknown> {
  batchId: string;
  mode: BatchActionMode;
  atomicity: BatchActionAtomicity;
  traceId: string;
  replayed: boolean;
  items: Array<{
    index: number;
    itemId: string;
    operationId: string;
    status: BatchActionItemStatus;
    value?: T;
    error?: BatchActionError;
  }>;
  error?: BatchActionError;
}

const NAME = /^[a-z][a-z0-9_]*$/;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const LEGACY_PREFIX = "BulkTransaction:";

function object(value: unknown, where: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw errors.validation(`${where} must be an object`);
  return value as JsonObject;
}

function text(value: unknown, where: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\r\n\0]/.test(value)) {
    throw errors.validation(`${where} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function integer(value: unknown, where: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw errors.validation(`${where} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}

export function parseAppActionBatchContract(
  value: unknown,
  inputTables: readonly AppActionInputTable[],
  options: { where?: string; hasPreview?: boolean } = {},
): AppActionBatchContract {
  const where = options.where ?? "batch";
  const input = object(value, where);
  if (input.contract_version !== 1) throw errors.validation(`${where}.contract_version must be 1`);
  if (options.hasPreview === false) throw errors.validation(`${where} requires the AppAction to declare preview`);

  const inputTable = text(input.input_table, `${where}.input_table`, 120);
  if (!NAME.test(inputTable)) throw errors.validation(`${where}.input_table must be a lowercase fieldname`);
  const table = inputTables.find((candidate) => candidate.fieldname === inputTable);
  if (!table) throw errors.validation(`${where}.input_table must name one declared input table: ${inputTable}`);

  const itemIdField = text(input.item_id_field, `${where}.item_id_field`, 120);
  if (!NAME.test(itemIdField)) throw errors.validation(`${where}.item_id_field must be a lowercase fieldname`);
  if (!table.columns.some((column) => column.fieldname === itemIdField)) {
    throw errors.validation(`${where}.item_id_field must name a column of ${inputTable}: ${itemIdField}`);
  }

  const atomicity = text(input.atomicity, `${where}.atomicity`, 16) as BatchActionAtomicity;
  if (atomicity !== "atomic" && atomicity !== "independent") {
    throw errors.validation(`${where}.atomicity must be atomic or independent`);
  }
  const maxItems = input.max_items === undefined
    ? table.max_rows
    : integer(input.max_items, `${where}.max_items`, 1, 500);
  if (maxItems > table.max_rows) {
    throw errors.validation(`${where}.max_items cannot exceed ${inputTable}.max_rows (${table.max_rows})`);
  }
  if (maxItems < table.min_rows) {
    throw errors.validation(`${where}.max_items cannot be less than ${inputTable}.min_rows (${table.min_rows})`);
  }

  return {
    contract_version: 1,
    input_table: inputTable,
    item_id_field: itemIdField,
    atomicity,
    max_items: maxItems,
  };
}

/**
 * Decode batch metadata embedded inside the existing BulkTransaction compatibility payload.
 * Old clients ignore the extra `batch` property; new server/tooling can reconstruct it.
 */
export function parseLegacyBatchActionField(
  field: LegacyBulkTransactionField,
  table: AppActionInputTable,
  hasPreview: boolean,
): AppActionBatchContract | undefined {
  if (field.fieldtype !== "Text" || !field.options?.startsWith(LEGACY_PREFIX)) return undefined;
  let decoded: JsonObject;
  try {
    decoded = object(JSON.parse(field.options.slice(LEGACY_PREFIX.length)), "BulkTransaction compatibility spec");
  } catch (error) {
    if (error instanceof SyntaxError) throw errors.validation("BulkTransaction compatibility spec is not valid JSON");
    throw error;
  }
  if (decoded.batch === undefined) return undefined;
  return parseAppActionBatchContract(decoded.batch, [table], {
    where: `batch(${table.fieldname})`,
    hasPreview,
  });
}

export function normalizeBatchActionInvocation(
  value: unknown,
  contract: AppActionBatchContract,
  mode: BatchActionMode,
): NormalizedBatchActionInvocation {
  const input = object(value, "batch request");
  if (input.contract_version !== 1) throw errors.validation("batch request.contract_version must be 1");
  const batchId = text(input.batch_id, "batch request.batch_id", 160);
  if (!CORRELATION.test(batchId)) throw errors.validation("batch request.batch_id contains unsupported characters");
  const idempotencyKey = input.idempotency_key === undefined
    ? undefined
    : text(input.idempotency_key, "batch request.idempotency_key", 200);
  if (mode === "commit" && !idempotencyKey) {
    throw errors.validation("batch request.idempotency_key is required for commit");
  }

  const payload = object(input.payload, "batch request.payload");
  const payloadBytes = new TextEncoder().encode(stableJson(payload)).byteLength;
  if (payloadBytes > BATCH_ACTION_MAX_PAYLOAD_BYTES) {
    throw errors.validation(`batch request.payload exceeds ${BATCH_ACTION_MAX_PAYLOAD_BYTES} bytes`);
  }

  const rawRows = payload[contract.input_table];
  if (!Array.isArray(rawRows)) throw errors.validation(`batch request.payload.${contract.input_table} must be an array`);
  if (!rawRows.length) throw errors.validation(`batch request.payload.${contract.input_table} must not be empty`);
  if (rawRows.length > contract.max_items) {
    throw errors.validation(`batch request.payload.${contract.input_table} exceeds max_items (${contract.max_items})`);
  }

  const ids = new Set<string>();
  const items = rawRows.map((row, index): NormalizedBatchActionItem => {
    const value = object(row, `batch request.payload.${contract.input_table}[${index}]`);
    const itemId = text(value[contract.item_id_field], `batch item ${index}.${contract.item_id_field}`, 160);
    if (!CORRELATION.test(itemId)) throw errors.validation(`batch item ${index}.${contract.item_id_field} contains unsupported characters`);
    if (ids.has(itemId)) throw errors.validation(`Duplicate batch item id: ${itemId}`);
    ids.add(itemId);
    return {
      item_id: itemId,
      index,
      operation_id: `${batchId}:${itemId}`,
      value: structuredClone(value),
    };
  });

  return {
    contract_version: 1,
    batch_id: batchId,
    mode,
    atomicity: contract.atomicity,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    items,
  };
}

/** Stable material A2 can hash for replay-conflict detection; idempotency key is excluded. */
export function canonicalBatchRequestMaterial(invocation: NormalizedBatchActionInvocation): string {
  return stableJson({
    contract_version: invocation.contract_version,
    batch_id: invocation.batch_id,
    mode: invocation.mode,
    atomicity: invocation.atomicity,
    items: invocation.items.map((item) => ({ item_id: item.item_id, index: item.index, value: item.value })),
  });
}

/** A2 adapter seam: hashing policy stays with execution infrastructure, public semantics stay here. */
export function toBatchExecutorPlan(
  invocation: NormalizedBatchActionInvocation,
  requestHash: string,
): BatchExecutorPlanLike {
  const hash = text(requestHash, "batch request hash", 256);
  return {
    batchId: invocation.batch_id,
    requestHash: hash,
    mode: invocation.mode,
    atomicity: invocation.atomicity,
    ...(invocation.idempotency_key ? { idempotencyKey: invocation.idempotency_key } : {}),
    items: invocation.items.map((item) => ({ id: item.item_id, value: structuredClone(item.value) })),
  };
}

/** Map a runtime trace into the one public deterministic result envelope. */
export function createBatchActionResultEnvelope<T>(trace: BatchRuntimeTraceLike<T>): BatchActionResultEnvelope<T> {
  const batchId = text(trace.batchId, "batch result.batchId", 160);
  const traceId = text(trace.traceId, "batch result.traceId", 200);
  if (trace.mode !== "preview" && trace.mode !== "commit") throw errors.validation("batch result.mode is invalid");
  if (trace.atomicity !== "atomic" && trace.atomicity !== "independent") throw errors.validation("batch result.atomicity is invalid");
  const seen = new Set<number>();
  const items = [...trace.items].sort((left, right) => left.index - right.index).map((item): BatchActionItemResult<T> => {
    if (!Number.isInteger(item.index) || item.index < 0) throw errors.validation("batch result item index must be a non-negative integer");
    if (seen.has(item.index)) throw errors.validation(`Duplicate batch result index: ${item.index}`);
    seen.add(item.index);
    const itemId = text(item.itemId, `batch result item ${item.index}.itemId`, 160);
    const expectedOperationId = `${batchId}:${itemId}`;
    if (item.operationId !== expectedOperationId) {
      throw errors.validation(`batch result item ${item.index}.operationId must equal ${expectedOperationId}`);
    }
    if (item.status === "success") {
      return { index: item.index, item_id: itemId, operation_id: expectedOperationId, status: "success", value: item.value as T };
    }
    if (item.status === "error") {
      if (!item.error) throw errors.validation(`batch result item ${item.index}.error is required`);
      return { index: item.index, item_id: itemId, operation_id: expectedOperationId, status: "error", error: normalizeError(item.error, `batch result item ${item.index}.error`) };
    }
    if (item.status === "rolled_back") return { index: item.index, item_id: itemId, operation_id: expectedOperationId, status: "rolled_back" };
    if (item.status === "skipped") return { index: item.index, item_id: itemId, operation_id: expectedOperationId, status: "skipped" };
    throw errors.validation(`batch result item ${item.index}.status is invalid`);
  });

  return {
    contract_version: 1,
    batch_id: batchId,
    mode: trace.mode,
    atomicity: trace.atomicity,
    trace_id: traceId,
    replayed: trace.replayed === true,
    items,
    ...(trace.error ? { error: normalizeError(trace.error, "batch result.error") } : {}),
  };
}

function normalizeError(value: BatchActionError, where: string): BatchActionError {
  return { code: text(value.code, `${where}.code`, 120), message: text(value.message, `${where}.message`, 1000) };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Fixed cross-layer semantics; callers must not make these configurable per vertical. */
export const BATCH_ACTION_SEMANTICS = Object.freeze({
  trusted_context: "server",
  commit_idempotency: "tenant-scoped-key-required",
  replay_conflict: "same-key-different-request-rejected",
  operation_id: "batch_id:item_id",
  correction_owner: "domain",
  preview_side_effects: "forbidden",
  request_hash_material: "canonical-public-request-without-idempotency-key",
} as const);
