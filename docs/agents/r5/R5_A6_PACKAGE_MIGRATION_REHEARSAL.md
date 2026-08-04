# R5-A6 — Package / Migration Rehearsal

Date: **2026-08-04**
Risk: **CRITICAL** — package lifecycle, migration/recovery and tenant-isolation evidence
Execution topology: **SINGLE**
Branch: `agent/r5-06-package-migration-rehearsal`
Branch baseline: `main@8316d2a5f24863d3347cf9f92ec5987145b8dc9e`
Integrated R5 candidate SHA: **NONE — prerequisite not yet satisfied**

## Mission

Prove repeatable customer deployment mechanics on disposable/non-production fixtures without creating a second package installer, migration authority, business write path or production mutation path.

R5-06 deliberately does **not** cherry-pick R5-01..R5-05 worker branches to manufacture a candidate. The exact integrated candidate must come from the R5 convergence/control path after Wave 1 dispositions are stable.

## Exact-state prerequisite audit

| Lane | Exact state observed at R5-06 start | R5-06 disposition |
|---|---|---|
| R5-00 | PR `#629`; RC4 source integration complete; `GO_WAVE_1` only | consume control evidence; no RC4 replay |
| R5-01 | package/capability-profile work not integrated; draft PR `#634` later opened | dependency owner for package contract |
| R5-02 | draft PR `#632`, WIP, finance/HCM work not integrated | dependency owner for HRM package defect |
| R5-03 | branch diverged from current main at start | dependency |
| R5-04 | draft PR `#628`, READY/GREEN; exact-head run `30878962512` PASS | stable worker evidence, not integrated candidate |
| R5-05 | draft PR `#630`, `BLOCKED` on shared scheduler registration | dependency |

Therefore Wave 2 cannot honestly claim an integrated-candidate rehearsal yet. Independent rehearsal infrastructure continues on exact current `main` and remains reusable when a candidate SHA exists.

## Authorities reused — no duplicate implementation

### Package authority

`server/packages/app-registry/src/installer.ts` remains authoritative for install/upgrade/uninstall behavior.

Existing behavior reused by this rehearsal:

- package parsed before writes;
- package dependency and minimum-version check at install boundary;
- identical reinstall returns `unchanged`;
- downgrade is refused;
- install/upgrade object writes are committed as one D1 batch;
- package ownership metadata remains canonical;
- Roles are shared grants rather than exclusive app-owned objects.

`server/scripts/pack-app.mjs` is reused for source-package dry validation. R5-06 does not add another package reader or installer.

### Migration authority

`server/scripts/verify-migration-governance.mjs` remains authoritative for repository migration governance:

- exact migration filename validation;
- frozen legacy prefix-collision allowlist;
- append-only delta enforcement;
- full `migrationDir/filename + SHA-256` applied-state identity.

R5-06 does not rename historical migrations or invent a second migration ledger.

### Import/opening/reconciliation authority

Existing `server/packages/migration` contracts and tests are reused for:

- dependency ordering `master -> opening -> transaction`;
- opening preview/apply/reconcile semantics;
- decimal-safe exact reconciliation fixtures.

Domain owners remain responsible for real finance/stock/HCM posting rules and production cutover semantics.

## Reproducible rehearsal gate

Workflow: `.github/workflows/r5-06-package-migration-rehearsal.yml`

It executes on the exact PR head and has **no deploy step**.

1. locked dependency install;
2. exact-head server dist emission;
3. migration tree/checksum/append-only governance;
4. opening import order + reconciliation fixtures;
5. canonical App Registry regressions;
6. first-party package dry checks for HRM, VN Accounting, Manufacturing/QMS and Maintenance;
7. targeted disposable Workerd/D1 scenarios for login/bootstrap, tenant-route isolation, install, idempotent reinstall, repeated upgrade, atomic failed-install rollback and safe uninstall;
8. diff hygiene;
9. explicit R5-01 minimum-version contract regression;
10. aggregate verdict after every independent gate has run.

