# RC3-A5 — Independent QA / Validator / Blocker Prioritization

Date: 2026-08-04  
Agent: **RC3-A5 — Independent QA / Validator / Blocker Prioritization**  
Branch: `agent/rc3-05-independent-qa`  
Exact program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Risk: **STANDARD evidence validation**  
Status: **BLOCKED — independent static QA complete; final converged-candidate spot-check waits substantive A1-A4 evidence**

## 1. Mission and boundary

A5 is an independent verification lane. It does not own primary capability scoring and does not modify runtime, schema, provider resources or production state merely to improve maturity.

A5 responsibilities:

- review the capability validator and denominator contract;
- detect missing, duplicate and unknown capability IDs;
- verify maturity arithmetic;
- independently spot-check existing/promoted maturity claims against source/test/migration/permission/reconciliation/UI/production evidence;
- reject circular evidence;
- identify stale branch/PR/status references contradicted by exact current `main`;
- produce a ranked top-30 release-confidence blocker queue;
- report dependencies without blocking independent work.

This is non-UI governance/evidence work. No merge to `main` and no production deploy are authorized by this lane.

## 2. Exact repository state audited

Exact `main` at this audit checkpoint remains:

`98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`

RC3 program control branch:

`program/rc3-exact-main-release-confidence-20260804`

Program control is one commit ahead of the exact seed and contains the RC3 program specification only.

Mandatory sources reviewed for A5 static QA:

- exact current `main`, RC3 worker branches and relevant PR state;
- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `PROJECT_CONTEXT.md`;
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
- `server/scripts/validate-enterprise-capability-status.mjs`;
- `docs/agents/rc/RC-01-capability-truth.md`;
- current RC/transaction-closure/WS09/CFMAX/WS17 evidence where material to the spot-checks below.

Exact source/migration/test/GitHub state wins over prose.

## 3. Structural validator audit

Canonical validator:

`server/scripts/validate-enterprise-capability-status.mjs`

A5 independently reviewed its contract. It enforces:

1. `EXPECTED_TOTAL = 956`;
2. maturity vocabulary exactly `Missing`, `Foundation`, `Wired`, `RC`, `Hardened`;
3. canonical map-ID extraction;
4. same-family inclusive range expansion;
5. registry marker presence;
6. duplicate ID detection in the map;
7. duplicate assignment detection in status;
8. missing status-ID detection;
9. unknown status-ID detection;
10. exact map unique count = 956;
11. exact status unique count = 956;
12. declared maturity arithmetic vs expanded registry;
13. non-zero exit on any structural mismatch.

No denominator defect was found in the validator design.

### 3.1 Current 956/956 invariant

Historical RC-01 capability truth merged at commit:

`562b0e3124f2aac4a944d5285564f2d54527e754`

Current exact `main` is **355 commits ahead** of that RC-01 commit.

The compare does **not** change any of these canonical validator inputs/artifacts:

- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — current blob `0f5c2454c53f7b71e6f7ced1d3f85e067f79e7a5`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` — current blob `edd222b24dd9ac6870f91d326bec1c2a63cbea2a`;
- `server/scripts/validate-enterprise-capability-status.mjs` — current blob `39513c8aebb4722aee6826ce740f1e55e56c9700`.

RC-01 recorded the exact validator-equivalent result:

```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Maturity: Hardened=0 RC=4 Wired=448 Foundation=345 Missing=159
Capability status completeness: 956/956
```

Because all three byte-level inputs/artifacts remain unchanged, the current historical registry remains structurally **956/956 exactly once**.

A5 does **not** claim a fresh local Node execution in this connector session. A full repository checkout is unavailable here. The conclusion above is an invariance proof from byte-identical validator inputs plus the previously recorded exact result. Once A0 changes the registry, a fresh execution against that final candidate is mandatory before convergence.

## 4. Maturity arithmetic

Historical/current-stale registry arithmetic:

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 4 |
| Wired | 448 |
| Foundation | 345 |
| Missing | 159 |
| **Total** | **956** |

Arithmetic check:

`0 + 4 + 448 + 345 + 159 = 956` — PASS.

This is a structural/arithmetic PASS only. It is **not** evidence that these historical labels remain the correct exact-current-main maturity after 355 subsequent commits.

## 5. Primary QA finding — registry is structurally valid but semantically stale

The strongest independent finding is a freshness split:

- denominator/registry structure is intact;
- capability maturity content has not moved since RC-01;
- exact current `main` has advanced by 355 commits through finance RC work, Transaction Closure, WS09 Batch Productization, CFMAX R2, UI V3 and other convergence;
- therefore the old registry cannot be treated as a current-main maturity assessment without A1-A4 capability-level re-audit.

A5 rejects both unsafe shortcuts:

1. **No blanket retention by age** — old labels are not automatically current truth.
2. **No blanket promotion by merge count** — later source/tests/PR merges do not automatically satisfy RC/Hardened evidence gates.

## 6. Spot-check of the four historical RC capabilities

Historical RC IDs:

- `I01-014` Idempotency;
- `G02-001` Audit trail;
- `VP01-007` Supplier order/debt/FIFO allocation;
- `VP01-008` Supplier delivery reconciliation.

### 6.1 `I01-014` — retain RC candidate, not Hardened

Exact source evidence remains concrete rather than circular:

- `server/packages/frappe-api/src/command.ts` derives deterministic command IDs from trusted logical-write inputs and payload hash;
- `server/packages/document-kernel/src/kernel.ts` looks up `(tenant_id, command_id)` receipt before mutation, rejects payload/actor mismatch and returns the previous receipt for a genuine retry;
- `server/packages/document-kernel/src/d1-store.ts` persists/reads `mutation_receipts` under tenant scope while canonical writes remain in the kernel/store authority;
- later finance/stock/batch work continues to consume the canonical command/idempotency boundary rather than creating an alternate document-write authority.

A5 finding: **retain RC candidate** pending final exact candidate regression review. No production-grade evidence exists to justify Hardened.

### 6.2 `G02-001` — retain RC candidate, not Hardened

Exact current authority still places mutation lineage in canonical server writes rather than UI state. Current finance/kernel evidence describes append-style `versions` plus `mutation_receipts` committed with the authoritative mutation/ledger batch, with actor identity owned by the server-side command path.

A5 found no exact-current evidence that invalidates the narrow audit-trail RC claim. However provider/production security operations, privacy controls and privileged-support evidence remain separate gaps.

A5 finding: **retain RC candidate** pending final exact candidate regression review. No Hardened promotion.

### 6.3 `VP01-007` / `VP01-008` — retain narrow RC candidate, explicitly not deployed-current

`docs/agents/workstreams/WS17-alumdoor-reference-vertical.md` records exact source boundaries for:

- supplier delivery dashboard backed by canonical allocation/payment sources;
- bulk FIFO receipt with idempotency/conflict protection;
- supplier settlement Close/Reverse through canonical Purchase Settlement authority;
- targeted correction/reversal/identity regressions;
- Golden Order read-only verifier, isolated exact-source regression `7/7 PASS`;
- historical #295 validation only for byte-identical selectively ported blobs.

Critical production boundary remains explicit:

- current composed source package: `alumdoor@2.2.2`;
- historical production evidence: `alumdoor@2.2.1` at release `69b94ac1fe29a2ab39175e5442975a9197a0d39e`;
- live authenticated same-order Golden Order run: NOT RUN.

A5 finding: **retain the two narrow RC candidates**, but reject any Hardened or “current source deployed” interpretation.

## 7. Promotion gate for new RC3 findings

A5 accepts **zero new maturity promotions at this checkpoint**.

Reason:

- A1 has no substantive evidence commit yet;
- A2 has no substantive evidence commit yet;
- A3 currently has only a bootstrap/in-progress evidence file;
- A4 currently has only a bootstrap/in-progress evidence file;
- A0 has frozen methodology and stale-registry proof but correctly defers domain reassessment to A1-A4.

Any later A1-A4 promotion candidate must be rechecked by A5 against exact source/test/migration/permission/reconciliation/UI/provider/production evidence before A0 convergence.

## 8. Circular and stale-evidence audit

### 8.1 Circular evidence

A5 rejects a status document citing another status document as the only reason for maturity. No such document-to-document citation is sufficient for final RC3 promotion.

The four historical RC spot-checks above have direct source/evidence paths and therefore are not retained solely by circular status prose.

Family-level historical evidence bundles in `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` are useful pointers, but are too coarse and old to mass-promote current families.

### 8.2 Stale references that require A0 reconciliation

1. `CURRENT_STATUS.md` still contains an `ACTIVE — VN Accounting Period Integrity Hardening r8` historical branch narrative, while RC-020 Finance Posting/Period/Reversal has since merged through PR `#443` and later transaction-closure work is already on exact current main. The old branch narrative must be superseded/classified, not copied into RC3 truth.
2. `NEXT_TASKS.md` still presents WS09 App Factory operationalization / Batch Productization as a next program priority even though exact current main is `feat(ws09): converge Batch Productization into main`. Remaining WS09 gaps must be rewritten as specific capability/evidence gaps, not as the already-completed broad wave.
3. Historical `E-FIN` evidence references pre-RC3 migration/test state and does not include current RC-020/021/023 migration/query/regression evidence.
4. Historical `E-APPFACTORY` predates the current BatchAction/BatchTransaction/replay consumer convergence.
5. Historical `E-SRE` predates CFMAX R2 source convergence and must separate source-done from provider/non-production and production proof.
6. Historical `E-UI` predates UI V3/mobile QA source changes and still cannot imply RC without browser/mobile/exact-release evidence.
7. Alumdoor production evidence remains historical `2.2.1`; exact current source must not inherit that release proof.

