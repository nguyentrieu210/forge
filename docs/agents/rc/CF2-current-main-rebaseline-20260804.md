# CF2 — Current-Main Capability Rebaseline

Date: **2026-08-04**  
Branch: `rc/cf2-release-confidence-20260804`  
Exact current-main synchronized into branch: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`  
Internal sync PR: `#547`  
Risk: documentation / validation tooling; non-UI; no production mutation

## Purpose

Re-score only capability IDs whose current-main evidence materially changed after the original RC-01 baseline, while preserving the 956-ID denominator and refusing promotions based on merge/code presence alone.

The canonical baseline in `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` was created from `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`. Exact current main is materially newer. The strongest new evidence is the merged Transaction Closure convergence plus the RC-020..025 capability-specific handoffs.

## Exact evidence consumed

- Capability denominator: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — 956 IDs.
- Existing baseline registry: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — 956/956 structural baseline.
- Finance posting/period/reversal: `docs/agents/rc/RC-020-finance-period-posting.md`.
- AR/customer reconciliation: `docs/agents/rc/RC-021-finance-ar-reconciliation.md`.
- AP/supplier reconciliation: `docs/agents/rc/RC-022-finance-ap-reconciliation.md`.
- Cash/bank reconciliation: `docs/agents/rc/RC-023-finance-cash-bank.md`.
- Inventory correction/backdate/repost/valuation: `docs/agents/rc/RC-024-025-inventory-authority.md`.
- Canonical integrated convergence: `docs/agents/transaction-closure/07-CONVERGENCE.md`.
- Exact integrated validation: run `30847056639`, job `91797832548`, candidate `9ef9944f4a28e884979d790fc359d7c2c08da497` against `main@f6f1905bd18e33ed87896b94ba10670b3b2c53b3`.
- Canonical Transaction Closure merge: PR `#519`, `main@2b1d088c353bd2c15cd6bc2a74b342c98df1dcf7`.
- Phase close / productization advance: PR `#523`, `main@d651a3c43a7841cb82cf47561cfae7a89a276b88`.
- Concurrent UI-only main drift synchronized through internal PR `#547` to `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`; no backend/schema/ledger/permission/status overlap.

## Validation truth

`server/scripts/cf2-release-confidence-rebaseline.mjs` was added as an executable rebaseline validator. It:

1. parses the canonical Capability Map;
2. requires exactly 956 unique map IDs;
3. parses the existing capability registry and requires exactly 956 unique assignments;
4. requires the known RC-01 baseline counts before applying any change;
5. applies only an explicit evidence-backed promotion whitelist;
6. rejects unknown IDs, duplicate promotions and maturity downgrades;
7. asserts the exact CF2 candidate maturity counts;
8. keeps `Hardened = 0`.

Local validation available in the execution environment:

- exact validator source copied from branch and checked with `node --check`: **PASS**;
- maturity transition arithmetic independently asserted: **PASS**, total `956`;
- direct repository clone: **BLOCKED** by sandbox DNS to `github.com`;
- temporary GitHub Actions workflow was attempted on the CF2 branch, but no observable workflow run/status was emitted under the repository's current Actions policy; the workflow was removed and no CI PASS is claimed.

Therefore this record distinguishes **source/syntax/arithmetic validation** from **full exact-checkout execution**. No missing execution is fabricated into green evidence.

## CF2 promotion whitelist

### F01 — General Ledger / Period / Reversal

Promote to **RC** based on RC-020 named capability scope plus the later integrated CRITICAL gate:

`F01-003`, `F01-007`, `F01-008`, `F01-009`, `F01-010`, `F01-014`, `F01-015`, `F01-019`, `F01-022`, `F01-024`, `F01-025`.

Reason: canonical GL authority, period controls, immutable posting, exact reversal/correction, scoped reporting and reconciliation were named by RC-020 and subsequently exercised in Transaction Closure.

### F02 — Accounts Receivable

Promote to **RC**:

`F02-001`, `F02-002`, `F02-003`, `F02-005`, `F02-006`, `F02-007`, `F02-008`, `F02-012`, `F02-013`, `F02-017`, `F02-018`.

