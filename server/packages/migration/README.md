# @cloudforge/migration

WS13-owned migration and implementation orchestration primitives for Forge.

This package does **not** create a second write path. Authoritative document writes must still go through the existing permission + document-kernel/domain path. The package owns planning, source adaptation, duplicate/retry decisions, incremental checkpoints, reconciliation and implementation readiness.

## Safety invariants

1. Preview/dry-run is not final validation. The authoritative controller validates again on apply.
2. Partial success is explicit. One failed row does not imply already-confirmed rows were rolled back.
3. A missing row outcome is `unresolved`, not `failed`. Reconcile it before retrying because a write may have committed while its response was lost.
4. Duplicate behavior is explicit: `error`, `skip` or `update`. There is no silent overwrite default.
5. Money/quantity reconciliation uses plain decimal strings and BigInt-scaled addition, never binary-float accumulation.
6. Source-controlled migration manifests may not contain passwords, API keys, tokens, cookies or private keys.
7. Incremental Frappe/ERPNext paging uses the `(modified, name)` tuple so rows sharing one timestamp are not skipped at page boundaries.
8. Generic apply is sequential. A domain may introduce safe batching only after proving rows are independent.
9. An authoritative write must be followed by a persisted row outcome. If outcome persistence fails, execution stops and the row is treated as unresolved until reconciled.
10. Production backup/migration/rollback evidence belongs to WS12. This package does not grant production authorization.

## Modules

| Module | Responsibility |
|---|---|
| `index.ts` | deterministic plan/fingerprint/state-machine core |
| `adapters.ts` | Frappe/ERPNext row normalization and verified MISA inventory mapping |
| `execution.ts` | retry quarantine, duplicate decision, incremental checkpoint contract |
| `frappe-source.ts` | stable Frappe incremental cursor/query contract |
| `manifest.ts` | source/target dependency manifest, phase ordering and secret guard |
| `orchestrator.ts` | kernel-neutral partial-success apply orchestration |
| `reconcile.ts` | exact count/distinct/decimal reconciliation metrics |
| `template.ts` | workbook-neutral import template and deterministic mapping suggestions |
| `implementation.ts` | implementation/go-live checklist state, dependencies and evidence snapshot |
| `implementation-template.ts` | scope-driven enterprise checklist template |

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

and advances with the tuple `(modified, name)`, not with `modified` alone. Persist the next checkpoint only after the corresponding batch outcomes are durable.

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

## Read-only CLI

Build CloudForge first, then:

```bash
node server/scripts/forge-migration.mjs validate --manifest migration.json
node server/scripts/forge-migration.mjs reconcile --spec metrics.json --source source.json --target target.json
```

The CLI intentionally has no `apply` command. Production mutation remains behind the authoritative integration and production safety gates.

## Integration boundaries

### WS00 / shared kernel

WS13 still needs a durable migration run + row receipt contract that records stable source identity, row fingerprint, resolved target name and command receipt. Until that lands, autonamed rows without a durable target identity cannot be called fully retry-safe.

### Domain streams

Finance, stock and HR/payroll own opening-data validation, posting/correction semantics and authoritative reconciliation metric definitions. WS13 orchestrates those providers but must not invent domain ledger rules.

### WS12

Production cutover requires backup/preflight/rollback/release evidence from the SRE/data-safety boundary.

### WS14 / existing client import UI

Existing client-specific MISA screens should consume the canonical WS13 mapping contract when a shared integration seam is available. WS13 does not patch the shared React runtime or another workstream's UI.

## Verification

Targeted WS13 tests live in `server/tests/migration-*.test.mjs`.

When a full checkout/dependency environment is unavailable, record repository build/tests as `NOT RUN`; do not convert missing evidence into a fake PASS. Isolated strict TypeScript/regression evidence may support development, but it does not replace full repository verification for merge/release.
