# @cloudforge/migration

WS13-owned migration, implementation and customer-success orchestration for Forge.

This package does **not** create a second business write path. Authoritative document writes still go through the existing permission + document-kernel/domain path. WS13 owns source normalization, planning, staging/journaling, duplicate/retry decisions, incremental checkpoints, reconciliation and implementation/go-live orchestration.

## Safety invariants

1. Preview/dry-run is not final validation. The authoritative controller validates again on apply.
2. Partial success is explicit. One failed row does not imply already-confirmed rows were rolled back.
3. A missing/uncertain row outcome is not blindly retried. The durable executor checks the kernel `mutation_receipts` first.
4. Stable target identity and `command_id` are persisted **before** an authoritative create/update executes.
5. Duplicate behavior is explicit: `error`, `skip` or `update`. There is no silent overwrite default.
6. Money/quantity reconciliation uses plain decimal strings and BigInt-scaled addition, never binary-float accumulation.
7. Source-controlled migration manifests may not contain passwords, API keys, tokens, cookies or private keys.
8. Incremental Frappe/ERPNext paging uses the `(modified, name)` tuple so rows sharing one timestamp are not skipped at page boundaries.
9. Generic apply is sequential. A domain may introduce safe batching only after proving rows are independent.
10. Staged row documents may be purged only after the run is completed/cancelled; hashes/receipts remain as evidence.
11. Production backup/migration/rollback evidence belongs to WS12. This package does not grant production authorization.

## Modules

| Module | Responsibility |
|---|---|
| `index.ts` | deterministic plan/fingerprint/state-machine core |
| `adapters.ts` | Frappe/ERPNext row normalization and verified MISA inventory mapping |
| `tabular.ts` | workbook-neutral CSV/Excel grid normalization |
| `template.ts` | import template and deterministic mapping suggestions |
| `correction.ts` | confirmed failed-row correction dataset/CSV |
| `execution.ts` | retry quarantine, duplicate decision, incremental checkpoint contract |
| `frappe-source.ts` | stable Frappe incremental cursor/query contract |
| `manifest.ts` | source/target dependency manifest, phase ordering and secret guard |
| `reconcile.ts` | exact count/distinct/decimal reconciliation metrics |
| `orchestrator.ts` | side-effect-neutral partial-success orchestration primitive |
| `d1-journal.ts` | durable run/row/checkpoint/reconciliation journal + kernel-receipt recovery |
| `durable-orchestrator.ts` | journal-first executor: reserve -> command identity -> kernel write -> outcome |
| `kernel-port.ts` | thin adapter from existing Forge command boundary to durable executor |
| `opening.ts` | domain-owned opening-data preview/apply/reconcile contract |
| `implementation.ts` | implementation/go-live checklist state, dependencies and evidence snapshot |
| `implementation-template.ts` | scope-driven enterprise checklist template |
| `customer-success.ts` | training/knowledge/support-handoff/adoption readiness |

Tenant migration `0053_migration_run_journal.sql` owns the durable WS13 journal tables. It does not alter document/ledger storage. `0053` is intentionally reserved after the parallel WS06 `0043-0047`, WS01 `0048`, and WS15 `0049-0052` ranges to prevent cross-workstream migration-number collisions.

## MISA evidence

The MISA inventory mapping is promoted from the existing `client/apps/kho-vn/src/misa-mapping.ts` implementation, which has an in-repo verifier against real receipt, delivery and transfer sample workbooks. The generic package preserves the proven rules:

- find the header row instead of hard-coding a row number;
- match normalized Vietnamese header text instead of column position;
- group item lines by voucher number;
- normalize dates to `YYYY-MM-DD`;
- keep decimal values as canonical strings.

The WS13 adapter is a source transformation. It does not submit stock/accounting documents by itself.

## ERPNext/Frappe incremental contract

Use `buildFrappeIncrementalPageRequest()` with the last confirmed cursor. Pagination is ordered by:

```text
modified ASC, name ASC
```

