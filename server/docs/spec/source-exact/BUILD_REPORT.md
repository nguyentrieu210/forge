# Source-Exact Documentation Build Report

Date: 2026-07-24

## Completed in this package

- Full immutable SHA locked for Frappe v16.19.0 and ERPNext v16.20.0.
- Safe official-source acquisition utility implemented.
- Complete source inventory and source tree fingerprint implementation.
- Lossless DocType/report/standard JSON extraction implemented.
- Python AST extraction implemented for symbols, lifecycle methods, whitelisted methods, hooks, calls, exception messages, SQL fingerprints, DocType references and mappings.
- Conservative JS/TS/Vue extraction implemented for form/list/report registration, RPC methods, routes, imports and field names.
- Dependency graph and human-readable DocType/Python dossiers implemented.
- Coverage, mapping, oracle, runtime export, licensing and upgrade contracts documented.
- 90-class source/runtime artifact coverage matrix documented.
- Immutable source-to-runtime-to-oracle-to-implementation traceability contract documented.
- Runtime Frappe metadata/configuration exporter implemented.
- Fail-closed verifier implemented.
- ERPNext 109-artifact enrichment ledger generated.
- Frappe 28-domain framework ledger generated.
- Parser regression fixture expanded and executed successfully.

## Verification executed

```text
npm run test:source-spec

1 parser integration test: PASS
Covered fixture kinds: DocType, controller, client script, report,
hooks, patches, workspace, workflow, notification, template,
translation and SQL inventory.
```

```text
npm run check

21/21 Node/domain tests: PASS
SQLite schema/trigger/fixed-point/reference guards: PASS
SQLite optimistic, fulfilment, payment and stock races: PASS
Worker TypeScript typecheck: PASS
Repository verifier: PASS
```

```text
39 project JSON files outside generated/vendor directories: VALID
```

`npm run verify:source-spec` intentionally fails closed because the generated full indexes for the two pinned upstream source trees are not present.

## Not completed in this build environment

The current container cannot resolve external archive hosts, so the two official source archives could not be downloaded. The package therefore does **not** claim that Frappe/ERPNext source inventory, runtime export or behavioral parity has been completed.

The vendored `node_modules` copied from the original ZIP also lacks the Linux Rolldown optional native binding, so the workerd/Vitest suite was not reproducible in this environment. It should be run after a clean `npm ci`; the clean distribution intentionally excludes `node_modules`.

## Command to close the static-source gate

```bash
python3 docs/spec/tools/run_source_exact_pipeline.py \
  --project-root . \
  --sources-dir ../upstream \
  --apps frappe,erpnext \
  --fetch

npm run verify:source-spec
```

Alternatively, provide checkouts matching the locked full SHAs, run the scanner, then run the runtime exporter on a clean pinned Frappe site and populate mapping/oracle evidence.
