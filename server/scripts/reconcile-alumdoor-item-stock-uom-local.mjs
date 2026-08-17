#!/usr/bin/env node
/**
 * RETIRED direct local mutator.
 *
 * Canonical Item reconciliation is owned by:
 *   node scripts\local-runner\run-local-import.mjs item-master ...
 *
 * This historical helper used to PUT Item.stock_uom directly through the local
 * API. Leaving it callable would create a mutation path outside the canonical
 * lock/backup/verify lifecycle. Add a guarded adapter operation instead if this
 * exact migration is ever needed again.
 */
throw new Error(
  'RETIRED_LOCAL_MUTATOR: reconcile-alumdoor-item-stock-uom-local.mjs may not mutate local state directly; use the canonical item-master runner',
);