The tenant-worker gate is intentionally targeted rather than running all 78 Frappe-facade scenarios. Run `30879982782` proved the full file currently has unrelated baseline failures in share/report/fieldtype/notification/web-form scenarios. Those failures are not package/migration evidence and must not mask the R5-06 scenarios. The relevant package lifecycle scenarios themselves passed in that run except the stale large-package ownership assertion described in DR-R5-A6-05.

## Executable evidence — run 30879982782

Exact head: `8c5ac56c7b333d7d65a90031d6419931d9ca3607`

| Gate | Result | Evidence |
|---|---|---|
| exact head + locked install | PASS | checkout/assert succeeded; frozen lockfile installed |
| target dist emission | PASS with unrelated baseline debt | App Registry and Migration dist emitted; existing full-server TypeScript debt remains outside R5-06 scope |
| migration governance | PASS | 85 SQL files / 3 migration dirs; append-only delta PASS; 3/3 governance tests |
| opening import + reconciliation | PASS | 5/5 opening tests and 4/4 manifest/reconciliation tests |
| App Registry unit regression | PASS | 40/40 tests |
| HRM package dry check | **FAIL / BLOCKED** | missing external `Bank Account` declaration; DR-R5-A6-04 |
| VN Accounting package dry check | PASS | `vn-accounting@1.6.1` validated |
| Manufacturing/QMS package dry check | PASS | `manufacturing-qms@1.1.0` validated |
| Maintenance package dry check | PASS | `maintenance@1.5.1` validated |
| full tenant-worker file | baseline noisy | 66/78 passed; R5-06 package lifecycle scenarios were green except stale 127-row ownership assertion |
| diff hygiene | FAIL — harness defect | markdown hard-break trailing spaces; corrected after this run |
| minimum-version contract | **FAIL / BLOCKED** | `1.2.9` incorrectly satisfies manifest requirement `>=1.3.0`; DR-R5-A6-01 |

## Dependency Requests

### DR-R5-A6-01 -> R5-01 Package + Capability Profile — dependency version semantics

**Observed first-party manifest:** `server/apps-src/vn-accounting/app.json` declares:

`hrm >=1.3.0`

**Observed canonical resolver:** `satisfiesVersion()` delegates to `compareVersions()`, whose parser splits the string on `.` and converts each component with `Number(part) || 0`.

For `">=1.3.0"`, the first component is `">=1"`, which converts to `0`. Therefore a too-old installed version such as `1.2.9` can incorrectly satisfy the declared minimum.

This is not a rehearsal-harness defect. It is the shared package-version contract owned by R5-01, so R5-06 does **not** patch `app-registry` locally.

Acceptance for dependency closure:

- one canonical dependency-version syntax is defined and parser-validated;
- first-party manifests are valid under that syntax;
- `1.2.9` does **not** satisfy a minimum of `1.3.0`;
- `1.3.0` and `1.8.0` do satisfy it;
- invalid/unsupported constraint syntax fails closed rather than degrading numerically;
- install-time dependency checks and R5-01 profile resolution use the same semantics.

Pinned regression: `server/tests/r5-package-migration-rehearsal.test.mjs`.

Dependency Request was posted to draft PR `#634`.

### DR-R5-A6-02 -> R5-01 — capability profile lifecycle

R5-06 must prove profile apply -> deactivate -> reactivate and that disable preserves package/data. The canonical profile contract exists only on the non-integrated R5-01 worker path at this checkpoint.

R5-06 will not reproduce capability flags or write a client-only activation authority. This lane remains blocked until the R5-01 contract has a stable integration disposition/candidate.

Dependency Request was posted to draft PR `#634`.

### DR-R5-A6-03 -> R5 Integration Control / convergence — exact candidate SHA

Full Wave-2 rehearsal must run against **one explicit integrated R5 candidate SHA** after R5-01..R5-05 stable dispositions.

No candidate SHA existed at R5-06 start. R5-06 therefore records this prerequisite instead of constructing a synthetic candidate by cherry-picking workers.

### DR-R5-A6-04 -> R5-02 Finance/HCM — HRM package integrity

Canonical dry check:

`node scripts/pack-app.mjs apps-src/hrm --check`

fails because `Salary Bank Batch.bank_account` links to `Bank Account` while the HRM manifest does not declare that target through `externalDocTypes`.

