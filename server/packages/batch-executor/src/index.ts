export type BatchExecutionMode = "preview" | "commit";
export type BatchExecutionAtomicity = "atomic" | "independent";

export interface BatchExecutionItem<TItem> {
  id: string;
  value: TItem;
}

/**
 * Runtime-only execution plan consumed by A2. This is deliberately not the public
 * AppAction/BatchAction manifest contract. A1 owns the public contract and must adapt
 * its canonical shape into this plan after dependency convergence.
 */
export interface BatchExecutionPlan<TItem> {
  batchId: string;
  requestHash: string;
  mode: BatchExecutionMode;
  atomicity: BatchExecutionAtomicity;
  idempotencyKey?: string;
  items: readonly BatchExecutionItem<TItem>[];
}

/** Trusted values supplied by the authenticated server route, never by client payload. */
export interface TrustedBatchExecutionContext<TActor> {
  tenantId: string;
  actor: TActor;
  traceId: string;
}

export interface BatchItemExecutionContext<TActor> extends TrustedBatchExecutionContext<TActor> {
  batchId: string;
  itemId: string;
  itemIndex: number;
  /** Stable command correlation key for domain-kernel idempotency on retry. */
  operationId: string;
}

export interface BatchDomainExecutor<TItem, TValue, TActor> {
  /** Preview and commit are separate so preview can never accidentally call the commit callback. */
  preview(item: TItem, context: BatchItemExecutionContext<TActor>): Promise<TValue>;
  commit(item: TItem, context: BatchItemExecutionContext<TActor>): Promise<TValue>;
}

export interface AtomicBatchRunner {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface BatchReplayScope {
  tenantId: string;
  idempotencyKey: string;
  requestHash: string;
}

export type BatchReplayClaim<TResult> =
  | { state: "acquired" }
  | { state: "replay"; requestHash: string; result: TResult }
  | { state: "in_flight"; requestHash: string };

/**
 * claim() must be atomic for a tenant/idempotencyKey pair in a production adapter.
 * The executor never performs commit work unless it owns the claim.
 */
export interface BatchReplayStore<TResult> {
  claim(scope: BatchReplayScope): Promise<BatchReplayClaim<TResult>>;
  complete(scope: BatchReplayScope, result: TResult): Promise<void>;
  release(scope: BatchReplayScope): Promise<void>;
}

export type BatchAuditEventType =
  | "batch.started"
  | "batch.replayed"
  | "batch.completed"
  | "batch.failed"
  | "item.previewed"
  | "item.committed"
  | "item.failed"
  | "item.rolled_back";

export interface BatchAuditEvent {
  type: BatchAuditEventType;
  tenantId: string;
  traceId: string;
  batchId: string;
  mode: BatchExecutionMode;
  atomicity: BatchExecutionAtomicity;
  itemId?: string;
  itemIndex?: number;
  operationId?: string;
  errorCode?: string;
}

export interface BatchAuditSink {
  record(event: BatchAuditEvent): Promise<void>;
}

export interface SerializedBatchError {
  code: string;
  message: string;
}

export type BatchItemExecutionOutcome<TValue> =
  | { index: number; itemId: string; operationId: string; status: "success"; value: TValue }
  | { index: number; itemId: string; operationId: string; status: "error"; error: SerializedBatchError }
  | { index: number; itemId: string; operationId: string; status: "rolled_back" }
  | { index: number; itemId: string; operationId: string; status: "skipped" };

/**
 * Internal execution evidence only. A1 owns the external result envelope and may map
 * this trace into its canonical public result without changing A2 execution mechanics.
 */
export interface BatchExecutionTrace<TValue> {
  batchId: string;
  mode: BatchExecutionMode;
  atomicity: BatchExecutionAtomicity;
  traceId: string;
  replayed: boolean;
  items: BatchItemExecutionOutcome<TValue>[];
  error?: SerializedBatchError;
}

export class BatchExecutionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "BatchExecutionError";
  }
}

export interface ExecuteBatchOptions<TItem, TValue, TActor> {
  plan: BatchExecutionPlan<TItem>;
  context: TrustedBatchExecutionContext<TActor>;
  domain: BatchDomainExecutor<TItem, TValue, TActor>;
  replayStore?: BatchReplayStore<BatchExecutionTrace<TValue>>;
  atomicRunner?: AtomicBatchRunner;
  audit?: BatchAuditSink;
}

interface AtomicFailure<TValue> {
  error: SerializedBatchError;
  outcomes: Array<Extract<BatchItemExecutionOutcome<TValue>, { status: "success" }>>;
  failedIndex: number;
}

class AtomicExecutionFailure<TValue> extends Error {
  constructor(readonly failure: AtomicFailure<TValue>) {
    super(failure.error.message);
    this.name = "AtomicExecutionFailure";
  }
}

