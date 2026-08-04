# RC3-A5 — Independent QA / Validator / Blocker Prioritization

Date: 2026-08-04  
Agent: **RC3-A5 — Independent QA / Validator / Blocker Prioritization**  
Branch: `agent/rc3-05-independent-qa`  
PR: `#591`  
Exact program seed: `main@98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`  
Risk: **STANDARD evidence/governance validation**  
Status: **READY — A1-A4 final spot-check complete; final fresh 956/956 validator run waits A0 converged registry**

## 1. Mission and boundary

A5 is the independent RC3 verification lane. It does not own primary capability scoring and does not modify runtime, schema, provider resources or production state merely to improve maturity.

A5 responsibilities:

- review the canonical capability validator and denominator contract;
- detect missing, duplicate and unknown capability IDs;
- verify maturity arithmetic;
- independently spot-check retained/promoted/demoted maturity claims against direct source/test/migration/permission/reconciliation/UI/provider/production evidence;
- reject circular evidence and stale branch/PR claims;
- rank the residual top-30 release-confidence blockers;
- report dependencies without blocking independent work.

This is non-UI governance/evidence work. Commit/PR is allowed. Merge to the RC3 control branch or `main`, deployment, destructive migration changes and provider/production mutation are outside A5 authorization.

## 2. Exact repository state audited

Exact `main` audited by RC3:

`98b5e1b22858ae85b977ccd1ad3ae8d74e9ceed7`

RC3 control branch:

`program/rc3-exact-main-release-confidence-20260804`

Worker PRs consumed by the final A5 review:

- A0 `#585` — capability convergence coordinator;
- A1 `#590` — ERP / Vietnam evidence;
- A2 `#589` — Platform / IAM / App Factory / Integration / Migration evidence;
- A3 `#586` — SRE / Cloudflare / provider evidence;
- A4 `#588` — UI / mobile / browser / release evidence;
- A5 `#591` — this independent QA lane.

Mandatory sources reviewed include:

- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `PROJECT_CONTEXT.md`;
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
- `server/scripts/validate-enterprise-capability-status.mjs`;
- `docs/agents/rc/RC-01-capability-truth.md`;
- exact worker evidence from A1-A4;
- relevant exact GitHub Actions jobs/logs and current source blobs.

Exact source/migration/test/GitHub state wins over prose.

## 3. Structural validator audit

Canonical validator:

`server/scripts/validate-enterprise-capability-status.mjs`

A5 independently reviewed the validator contract. It enforces:

1. `EXPECTED_TOTAL = 956`;
2. maturity vocabulary exactly `Missing`, `Foundation`, `Wired`, `RC`, `Hardened`;
3. canonical map-ID extraction and same-family inclusive range expansion;
4. registry marker presence;
5. duplicate IDs in the map;
6. duplicate assignments in status;
7. missing status IDs;
8. unknown status IDs;
9. exact map unique count = 956;
10. exact status unique count = 956;
11. declared maturity arithmetic vs expanded registry;
12. non-zero exit on any structural mismatch.

No denominator defect was found in the validator design.

### 3.1 Historical/current-stale 956/956 invariant

Historical RC-01 capability truth merged at:

`562b0e3124f2aac4a944d5285564f2d54527e754`

Exact current `main` is **355 commits ahead** of that RC-01 point, but these canonical blobs remain byte-identical:

- capability map: `0f5c2454c53f7b71e6f7ced1d3f85e067f79e7a5`;
- capability status: `edd222b24dd9ac6870f91d326bec1c2a63cbea2a`;
- validator: `39513c8aebb4722aee6826ce740f1e55e56c9700`.

RC-01 recorded:

```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Maturity: Hardened=0 RC=4 Wired=448 Foundation=345 Missing=159
Capability status completeness: 956/956
```

Because all validator inputs are unchanged, the historical registry remains structurally **956/956 exactly once** by byte-invariance proof.

A5 does **not** mislabel this as a fresh local Node execution. After A0 mutates maturity rows, the exact final candidate must run the validator again.

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

`0 + 4 + 448 + 345 + 159 = 956` — **PASS**.

This is a structural/arithmetic pass only. The labels themselves are stale because implementation/evidence advanced for 355 later commits. Final post-A0 arithmetic remains a mandatory A5/A0 convergence check.

## 5. Four historical RC capabilities — independent retention review