and advances with the tuple `(modified, name)`, not with `modified` alone. The persisted checkpoint stores the exact `source_id` and adapter name such as `erpnext-rest-v1`; it never reconstructs the adapter from the broader source kind.

## Durable apply/recovery

For create/update, the integration must prepare the exact kernel command without executing it. WS13 then runs:

```text
resolve target name
  -> reserve source row -> target name
  -> persist command_id + payload_hash (applying)
  -> run canonical document command
  -> persist imported/updated outcome
```

If command execution throws because the response disappeared, `D1MigrationJournal.recoverApplyingRow()` checks the existing kernel `mutation_receipts` on a first-primary session:

- receipt matches reserved target + payload: recover as committed success;
- no receipt: only then may the row become failed/retryable;
- mismatched receipt: invariant failure, never silent retry.

The kernel itself remains authoritative. WS13 does not insert business documents, GL or stock rows directly.

## Migration manifest

A manifest describes sources and targets without credentials. Targets are ordered in three phases:

```text
master -> opening -> transaction
```

Dependencies may stay in the same phase or point to an earlier phase, never a later phase.

Example:

```json
{
  "schema_version": 1,
  "id": "erpnext-cutover",
  "sources": [
    { "id": "erpnext", "kind": "erpnext", "adapter": "erpnext-rest-v1", "options": { "base_url_ref": "ERP_SOURCE_URL" } }
  ],
  "targets": [
    {
      "id": "customers",
      "source_id": "erpnext",
      "target_doctype": "Customer",
      "phase": "master",
      "depends_on": [],
      "mapping": {},
      "duplicate_policy": "update",
      "key_field": "name",
      "reconciliation_metrics": ["customer_count"]
    }
  ]
}
```

`base_url_ref` is a reference name, not the URL credential itself. Secrets remain outside source control.

## Opening data

WS13 owns `OpeningMigrationProvider`, preview/apply sequencing and exact reconciliation. Finance/stock/HR providers own:

- authoritative validation;
- period/effective-date rules;
- posting/ledger side effects;
- correction/reversal semantics;
- domain metric definitions.

That boundary prevents migration code from becoming a second accounting/stock/payroll engine.

## Implementation and customer success

`buildEnterpriseImplementationChecklist()` derives setup/migration/training/go-live gates only from explicitly enabled domains. It does not assume every customer uses Finance, Stock, HR or Tax.

Customer-success readiness links training evidence, knowledge/runbook references, a support-provider handoff and adoption counters. It points at helpdesk/service providers rather than implementing a competing ticket engine inside WS13.

## Read-only CLI

Build CloudForge first, then:

```bash
node server/scripts/forge-migration.mjs validate --manifest migration.json
node server/scripts/forge-migration.mjs reconcile --spec metrics.json --source source.json --target target.json
```

The CLI intentionally has no `apply` command. Production mutation remains behind the authoritative integration and production safety gates.

## Integration boundaries / dependency requests

### Shared Frappe/API seam

Durable storage no longer requires a new kernel primitive. The remaining shared integration is narrow: supply existing `lookup`, authoritative autoname resolution, `buildCommand` and `runCommand` callbacks to `KernelMigrationApplyPort`, then wire the current Data Import API to WS13 orchestration.

### Domain streams

Finance, stock and HR/payroll still need concrete `OpeningMigrationProvider` implementations and authoritative reconciliation metric definitions. WS13 must not invent their ledger rules.

### WS12

Production cutover still requires backup/preflight/rollback/release evidence from the SRE/data-safety boundary.

### WS14 / existing client import UI

Existing client-specific MISA/Data Import screens should consume the canonical WS13 mapping/preview/correction contracts through an integration seam. WS13 does not patch the shared React runtime or another workstream's UI.

## Verification

Targeted WS13 tests live in `server/tests/migration-*.test.mjs` plus `server/scripts/test-migration-run-journal.py`.

When a full checkout/dependency environment is unavailable, repository build/test status is `NOT RUN`; missing evidence is never relabeled PASS. Isolated strict TypeScript/regression and SQLite replay evidence may support development, but they do not replace full repository verification for merge/release.