## 9. Migration sequencing anomaly — Dependency Request required

Exact current main contains three tenant migration files sharing numeric prefix `0110`:

- `server/migrations/tenant/0110_batch_replay_claims.sql`;
- `server/migrations/tenant/0110_rc020_finance_posting_period_integrity.sql`;
- `server/migrations/tenant/0110_rc023_cash_bank_reconciliation.sql`.

Followed by:

- `0111_rc020_finance_gl_scope_reconciliation.sql`;
- `0112_rc021_finance_ar_reconciliation.sql`.

This is **not an immediate uniqueness failure** in the current custom remote runner:

`server/scripts/d1-migrate-remote.mjs`

- sorts `.sql` filenames lexicographically;
- journals the complete filename in `d1_migrations.name TEXT UNIQUE`;
- therefore all three `0110_*` filenames are distinguishable.

However, duplicate numeric prefixes create sequencing/governance ambiguity and can become dangerous when reasoning about migration chronology, dependencies, environment drift, or future tooling that assumes monotonic numeric IDs.

A5 does not rename already-possibly-applied migrations. Correct resolution requires exact applied-state audit first, then an owner decision on future numbering/validation.

## 10. Ranked Top-30 release-confidence blockers

Ranking uses business breadth, authority risk, dependency centrality and evidence deficit. “Target” is the next defensible maturity objective for the declared slice, not permission to bulk-promote.