Historical RC IDs:

- `I01-014` Idempotency;
- `G02-001` Audit trail;
- `VP01-007` Supplier order/debt/FIFO allocation;
- `VP01-008` Supplier delivery reconciliation.

### 5.1 `I01-014` — RETAIN RC, not Hardened

Direct current source remains non-circular:

- `server/packages/frappe-api/src/command.ts` derives deterministic command IDs from trusted logical-write inputs/payload hash;
- `server/packages/document-kernel/src/kernel.ts` reads `(tenant_id, command_id)` receipt before mutation, rejects actor/payload mismatch and returns the previous receipt for a genuine retry;
- `server/packages/document-kernel/src/d1-store.ts` persists tenant-scoped `mutation_receipts`;
- later finance/stock/batch work consumes the canonical idempotency/write boundary rather than creating a competing authority.

A5 decision: **retain RC**. No production-grade evidence supports Hardened.

### 5.2 `G02-001` — RETAIN RC, not Hardened

Mutation lineage remains in canonical server writes. Current command/kernel/finance paths preserve append-style `versions` / mutation evidence and server-owned actor identity.

A5 decision: **retain RC**. This does not imply platform privacy, privileged support access or provider security operations are complete.

### 5.3 `VP01-007` / `VP01-008` — RETAIN narrow RC, explicitly not current-production Hardened

WS17 source evidence still directly supports supplier allocation/payment/reconciliation and correction semantics. Golden Order has narrow executable evidence.

Production boundary remains materially older:

- current source package: `alumdoor@2.2.2`;
- historical production release evidence: `alumdoor@2.2.1` at `69b94ac1fe29a2ab39175e5442975a9197a0d39e`;
- live authenticated current-source same-order proof: absent.

A5 decision: **retain both narrow RC claims**, reject Hardened/current-source-deployed wording.

## 6. Final A1-A4 spot-check decisions

A5 does not copy worker prose into the canonical registry. The decisions below are based on direct evidence spot-checks plus exact GitHub Actions state.

### 6.1 A1 ERP / VN — ACCEPT scoped recommendations

A1 proposes **61 scoped RC promotions**:

- Finance: 39 IDs across `F01`, `F02`, `F03`, `F04`;
- Procurement: 6 IDs in `P01`;
- Inventory: 4 IDs in `W01`;
- Manufacturing: 12 IDs in `M01` / `M03`.

A1 deliberately does **not** promote Vietnam statutory families, broad HCM/payroll, landed-cost closure, historical stock repost breadth, rework/subcontract manufacturing or broad manufacturing actual-cost/variance posting.

Independent A5 verification:

1. Transaction Closure job `91797832548`, run `30847056639`, concluded **success** and executed the Sales, Manufacturing, Inventory/WMS/valuation, Finance, Procurement and Warranty/service gates plus SQL/migration/package/authority checks.
2. The exact tested Transaction Closure head was `9ef9944f4a28e884979d790fc359d7c2c08da497`; it is not a simple ancestor of current main, so A5 did not infer exact-current coverage from branch names.
3. Representative tested authority/test blobs are byte-identical between that tested head and current main:
   - `server/packages/ledger/src/index.ts` → `77a7dd5fe8375500f63c160943d6b0cdf405f785`;
   - `server/packages/query/src/finance-closure.ts` → `871ac52aa90ae51a75be2f8ef91db557469f6c78`;
   - `server/packages/clouderp-core/src/procurement-p2p-controllers.ts` → `3d7f8155d5ab8d5c80cf4c26d95f95b377cf2b92`;
   - `server/packages/clouderp-erpnext/src/manufacturing-costing-read.ts` → `8489c42b34fec8afbcc96fe4751ea4254ab4ef8d`;
   - `server/packages/clouderp-stock/src/wms-picking.ts` → `df116e843d2f07f12ed388e2dd0470e11011272a`;
   - `server/migrations/tenant/0110_rc020_finance_posting_period_integrity.sql` → `9a5f585ab917e84bd7e680d26ed199d34e75244f`;
   - `server/tests/manufacturing-transaction-closure.test.mjs` → `f72c2f8f1488ad06f3eb8ac447fc0b6e10348b03`.
