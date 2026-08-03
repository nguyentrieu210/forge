# CF2 — Capability Truth → Release Confidence

Date: **2026-08-04**  
Run branch: `rc/cf2-release-confidence-20260804`  
Original seed: `main@d651a3c43a7841cb82cf47561cfae7a89a276b88`  
Current-main synchronized into branch: `main@cf5dd0da5b0154374a4ce371d7b122cd059a0bb2` via internal PR `#547`  
Mode: evidence + validation tooling / no production mutation

## Executive decision

- **Global Forge production release confidence: still BLOCKED.**
- **Capability truth is materially improved:** CF2 now has an executable, evidence-whitelisted current-main rebaseline candidate instead of reusing the stale RC-01 score.
- Candidate maturity: **Hardened 0 / RC 50 / Wired 417 / Foundation 330 / Missing 159 = 956/956**.
- **Transaction Closure declared backend scope has high RC confidence** from exact integrated CRITICAL evidence, but its evidence explicitly does not prove or authorize production deployment.
- **No capability is promoted to Hardened.** Exact production/failure/recovery evidence remains insufficient.

Detailed rebaseline record: `docs/agents/rc/CF2-current-main-rebaseline-20260804.md`.  
Executable validator: `server/scripts/cf2-release-confidence-rebaseline.mjs`.

## CF2 invariants

1. `main` remains protected; CF2 writes only through its branch/PR.
2. Merge/code presence is not maturity evidence by itself.
3. RC promotion requires capability-ID-specific source/invariant/regression evidence.
4. Finance/stock promotion also requires correction/reversal/reconciliation evidence in the declared scope.
5. Hardened/deployed claims require exact production evidence.
6. Historical PR evidence loses to exact current main.

## Current-main drift handling

CF2 began from `d651a3c...`. During execution, `main` advanced through UI-only commits `c10e8d9...` and `cf5dd0da...`.

The drift touched shell/UI presentation only and did not overlap backend/schema/ledger/permission/capability-status files. CF2 still synchronized exact current main into the branch through internal PR `#547` before final rebaseline work. No main or production mutation was performed by that sync.

## Capability truth baseline

The existing canonical registry remains structurally complete at **956/956**, but its maturity labels were created from historical baseline `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`:

| Maturity | Historical count |
|---|---:|
| Hardened | 0 |
| RC | 4 |
| Wired | 448 |
| Foundation | 345 |
| Missing | 159 |
| **Total** | **956** |

CF2 therefore treats those labels as the input baseline, not exact-current-main truth.

## Current-main candidate rebaseline

CF2 promotes only IDs named by RC-020..025 evidence whose previously gated regression requirements were subsequently exercised by the canonical Transaction Closure integrated validation.

| Maturity | CF2 candidate | Share |
|---|---:|---:|
| Hardened | 0 | 0.00% |
| RC | 50 | 5.23% |
| Wired | 417 | 43.62% |
| Foundation | 330 | 34.52% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |

Transition:

- 46 IDs move into RC;
- 4 IDs move Foundation -> Wired;
- no downgrade;
- no Missing capability is promoted merely because a domain merged;
- Hardened remains 0.

### Promoted RC slices

- **F01:** posting/period/report/reversal slice from RC-020.
- **F02:** AR/customer settlement/reconciliation slice from RC-021.
- **F03:** AP/supplier settlement/reconciliation slice from RC-022.
- **F04:** cash/bank/reconciliation authority slice from RC-023.
- **W01:** Stock Reconciliation, FIFO, Moving Average and valuation adjustment from RC-024/025.

Backdate/repost `W01-023/024` move only to Wired because historical downstream COGS/expense restatement remains deferred.

CF2 deliberately does not blanket-promote Sales C03, Manufacturing, Procurement, Warranty/Service or UI families until their capability-ID-specific promotion evidence is normalized to the same standard.

## Evidence ladder — canonical Transaction Closure

Canonical convergence: `docs/agents/transaction-closure/07-CONVERGENCE.md`, PR `#519`.

Exact integrated evidence:

