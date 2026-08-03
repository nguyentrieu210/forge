# Forge Validation Gates

Canonical executable policy for change validation. The source matrix is `validation/rc-gates.json`; the runner is `scripts/run-validation-gate.mjs`.

This policy turns the Enterprise Completion Skill risk classes into deterministic local gates without turning GitHub Actions back into a second development CI system.

## 1. Principles

1. Validation is tied to an exact `baseSha` and `headSha`.
2. Risk classification is `FAST`, `STANDARD`, or `CRITICAL` only.
3. A broad suite does not substitute for a missing targeted invariant test.
4. A required check with no command/evidence fails closed at plan time.
5. Finance, stock, and payroll changes are always `CRITICAL`.
6. Finance/stock/payroll `CRITICAL` changes require correction/reversal **and** reconciliation evidence.
7. UI promotion requires browser evidence; mobile evidence is mandatory when the changed surface is mobile-applicable.
8. `HARDENED` or `DEPLOYED` claims require production release evidence matching the exact head SHA and a bundle marker.
9. Full-suite failures unrelated to the change may be recorded as inherited debt only when pinned to the exact base SHA with a tracking reference and reason. Required gates themselves cannot be waived as inherited.
10. Production deploy/migration is outside this runner. The runner only validates evidence already produced by an authorized release path.

## 2. Matrix

| Requirement | FAST | STANDARD | CRITICAL | Conditional rule |
|---|:---:|:---:|:---:|---|
| typecheck | required | required | required | default `pnpm run typecheck` |
| build | required | required | required | default `pnpm run build` |
| unit/self-check |  | required | required | default `pnpm run test` |
| targeted integration |  | required | required | must be wired to the changed slice |
| permission |  | required | required | must verify server-side authority |
| tenant isolation |  | conditional | required | STANDARD when tenant boundary changes |
| failure path |  | required | required | negative/error semantics |
| idempotency/retry |  | conditional | required | STANDARD when authoritative mutation changes |
| migration replay |  | conditional | conditional | required whenever a migration changes |
| correction/reversal |  |  | conditional | mandatory for finance/stock/payroll CRITICAL |
| reconciliation |  |  | conditional | mandatory for finance/stock/payroll CRITICAL |
| browser E2E |  |  |  | required for `UI_PROMOTION` when `touches.ui=true` |
| mobile evidence |  |  |  | required for `UI_PROMOTION` when `touches.mobile=true` |
| production release marker |  |  |  | required for `HARDENED` or `DEPLOYED` claim |

Blank cells mean “not required by that lane alone”, not “forbidden”. Conditional rules can still add them.

## 3. Existing repo infrastructure reused

The gate deliberately reuses current Forge commands instead of inventing another giant CI stack:

- root `pnpm run typecheck`, `pnpm run test`, `pnpm run build`;
- CloudForge `test:sql`, `test:workers`, migration regression scripts and business-suite checks;
- MetaForge Playwright config with `desktop-chromium`, `mobile-pixel7`, and `mobile-iphone13` projects;
- existing deploy evidence shape containing `releaseSha`, `bundleHash`, and `completedAt`.

Targeted integration/permission/tenant/failure/idempotency/correction/reconciliation checks intentionally have **no generic default command**. Those invariants are meaningful only when the profile points at the tests for the changed authority. A missing targeted command is a configuration failure rather than a pretend pass from an unrelated broad suite.

## 4. Validation profile

Every run uses a JSON profile. Start from `validation/profile.example.json` or `validation/profile.ui-promotion.example.json`.

Required identity fields:

```json
{
  "changeId": "my-change",
  "baseSha": "40-character-base-sha",
  "headSha": "40-character-head-sha",
  "risk": "STANDARD"
}
```

The profile also declares:

- `domains`: lower/upper case is normalized; `finance`, `stock`, or `payroll` force CRITICAL;
- `touches.ui`;
- `touches.mobile`;
- `touches.migration`;
- `touches.authoritativeMutation`;
- `touches.tenantBoundary`;
- `claims`: `UI_PROMOTION`, `RC`, `HARDENED`, `DEPLOYED`;
- `checks`: exact commands and/or evidence paths for targeted checks;
- `diagnostics`: optional broad suites that are useful for debt discovery but are not substitutes for the required gates.

