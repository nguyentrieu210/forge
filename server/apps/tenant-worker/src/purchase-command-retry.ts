import { asCloudForgeError, errors } from "../../../packages/core/src/index.js";
import { MutationSerialExecutor } from "../../../packages/document-kernel/src/index.js";

export const PURCHASE_REVISION_RETRIES = 3;

/**
 * Retry only the optimistic allocation revision conflict emitted by the
 * authoritative mutation store. Every retry re-enters DocumentKernel so the
 * command receipt/idempotency check and the latest queue revision are read
 * again before a new plan is built.
 */
export async function executePurchaseCommandWithRevisionRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = PURCHASE_REVISION_RETRIES,
): Promise<T> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw errors.validation("Purchase revision retry attempts must be a positive integer");
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const normalized = asCloudForgeError(error);
      if (normalized.code !== "PURCHASE_ALLOCATION_REVISION_CONFLICT" || attempt === maxAttempts) {
        throw normalized;
      }
    }
  }

  throw errors.purchaseAllocationConflict();
}

/**
 * Durable Object requests may interleave while awaiting database work. Keep the
 * full purchase mutation, including plan construction and commit, serialized for
 * one supplier coordinator instance. Failed operations release the queue so a
 * later command cannot be permanently blocked.
 *
 * The queue primitive is shared with inventory coordination; purchase keeps only
 * its domain-specific revision retry policy here.
 */
export class PurchaseCommandSerialExecutor {
  private readonly serial = new MutationSerialExecutor();

  execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.serial.execute(() => executePurchaseCommandWithRevisionRetry(operation));
  }
}