| # | Capability ID(s) | Current historical maturity | Target | Missing evidence / implementation | Owner | Dependency | Risk | Evidence class needed | Why it blocks release confidence |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `G01-011..G01-015` | Missing | RC | MFA/OIDC/SAML/SSO/SCIM enforcement, lifecycle, attributable identity, regression/provider proof | WS11 / A2 | identity/provider policy | CRITICAL | executable + provider-nonprod | Central authentication boundary remains incomplete |
| 2 | `G01-016..G01-017` | Wired | RC | session lifecycle/revocation parity across Frappe/native surfaces, step-up-sensitive paths | WS11 / A2 | auth contract | CRITICAL | executable | Compromised/revoked sessions must fail consistently |
| 3 | `T01-020` | Missing | RC | audited support access/impersonation with attributable operator, approval and revocation | WS11 / A2 | business/security policy | CRITICAL | executable + business-policy | Support access is a privileged tenant boundary |
| 4 | `T01-019` | Missing | RC | delete tenant/data lifecycle, retention, legal hold, recovery boundary | WS11/WS12 | destructive policy | CRITICAL | business-policy + production-authorized | Destructive lifecycle cannot be improvised after release |
| 5 | `T01-016..T01-017`, `O01-013..O01-016` | Foundation/Wired | RC | backup verification, restore/PITR/DR/rollback drill with RTO/RPO evidence | WS12 / A3 | approved non-production environment | CRITICAL | provider-nonprod | Recovery tooling existence is not recoverability proof |
| 6 | `O01-006..O01-012` | Foundation/Wired | RC | alert/error/DLQ/retry/integrity/reconciliation operational evidence | WS12 / A3 | telemetry/provider seams | STANDARD/CRITICAL | executable + provider-nonprod | Failures must become observable and recoverable |
| 7 | `O01-020..O01-021` | Wired/Foundation | RC | rate-limit/abuse policy mapped to routes, false-positive evidence, API/PWA compatibility | WS12 / A3 | Cloudflare provider | CRITICAL | provider-nonprod | Edge controls can break legitimate traffic or leave attack gaps |
| 8 | `IM02-006..IM02-009` | Foundation | RC | correction/retry, incremental migration, post-migration reconciliation, crash-window proof | WS13 / A2 | migration journal + domain owners | CRITICAL | executable | Customer cutover is unsafe without retry/reconcile truth |
| 9 | `T01-015`, `IM02-016` | Foundation | RC | tenant/legacy migration cutover, resumability, reconciliation and rollback evidence | WS13 / A2 | WS12 recovery | CRITICAL | executable + provider-nonprod | Tenant movement is high-blast-radius data authority |
| 10 | `F01-007..F01-010`, `F01-024..F01-025` | Wired/Foundation | RC | exact-current period/reversal evidence, migration replay, permission and immutable GL verification | WS01 / A1 | duplicate-prefix migration audit | CRITICAL | executable | Posting-period and correction semantics protect financial truth |
| 11 | `F02-005..F02-008`, `F02-017` | Wired/Foundation | RC | allocation/partial/overpayment/credit/reconciliation exact authority and regression | WS01 / A1 | payment ledger/period authority | CRITICAL | executable | AR must reconcile, not merely post invoices |
| 12 | `F03-003`, `F03-006..F03-007`, `F03-010` | Wired/Foundation | RC | supplier advance/partial/adjustment/reconciliation exact regression | WS01/WS03 / A1 | Payment Ledger | CRITICAL | executable | AP settlement/correction is core cash authority |
| 13 | `F04-008..F04-013` | Wired/Foundation | RC | statement import, matching, partial/reversible reconciliation with correction evidence | WS01 / A1 | bank/provider optional | CRITICAL | executable | Bank-to-book closure is required for finance confidence |
| 14 | `MD02-005` | Foundation | RC | GL/stock/AP/AR/payment/payroll cross-ledger reconciliation job and exception proof | WS01/WS12 / A1/A3 | multiple domain ledgers | CRITICAL | executable | Cross-ledger drift can silently corrupt enterprise reporting |
| 15 | `V02-011..V02-014` | Missing | RC | PIT resident rules, progressive PIT, deductions, annual settlement with official effective-dated fixtures | WS01/WS06 / A1 | official legal sources | CRITICAL | executable + official-source | Vietnam payroll/tax correctness is legally sensitive |
| 16 | `V03-001..V03-010` | Wired | RC | full statutory evaluator, official sources, effective-date selection, deterministic numeric regression | WS06 / A1 | legal policy/source | CRITICAL | executable + official-source | Versioned metadata alone is not statutory payroll automation |
| 17 | `V04-006..V04-010` | Missing | RC | e-invoice sync, signing, filing/provider boundary, audit/idempotency, certified-provider evidence | WS01 / A1 | provider + legal policy | CRITICAL | provider-nonprod + official-source | Statutory document lifecycle is incomplete without provider truth |
| 18 | `P01-016..P01-019` | Foundation/Missing | RC | landed-cost authority, three-way match, qty/price variance and correction/hold semantics | WS03 / A1 | Stock/Finance authority | CRITICAL | executable | Source-to-pay cannot close safely without match/variance authority |
| 19 | `W01-021`, `W01-023..W01-024` | Foundation | RC | landed-cost valuation, backdate/repost/replay and finance reconciliation | WS04 / A1 | WS01 Finance | CRITICAL | executable | Inventory valuation changes must be reproducible and reconcilable |
| 20 | `W02-004`, `W02-012..W02-014` | Missing/Foundation/Wired | RC | persisted putaway/task assignment, scanner server path, cycle-count freeze completion | WS04 / A1/A4 | mobile/runtime contract | STANDARD/CRITICAL | executable + browser/mobile | Warehouse execution still has operational gaps beyond stock ledger |
| 21 | `M03-009..M03-010` | Missing | RC | rework/subcontract state machine, stock/cost correction and regression | WS05 / A1 | Stock/Finance | CRITICAL | executable | Manufacturing exception paths are not optional in production |
| 22 | `M04-004..M04-010` | Foundation/Missing | RC | overhead/actual cost/variance posting plus genealogy/traceability closure | WS05 / A1 | Stock + Finance | CRITICAL | executable | Manufacturing cost and traceability are enterprise-control boundaries |
| 23 | `B02-004..B02-006` | Wired/Missing | RC | install/upgrade/rollback transactional proof after current WS09 convergence | WS09 / A2 | migration/SRE | STANDARD/CRITICAL | executable | App Factory is unsafe if an app cannot be reverted predictably |
| 24 | `B01-005`, `B01-009..B01-011` | Missing | RC | parallel approval, escalation, SLA/timer, scheduled action durable semantics | WS09 / A2 | Workflow runtime/provider | STANDARD | executable + provider-nonprod where durable | Enterprise workflows need timeout/escalation behavior |
| 25 | `I01-011..I01-015` | Wired/RC/Foundation | RC | physical queue/DLQ persistence, inspect/quarantine/replay/metrics while retaining idempotency | WS10/WS12 / A2/A3 | queue provider | CRITICAL | executable + provider-nonprod | Integration retries must not create duplicate business effects |
| 26 | `U01-001..U01-002` | Wired | RC | exact desktop/tablet/Android/360px/a11y/dark/reduced-motion browser matrix + exact release marker | WS14 / A4 | browser lane + release evidence | STANDARD | browser/mobile + production if claimed | Source-responsive is not proven responsive/installable behavior |
| 27 | `U01-003..U01-007` | Missing | Wired then RC | tenant/session-aware cache, offline write queue, background sync, OCC conflict detect/resolve, revoke purge | WS14 + WS00/11/12 / A2/A4 | shared offline contract | CRITICAL | executable + browser/mobile | Offline state can violate tenant/auth/data freshness boundaries |
| 28 | `R01-014` | Missing | RC | offline POS transaction semantics consuming canonical offline/OCC contract | Commerce + WS14 | `U01-003..007` | CRITICAL | executable + browser/mobile | POS offline writes are financial/stock mutations |
| 29 | `A02-021..A02-024` | Missing | RC | proposal/tool execution/preview/human approval with permission and auditable authority | AI + WS11 / A2 | IAM/policy | CRITICAL | executable | AI must never bypass business authority |
| 30 | `O01-002`, `VP01-007..VP01-008` | Wired / RC | RC / Hardened gate | exact-current release SHA + bundle hash + authenticated current-source live evidence; no inheritance from Alumdoor 2.2.1 | WS12/WS17 / A3/A4 | production authorization for production proof | CRITICAL | production exact-release | Current-source deployment is the final boundary between RC source and Hardened claim |

