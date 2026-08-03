# RC-02 — Release / SRE

Status: **REVIEW — implementation/audit complete to PR gate; no production mutation performed**  
Owner: **RC-02**  
Branch: `rc/w0-release-sre`  
Exact main at branch creation: `3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  
Latest main audited during execution: `8ceb94241ff82b1433370b43b0eff832ade4fdf9` (UI-only change in `client/packages/ui/src/styles.css`; no overlap with RC-02 files)

## Scope

This lane executes **RC-002** and audits/prepares the requested **RC-014 / RC-015** release/data-safety surface:

- root GitHub Actions release topology;
- canonical release workflow and stale/duplicate/one-off disposition;
- proof that a non-UI commit cannot automatically deploy the Gateway UI;
- `/health`, `/release.json`, exact release SHA and bundle marker;
- backup verification and restore drill contract;
- migration verification boundaries;
- Worker rollback / D1 recovery boundaries;
- integrity and release evidence.

No production deploy, production migration, restore, PITR, password reset, tenant metadata apply, secret/DNS change, queue/resource provisioning or destructive operation was run.

## Required-input discrepancy

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` does **not exist** on exact main at branch creation and still returns 404 on the latest audited `main`. Repository search also found no `RC-002` definition file. The execution scope above therefore uses the explicit RC-02 mission supplied by orchestration plus current Skill, North Star, Current Status, SRE runbook, WS12 handoff and exact code/evidence.

### Dependency Request DR-RC02-01

- Target: release coordinator / RC control-plane owner.
- Need: publish the canonical RC Hardening Plan path or commit if it exists elsewhere.
- Impact: **non-blocking** for the explicit RC-02 work completed here; blocks claiming literal compliance with task text that is absent from the repository.
- Workaround: use explicit orchestration scope and repository evidence; do not invent missing RC task wording.

## Release topology after RC-02

| Surface | Trigger | Production effect | Disposition |
|---|---|---|---|
| `.github/workflows/alu-build-deploy.yml` | `push main` limited to `client/**`; manual `workflow_dispatch` for UI/full | UI push deploys Gateway only; full lane is manual | **Canonical release workflow** |
| `.github/workflows/alu-employee-lite-apply.yml` | manual `workflow_dispatch` only | tenant-scoped Employee Lite metadata mutation after exact merged-main check | **Keep as manual maintenance action** |
| `.github/workflows/alu-admin-password-reset.yml` | manual `workflow_dispatch` only | production admin credential reset/session revocation after exact merged-main check | **Keep as manual maintenance action** |
| `.github/workflows/deploy-ui-once.yml` | formerly every push to `main` | deployed Gateway regardless of changed path | **Deleted: unsafe duplicate** |
| `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` | formerly push when workflow file changed | hard-coded SHA full production release | **Deleted: stale one-off** |
| `client/.github/workflows/ci.yml` | nested under `client/` | not a root repository GitHub Actions workflow | **Not part of active release topology** |

### Why `alu-build-deploy.yml` is canonical

Exact source already contains the required release invariants:

1. automatic push is `main` + `paths: client/**`;
2. automatic UI job has an additional changed-file guard and refuses backend/schema/non-allowlisted companions before deploy;
3. manual UI/full target must be an ancestor of current `origin/main`;
4. full release order is backup -> offline replay verify -> migration -> tenant/app/Gateway deployment;
5. final convergence verifier checks out current `main` SRE tooling and probes the exact target SHA;
6. plaintext SQL backup is not uploaded as an Actions artifact.

`server/scripts/verify-release-safety.mjs` now scans the entire root workflow directory, not only the canonical file. It fails if:

- a `tmp-*` workflow remains active;
- another root workflow deploys the Gateway;
- a production-mutating maintenance workflow has `push` or `pull_request` trigger;
- a production-mutating maintenance workflow lacks explicit `workflow_dispatch`.

## Proof: non-UI commit does not automatically deploy UI

