#!/usr/bin/env node
/**
 * RETIRED direct local mutator.
 *
 * Warehouse master mutation must be added as an explicit guarded operation in
 * the canonical local runner before it can write local state again. This old
 * helper created Warehouse records directly through the loopback API without
 * the shared lock/backup/post-verify lifecycle.
 */
throw new Error(
  'RETIRED_LOCAL_MUTATOR: seed-alumdoor-warehouse-local.mjs may not mutate local state directly; add a canonical runner operation before using it again',
);
