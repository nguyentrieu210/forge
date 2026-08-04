# R5-01 — Package + Capability Profile

Date: **2026-08-04**  
Status: **READY_WITH_DEPENDENCIES**  
Branch: `agent/r5-01-package-capability-profile`  
PR: **#634 (draft)**  
Risk: **STANDARD / shared backend + schema** — do not merge/deploy without explicit authorization.

## 1. Execution topology

Execution topology: **SINGLE**  
Worker agents: **1**  
Active worker branches: **1** — `agent/r5-01-package-capability-profile`  
Coordinator/control dependency: R5-00 `agent/r5-00-integration-control`

R5-00 verdict is `GO_WAVE_1`. Its manifest makes R5-01 the App Registry/App Factory authority for package + capability-profile composition. R5-05 is a consumer of this contract, not a competing profile authority.

The branch was created from `main@30346e08eabb7074f8623eeedae09efec25da072`. During execution `main` advanced by a docs/coordination-only commit to `8316d2a5f24863d3347cf9f92ec5987145b8dc9e`. Exact validation therefore runs the GitHub PR merge candidate and asserts current `origin/main` is an ancestor before testing.

## 2. Product model closed by R5-01

The canonical model is now:

1. **Platform infrastructure remains shared and always-on.**
2. **Domain/app packages remain coarse-grained installable/versioned authorities.** `AppInstaller` still owns package install, upgrade, dependency checks, ownership and uninstall.
3. **Capabilities are fine-grained activation metadata declared by a package and composed by a tenant profile.** They do not become separately installed physical packages.
4. **Disabling a capability never uninstalls its package and never deletes business/history data.** It only changes effective surfaces/gates.
5. **Uninstall remains a separate explicit administrative lifecycle.** Existing package uninstall/purge semantics are not reused by profile deactivation.
6. **The App Registry is the only profile authority.** The Builder serializes proposals; it does not keep a client-trusted shadow flag store.

## 3. Canonical contract

A package may carry a top-level capability contract alongside the existing App Manifest:

```json
{
  "id": "alumdoor",
  "version": "2.0.35",
  "capabilities": [
    {
      "id": "alumdoor.workshop",
      "label": "Workshop",
      "default_state": "disabled",
      "requires": [
        {
          "capability": "vn-accounting.cash-bank",
          "min_package_version": "2.0.0"
        }
      ],
      "surfaces": {
        "nav": ["workshop"]
      }
    }
  ]
}
```

A tenant profile is a versioned proposal over installed package contracts:

```json
{
  "profile_id": "alumdoor-pilot",
  "expected_version": 3,
  "selections": [
    {
      "capability_id": "alumdoor.workshop",
      "state": "enabled"
    }
  ]
}
```

The server resolves the proposal into `required | enabled | disabled | blocked`, including implicit dependency enables, exact minimum package requirements, errors and current-vs-proposed diff.

### Invariants

- Capability IDs are package-namespaced (`<package>.<capability>`).
- Required capabilities cannot be disabled.
- Dependency resolution is deterministic.
- Explicit disable is authoritative: a dependent capability becomes blocked instead of silently overriding the operator's disable.
- Unknown/uninstalled dependency fails closed.
- Dependency cycle fails closed.
- Capability conflict fails closed.
- Minimum package version mismatch fails closed.
- Declared nav/action/screen/report/chart/validator/hook references are validated against the package surface where the canonical manifest has an equivalent surface catalogue.
- One package surface cannot be owned by two capabilities.
- Re-applying an identical semantic profile is idempotent even when OCC `expected_version` or preview diff changes.
- Stale profile apply fails with version conflict.
- Capability deactivation never deletes `installed_apps`, documents or authoritative ledgers.

## 4. Authority diagram

```text
Package source
  app manifest + capabilities[]
            |
            v
  App Registry / AppInstaller                 <-- SINGLE AUTHORITY
  - canonical package parse/install
  - package dependency + version checks
  - capability contract registration
  - profile preview / resolve / apply
  - OCC + immutable profile revisions
            |
            +-------------------------------+
            |                               |
            v                               v
 installed_apps / app_objects        capability_profile_*
 package + metadata authority        activation metadata only
            |                               |
            +---------------+---------------+
                            v
                  effective AppInstaller.list()
                  + assertCapability()
                            |
          +-----------------+------------------+
          |                 |                  |
          v                 v                  v
 nav/actions/screens   reports/charts     validators

Client CapabilityProfileBuilder
  -> serializes proposal + expected_version
  -> NEVER decides effective authority locally
  -> preview/apply must delegate to App Registry service
```

