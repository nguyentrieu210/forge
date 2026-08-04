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
| R5-01 | branch diverged from current main, 2 ahead / 1 behind; capability-profile contract not integrated | dependency |
| R5-02 | draft PR `#632`, WIP, 9 commits ahead of current main | dependency |
| R5-03 | branch diverged, 1 ahead / 1 behind | dependency |
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
- package ownership metadata remains canonical.

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
7. disposable Workerd/D1 tenant-worker integration covering bootstrap, install, idempotent reinstall, upgrade, atomic failure recovery and tenant routing isolation;
8. diff hygiene;
9. explicit R5-01 minimum-version contract regression.

## Exact contract defect found by rehearsal

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

### DR-R5-A6-02 -> R5-01 — capability profile lifecycle

R5-06 must prove profile apply -> deactivate -> reactivate and that disable preserves package/data. The canonical profile contract exists only on the non-integrated R5-01 worker branch at this checkpoint.

R5-06 will not reproduce capability flags or write a client-only activation authority. This lane remains blocked until the R5-01 contract has a stable integration disposition/candidate.

### DR-R5-A6-03 -> R5 Integration Control / convergence — exact candidate SHA

Full Wave-2 rehearsal must run against **one explicit integrated R5 candidate SHA** after R5-01..R5-05 stable dispositions.

No candidate SHA existed at R5-06 start. R5-06 therefore records this prerequisite instead of constructing a synthetic candidate by cherry-picking workers.

## PASS / FAIL matrix

Status below is updated only from executable evidence; source presence is not a PASS.

| Rehearsal requirement | Current verdict | Evidence / blocker |
|---|---|---|
| fresh/disposable tenant bootstrap | PENDING CI | tenant-worker Workerd/D1 integration gate |
| deterministic package dependency install order | BLOCKED | DR-R5-A6-01 must close canonical version semantics; full candidate order also needs DR-R5-A6-03 |
| minimum package version resolution | **FAIL / BLOCKED** | pinned regression demonstrates `>=` contract mismatch; DR-R5-A6-01 |
| install + idempotent reinstall | PENDING CI | existing AppInstaller + tenant-worker integration regression |
| package upgrade path | PENDING CI | existing multi-version tenant-worker regression |
| capability profile apply/deactivate/reactivate | BLOCKED | DR-R5-A6-02 |
| disabled capability preserves package/data | BLOCKED | DR-R5-A6-02 |
| migration sequence/checksum/applied-state semantics | PENDING CI | canonical migration governance + unit regression |
| simulated failed package upgrade/install recovery | PENDING CI | atomic D1-batch failure regression; integrated-candidate rerun still required |
| representative opening import + reconciliation | PENDING CI | migration opening + manifest/reconciliation fixtures |
| tenant leakage negative path | PENDING CI | tenant-worker route/binding mismatch fail-closed regression |
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

**R5-06 = BLOCKED, independent rehearsal harness implemented.**

The branch is useful now because it converts package/migration assumptions into executable gates, but it cannot become `READY` until:

1. DR-R5-A6-01 is closed by the canonical package owner;
2. DR-R5-A6-02 has a stable profile contract;
3. R5 Integration Control supplies one exact integrated candidate SHA;
4. the same rehearsal is rerun on that candidate and all required gates are materially PASS.