export async function executeBatch<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
): Promise<BatchExecutionTrace<TValue>> {
  const { plan, context } = options;
  validatePlan(plan);
  validateTrustedContext(context);

  if (plan.mode === "commit" && !plan.idempotencyKey) {
    throw new BatchExecutionError("BATCH_IDEMPOTENCY_REQUIRED", "Commit batches require an idempotency key");
  }
  if (plan.mode === "commit" && plan.atomicity === "atomic" && !options.atomicRunner) {
    throw new BatchExecutionError("BATCH_ATOMIC_RUNNER_REQUIRED", "Atomic commit requires an authoritative transaction runner");
  }
  if (plan.mode === "commit" && !options.replayStore) {
    throw new BatchExecutionError("BATCH_REPLAY_STORE_REQUIRED", "Commit batches require an atomic replay store");
  }

  const scope = plan.mode === "commit"
    ? {
        tenantId: context.tenantId,
        idempotencyKey: plan.idempotencyKey as string,
        requestHash: plan.requestHash,
      }
    : undefined;

  let ownsReplayClaim = false;
  if (scope && options.replayStore) {
    const claim = await options.replayStore.claim(scope);
    if (claim.state === "replay") {
      assertMatchingReplayHash(scope, claim.requestHash);
      const replayed: BatchExecutionTrace<TValue> = { ...claim.result, replayed: true };
      await audit(options.audit, batchEvent(options, "batch.replayed"));
      return replayed;
    }
    if (claim.state === "in_flight") {
      assertMatchingReplayHash(scope, claim.requestHash);
      throw new BatchExecutionError(
        "BATCH_REPLAY_IN_FLIGHT",
        "An identical commit is already in flight; retry with the same idempotency key",
      );
    }
    ownsReplayClaim = true;
  }

  await audit(options.audit, batchEvent(options, "batch.started"));

  try {
    const result = plan.mode === "preview"
      ? await executePreview(options)
      : plan.atomicity === "atomic"
        ? await executeAtomicCommit(options)
        : await executeIndependentCommit(options);

    if (scope && options.replayStore) {
      await options.replayStore.complete(scope, result);
      ownsReplayClaim = false;
    }

    await audit(options.audit, batchEvent(options, "batch.completed"));
    return result;
  } catch (error) {
    if (ownsReplayClaim && scope && options.replayStore) await options.replayStore.release(scope);
    const serialized = serializeError(error);
    await audit(options.audit, { ...batchEvent(options, "batch.failed"), errorCode: serialized.code });
    throw error;
  }
}

async function executePreview<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
): Promise<BatchExecutionTrace<TValue>> {
  const outcomes: BatchItemExecutionOutcome<TValue>[] = [];
  for (let index = 0; index < options.plan.items.length; index += 1) {
    const entry = options.plan.items[index];
    if (!entry) continue;
    const itemContext = createItemContext(options.context, options.plan.batchId, entry.id, index);
    try {
      const value = await options.domain.preview(entry.value, itemContext);
      outcomes.push({ index, itemId: entry.id, operationId: itemContext.operationId, status: "success", value });
      await auditItem(options, "item.previewed", entry.id, index, itemContext.operationId);
    } catch (error) {
      const serialized = serializeError(error);
      outcomes.push({ index, itemId: entry.id, operationId: itemContext.operationId, status: "error", error: serialized });
      await auditItem(options, "item.failed", entry.id, index, itemContext.operationId, serialized.code);
      if (options.plan.atomicity === "atomic") {
        appendSkipped(options, outcomes, index + 1);
        return trace(options, outcomes, serialized);
      }
    }
  }
  return trace(options, outcomes);
}

async function executeIndependentCommit<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
): Promise<BatchExecutionTrace<TValue>> {
  const outcomes: BatchItemExecutionOutcome<TValue>[] = [];
  for (let index = 0; index < options.plan.items.length; index += 1) {
    const entry = options.plan.items[index];
    if (!entry) continue;
    const itemContext = createItemContext(options.context, options.plan.batchId, entry.id, index);
    try {
      const value = await options.domain.commit(entry.value, itemContext);
      outcomes.push({ index, itemId: entry.id, operationId: itemContext.operationId, status: "success", value });
      await auditItem(options, "item.committed", entry.id, index, itemContext.operationId);
    } catch (error) {
      const serialized = serializeError(error);
      outcomes.push({ index, itemId: entry.id, operationId: itemContext.operationId, status: "error", error: serialized });
      await auditItem(options, "item.failed", entry.id, index, itemContext.operationId, serialized.code);
    }
  }
  return trace(options, outcomes);
}

