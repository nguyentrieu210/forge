# R7-A Frappe 16 Denominator

R7-A does not invent a second Frappe inventory. The canonical denominator is:

- `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`
- 28 framework domains
- Frappe `v16.19.0`
- commit `ba18090b141740e75d52aa97bfc525ff2f831f6c`

The 90-class artifact matrix at `server/docs/spec/source-exact/11-complete-artifact-coverage-matrix.md` remains the artifact-level coverage authority underneath the 28 domain-level R7 dispositions.

## Domain-level completion rule

Each of the 28 IDs must appear exactly once in `R7_FRAPPE_PARITY_MATRIX.json`.

A domain may be closed only as:

- EXACT_PARITY
- SEMANTIC_PARITY
- FORGE_SUPERSET
- INTENTIONAL_DIFFERENCE
- OUT_OF_SCOPE with explicit rationale

A domain in GAP or UNRESOLVED blocks `R7-A FRAPPE PLATFORM CLOSED`.

## Why two levels exist

The 28-domain ledger answers "which platform behavior family?". The 90 artifact classes answer "which source/runtime artifact types must be inventoried/exported/oracled/mapped?". R7 certification needs both; neither replaces the other.