## 11. Smallest next set with highest release-confidence leverage

The top-30 queue is intentionally broad enough to preserve ownership, but the smallest high-leverage sequence is:

1. finish A1-A4 evidence first — do not implement from the scorecard;
2. converge the current capability registry and rerun 956/956 validator;
3. close auth/session/support-access authority gaps;
4. close finance period/reconciliation + migration-sequencing evidence;
5. prove backup/restore/rollback/provider recovery in approved non-production;
6. prove browser/mobile/exact-release identity for UI claims;
7. only then promote narrowly evidenced capabilities and compute historical delta.

This order increases confidence in shared authorities before adding long-tail feature breadth.

## 12. Dependency Requests

### DR-RC3-A5-001 — substantive A1-A4 evidence required for final spot-check

Owners: A1, A2, A3, A4.  
Need: capability-level proposed maturity rows with direct exact evidence.  
Blocks: final A5 promotion/demotion review and final top-30 reconciliation.  
Does not block: static validator audit, stale-reference audit, migration anomaly audit or provisional blocker ranking already completed here.

### DR-RC3-A5-002 — resolve duplicate tenant migration numeric prefixes without unsafe renaming

Owners: A1/WS01 + A2/WS13 + A0 convergence.  
Need:

- inspect exact applied `d1_migrations` state in every relevant approved environment before changing names;
- record intended dependency/order among the three `0110_*` migrations;
- decide whether existing filenames must remain immutable and only future numbering is corrected;
- add a future migration-number uniqueness/governance check if compatible with already-applied state.