## 5. Commands

Inspect the plan without running checks:

```bash
pnpm run validate:gate -- --profile validation/my-change.json --plan
```

Execute the profile-selected lane:

```bash
pnpm run validate:gate -- --profile validation/my-change.json
```

Force the lane from the command line when reviewing a suspicious profile:

```bash
pnpm run validate:critical -- --profile validation/my-change.json
```

Write machine-readable evidence:

```bash
pnpm run validate:gate -- --profile validation/my-change.json --report tmp/validation-result.json
```

Policy self-test:

```bash
pnpm run validate:gate:test
```

Exit codes:

| Code | Meaning |
|---:|---|
| 0 | required gates pass; may include explicitly classified inherited diagnostic debt |
| 1 | a required gate failed |
| 2 | invalid profile/matrix or a required check has no implementation |
| 3 | required gates pass, but a diagnostic failure is not yet classified |

## 6. Targeted check wiring

Example fragment for a server-side STANDARD mutation:

```json
{
  "risk": "STANDARD",
  "touches": {
    "authoritativeMutation": true,
    "tenantBoundary": false,
    "migration": false,
    "ui": false,
    "mobile": false
  },
  "checks": {
    "targeted_integration": { "command": "<targeted integration command>" },
    "permission": { "command": "<permission regression command>" },
    "failure_path": { "command": "<negative-path regression command>" },
    "idempotency_retry": { "command": "<retry/idempotency regression command>" }
  }
}
```

For CRITICAL finance/stock/payroll, also wire `tenant_isolation`, `correction_reversal`, and `reconciliation`; if a migration is touched, wire a targeted `migration_replay` command instead of relying on the broad SQL default when a narrower regression exists.

## 7. UI promotion

A UI change can remain FAST for development, but a promotion claim adds runtime evidence:

```json
{
  "risk": "FAST",
  "touches": { "ui": true, "mobile": true },
  "claims": ["UI_PROMOTION"]
}
```

The default browser commands reuse the current MetaForge Playwright projects:

- desktop: `desktop-chromium`;
- mobile: `mobile-pixel7` + `mobile-iphone13`.

If a surface is genuinely desktop-only, set `touches.mobile=false`. Do not use that flag to dodge mobile evidence for a responsive/PWA surface.

## 8. HARDENED / DEPLOYED claims

A profile claiming `HARDENED` or `DEPLOYED` must provide `production_release_marker` evidence:

```json
{
  "claims": ["DEPLOYED"],
  "checks": {
    "production_release_marker": {
      "path": "deploy-evidence/example.json"
    }
  }
}
```

The evidence JSON must contain:

- `releaseSha` exactly equal to the profile `headSha` (or explicit `releaseSha` override in the check);
- `deployedSha`, when present, equal to the same SHA;
- a non-empty `bundleHash` of at least 8 characters;
- a valid `completedAt` timestamp.

This intentionally rejects “merged”, “workflow green”, or “code exists” as production proof.

## 9. Inherited failures

Broad suites belong under `diagnostics`, not under required gate replacement. Example:

```json
{
  "diagnostics": [
    {
      "id": "full-suite",
      "command": "pnpm run verify",
      "inherited": {
        "baseSha": "<same exact baseSha as profile>",
        "tracking": "issue-or-handoff-reference",
        "reason": "Failure reproduced on untouched exact base and is outside this change."
      }
    }
  ]
}
```

Rules:

- inherited classification is accepted only when `inherited.baseSha === profile.baseSha`;
- `tracking` and `reason` are mandatory;
- an untriaged diagnostic failure returns exit code 3;
- inherited diagnostics never turn a failed required gate green;
- if the changed slice touches the failing invariant, it is not inherited debt anymore and must be fixed or blocked explicitly.

## 10. Scope boundary

This gate does not:

- trigger production deploys;
- run production migrations;
- mutate secrets/DNS/customer data;
- certify statutory/legal correctness from test count alone;
- replace domain review for finance, payroll, inventory, auth, tenant isolation or migration.

Its job is narrower and less glamorous: make it difficult to call a change validated while silently omitting the evidence its risk class actually requires.
