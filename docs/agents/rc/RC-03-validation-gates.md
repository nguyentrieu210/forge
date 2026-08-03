# RC-03 — Validation Gates

Agent: `RC-03`  
Branch: `rc/w0-validation-gates`  
Task: `RC-003`  
Start baseline: exact `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  
PR: `#433` — `feat(validation): make RC risk gates executable`  
PR base at open: `main@8ceb94241ff82b1433370b43b0eff832ade4fdf9`  
Merge/deploy: **not performed**

## 1. Outcome

RC-003 now has an executable, fail-closed validation policy instead of prose-only FAST/STANDARD/CRITICAL labels.

Delivered:

- `validation/rc-gates.json` — machine-readable matrix;
- `scripts/run-validation-gate.mjs` — deterministic planner/executor;
- `scripts/validation-gate.test.mjs` — policy regression tests;
- `validation/profile.example.json` — CRITICAL finance profile example;
- `validation/profile.ui-promotion.example.json` — UI promotion example;
- `docs/VALIDATION_GATES.md` — canonical usage/policy;
- root package commands `validate:gate`, `validate:fast`, `validate:standard`, `validate:critical`, `validate:gate:test`.

The runner is local-first and reuses existing repo test/build/E2E infrastructure. No new GitHub Actions development CI was added.

## 2. Evidence audited on exact starting main

### Enterprise policy

`skills/forge-enterprise-completion/SKILL.md` defines:

- FAST: scoped typecheck/build, UI visual evidence when applicable;
- STANDARD: unit/targeted integration, permission, happy/failure paths;
- CRITICAL: invariants, migration replay when schema changes, authoritative regression, correction/reversal, tenant/permission isolation and reconciliation;
- no RC/Hardened promotion from code/test count alone.

`docs/FORGE_ENTERPRISE_NORTH_STAR.md` requires correction/cancel/reversal, server-side permission/tenant isolation, accounting/stock/payroll reconciliation, mobile/offline where needed, and backup/release evidence for enterprise completion.

### Existing commands reused

Root `package.json` already exposed:

- `pnpm run typecheck`;
- `pnpm run test`;
- `pnpm run build`;
- `pnpm run verify`;
- `pnpm run release:check`.

`server/package.json` already exposed:

- unit + SQL migration suite;
- `test:workers`;
- `typecheck:workers`;
- `check:business-suite`;
- tenant backup/restore/migrate/rollback commands;
- many targeted Python migration regressions, including finance/HRM/warehouse cash/period-integrity families.

`client/package.json` already exposed `typecheck`, `test`, `build`, and `e2e`.

`client/apps/demo/playwright.e2e.config.mjs` already defines three projects:

- `desktop-chromium`;
- `mobile-pixel7`;
- `mobile-iphone13`.

`deploy-evidence/alu-full-sync.json` demonstrates the current production evidence shape with exact `releaseSha`, `deployedSha`, `bundleHash`, and `completedAt`.

## 3. Deterministic matrix

### FAST

Always requires:

- typecheck;
- build.

Additional promotion/maturity rules:

- UI `UI_PROMOTION`, `RC`, `HARDENED`, or `DEPLOYED` claim + `touches.ui=true` => browser E2E;
- the same claims + `touches.mobile=true` => mobile E2E.

### STANDARD

Always requires:

- typecheck;
- build;
- unit/self-check;
- targeted integration;
- permission regression;
- failure-path regression.

Conditional:

- authoritative mutation => idempotency/retry;
- tenant-boundary change => tenant isolation;
- migration => migration replay;
- UI promotion/maturity claim => browser/mobile evidence according to touched surface.

### CRITICAL

Always requires:

- typecheck;
- build;
- unit/self-check;
- targeted integration;
- permission;
- tenant isolation;
- failure path;
- idempotency/retry.

Conditional but mandatory when applicable:

- migration => migration replay;
- finance/stock/payroll => correction/reversal + reconciliation;
- UI promotion/maturity claim => browser/mobile evidence;
- `HARDENED` or `DEPLOYED` => exact production release marker.

Finance/stock/payroll profiles are rejected if risk is lower than CRITICAL.

## 4. Exact production proof rule

A `HARDENED` or `DEPLOYED` profile cannot pass by pointing at a green PR, merged commit, or build artifact alone.

The `production_release_marker` verifier requires:

1. `releaseSha` = exact profile head SHA (40 hex chars);
2. `deployedSha`, when present, = same SHA;
3. non-empty `bundleHash` with at least 8 characters;
4. parseable `completedAt` timestamp.

This matches the repository's existing `/release.json` / deploy-evidence contract without triggering a deployment.

## 5. Inherited failure handling

Full/broad suites can be recorded under `diagnostics`.

A failing diagnostic is classified `INHERITED` only when all are true:

- `inherited.baseSha` exactly equals the profile `baseSha`;
- a tracking issue/doc reference exists;
- a concrete reason is recorded.

Required gates cannot be waived as inherited. If a broad failure is not classified, the runner returns `PASS_GATES_DIAGNOSTIC_TRIAGE_REQUIRED` (exit 3) rather than quietly laundering it into green.

## 6. Fail-closed choices

The matrix deliberately does **not** assign fake universal defaults for:

- targeted integration;
- permission;
- tenant isolation;
- failure path;
- idempotency/retry;
- correction/reversal;
- reconciliation.

Those checks must point to the exact tests/evidence for the changed authority. If a required check has no implementation in the profile, plan mode returns configuration failure before execution.

The only broad defaults are existing repo commands where “broad” is semantically valid: typecheck, build, unit/self-check, SQL migration replay, and current Playwright desktop/mobile projects.

## 7. Validation performed for RC-003 implementation

The runner/matrix/tests were exercised as standalone Node code with Node `v22.16.0` because this environment cannot clone/resolve GitHub for a full dependency checkout.

Commands on the latest policy content:

```text
node --check scripts/run-validation-gate.mjs
node --check scripts/validation-gate.test.mjs
node --test scripts/validation-gate.test.mjs
```

Result:

```text
10 tests
10 pass
0 fail
```

Covered policy regressions:

1. FAST locks typecheck + build.
2. STANDARD authoritative mutation adds idempotency/retry.
3. Tenant boundary + migration add isolation/replay.
4. CRITICAL finance adds correction/reversal + reconciliation.
5. UI `UI_PROMOTION`/`RC`/`HARDENED`/`DEPLOYED` claims add desktop + mobile evidence when marked applicable.
6. HARDENED/DEPLOYED adds production marker.
7. finance/stock/payroll cannot be downgraded below CRITICAL.
8. missing targeted implementation fails plan.
9. inherited diagnostic is pinned to exact base SHA.
10. release evidence accepts exact SHA and rejects mismatch.

Full Forge typecheck/build/test/E2E was **not run in this connector environment**. That is not reported as PASS. The RC-003 policy code itself has standalone syntax/regression evidence; actual product changes using this gate must still supply the profile-selected product evidence.

## 8. Inherited validation debt on starting main

| Debt | Exact observation | RC-003 disposition |
|---|---|---|
| Risk classes were policy, not executable lanes | `CURRENT_STATUS.md` records merged minimal risk-based gates, but root scripts had no FAST/STANDARD/CRITICAL runner | closed by matrix + runner |
| Root `verify` is broad and not capability-aware | cannot prove a specific permission/failure/correction invariant by itself | required targeted checks fail closed |
| Migration suite is broad | `server test:sql` covers many families in one command | broad default retained; profile can/should override with targeted migration regression |
| UI E2E existed but was not promotion-bound | current Playwright config already has desktop + 2 mobile projects | promotion/maturity claims now add browser/mobile gates |
| Production proof existed only in release workflow/evidence conventions | exact release SHA/bundle proof is present in deploy evidence | reusable verifier added; no deploy triggered |
| Development GitHub Actions are intentionally absent | `CURRENT_STATUS.md` says Actions are build/deploy only | kept local-first; no heavy CI added |
| Full suite may contain unrelated historical failures | no deterministic inherited-failure encoding existed | diagnostics classification now exact-base pinned |

## 9. Dependency Request

### DR-RC03-001 — RC hardening plan file missing from exact main

Requested path:

`docs/FORGE_RC_HARDENING_PLAN_20260803.md`

Result on exact starting main: **404 / file absent**. Repository code search also returned no `RC-003` or file-name match.

Impact:

- cannot cite that document as repository evidence;
- not blocking RC-003 because the user task itself supplies RC-003 acceptance criteria and the Enterprise Completion Skill/North Star/current scripts provide enough authority to implement the lane deterministically.

Action for coordinator/RC control lane: add/restore the canonical hardening plan if it is intended to be a repository source of truth. RC-03 should then compare it against this executable matrix rather than replacing executable evidence with prose.

## 10. Concurrent-main / PR state

The branch was created from exact `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830` as requested.

Before PR opening, current main was rechecked at `8ceb94241ff82b1433370b43b0eff832ade4fdf9`. The one intervening commit is unrelated UI-only work touching `client/packages/ui/src/styles.css`; RC-003 touches validation files, docs, and root package scripts only.

PR `#433` is open against current `main`. No old PR was reopened.

## 11. Merge/deploy boundary

This work is non-UI validation infrastructure.

- PR required: **done — #433**.
- Merge performed: **no**.
- Production deploy: **no**.
- Production migration: **no**.
- Secret/DNS/customer-data mutation: **no**.