Blocks: confident migration chronology/replay evidence.  
Does not authorize: production mutation or renaming an already-applied migration.

### DR-RC3-A5-003 — fresh final validator execution after A0 registry mutation

Owner: A0/A5 convergence.  
Need: run `node server/scripts/validate-enterprise-capability-status.mjs` on the exact final candidate after all maturity edits.  
Required acceptance:

- map 956 unique;
- status 956 unique;
- missing 0;
- unknown 0;
- duplicates 0;
- declared arithmetic matches expanded registry;
- exact final candidate SHA recorded.

## 13. Current RC3 topology observed by A5

Execution topology: **PROGRAM**  
Coordinator/control lane: **A0**  
Worker agents: **5 (A1-A5)**

| Agent | Branch | Observed status | A5 dependency view |
|---|---|---|---|
| A0 | `agent/rc3-00-capability-convergence` | RUNNING — methodology/denominator/stale-registry foundation committed | final convergence consumes A1-A5 |
| A1 | `agent/rc3-01-erp-vn-evidence` | BOOTSTRAPPED branch only; no substantive commit observed | blocks A5 ERP/VN final spot-check |
| A2 | `agent/rc3-02-platform-evidence` | BOOTSTRAPPED branch only; no substantive commit observed | blocks A5 platform/IAM/migration final spot-check |
| A3 | `agent/rc3-03-sre-cloudflare-evidence` | BOOTSTRAPPED — in-progress evidence header only | blocks A5 provider/SRE final spot-check |
| A4 | `agent/rc3-04-ui-mobile-release-evidence` | BOOTSTRAPPED — in-progress evidence header only | blocks A5 UI/mobile final spot-check |
| A5 | `agent/rc3-05-independent-qa` | BLOCKED — substantive static QA complete; final candidate review waits A1-A4 | DR-RC3-A5-001 |

## 14. Current verdict

### PASS now

- canonical denominator contract: **956**;
- historical registry structure: **956/956 exactly once by byte-invariance proof**;
- maturity arithmetic: **PASS**;
- validator design: **adequate for structural completeness**;
- no evidence supports a Hardened capability at this checkpoint;
- four historical RCs survive initial independent source/evidence spot-check as retain candidates, not Hardened.

### NOT YET PASS

- current-main maturity recomputation;
- final A1-A4 promotion/demotion review;
- fresh validator execution on the future A0 converged candidate;
- provider/non-production recovery/security proof;
- exact-current production release proof;
- final top-30 after upstream evidence changes.

## 15. Merge/deploy boundary

A5 changes documentation/evidence only, but it is **not UI-only**.

- commit on `agent/rc3-05-independent-qa`: allowed;
- open PR to the RC3 program/control branch: allowed;
- self-merge/converge: not performed by A5;
- merge RC3 program to `main`: requires explicit user approval;
- production deploy/provider mutation: not performed and not authorized.