Reason: RC-021 names these settlement/reconciliation capabilities, and Transaction Closure executed Sales/O2C + RC-021 AR regressions in the integrated matrix.

Not promoted: payment schedule, first-class debit-note/write-off/bad-debt lifecycle, credit-limit/hold/reminder surfaces beyond proven scope.

### F03 — Accounts Payable

Promote to **RC**:

`F03-001`, `F03-002`, `F03-003`, `F03-006`, `F03-007`, `F03-008`, `F03-009`, `F03-010`.

Reason: RC-022 names the AP settlement/reconciliation slice; the final convergence explicitly reports RC-022 AP reconciliation PASS.

Not promoted: payment request/scheduling, withholding tax, payable forecast, and whole multi-currency payable lifecycle.

### F04 — Cash / Bank / Reconciliation

Promote to **RC**:

`F04-001`, `F04-002`, `F04-003`, `F04-004`, `F04-005`, `F04-006`, `F04-008`, `F04-009`, `F04-010`, `F04-011`, `F04-012`, `F04-013`.

Promote to **Wired** only:

`F04-017`, `F04-019`.

Reason: RC-023 explicitly assessed the first group as RC within its declared authority/reconciliation boundary; the integrated convergence later executed the RC-023 cash/bank gate. Cheque/reference and Cash Position have meaningful source/backend evidence but still lack enough complete surface/provider evidence for RC.

Not promoted: concrete bank feed provider, payment batch, treasury dashboard/forecast and broader approval/provider surfaces.

### W01 — Inventory authority / valuation

Promote to **RC**:

`W01-011`, `W01-013`, `W01-014`, `W01-022`.

Promote to **Wired** only:

`W01-023`, `W01-024`.

Reason: RC-024/025 names reconciliation, FIFO, Moving Average and valuation adjustment as RC candidates after exact CRITICAL execution; Transaction Closure later reports Inventory/WMS/valuation **38/38 PASS**. Backdated/repost behavior is real and tested but historical downstream COGS/expense restatement remains an explicit deferred Finance boundary, so CF2 keeps those two at Wired rather than RC/Hardened.

## Conservative non-promotions

CF2 deliberately does **not** bulk-promote Sales C03, Manufacturing M01..M04, Procurement P01/P02, Warranty/Service S/E or UI capabilities merely because Transaction Closure/UI V3 merged.

Those areas have stronger evidence than the old baseline, but a capability-ID-specific promotion decision needs the same traceability standard used above. Their current code/test evidence remains useful for the next rebaseline slice without weakening the maturity model.

## Candidate maturity result

Starting RC-01 baseline:

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 4 |
| Wired | 448 |
| Foundation | 345 |
| Missing | 159 |
| **Total** | **956** |

CF2 candidate after the explicit whitelist:

| Maturity | Count | Share |
|---|---:|---:|
| Hardened | 0 | 0.00% |
| RC | 50 | 5.23% |
| Wired | 417 | 43.62% |
| Foundation | 330 | 34.52% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |

Transition summary:

- **46 IDs** move into RC;
- **4 IDs** move Foundation -> Wired;
- no ID is downgraded;
- no Missing capability is promoted without evidence;
- **Hardened remains 0**.

## Release-confidence interpretation

This rebaseline materially improves confidence in the proved Finance/Inventory transaction authority slices, but it does not make Forge globally release-confident or production-hardened.

Still blocking a global Hardened/release claim:

- exact-current production release proof for deployed claims;
- broader failure/restore/DR evidence;
- provider-specific bank/e-invoice/statutory closure where required;
- historical Stock -> downstream Finance restatement;
- WMS task/scanner orchestration;
- remaining SaaS/IAM/MFA/SSO/entitlement boundaries;
- migration/onboarding cutover evidence;
- capability-ID-specific rebaseline for other domains rather than blanket promotion.

## Merge / deploy boundary

This CF2 branch is non-UI validation/documentation tooling.

- internal branch sync: performed through PR `#547`;
- main merge: **not performed**;
- production deploy/migration/tenant mutation/secret/DNS change: **not performed**;
- PR `#527` remains the review boundary.