4. WS09 final convergence run `30860236052`, job `91840404067`, concluded **success** on exact head `ec0ae2f2269fd560b3636aa5671b39b2de7a8fcb` and independently exercised BatchAction/executor 23/23, Stock Reconciliation 16/16, BOM 18/18, replay migration/SQL, client declarations/input-table tests and production runtime build.
5. Both validation lanes intentionally use changed-authority TypeScript guards. They do **not** prove a green global server TypeScript build. Existing baseline errors were visible in unrelated App Factory definition, Manufacturing MRP, QMS and Frappe-model validation files. A5 therefore accepts only the scoped capability evidence, never a repo-wide build claim.

A5 decision: **ACCEPT A1's exact listed RC promotions for A0 convergence**, subject to A0 applying only the named IDs and preserving all A1 holdbacks. No Hardened promotions.

### 6.2 A2 Platform / IAM / App Factory — ACCEPT all proposed deltas

A2 proposed:

**Promotions**

- `G01-011`: Missing -> Wired;
- `G01-012`: Missing -> Foundation;
- `G01-014`: Missing -> Foundation;
- `G02-008`: Foundation -> Wired;
- `T01-018`: Foundation -> Wired;
- `T01-014`: Missing -> Foundation;
- `B02-006`: Missing -> Foundation.

**Demotions**

- `G02-003`: Foundation -> Missing;
- `G02-004`: Foundation -> Missing;
- `G02-005`: Foundation -> Missing.

Independent A5 source spot-check:

- `auth-routes.ts` verifies password and enabled user before `assertLoginSecondFactor()`, then only mints/registers the session after MFA succeeds — sufficient for **Wired**, not RC;
- `security-alerts.ts` is a connected immutable-audit-derived security alert read model — sufficient for **Wired**, not RC;
- `route-governance.ts` explicitly owns `active <-> suspended` transitions, reason requirement and audit action classification — sufficient for `T01-018` **Wired**;
- `app-revision-store.ts` has a real optimistic/audited rollback mechanism but intentionally refuses materialized metadata changes without reverse migration — sufficient only for narrow **Foundation** rollback claims;
- repository search does not expose one canonical PII classification/masking/retention taxonomy; authorization/redaction is not equivalent to the three privacy capabilities.

A5 decision: **ACCEPT all 7 A2 promotions and all 3 A2 demotions**. No RC/Hardened promotion from A2.

### 6.3 A3 SRE / Cloudflare — ACCEPT no-change conclusion

A3 recommends **0 promotions / 0 demotions** for `O01` and `T01-008`.

A5 agrees because current source proves meaningful observability, queue-safety, D1 session policy, workflow/config/governance seams, but provider truth remains explicitly separate:

- `remote_observation.status = unverified`;
- no exact-current production release proof;
- D1 replica/APAC proof absent;
- Workflow recovery proof absent;
- Analytics Engine adoption/reconciliation absent;
- edge-security provider state/false-positive proof absent;
- AI Gateway/Browser Run provider proof absent;
- backup/restore/DR/rollback rehearsals remain incomplete.

A5 decision: **ACCEPT A3 no-change recommendation**. Keep provider/non-production evidence in a separate queue; never backfill it from source config.

### 6.4 A4 UI / mobile / release — ACCEPT candidate deltas

A4 correctly identifies current presentation authority as **V2**, not V3. `client/packages/shell/src/AppShell.tsx` directly imports/renders `AppShellV2` and labels V3 props compatibility-only.

A4 proposed:

- `U01-009` Barcode scanner: Foundation -> Wired;
- `U01-010` QR scanner: Foundation -> Wired;
- `U01-011` GPS/geolocation: Foundation -> Wired;
- `U01-012` Signature capture: Foundation -> Wired;
- `U01-013` Push notifications: Foundation -> Missing.

Independent A5 source spot-check:

- `CameraScanner.tsx` uses `navigator.mediaDevices.getUserMedia`, rear-camera preference and `BarcodeDetector` with barcode + `qr_code` formats;
- the scanner is consumed by a real warehouse receipt screen rather than being a detached demo;
- generic `media.tsx` has a pointer/canvas Signature control and `navigator.geolocation` GeoJSON path;
- repository search found no `PushManager`/push subscription/service-worker provider delivery path;
- browser/device evidence is still absent, so no `U01` RC promotion is justified.

A5 decision: **ACCEPT all four Wired promotions and the Push demotion to Missing**. Keep `U01-001/002` Wired and `U01-003..007` Missing.