No data path exists from capability deactivation to package uninstall or ledger/document deletion.

## 5. Implementation

### App Registry

Added:

- `server/packages/app-registry/src/capability-profile.ts`
  - package capability contract parser;
  - tenant profile proposal parser;
  - deterministic resolver;
  - dependency/min-version/cycle/conflict/unknown fail-closed handling;
  - diff and effective-surface helpers.
- `server/packages/app-registry/src/capability-profile-store.ts`
  - exact installed package/version/content-hash contract lookup;
  - immutable versioned profile revisions;
  - active profile pointer;
  - OCC and semantic idempotency.
- `server/packages/app-registry/src/capability-profile-installer.ts`
  - keeps the proven installer chain as package authority;
  - registers capability contracts at install boundary;
  - exposes server-authoritative preview/apply/current/assert methods;
  - gates effective nav/actions/screens/reports/charts/validators through `list()`.
- `server/packages/app-registry/src/index.ts`
  - exports canonical profile authority and the capability-aware `AppInstaller`.

The original installer remains responsible for package install/upgrade/ownership/uninstall. R5-01 does not fork it.

### Persistence

Added append-only tenant migration:

- `server/migrations/tenant/0115_capability_profiles.sql`

Tables:

- `app_capability_contracts`
- `capability_profile_revisions`
- `capability_profile_active`

A capability contract recorded before a failed package install is inert: contract lookup only accepts an exact matching row from `installed_apps` by tenant/app/version/content hash.

### Capability Profile Builder

Added:

- `client/packages/builder/src/capability/capability-profile.ts`
- `client/packages/builder/src/capability/CapabilityProfileBuilder.tsx`
- Builder barrel exports.

Builder behavior:

- displays current server profile version;
- groups capabilities by package;
- locks required capabilities;
- toggles desired enabled/disabled state;
- shows blocked reasons;
- supports preview and apply callbacks;
- serializes only explicit selections plus OCC version;
- does not calculate or persist authoritative effective state client-side.

## 6. Activation/deactivation behavior

| Surface | R5-01 disposition |
|---|---|
| Package install/version/data | **Preserved** — capability state does not alter package installation |
| Navigation | **Wired** via effective `AppInstaller.list()` |
| Actions | **Wired** via effective `AppInstaller.list()` |
| Screens | **Wired** via effective `AppInstaller.list()` |
| Reports/charts | **Wired** via effective `AppInstaller.list()` |
| Validators | **Wired** via effective `AppInstaller.list()` and existing validator consumer |
| Permission/business route gate | **Canonical primitive ready** via `AppInstaller.assertCapability()`; downstream route owners must consume it where a capability gates a write/read |
| Hooks | **Dependency Request** — current tenant hook fanout reads raw `installed_apps.manifest_json`, bypassing effective `list()` |
| Jobs/scheduler | **Dependency Request** — no single current App Registry-owned job dispatch seam to patch safely in R5-01 |
| External integrations/provider dispatch | **Dependency Request** — R5-05 consumer boundary |
| Uninstall/purge | **Separate lifecycle, intentionally unchanged** |

## 7. Regression evidence

Canonical green run:

- Workflow: **R5-01 Capability Profile Validation**
- Run: **30880367319**
- Job: **91900243112**
- Exact PR merge candidate: `c92120554f7c5c7090fd5016edc3721dfce98096`
- Candidate composition: R5-01 head `fe906e158b4cee3c65b04bd180dcdb4b8f2701bb` merged for validation into current `main@8316d2a5f24863d3347cf9f92ec5987145b8dc9e`

PASS evidence:

- current `origin/main` is ancestor of tested candidate;
- no TypeScript error in R5-01 App Registry authority;
- **51/51** App Registry/capability server tests pass;
- `@metaforge/builder` build passes;
- **3/3** targeted Capability Profile Builder model tests pass;
- SQL verification passes;
- migration governance passes across **86 SQL files / 3 migration directories**;
- append-only migration delta passes against current main;
- **3/3** migration-governance tests pass;
- non-destructive authority guard passes.

The targeted TypeScript build still observes one pre-existing unrelated diagnostic in `server/packages/frappe-model/src/validate.ts` concerning `DocTypeKind | undefined` under `exactOptionalPropertyTypes`. The R5-01 gate explicitly fails if an error intersects `capability-profile*` or the changed App Registry export; none does.

### Acceptance coverage