R5-06 does not patch the HCM package manifest from the rehearsal lane.

Acceptance:

- HRM validates with canonical `pack-app --check`;
- `Bank Account` is declared through the existing external-DocType contract, or the field target is corrected if authoritative domain evidence requires a different target;
- no duplicate local `Bank Account` DocType is created.

Dependency Request was posted to draft PR `#632`.

### DR-R5-A6-05 -> R5-01 Package authority — stale large-package ownership assertion

The tenant-worker regression for a synthetic package containing 69 DocTypes, 57 fixtures and one Role still expects `127` `app_objects` rows.

Current canonical `AppInstaller.ownedObjects()` deliberately does **not** claim Roles as exclusive app-owned objects because Roles are shared grants and uninstall leaves them in place. The canonical ownership count for that synthetic package is therefore `69 + 57 = 126`.

R5-06 does not rewrite this shared package-contract test from the rehearsal lane. The stale assertion was routed to R5-01.

Acceptance:

- large-package regression agrees with the canonical shared-Role lifecycle;
- cross-app shared Roles remain valid;
- uninstall does not delete shared Roles;
- all genuinely app-owned objects are still proven to persist atomically.

## PASS / FAIL matrix

Status below is updated only from executable evidence; source presence is not a PASS.

| Rehearsal requirement | Current verdict | Evidence / blocker |
|---|---|---|
| fresh/disposable tenant bootstrap | PASS on current-main fixture | older tenant standard-catalogue repair passed in Workerd/D1; integrated-candidate rerun still required |
| deterministic package dependency install order | BLOCKED | minimum-version semantics DR-R5-A6-01 plus exact candidate DR-R5-A6-03 |
| minimum package version resolution | **FAIL / BLOCKED** | pinned regression demonstrates `>=` contract mismatch; DR-R5-A6-01 |
| install + idempotent reinstall | PASS on current-main fixture | tenant-worker package scenario passed |
| package upgrade path | PASS on current-main fixture | repeated multi-version upgrade scenario passed |
| capability profile apply/deactivate/reactivate | BLOCKED | DR-R5-A6-02 |
| disabled capability preserves package/data | BLOCKED | DR-R5-A6-02 |
| migration sequence/checksum/applied-state semantics | PASS on current main | governance 3/3 + 85-file append-only/checksum evidence |
| simulated failed package install recovery | PASS on current-main fixture | late metadata failure rolled back atomically |
| representative opening import + reconciliation | PASS on current main | opening 5/5 + manifest/reconcile 4/4 |
| tenant leakage negative path | PASS on current-main fixture | route/binding tenant mismatch failed closed |
| first-party HRM package integrity | **FAIL / BLOCKED** | DR-R5-A6-04 |
| first-party VN Accounting package integrity | PASS | canonical packer |
| first-party Manufacturing/QMS package integrity | PASS | canonical packer |
| first-party Maintenance package integrity | PASS | canonical packer |
| large-package ownership regression | BLOCKED upstream test contract | DR-R5-A6-05; assertion conflicts with canonical shared-Role ownership semantics |
| exact integrated R5 candidate rehearsal | BLOCKED | DR-R5-A6-03 |

## Safety boundary

- No production migration.
- No production restore/PITR.
- No provider/DNS/secret mutation.
- No customer-data mutation.
- No deploy.
- No R5 worker cherry-pick into a synthetic integration branch.
- This is non-UI CRITICAL work; PR must stop before merge/deploy pending explicit authorization.

## Current verdict

**R5-06 = BLOCKED, independent rehearsal harness implemented and materially exercised.**

The branch now distinguishes harness failures from owner-contract failures and keeps independent gates executable. It cannot become `READY` until:

1. DR-R5-A6-01 is closed by the canonical package owner;
2. DR-R5-A6-02 has a stable profile contract;
3. DR-R5-A6-04 closes the HRM package integrity defect;
4. DR-R5-A6-05 reconciles the stale shared-Role ownership regression;
5. R5 Integration Control supplies one exact integrated candidate SHA;
6. the same rehearsal is rerun on that candidate and all required gates are materially PASS.
