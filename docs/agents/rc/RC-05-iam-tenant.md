# RC-05 — IAM / Tenant / Offline Contract

Status: **READY FOR PR REVIEW — CRITICAL, no merge/deploy**  
Branch: `rc/w0-iam-tenant`  
Started from exact `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830` (`ahead=0`, `behind=0` at branch creation).  
Scope requested: RC-011, RC-013 and contract phase of RC-016.

## 1. Truth / source hierarchy

Audited mandatory sources available on exact main:

- `skills/forge-enterprise-completion/SKILL.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
- live IAM/permission/auth/gateway/app-registry/runtime source, migrations and regression tests.

### Dependency Request — missing RC hardening plan

`docs/FORGE_RC_HARDENING_PLAN_20260803.md` does **not exist on the exact current-main seed used to create this branch**, and repo code search found no `RC-011` / `RC-016` text to recover the missing task definition.

`DR-RC05-PLAN-01 -> RC control-plane/document owner`: restore/publish the canonical RC hardening plan. This agent used the user's explicit RC-05 scope plus Skill/North Star/capability map and continued all independent work instead of blocking.

No legacy PR was reopened. The old `agent/ent-11-security-iam-saas` branch was compared against current main and is now behind current main with no unique ahead commits; it was treated as historical evidence only.

## 2. IAM / permission audit

Authoritative implementation: `server/packages/frappe-model/src/permission.ts`.

Observed server-side invariants:

- deny by default when no metadata/role/share authority grants an action;
- Role/DocPerm action evaluation;
- owner-only permission (`if_owner`);
- Share read/write/share scope, without share implicitly granting higher field permlevels;
- field `permlevel` read/write enforcement and response redaction;
- User Permission Link-value constraints;
- organization scope and published Role Policy only narrow access; they do not widen static DocPerm;
- list/read scope is compiled with tenant/owner/share/User Permission constraints server-side;
- Administrator/System Manager rescue authority remains explicit;
- UI metadata is filtered for usability, but server permission remains authoritative.

Existing regression evidence includes `server/tests/permission-v2.test.mjs`, covering owner, share, field permlevel, User Permission, list SQL scoping, redaction, organization scope and role-policy narrowing.

### Session authority audit

`server/packages/frappe-api/src/session.ts` signs tenant/user/roles/epoch/expiry/auth-time/CSRF/session-id into the cookie. More importantly, `server/packages/frappe-api/src/auth-routes.ts::establishSession()` re-reads the live user and current roles from D1 and builds the request actor from those values. Cookie-embedded roles are therefore not the online authorization authority.

Current session lifecycle also has:

- `session_epoch` all-session invalidation;
- per-session registry/revocation for newer sessions;
- login MFA enforcement before session issuance;
- server-side login rate limiting;
- signed-session tenant binding and CSRF binding.

### Maturity recommendation

No RC/Hardened promotion is claimed without exact executable and production evidence.

| Capability | Recommendation | Evidence boundary |
|---|---|---|
| `G01-002` Role | Wired | role directory + live-role session establishment + regression evidence |
| `G01-003` RBAC | Wired | server authority and atomic admin foundation; exact-head suite not executed here |
| `G01-004` Record permission | Wired | owner/share/row scope enforced server-side |
| `G01-005` Field/permlevel | Wired | write guard + read redaction regressions |
| `G01-006` Owner permission | Wired | document-scoped owner path regression |
| `G01-007` Share | Wired | read/write/share semantics and protected-field regression |
| `G01-008` User Permission/scope | Wired | server Link constraints + list compilation regression |

## 3. Tenant isolation / lifecycle audit

### Trusted routing boundary

`server/apps/gateway-worker/src/index.ts`:

- derives route tenant from the vhost/route table in production;
- strips untrusted platform identity headers;
- signs trusted tenant/user identity for internal routing;
- verifies JWT signature/issuer/audience before using `auth_time`/actor claims;
- rejects JWT tenant mismatch;
- refuses any tenant route whose status is not `active` with `423 TENANT_NOT_ACTIVE` **before client-shell/API dispatch**.

`server/apps/control-plane-worker/src/route-governance.ts` provides controlled `provisioning/active/suspended` transitions, required reasons, monotonic routing versions and audit-action classification. Existing regression: `server/tests/control-route-governance.test.mjs`.

Recommendation: tenant routing/lifecycle is **Wired**, not RC/Hardened without exact-head execution and production route evidence.

## 4. App install / upgrade / rollback audit

### Existing strengths

`server/packages/app-registry/src/installer.ts` already provides:

- package/version parsing;
- minimum platform/dependency checks;
- downgrade refusal;
- external DocType validation;
- foreign ownership conflict protection;
- navigation conflict protection;
- one D1 batch for install/upgrade materialization;
- no-op identical reinstall;
- uninstall refusal when dependent apps exist or app-owned DocTypes still hold documents.

`server/packages/app-registry/src/app-revision-store.ts` already provides versioned app revision history and a narrow presentation-only rollback. It refuses rollback when materialized metadata differs and no reverse migration exists.

### Gap found

Before this branch, upgrade rewrote the `app_objects` ownership set to the new manifest but did not remove materialized objects omitted by the new manifest. A package could therefore drop a DocType/workflow/print format/fixture/custom field and leave the old tenant row alive but no longer owned/described by the package.

That breaks install/upgrade/rollback lifecycle truth and can make future uninstall/recovery reason about incomplete ownership.

### Fix implemented

New `server/packages/app-registry/src/app-upgrade-guard.ts`:

- computes the materialized declaration set for DocTypes, Workflows, Print Formats, Fixtures and Custom Fields;
- rejects app-id mismatch;
- rejects any sequential upgrade that drops one of those declarations;
- requires an explicit reverse migration or uninstall contract before such removal can be accepted.

`server/packages/app-registry/src/platform-aware-installer.ts` now loads the currently installed manifest for the same tenant/app and runs that guard before delegating to the unchanged atomic core installer.

Why here: the package barrel exports the installer through `input-table-installer -> platform-aware-installer -> core installer`. This keeps the core D1 transaction unchanged while protecting the canonical public app-install path.

Presentation-only changes remain allowed because nav/reports/charts/client data live inside `installed_apps` and disappear atomically with that row revision.

### New regression

`server/tests/app-upgrade-materialization-guard.test.mjs` covers:

- materialized additions allowed;
- presentation changes allowed;
- dropped DocType rejected;
- dropped Workflow rejected;
- dropped Print Format rejected;
- dropped Fixture rejected;
- dropped Custom Field rejected;
- cross-app id replacement rejected.

Existing `server/tests/app-revision-history.test.mjs` provides complementary rollback evidence: materialized metadata drift makes rollback non-automatable.

### Remaining concurrency gap

The canonical core installer reads the current `installed_apps` row before building its D1 batch, then upserts `installed_apps` without an optimistic predicate on the previously observed content hash/revision. The new removal guard therefore closes ordinary/sequential orphaning but cannot honestly prove fail-closed behavior if **two upgrades of the same tenant/app race** between preflight and commit.

`app-revision-store.rollbackPresentation()` already demonstrates the desired pattern: optimistic update against the previously observed active content plus failure when the row changed.

`DR-RC05-APP-01 -> app-registry/kernel shared write authority`: add storage-level OCC/serialization for app install/upgrade (`installed_apps` expected content/revision or equivalent authoritative lock), then add a two-writer regression. Do not solve this with a browser/admin UI lock.

This is recorded as a blocker to RC/Hardened app-upgrade maturity, not as a reason to discard the independent sequential hardening in this PR.

### App lifecycle maturity recommendation

| Capability | Recommendation | Boundary |
|---|---|---|
| `B02-002` App dependency | Wired | install-time dependency/version enforcement |
| `B02-003` App version | Wired | version/hash/revision history + downgrade guard |
| `B02-004` / `T01-012` App install per tenant | Wired | tenant-scoped atomic install path; same-app concurrent install/upgrade OCC remains DR-RC05-APP-01 |
| `B02-005` / `T01-013` App upgrade per tenant | Wired, strengthened | sequential removal guard; exact test run + concurrent OCC still pending |
| `B02-006` / `T01-014` App rollback | Foundation/Wired-narrow | presentation rollback wired; general materialized rollback remains blocked without reverse migration |

No claim is made that Forge has a generic reversible schema/data migration language. It does not.

## 5. Offline contract phase (RC-016)

Created canonical contract: `docs/FORGE_OFFLINE_SYNC_CONTRACT.md`.

The contract freezes:

- offline read/cache partitioning by trusted tenant, user, server-owned access revision, schema revision and canonical release markers;
- bounded offline authorization lease so a revoked user cannot retain unlimited offline access merely because the device remains disconnected;
- purge/lock on logout, user/tenant switch, 401/403/423, access revision change, schema incompatibility or lease expiry;
- no persisted cookie/JWT/trusted-identity/password/MFA secrets;
- offline write deny-by-default;
- canonical queue identity using stable `command_id`, `expected_version`, `payload_hash` and aggregate/action payload;
- no retargeting a queued command to another tenant/user/access revision;
- server-authoritative OCC conflict detection;
- no generic last-write-wins;
- rebase creates a **new** command id against the new authoritative version;
- submitted/ledger/immutable flows use domain correction/reversal rather than client merging;
- background sync cannot create a new long-lived bearer-token bypass just to make Service Worker replay convenient;
- release/schema freshness tied to the existing release SHA/bundle marker contract.

### Offline capability maturity

`U01-003..007` remain **Missing**. The branch freezes the contract only; it does not contain a private cache, write queue, background-sync runtime or conflict UI.

This matches `CURRENT_STATUS.md` and WS14's current truthful baseline.

## 6. Offline Dependency Requests

### DR-RC05-OFFLINE-01 -> RC-04 / shared auth boundary

Expose one authenticated, server-owned Offline Access Context with `tenant_id`, `user_id`, opaque `access_revision`, bounded `lease_expires_at`, `schema_revision`, `release_sha` and `bundle_hash`. No secret or client-authoritative role list.

### DR-RC05-OFFLINE-02 -> IAM/metadata authorities

Provide authoritative access-revision invalidation when access can narrow: Role/DocPerm/permlevel/User Permission/Share/organization scope/published Role Policy. Exact storage may be tenant + user generations; the invariant is what is frozen.

### DR-RC05-OFFLINE-03 -> WS14 runtime

Implement private IndexedDB/cache namespaces, purge/lock, write queue and conflict UX after Offline Access Context/revision is wired.

### DR-RC05-OFFLINE-04 -> RC-02 release/SRE

Keep the existing release SHA/bundle marker observable/canonical for cache and queue freshness.

## 7. Validation status

Repository canonical server commands from `server/package.json` include:

- `npm run build`;
- `npm run test:unit`;
- `npm run test:sql`;
- `npm run typecheck:workers`;
- `npm run check:business-suite` / broader readiness gates.

### Executed in this agent environment

- exact GitHub branch/base comparison: **PASS** at branch creation;
- source/document/test audit through GitHub connector: **PASS**;
- local checkout/build/unit/SQL/worker suite: **NOT RUN** because the execution container could not resolve `github.com` for checkout;
- new app-upgrade regression: **NOT RUN** locally for the same reason;
- production tenant routing, production migration, secret/DNS change, destructive data operation: **NOT RUN by design**;
- merge/deploy: **NOT RUN by design**.

During execution, `main` advanced by one unrelated UI-only commit touching `client/packages/ui/src/styles.css`. Exact compare showed no overlap with RC-05 files. The branch was not polluted with that unrelated UI commit solely to manufacture an `behind=0` counter.

PR CI/status is the next executable evidence source. A green PR does not by itself promote these CRITICAL capabilities to Hardened; production evidence is still separately required by the Skill.

## 8. Changed files

- `server/packages/app-registry/src/app-upgrade-guard.ts` — new sequential fail-closed upgrade-removal invariant.
- `server/packages/app-registry/src/platform-aware-installer.ts` — wire guard into canonical tenant app installer.
- `server/tests/app-upgrade-materialization-guard.test.mjs` — targeted regression.
- `docs/FORGE_OFFLINE_SYNC_CONTRACT.md` — offline read/write/sync security + OCC contract.
- `docs/agents/rc/RC-05-iam-tenant.md` — this evidence handoff.

## 9. Merge / deploy gate

RC-05 is IAM/Tenant/backend CRITICAL, not UI-only.

Open a PR, inspect exact-head CI/review, then **stop**. Do not merge or deploy without the user's explicit approval.