| Required evidence | Result |
|---|---|
| Dependency success | PASS |
| Missing dependency | PASS fail-closed |
| Dependency cycle | PASS fail-closed |
| Capability conflict | PASS fail-closed |
| Required capability cannot disable | PASS |
| Disable preserves package identity | PASS |
| Re-enable restores surface without reinstall | PASS |
| Tenant isolation | PASS |
| Server-side capability permission gate | PASS |
| Package minimum-version mismatch | PASS fail-closed |
| Profile current-vs-proposed diff | PASS |
| Profile OCC/versioning | PASS |
| Profile idempotent re-apply | PASS |
| Representative Alumdoor cross-package composition | PASS — Alumdoor consumes `vn-accounting.cash-bank`, does not copy Finance authority |
| Browser test for hosted Builder | **BLOCKED by DR-R5-01-02**; component/build/model evidence is not misreported as browser E2E |
| Full real-package install -> upgrade -> reinstall -> deactivate/reactivate rehearsal | **Handoff to R5-06** on disposable tenant fixtures |

## 8. CI-found defects fixed during R5-01

The lane did not treat first-pass green as assumed evidence.

1. TypeScript exposed an invalid `InstallResult` import and optional-client mismatch in the new installer adapter; both were corrected.
2. Regression exposed a real idempotency defect: OCC `expected_version` and preview `diff` were included in the profile content fingerprint, so a semantic no-op reapply could create a new revision. Fingerprinting now uses semantic active profile state only.
3. Existing App Registry tests initially failed because the narrow CI emit omitted the Query package; the harness was corrected instead of changing product code.
4. Builder Node regression initially imported the full barrel and pulled ReactFlow CSS; the test now imports the pure capability model directly. Pre-existing decimal tests outside R5-01 remain a separate baseline issue and are not claimed as R5-01 failures or fixes.

## 9. Dependency Requests

### DR-R5-01-01 — effective capability consumption in Integration/Workplace dispatch

**Target owner:** R5-05 Integration + BI + Workplace + Logistics  
**Need:** consume R5-01 effective capability state for hooks, scheduled jobs and provider/integration dispatch.  
**Canonical source:** `AppInstaller.currentCapabilityResolution()`, `AppInstaller.assertCapability()` and effective App Registry profile metadata.  
**Do not:** copy profile rows into a second integration config store or let a client flag decide dispatch authority.  
**Current concrete gap:** `tenant-worker` hook fanout reads `installed_apps.manifest_json` directly and therefore does not yet observe capability deactivation.  
**Blocking:** yes for claiming end-to-end hook/job/integration deactivation; no for the completed R5-01 registry contract/resolver/persistence/Builder work.

### DR-R5-01-02 — thin API façade + hosted Builder route/browser evidence

**Target owner:** shared Frappe/API façade + Builder host integration owner during R5 convergence.  
**Need:** expose authenticated System Manager endpoints for:

- current capability profile/catalog;
- preview proposal/resolution/diff;
- apply proposal with `expected_version`.

The façade must be thin and delegate to `context.apps.previewCapabilityProfile()` / `applyCapabilityProfile()`; it must not reimplement resolver rules or persist client flags. Mount `CapabilityProfileBuilder` against those calls, then run representative browser E2E.

**Why not patched here:** current `frappe-api/router.ts` is a shared platform façade with a hard-coded platform method switch and no App Registry extension hook. R5-01 will not create a second endpoint/config authority or overwrite another shared hotspot merely to manufacture browser evidence.  
**Blocking:** yes for hosted Builder browser PASS; no for the canonical App Registry authority and Builder component contract.

## 10. R5-06 handoff

R5-06 Package / Migration Rehearsal should consume this contract on disposable/non-production tenants and prove the physical lifecycle against representative first-party packages plus Alumdoor:

`fresh install -> upgrade -> idempotent reinstall -> profile apply -> deactivate -> data/package unchanged -> reactivate -> surfaces restored`

R5-06 should also verify migration checksum/applied-state and tenant isolation on the exact integrated R5 candidate. R5-01 does not perform production migration or mutate a customer tenant.

## 11. Verdict

**R5-01 owner scope: READY_WITH_DEPENDENCIES.**

The package-vs-capability authority, deterministic resolver, minimum-version handling, profile persistence/OCC/idempotency, non-destructive activation semantics, effective App Registry surfaces, server permission primitive and Capability Profile Builder contract are implemented and validated on the exact current-main merge candidate.

R5 convergence must keep the two dependency requests visible. Do not promote this lane to full end-to-end PASS until R5-05 consumes the effective dispatch contract and the shared façade hosts the Builder with browser evidence.

No merge, deployment, production migration, provider mutation or customer-data mutation was performed.