## 7. Circular/stale-evidence audit

### 7.1 Circular evidence rejected

A status/evidence document is not sufficient evidence for another status document. Final RC3 maturity must resolve to direct source/tests/migrations/permission/reconciliation/browser/provider/production evidence appropriate to the claimed level.

A5 found direct evidence behind the four historical RC retentions and the worker deltas accepted above; they are not retained/promoted solely by circular status prose.

### 7.2 Stale references requiring A0 cleanup

1. `CURRENT_STATUS.md` retains historical `ACTIVE — VN Accounting Period Integrity Hardening r8` language although RC-020 and later Transaction Closure work are on exact current main.
2. `NEXT_TASKS.md` still frames broad WS09 Batch Productization as upcoming even though current main itself is the WS09 convergence commit; only residual WS09 gaps should remain.
3. historical `E-FIN` predates RC-020/021/023 and Transaction Closure evidence;
4. historical `E-APPFACTORY` predates current BatchAction/BatchTransaction/replay convergence;
5. historical `E-SRE` predates CFMAX R2 and must separate source from provider truth;
6. historical `E-UI` predates later V3 work **and the V2 rollback**, so it cannot identify current presentation authority;
7. historical Alumdoor production proof remains `2.2.1` / `69b94ac...` and cannot prove current exact source deployed.

## 8. Migration sequencing anomaly

Exact current main contains three tenant migration files with numeric prefix `0110`:

- `0110_batch_replay_claims.sql`;
- `0110_rc020_finance_posting_period_integrity.sql`;
- `0110_rc023_cash_bank_reconciliation.sql`.

Then:

- `0111_rc020_finance_gl_scope_reconciliation.sql`;
- `0112_rc021_finance_ar_reconciliation.sql`.

This is **not an immediate uniqueness failure** under `server/scripts/d1-migrate-remote.mjs` because it lexically sorts filenames and journals the **complete filename** into `d1_migrations.name TEXT UNIQUE`.

It remains a migration-governance defect:

- chronology/dependency reasoning becomes ambiguous;
- environment drift review is harder;
- future tooling may assume unique monotonic numeric prefixes.

A5 explicitly rejects renaming potentially applied migrations without applied-state evidence. Resolve with an environment-aware migration audit, then freeze a future numbering/uniqueness rule.

## 9. Residual Top-30 release-confidence blockers after worker evidence

This ranking reflects A5-accepted A1/A2/A3/A4 deltas, even though A0 has not yet written them into the canonical registry. “Current after review” therefore means **A5 proposed convergence state**, not the still-stale checked-in registry.