async function executeAtomicCommit<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
): Promise<BatchExecutionTrace<TValue>> {
  const runner = options.atomicRunner;
  if (!runner) throw new BatchExecutionError("BATCH_ATOMIC_RUNNER_REQUIRED", "Atomic commit requires a transaction runner");

  try {
    const completed = await runner.run(async () => {
      const outcomes: Array<Extract<BatchItemExecutionOutcome<TValue>, { status: "success" }>> = [];
      for (let index = 0; index < options.plan.items.length; index += 1) {
        const entry = options.plan.items[index];
        if (!entry) continue;
        const itemContext = createItemContext(options.context, options.plan.batchId, entry.id, index);
        try {
          const value = await options.domain.commit(entry.value, itemContext);
          outcomes.push({ index, itemId: entry.id, operationId: itemContext.operationId, status: "success", value });
          await auditItem(options, "item.committed", entry.id, index, itemContext.operationId);
        } catch (error) {
          const serialized = serializeError(error);
          await auditItem(options, "item.failed", entry.id, index, itemContext.operationId, serialized.code);
          throw new AtomicExecutionFailure<TValue>({ error: serialized, outcomes, failedIndex: index });
        }
      }
      return outcomes;
    });
    return trace(options, completed);
  } catch (error) {
    if (!(error instanceof AtomicExecutionFailure)) throw error;
    const failure = error.failure as AtomicFailure<TValue>;
    for (const outcome of failure.outcomes) {
      await auditItem(options, "item.rolled_back", outcome.itemId, outcome.index, outcome.operationId);
    }
    throw new BatchExecutionError("BATCH_ATOMIC_COMMIT_FAILED", failure.error.message);
  }
}

function appendSkipped<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
  outcomes: BatchItemExecutionOutcome<TValue>[],
  startIndex: number,
): void {
  for (let index = startIndex; index < options.plan.items.length; index += 1) {
    const pending = options.plan.items[index];
    if (!pending) continue;
    const context = createItemContext(options.context, options.plan.batchId, pending.id, index);
    outcomes.push({ index, itemId: pending.id, operationId: context.operationId, status: "skipped" });
  }
}

function trace<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
  items: BatchItemExecutionOutcome<TValue>[],
  error?: SerializedBatchError,
): BatchExecutionTrace<TValue> {
  return {
    batchId: options.plan.batchId,
    mode: options.plan.mode,
    atomicity: options.plan.atomicity,
    traceId: options.context.traceId,
    replayed: false,
    items,
    ...(error ? { error } : {}),
  };
}

function createItemContext<TActor>(
  context: TrustedBatchExecutionContext<TActor>,
  batchId: string,
  itemId: string,
  itemIndex: number,
): BatchItemExecutionContext<TActor> {
  return { ...context, batchId, itemId, itemIndex, operationId: `${batchId}:${itemId}` };
}

function validatePlan<TItem>(plan: BatchExecutionPlan<TItem>): void {
  if (!plan.batchId.trim()) throw new BatchExecutionError("BATCH_ID_REQUIRED", "Batch id is required");
  if (!plan.requestHash.trim()) throw new BatchExecutionError("BATCH_REQUEST_HASH_REQUIRED", "Request hash is required");
  const ids = new Set<string>();
  for (const item of plan.items) {
    if (!item.id.trim()) throw new BatchExecutionError("BATCH_ITEM_ID_REQUIRED", "Every batch item requires an id");
    if (ids.has(item.id)) throw new BatchExecutionError("BATCH_DUPLICATE_ITEM_ID", `Duplicate batch item id: ${item.id}`);
    ids.add(item.id);
  }
}

function validateTrustedContext<TActor>(context: TrustedBatchExecutionContext<TActor>): void {
  if (!context.tenantId.trim()) throw new BatchExecutionError("BATCH_TRUSTED_TENANT_REQUIRED", "Trusted tenant context is required");
  if (!context.traceId.trim()) throw new BatchExecutionError("BATCH_TRACE_REQUIRED", "Trace id is required");
}

function assertMatchingReplayHash(scope: BatchReplayScope, storedHash: string): void {
  if (scope.requestHash !== storedHash) {
    throw new BatchExecutionError(
      "BATCH_IDEMPOTENCY_CONFLICT",
      "The idempotency key was already used for a different request",
    );
  }
}

function serializeError(error: unknown): SerializedBatchError {
  if (error instanceof BatchExecutionError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "BATCH_ITEM_FAILED", message: error.message };
  return { code: "BATCH_ITEM_FAILED", message: "Batch item failed" };
}

function batchEvent<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
  type: BatchAuditEventType,
): BatchAuditEvent {
  return {
    type,
    tenantId: options.context.tenantId,
    traceId: options.context.traceId,
    batchId: options.plan.batchId,
    mode: options.plan.mode,
    atomicity: options.plan.atomicity,
  };
}

async function audit(sink: BatchAuditSink | undefined, event: BatchAuditEvent): Promise<void> {
  if (sink) await sink.record(event);
}

async function auditItem<TItem, TValue, TActor>(
  options: ExecuteBatchOptions<TItem, TValue, TActor>,
  type: BatchAuditEventType,
  itemId: string,
  itemIndex: number,
  operationId: string,
  errorCode?: string,
): Promise<void> {
  await audit(options.audit, {
    ...batchEvent(options, type),
    itemId,
    itemIndex,
    operationId,
    ...(errorCode ? { errorCode } : {}),
  });
}