1. Canonical `alu-build-deploy.yml` uses `push.branches=main` with `paths: client/**`. A non-client-only commit does not trigger the workflow.
2. If a commit contains both `client/**` and another changed path, `Guard automatic main push as UI-only` runs before Wrangler and rejects non-UI files except explicitly allowlisted documentation companions.
3. The former `deploy-ui-once.yml`, which deployed Gateway on every `main` push, is removed.
4. The release-safety validator rejects any future second root workflow that deploys `apps/gateway-worker/wrangler.jsonc`.
5. Production-mutating maintenance workflows are manual-only, so merging maintenance code cannot itself mutate production.

This is **repository/source proof**, not a claim that a GitHub production run was executed in this RC session. No production run was triggered.

## `/health` and release marker audit

### `/health`

`server/scripts/sre-health-snapshot.mjs` requires:

- `/health` -> HTTP 200 with `ok=true`;
- `/` -> HTTP 200;
- unauthenticated boot remains HTTP 403;
- `/release.json` exists and has a bundle hash;
- optional expected release SHA matches exactly.

Remote probing is fail-closed behind `--allow-remote --confirm-host <host>` and has bounded retry/timeout controls.

### `/release.json`

`server/scripts/stage-client-bundle.mjs` replaces the staged Gateway public bundle wholesale, hashes the actual runtime + warehouse mobile files, then writes:

- `service: gateway-ui`;
- `releaseSha` from `VITE_FORGE_RELEASE_SHA` / `FORGE_RELEASE_SHA`;
- `bundleHash` from staged content.

Important boundary: this marker proves the **Gateway UI bundle revision**, not the Tenant Worker, app Worker, D1, KV, R2 or queue state.

### Existing production evidence

`deploy-evidence/alu-full-sync.json` records a completed release on 2026-08-02 with deployed/release SHA `69b94ac1fe29a2ab39175e5442975a9197a0d39e` and bundle hash `ed328d88ad8242f5`, with tenant worker, Alumdoor worker and Gateway UI marked deployed.

That is historical production evidence for that exact SHA only. It is **not** evidence that current `main` or this RC branch is deployed.

## Backup verification audit

Current backup chain is structurally sound at source level:

1. `backup-tenant.mjs` exports remote D1 and creates adjacent immutable `forge-d1-backup/v1` manifest containing tenant, database identity, filename, bytes, SHA-256 and timestamp.
2. `verify-tenant-backup.mjs` replays SQL into isolated local SQLite and checks `quick_check`, foreign keys, application table presence and core tenant scope.
3. plaintext SQL is explicitly treated as transient sensitive recovery material, not an Actions artifact.

### RC-02 defect fixed: verifier/drill tenant-scope drift

The offline verifier allowed provisioning metadata namespaces `demo` and `__standard__` inside `doctype_definitions`, while `restore-tenant-drill.mjs` rejected every non-target tenant id. A valid backup could therefore PASS offline verification and FAIL the remote drill for a policy disagreement between two SRE tools.

Fix:

- `RESERVED_METADATA_TENANTS` and `allowedTenantIdsForBackupTable()` are now shared in `server/scripts/lib/tenant-backup-verification.mjs`;
- both offline verification and remote restore drill consume the same allowlist contract;
- regression pins `documents`/`installed_apps` to exact tenant and `doctype_definitions` to tenant + reserved metadata catalogs only.

## Restore drill audit

`restore-tenant-drill.mjs` remains fail-closed:

- target name must begin `cloudforge-drill-` or `cloudforge-restore-`;
- live `cloudforge-<tenant>` target is refused;
- target must already exist and be empty;
- execute requires exact target confirmation;
- backup manifest/checksum is verified before import;
- post-restore checks cover integrity, foreign keys, tenant scope and migration count;
- evidence records `routes_changed:false`.

**Remote restore drill was NOT RUN in this RC session.** It is a Cloudflare resource/data operation and remains a production/destructive gate.

## Migration verification audit

`migrate-tenant.mjs` provides dry-run by default, explicit `--execute --confirm <tenant>` for remote apply, exact tenant D1 resolution and a clean-worktree gate unless an explicit risk override is supplied.

Existing `deploy-evidence/alu-migrate-diagnostic.json` records a 2026-08-02 backup/plan/migrate success with all 45 then-current migrations already recorded.

### Dependency Request DR-RC02-02 / existing DR-WS12-01

