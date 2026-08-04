# RC4-A18 — Alumdoor Reference Vertical Progress

Status: **READY FOR PR / NON-UI MERGE GATE**  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Branch: `agent/rc4-18-alumdoor-vertical`  
Capabilities: `VP01-007`, `VP01-008`; consumes release evidence `O01-002`  
Risk: **STANDARD evidence/verifier behavior**; no ledger/schema/migration mutation

## Outcome

A18 did not reopen the already-merged WS17 supplier-operation implementation. It hardened the residual release-confidence path needed to prove the current Alumdoor reference vertical without confusing historical production evidence with current source.

### 1. Exact release/package identity gate

Added `server/scripts/lib/alumdoor-reference-release-evidence.mjs` and wired it into the Golden Order verifier.

A live run now fails closed unless all of these are true:

- `/release.json` is a valid `gateway-ui` marker;
- `releaseSha` is an exact 40-character Git SHA;
- `bundleHash` is a valid 16-hex staged bundle hash;
- the live `metaforge.api.get_app_manifest?app=alumdoor` package id/version matches the composed source brief;
- an explicit expected release SHA is supplied and equals the deployed marker;
- optional expected bundle hash, when supplied, also matches.

This prevents historical `alumdoor@2.2.1` production evidence from being used to prove current source `alumdoor@2.2.2` or any later source revision.

### 2. Warranty lineage false-negative fixed

The evaluator already allowed Warranty Claim evidence linked by either `sales_order` or the exact `delivery_note`. The live verifier previously fetched Warranty Claim rows only by `sales_order`, so a valid delivery-only claim could be omitted and `--require-warranty` could fail incorrectly.

A18 now:

- derives only submitted Delivery Notes linked to the exact Sales Order lineage;
- queries Warranty Claim by direct Sales Order plus each exact linked Delivery Note;
- deduplicates claims by name;
- keeps the 5,000-row fail-closed ceiling;
- restricts Stock Ledger item queries to those exact linked Delivery Notes rather than unrelated deliveries for the same customer.

No Warranty, Stock, Finance or Manufacturing authority was reimplemented.

## Verification

Focused validation reconstructed from the exact A18 source blobs because this execution environment cannot clone `github.com` through DNS:

- `node --check server/scripts/verify-alumdoor-golden-order-readonly.mjs`: **PASS**.
- `node --test server/tests/alumdoor-golden-order-readonly.test.mjs`: **12/12 PASS, 0 fail**.
- New regressions cover delivery-only Warranty Claim linkage, exact Delivery Note filtering, warranty lookup dedupe, exact release/package match, stale package rejection, stale release rejection and the read-only source guard.
- Full monorepo build/typecheck/test: **NOT RUN** in this session because full checkout/dependency acquisition is unavailable through the current DNS boundary.
- Authenticated live Golden Order: **NOT RUN**; no production credential, customer-data mutation, deploy, DNS, secret, migration, restore or provider mutation was performed.

## Capability assessment

No maturity inflation is claimed.

- `VP01-007` supplier order/debt/FIFO allocation: prior WS17 source remains RC-quality consumer evidence; current production closure still depends on exact deployed source and generic Procurement ownership.
- `VP01-008` supplier delivery reconciliation: verifier is stronger and false-negative-safe, but authenticated same-order live evidence is still required before Hardened.
- `O01-002` release marker: consumed as an exact evidence gate; A18 does not own SRE release infrastructure.

## Dependency Requests

The following shared-owner dependencies remain outside A18 and were deliberately not patched here:

- **DR-A18-01 -> A11 / Procurement**: replace vertical allocation quantity semantics with a generic declarative allocation axis. Exact current shared `clouderp-core/src/uom.ts` still contains `inventory_mode === "Nhôm cây/lá"` / `qty_bar` compatibility logic.
- **DR-A18-02 -> A12 / Inventory-WMS**: declarative Measurement Profile / catch-weight measure roles; do not move Alumdoor literals between shared files.
- **DR-A18-03 -> A7 / App Factory**: complete generic AppAction/workspace/input-table contracts where residual gaps remain.
- **DR-A18-04 -> A6 / UI-Mobile**: current V2 browser/mobile/release evidence and removal of shared renderer/branding compatibility literals through metadata-owned contracts.
- **DR-A18-05 -> A13 / Manufacturing**: generic Production Request/BOM/capacity/idempotency orchestration where Alumdoor still consumes mixed implementation.
- **DR-A18-06 -> A2 / SRE + production gate**: authenticated exact-release Golden Order run after an approved release; production mutation/deploy is not performed by A18 merely to close evidence.

These dependencies do not block the independent A18 verifier hardening completed in this branch.

## Merge / deploy boundary

This branch changes non-UI verification/evidence behavior. Per RC4 program and enterprise completion skill:

1. open PR against exact current `main`;
2. keep production/live claims separated from source claims;
3. **stop before merge/deploy for explicit user approval**.
