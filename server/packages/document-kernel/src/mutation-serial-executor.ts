/**
 * Serializes a full asynchronous mutation pipeline for one coordination scope.
 *
 * Durable Object RPC methods can interleave while awaiting storage. Routing two
 * commands to the same DO therefore does not, by itself, protect a shared
 * read-check-write invariant. Callers must enqueue the whole operation, from the
 * first authoritative read through the final commit.
 *
 * Rejections deliberately release the queue so one failed mutation cannot poison
 * every later command for the same coordinator.
 */
export class MutationSerialExecutor {
  private tail: Promise<void> = Promise.resolve();

  execute<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation);
    this.tail = run.then(() => undefined, () => undefined);
    return run;
  }
}