- Target: **WS13 migration/onboarding infrastructure**.
- Gap: `d1-migrate-remote.mjs` applies a migration file first and inserts the `d1_migrations` row afterwards. A crash between those operations can cause a rerun of already-partially/applied SQL. The ledger records filename, not immutable content identity/checksum.
- Required contract: migration journal tied to immutable file/content identity with deterministic partial-failure/replay semantics.
- Blocking: **yes before migration verification can be called Hardened**.
- RC-02 action: audit and dependency recorded; shared migration contract not modified across lane ownership.

## Rollback / PITR audit

### Regular Worker rollback

`rollback-worker.mjs` plans read-only by default, requires exact Worker + exact version, requires exact confirmation + operator reason for execution, verifies the resulting deployment contains the requested version, and explicitly states D1/KV/R2 are unchanged.

### Workers-for-Platforms gap

Tenant/app Workers in the dispatch namespace do not have a provider-proven equivalent rollback contract in current repo evidence. Full-release rollback therefore remains partial and must use a verified compatible source/forward redeploy where appropriate.

### D1 state recovery

D1 PITR is separate from Worker rollback. Current SRE tooling requires explicit destructive confirmation and a fresh verified backup before execution. No PITR was executed here.

## Backup / restore / rollback gap matrix

| Capability | Current evidence | Recommendation | Remaining gap |
|---|---|---|---|
| Health check (`O01-001`) | source probe + historical production health evidence | **Wired / RC candidate** | current-release production observation |
| Release marker (`O01-002`) | exact staged SHA + bundle hash + historical production record | **Wired / RC candidate** | current-release production convergence |
| Backup verification (`O01-013`) | manifest/checksum + isolated replay + tenant/integrity checks; shared scope fix | **RC candidate, not Hardened** | current release backup/off-account retention proof |
| PITR (`O01-014`) | guarded plan/execute tooling | **Wired** | destructive rehearsal/approved operational policy |
| Disaster recovery (`O01-015`) | restore drill tooling + recovery runbook | **Foundation / Wired tooling** | remote drill cadence, RTO/RPO, encrypted off-account retention |
| Release rollback (`O01-016`) | exact regular Worker rollback | **Foundation** | dispatch-namespace tenant/app Worker rollback contract; schema/data compatibility evidence |
| Migration verification (`O01-017`) | plan/confirm/clean-worktree + backup-before-migration workflow | **Wired** | crash window + immutable migration content identity (WS13) |

No item is promoted to `Hardened` by this RC audit.

## Stale/historical evidence disposition

- `server/DEPLOY_EVIDENCE.md`: historical live deployment evidence; useful for incidents/provider behavior, not current-release truth.
- `docs/brd-v2/RELEASE_RUNBOOK.md`: historical Alumdoor v2 release procedure; it must not override current canonical `docs/ops/SRE_RUNBOOK.md` + exact source.
- `AI_HANDOFF.md`: contains stale release-workflow naming (`manual-release-alu.yml`) versus exact source; exact source/SRE runbook remain authoritative.
- PR #427 or any prior release PR: not used as current truth; only exact current source/evidence was accepted.

## Validation performed in this RC session

The execution container cannot resolve `github.com`, so a complete repository checkout/dependency install was unavailable. This is recorded rather than disguised as CI evidence.

Isolated validation against changed source copied from the branch:

- Node 22 `node --check` for `verify-release-safety.mjs`: **PASS**;
- release event parser assertions for manual vs push triggers: **PASS**;
- PyYAML parse for both modified maintenance workflows: **PASS**;
- shared tenant-scope helper syntax + policy assertions: **PASS**;
- branch fetch confirms both removed workflows return 404: **PASS**.

Repository-native `npm --prefix server run verify:release-safety` and `node --test server/tests/tenant-backup-verification.test.mjs` should run in a normal checkout/CI. No production workflow was invoked merely to manufacture evidence.

## RC-002 result

**RC-002 source hardening: READY FOR REVIEW.**

The release control plane now has one canonical Gateway release workflow, production maintenance is explicit/manual, stale automatic release paths are removed, release topology is guarded by executable source validation, and backup/restore tenant-scope policy no longer drifts between local verification and remote drill.

This is a non-UI CRITICAL lane. Stop at PR. **Do not merge or deploy without explicit authorization.**