- validated main: `f6f1905bd18e33ed87896b94ba10670b3b2c53b3`;
- candidate: `9ef9944f4a28e884979d790fc359d7c2c08da497`;
- run `30847056639`, job `91797832548`;
- focused Node regressions: **221/221 PASS**;
- Sales/O2C + RC-021 AR: **45/45 PASS**;
- Manufacturing: **56/56 PASS**;
- Inventory/WMS/valuation: **38/38 PASS**;
- Finance Daily Ledger/cross-ledger/AP/aging: **33/33 PASS**;
- Procurement/P2P: **30/30 PASS**;
- Warranty/Service: **19/19 PASS**;
- RC-020 / RC-022 / RC-023 controls: **PASS**;
- SQL/platform schema verification: **PASS**;
- authority diff audit: **PASS**;
- convergence migrations: none;
- convergence UI delta: none.

This proves the declared integrated backend scope, not production deployment and not repository-wide Hardened status.

## CF2 validator truth

Added `server/scripts/cf2-release-confidence-rebaseline.mjs`.

It reads the canonical Capability Map and existing registry, requires the 956-ID denominator, requires the known historical baseline counts, rejects duplicate/unknown/downgrade promotions, applies only the explicit CF2 whitelist and asserts the candidate counts above.

Validation actually performed in this execution environment:

- exact branch script source checked with `node --check`: **PASS**;
- maturity arithmetic independently asserted: **PASS**, total **956**;
- repository clone/full exact-checkout execution: **BLOCKED** by sandbox DNS to `github.com`;
- temporary branch-only GitHub Actions workflow was attempted, but no observable workflow run/status was emitted under the repository's current Actions configuration; it was removed before final branch state.

Therefore CF2 does **not** claim an exact-checkout CI PASS for the new validator. Source syntax + deterministic arithmetic are proven; canonical registry/map execution remains a review/merge gate if the environment later exposes it.

## Production / UI evidence

Transaction Closure explicitly performed no production deploy.

UI V3 had release-trigger commits on main, but CF2 still cannot prove the required production `/health` + `/release.json` exact-SHA/hash result through the available connector. Main subsequently changed UI presentation again (`#529`, then `cf5dd0d` V2 presentation restore), so old UI deployment evidence must not be projected onto exact current main.

Result: **production UI state remains UNPROVEN for exact current main** in CF2.

## Remaining release-confidence blockers

1. Exact production release marker for current deployed SHA/hash.
2. Tenant-scoped backup/restore/PITR/rollback/DR executable evidence before Hardened claims.
3. Historical Stock -> downstream Finance restatement after backdated valuation changes.
4. Provider-specific bank/e-invoice/statutory evidence where required.
5. SaaS/IAM closure: tenant lifecycle, MFA/SSO/step-up, entitlement and privileged boundaries.
6. Migration/onboarding dry-run/retry/idempotency/reconciliation/cutover evidence.
7. Capability-ID-specific rebaseline of the remaining domains; no blanket promotions.
8. WMS persisted task/reservation consumption/scanner integration.
9. Manufacturing rework/subcontract and actual-cost/variance financial depth.
10. Repository-wide TypeScript baseline debt outside the validated Transaction Closure authority set.

## Next program

Canonical backlog remains **Platform Productization**:

1. WS09 — App Factory operationalization.
2. WS11 — SaaS / IAM / Security closure.
3. WS13 — Migration / onboarding / tooling.
4. WS12 — Production hardening / SRE.
5. WS01/WS06/VN compliance — statutory closure.

Each lane must move capability IDs by evidence, not by feature-wave completion language.

## Merge / deploy boundary

CF2 is non-UI validation/documentation tooling.

- internal branch sync: done via `#547`;
- review PR: `#527`;
- merge to `main`: **not performed**;
- production deploy/migration/tenant mutation/secret/DNS change: **not performed**.

## Final CF2 decision

**CONTINUE PLATFORM PRODUCTIZATION.** Capability truth is no longer stuck at the old `RC=4` snapshot: the conservative current-main candidate is **RC=50**. Global production release confidence remains blocked because **Hardened=0** and exact current-main production/recovery evidence is still incomplete.
