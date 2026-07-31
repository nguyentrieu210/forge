# Alumdoor Purchase FIFO activation runbook

Status: pre-activation runbook. FIFO remains disabled until every gate below passes and the owner gives a new explicit activation approval.

## Scope

This runbook covers Purchase allocation backfill readiness, staging execution, business acceptance, and the final activation gate. It does not authorize a production deploy, secret change, DNS change, or FIFO activation by itself.

Authoritative implementation:

- `server/scripts/backfill-purchase-receipt-allocations.mjs`
- `server/scripts/prepare-purchase-fifo-activation.mjs`
- `server/scripts/purchase-allocation-backfill-planner.mjs`
- `server/packages/document-kernel/src/purchase-allocation-rollout-store.ts`
- `server/migrations/tenant/0031_purchase_allocation_control_metadata.sql`
- `server/migrations/tenant/0032_purchase_reversed_window_corrections.sql`

## Non-negotiable safety rules

1. Never run activation against production before staging evidence is complete.
2. Never guess an ambiguous legacy Purchase Order or Purchase Receipt child row.
3. `unresolved_count` must be exactly `0`.
4. Every write command must include the approved checksum from a fresh dry-run.
5. The command recomputes the plan and rejects checksum drift before any D1 write.
6. Backfill execution must leave `purchase_allocation_rollout_state.enabled=0`.
7. Production activation requires a fresh backup, rollback plan, exact checksum, named actor, and separate explicit approval.
8. Evidence, database exports, cookies, credentials, and customer data must not be committed to the repository.
9. Generated reports must be written outside the repository.

## Gate A: read-only readiness dry-run

Use a staging tenant or a production-shaped sanitized copy. The readiness wrapper is intentionally read-only and rejects `--execute`, `--activate`, `--confirm`, `--actor`, and `--expected-checksum`.

```bash
cd server
node scripts/prepare-purchase-fifo-activation.mjs \
  --tenant <staging-tenant> \
  --output-dir /absolute/path/outside/repository
```

For a sanitized fixture:

```bash
cd server
node scripts/prepare-purchase-fifo-activation.mjs \
  --tenant <fixture-tenant-id> \
  --input /absolute/path/to/sanitized-fixture.json \
  --output-dir /absolute/path/outside/repository
```

Expected result:

- mode is `read-only-dry-run`;
- checksum is a lowercase SHA-256 value;
- `unresolved_count=0`;
- PO-level checksum rows are reviewed;
- no repository file is created;
- no D1 write occurs.

Exit code `2` means the report was generated but unresolved rows remain. Stop and resolve the source data or mapping rules. Do not proceed by editing report JSON.

## Gate B: review evidence

Review the full report outside Git and record only redacted summary evidence:

- tenant/environment identifier;
- source snapshot timestamp;
- checksum;
- queue/window/obligation/allocation/unapplied counts;
- unresolved count;
- reviewer and review timestamp;
- report artifact location and retention policy.

Do not paste document payloads, supplier data, credentials, cookies, tokens, or raw database exports into PR comments.

## Gate C: controlled staging backfill

Only after Gate A and Gate B pass. Copy the exact reviewed checksum into the write command:

```bash
cd server
node scripts/backfill-purchase-receipt-allocations.mjs \
  --tenant <staging-tenant> \
  --output /absolute/path/outside/repository/backfill-execute.json \
  --execute \
  --confirm <staging-tenant> \
  --actor <named-operator> \
  --expected-checksum <reviewed-lowercase-sha256>
```

The write command recomputes the plan from the current tenant state and rejects the operation before any D1 mutation when:

- `--expected-checksum` is missing or malformed;
- the current checksum differs from the reviewed checksum;
- unresolved rows remain;
- the tenant confirmation does not match;
- rollout is already enabled;
- allocation ledger history already exists.

Required postconditions:

- ledger counts equal the reviewed dry-run counts;
- stored `backfill_checksum` equals the reviewed checksum;
- stored `unresolved_count=0`;
- rollout state remains `enabled=0`;
- rerunning execute is rejected when ledger history already exists;
- no production tenant is touched.

If counts or checksum differ, stop. Do not activate and do not overwrite the ledger.

## Gate D: authenticated staging business smoke

Use controlled test documents that can be cancelled or removed according to business policy.

1. Submit a Purchase Order and review allocation preview.
2. Submit one or more Purchase Receipts and verify FIFO allocation order.
3. Verify partial receipt, over-receipt, unapplied quantity, barem weight, and actual-weight attribution.
4. Cancel a Receipt and verify append-only reversal entries.
5. Close a settlement window with mandatory reason.
6. Reverse settlement and verify `close -> reverse -> cancel` behavior.
7. Exercise manual override with permission, reason, confirmation, and audit history.
8. Open supplier debt report, filters, summaries, drill-down, and CSV export.
9. Repeat the operator flow on desktop and mobile.
10. Verify rollout state is still disabled after all tests.

Record redacted evidence and D1 latency for normal and concurrent supplier operations. Endpoint health alone does not satisfy this gate.

## Gate E: production activation preparation

Before requesting activation approval:

1. Confirm exact CI-green code SHA and deployed Tenant Worker version.
2. Run a fresh production read-only dry-run.
3. Confirm checksum matches the reviewed activation candidate and `unresolved_count=0`.
4. Create a fresh production backup and verify the artifact exists.
5. Prepare rollback steps and the previous known-good Worker version.
6. Confirm no unrelated migration, Gateway deploy, DNS, or secret change is bundled.
7. Record the named activation actor.
8. Obtain a new explicit approval that names the production tenant and approved checksum.

## Gate F: activation

Activation is a separate action and must not be bundled into code deployment.

```bash
cd server
node scripts/backfill-purchase-receipt-allocations.mjs \
  --tenant alu \
  --output /absolute/path/outside/repository/activation-check.json \
  --execute \
  --activate \
  --confirm alu \
  --actor <named-operator> \
  --expected-checksum <approved-lowercase-sha256>
```

The command must reject:

- checksum drift;
- unresolved rows;
- missing actor;
- missing exact tenant confirmation;
- malformed checksum;
- activation that does not converge to the expected stored state.

After activation, verify `enabled=1`, exact checksum, actor, timestamp, production health, authenticated Purchase flow, and ledger correctness.

## Rollback and incident response

- Before activation: keep rollout disabled and redeploy the previous Worker if code rollback is needed.
- Backfill failure: stop, preserve evidence outside Git, and forward-fix tooling or data. Never edit an applied migration.
- Activation transaction failure: verify rollout remains disabled before any retry.
- Post-activation ledger or permission defect: stop Purchase writes if necessary, collect redacted evidence, and follow the approved rollback plan. Do not delete append-only ledger history manually.

## Required evidence summary

A final activation request must include:

- exact code SHA and CI run IDs;
- staging tenant and test timestamp;
- dry-run and stored checksum;
- `unresolved_count=0`;
- ledger counts before and after staging execute;
- authenticated staging smoke result;
- contention/latency result;
- production backup artifact ID;
- rollback version and steps;
- named actor;
- explicit owner approval for activation.
