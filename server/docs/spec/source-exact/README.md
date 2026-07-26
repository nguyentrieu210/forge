# CloudForge Source-Exact Documentation System

This directory defines the only accepted route from pinned Frappe/ERPNext source code to a CloudForge parity claim.

## Baseline

| App | Tag | Immutable commit | License | Role |
|---|---|---|---|---|
| Frappe | `v16.19.0` | `ba18090b141740e75d52aa97bfc525ff2f831f6c` | MIT | Framework/kernel behavior baseline |
| ERPNext | `v16.20.0` | `ff46d20b259a2d65a7ded959df9f9a42991a3562` | GPL-3.0 | ERP behavior baseline |

Tags are convenience names. Every scan, fixture and mapping is keyed by the full commit SHA and source hash.

## What “100%” means

CloudForge uses three independent coverage claims:

1. **Source inventory coverage** — every file in the immutable checkout is listed and SHA-256 hashed.
2. **Static extraction coverage** — every supported structured artifact is parsed without a silent error.
3. **Behavioral parity coverage** — runtime outputs from pinned Frappe/ERPNext and CloudForge match under reviewed fixtures.

A 100% inventory scan does not prove runtime parity. A 100% static scan does not resolve dynamic hooks, database behavior, tenant configuration, regional modules, external services or user customization. Only an oracle suite can close behavioral parity.

## Toolchain

- `tools/fetch_pinned_source.py` resolves a tag, verifies its full commit and safely extracts the archive.
- `tools/source_exact_parser.py` inventories and parses the immutable source tree.
- `tools/run_source_exact_pipeline.py` orchestrates acquisition and scanning.
- `tools/verify_source_exact.py` fails closed on missing outputs, SHA drift or parse gaps.
- `tests/test_source_exact_parser.py` is the regression test for the parser contract.

## Generated outputs per app

```text
source-exact/generated/<app>-<tag>/
├── README.md
├── summary.json
├── coverage.json
├── manifest.json
├── doctype-index.json
├── report-index.json
├── python-index.json
├── client-index.json
├── json-index.json
├── hooks-index.json
├── dependency-graph.json
├── whitelisted-methods.json
├── frappe-calls.json
├── parse-errors.json
└── docs/
    ├── doctypes/
    └── python/
```

`doctype-index.json` contains the complete normalized source DocType JSON, not a hand-written approximation. Python code is represented by AST-derived structure, source spans, calls and hashes; it is not executed by the scanner.

## Required second pass

Static output must be enriched with a runtime export from a site created from the same locked commits. Runtime export resolves merged metadata, custom fields, property setters, installed-app hooks, permissions, workflow state, translated labels, report registration and boot/runtime routes.

## Master coverage references

- `11-complete-artifact-coverage-matrix.md` enumerates 90 source/runtime artifact classes that must be resolved.
- `12-source-to-cloudforge-traceability.md` defines the immutable source → runtime → oracle → implementation evidence chain.
- `erpnext-artifact-resolution-ledger.json` tracks all 109 declared ERPNext artifacts fail-closed.
- `frappe-framework-domain-ledger.json` tracks 28 framework domains fail-closed.

## Hard rule

No document may say “100% ERPNext parity” unless all of the following are simultaneously true for the declared scope:

- immutable source inventory is 100%;
- static extraction has no unresolved critical parse errors;
- each behavior is mapped to CloudForge code or a reviewed waiver;
- positive, negative, cancellation, amendment, race and replay fixtures are green;
- document, GL, stock, payment, status and report projections reconcile;
- external/non-portable behavior is explicitly isolated;
- license provenance is complete.