| # | Capability ID(s) | Current after A5 review | Target | Residual blocker | Owner | Risk | Evidence needed |
|---:|---|---|---|---|---|---|---|
| 1 | `G01-011` | Wired | RC | exact login/enroll/recovery/browser regression + operational evidence | WS11 | CRITICAL | executable + browser/provider where used |
| 2 | `G01-012..G01-015` | Foundation/Missing | RC | complete OIDC/SAML/SSO/SCIM provider lifecycle, linking/provision/deprovision/logout | WS11 | CRITICAL | executable + provider-nonprod |
| 3 | `G01-016..G01-017` | Wired | RC | exact-current session/revocation/recent-auth regression across surfaces | WS11 | CRITICAL | executable |
| 4 | `T01-020` | Missing | RC | attributed/audited support access or impersonation lifecycle | WS11 | CRITICAL | executable + business/security policy |
| 5 | `G02-003..G02-005` | Missing | Wired then RC | canonical PII classification, masking and retention taxonomy surviving compiler/install/runtime | WS11/WS09 | CRITICAL | shared-contract + executable |
| 6 | `T01-019` | Missing | RC | tenant/data deletion, retention/legal-hold and recovery boundary | WS11/WS12 | CRITICAL | business policy + destructive-path evidence |
| 7 | `T01-016..T01-017`, `O01-013..O01-016` | Wired/Foundation | RC | restore/PITR/DR/rollback drill, RTO/RPO and exact backup proof | WS12 | CRITICAL | provider-nonprod |
| 8 | `O01-006..O01-012` | Foundation/Wired | RC | durable alert/error/DLQ/retry/integrity/reconciliation operations | WS12 | CRITICAL | executable + provider-nonprod |
| 9 | `O01-020..O01-021` | Wired/Foundation | RC | actual edge policy, API/PWA compatibility and false-positive evidence | WS12 | CRITICAL | provider-nonprod + policy |
| 10 | `IM02-006..IM02-009` | Foundation | RC | resumable retry/correction/incremental migration/post-migration reconciliation | WS13 | CRITICAL | executable |
| 11 | `T01-015`, `IM02-016` | Foundation | RC | tenant/legacy cutover, rollback, crash-window and reconciliation proof | WS13/WS12 | CRITICAL | executable + provider-nonprod |
| 12 | `O01-017`, `IM02-*` migration execution slice | Wired/Foundation | RC | resolve duplicate `0110` prefix governance from actual applied-state without unsafe rename | WS13/WS01 | CRITICAL | migration/applied-state evidence |
| 13 | `F01-011..F01-013` | non-RC | RC | automated close aggregate, retained earnings and close/reopen semantics | WS01 | CRITICAL | executable + reconciliation |
| 14 | `V02-011..V02-014` | Missing/Foundation | RC | PIT resident/progressive/deduction/annual settlement with official effective-dated fixtures | WS01/WS06 | CRITICAL | executable + official-source |
| 15 | `V03-001..V03-010` | Wired | RC | clause-verified official PIT/BHXH/BHYT/BHTN numeric fixtures + exact-head statutory regression | WS06 | CRITICAL | executable + official-source |
| 16 | `V04-006..V04-010` | Missing/Foundation | RC | e-invoice provider/signing/submission/retry/status synchronization | WS01/Integration | CRITICAL | provider-nonprod + official-source |
| 17 | `P01-016`, `W01-021` | Foundation | RC | landed-cost application into authoritative stock value, exact reversal and Stock/GL reconciliation | WS03/WS04/WS01 | CRITICAL | executable + reconciliation |
| 18 | `W01-023..W01-024` | below RC | RC | historical stock repost/replay mapped through downstream COGS/Finance correction | WS04/WS01 | CRITICAL | executable + reconciliation |
| 19 | `W02-004`, `W02-013` | Missing/Foundation | RC | persisted putaway/warehouse task assignment state machine | WS04 | STANDARD | executable |
| 20 | `W02-009`, `W02-014` | Foundation/Wired | RC | dedicated cycle-count/freeze workflow closure beyond stock-ledger primitive | WS04 | STANDARD | executable + browser/mobile where operational |
| 21 | `M03-009..M03-010` | Missing | RC | rework operating model and subcontract material/procurement/valuation contract | WS05 | CRITICAL | business contract + executable |
| 22 | `M04-004..M04-010` | Foundation/Missing | RC | actual labor/machine/overhead cost, variance posting and traceability closure | WS05/WS01 | CRITICAL | executable + reconciliation |
| 23 | `B02-006`, `T01-014` | Foundation | RC | generic materialized schema/data reverse migration and transactional rollback | WS09/WS13 | CRITICAL | executable + migration rollback |
| 24 | `B01-005`, `B01-009..B01-011` | Missing | RC | persisted parallel/quorum approval, escalation, SLA/timer and scheduled actions | WS09 | STANDARD | executable |
| 25 | `I01-011..I01-015` | Wired/Foundation/RC | RC breadth | physical attempt persistence, inspect/quarantine/replay, DLQ metrics while preserving idempotency | WS10/WS12 | CRITICAL | executable + provider-nonprod |
| 26 | `U01-001..U01-002` | Wired | RC | current V2 desktop/tablet/Android/360px/a11y + real installed standalone PWA evidence | WS14 | STANDARD | browser/mobile |
| 27 | `U01-003..U01-007` | Missing | Wired then RC | authenticated tenant/session-aware cache, offline queue, background replay, OCC conflict UX | WS14 + WS11/12 | CRITICAL | shared-contract + executable + browser/mobile |
| 28 | `R01-014` | Missing | RC | offline POS semantics consuming canonical offline/OCC/idempotency authority | Commerce/WS14 | CRITICAL | executable + browser/mobile |
| 29 | `A02-021..A02-024` | Missing | RC | AI proposal/tool/preview/human approval with permission/audit authority | AI/WS11 | CRITICAL | executable |
| 30 | `O01-002`, `VP01-007..VP01-008` | Wired / RC | exact-release / Hardened gate | current exact release SHA + bundle hash + authenticated live evidence; no inheritance from old Alumdoor release | WS12/WS17 | CRITICAL | production exact-release after authorization |

## 10. Global build caveat

A5 explicitly records a repository-level nuance that must not be lost during convergence:

- Transaction Closure exact scoped gate: PASS;
- WS09 exact scoped gate: PASS;
- **global server TypeScript: not proven green**.

Observed baseline errors outside changed authority include App Factory definition nullability, Manufacturing MRP exact-optional typing, QMS exact-optional typing and Frappe-model validation typing. They did not invalidate the scoped changed-authority gates, but they remain engineering debt and must not be rewritten as “full repo typecheck PASS”.

## 11. Dependency Requests

### DR-RC3-A5-001 — A1-A4 substantive evidence

**RESOLVED.** A1 `#590`, A2 `#589`, A3 `#586`, A4 `#588` are substantive and were independently spot-checked above.

### DR-RC3-A5-002 — duplicate migration-prefix applied-state audit

Owners: A1/WS01 + A2/WS13 + A0 convergence.

Need:

- inspect exact `d1_migrations` applied state in every relevant approved environment before changing filenames;
- record intended dependency/order among the three `0110_*` migrations;
- preserve already-applied filename identity where required;
- add a future migration-number uniqueness/governance check compatible with historical state.

No production mutation or unsafe rename is authorized by A5.

### DR-RC3-A5-003 — fresh validator execution after A0 registry convergence

Owner: A0/A5 convergence.

After A0 applies accepted maturity deltas, run:

`node server/scripts/validate-enterprise-capability-status.mjs`

Acceptance:

- map unique = 956;
- status unique = 956;
- missing = 0;
- unknown = 0;
- duplicates = 0;
- declared maturity arithmetic = expanded registry arithmetic;
- final candidate SHA recorded.

This is the only remaining dependency preventing A5 from declaring the **future converged registry** structurally PASS. It does not block delivery of A5 evidence to A0.

## 12. RC3 topology at A5 completion

Execution topology: **PROGRAM**  
Coordinator/control lane: **A0**  
Worker agents: **5 (A1-A5)**

| Agent | Branch | PR | Status | A5 disposition |
|---|---|---:|---|---|
| A0 | `agent/rc3-00-capability-convergence` | #585 | RUNNING | must ingest worker evidence and write final registry |
| A1 | `agent/rc3-01-erp-vn-evidence` | #590 | READY | scoped recommendations accepted |
| A2 | `agent/rc3-02-platform-evidence` | #589 | READY | all proposed deltas accepted |
| A3 | `agent/rc3-03-sre-cloudflare-evidence` | #586 | READY | no-change/provider-gap classification accepted |
| A4 | `agent/rc3-04-ui-mobile-release-evidence` | #588 | READY | UI/mobile candidates accepted |
| A5 | `agent/rc3-05-independent-qa` | #591 | READY | deliver to A0; final validator awaits A0 candidate |

## 13. Final A5 verdict

### PASS / accepted now

- canonical denominator: **956**;
- historical registry structural coverage: **956/956 exactly once** by byte-invariance proof;
- historical maturity arithmetic: **PASS**;
- validator design: **PASS for structural completeness**;
- historical RC retention: `I01-014`, `G02-001`, `VP01-007`, `VP01-008` retained narrowly;
- A1 scoped 61 RC recommendations: **accepted for A0 convergence**;
- A2 7 promotions + 3 demotions: **accepted**;
- A3 0/0 delta: **accepted**;
- A4 4 Wired promotions + 1 demotion: **accepted**;
- Hardened promotions: **0**.

### Still required at coordinator convergence

- A0 writes the canonical per-capability registry changes;
- A0 reconciles stale status/task/evidence references;
- exact final validator execution proves 956/956 and new arithmetic;
- duplicate migration-prefix applied-state issue remains tracked;
- provider/browser/production proof remains separate and cannot be inferred from source/CI.

## 14. Merge/deploy boundary

A5 is documentation/evidence/governance, **not UI-only**.

- branch commit: completed;
- PR `#591` to RC3 control branch: completed;
- A5 self-merge: **not performed**;
- RC3 control -> `main`: **not performed; explicit user approval required**;
- production deploy/provider mutation: **not performed**.
