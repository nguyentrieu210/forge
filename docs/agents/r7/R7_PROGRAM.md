# R7-A — Frappe 16 Platform Closure

Status: CLOSED — `FRAPPE_PLATFORM_CLOSED`  
Base Forge commit: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`  
Pinned upstream: Frappe `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`

## Mission

R7-A closes the behavioral contract between the pinned Frappe 16 framework baseline and Forge's platform layer before broad ERPNext closure or broad .NET reimplementation.

R7-A is not a source-code clone program. Architecture may differ. The acceptance target is observable platform behavior, safety invariants, explicit intentional differences and fail-closed evidence.

The authoritative chain is:

```text
Frappe 16 pinned source/runtime
        -> source-exact inventory
        -> runtime/oracle evidence
        -> R7 parity disposition
        -> Forge canonical authority
        -> language-neutral contract/fixture
        -> later .NET implementation
```

## Sources of truth

Read exact current branch/main first, then:

1. `SENTRUX_MAP.md`
2. `.sentrux/rules.toml`
3. `CURRENT_STATUS.md`
4. `NEXT_TASKS.md`
5. `PROJECT_CONTEXT.md`
6. `docs/ARCHITECTURE.md`
7. `skills/forge-enterprise-completion/SKILL.md`
8. `server/source-lock.json`
9. `server/docs/spec/source-exact/`
10. exact implementation/migrations/tests for the domain under audit.

Exact source, migrations and tests override stale prose.

## Scope and denominator

The denominator is the existing 28-domain framework ledger:
`server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.

R7 does not create a competing domain inventory. The R7 matrix must contain exactly the same 28 domain IDs, once each.

R7 classifications:

- `EXACT_PARITY`
- `SEMANTIC_PARITY`
- `FORGE_SUPERSET`
- `INTENTIONAL_DIFFERENCE`
- `GAP`
- `UNRESOLVED`
- `OUT_OF_SCOPE` only with a reviewed rationale.

No status means "same implementation". It means the declared observable contract has the stated disposition.

## Lanes

- R7-00 CONTROL — source lock, denominator, matrix, validation
- R7-01 METADATA — DocType/DocField/customization/schema semantics
- R7-02 DOCUMENT — lifecycle, naming, children, hooks, amendment
- R7-03 PERMISSION — role/owner/permlevel/user permission/share/query permissions
- R7-04 WORKFLOW — state/action/assignment/approval/notification
- R7-05 HISTORY — version/audit/timeline/comments/files
- R7-06 QUERY — list/search/link/report/dashboard/workspace
- R7-07 DATA — import/export/migration/install/upgrade/customization
- R7-08 ASYNC — events/jobs/scheduler/retry/outbox/realtime
- R7-09 API — Frappe-shaped REST/RPC/boot/client contract
- R7-10 CROSS-CUTTING — tenant/security/OCC/idempotency/failure/large-data
- R7-11 CERTIFICATION — independent closure check.

## Oracle rule

When static source is insufficient, use the pinned Frappe 16 runtime. Every oracle case must identify:

- Frappe SHA;
- fixture ID/version;
- initial state;
- actor/roles;
- operation;
- expected response/error;
- expected document state;
- expected side effects.

A source scan is not behavioral parity.

## Test dimensions

Where relevant, a capability is not closed without considering happy path, invalid input, permission denial, tenant boundary, duplicate retry, stale concurrency, partial state, cancel/correction, amend/revision, effective/backdated behavior, import/export, large-data and browser/API behavior.

## Authority rules

Do not create shadow platform authority merely to imitate Frappe.

Preserve Forge canonical authorities: Document Kernel, server-side permission, tenant boundary, OCC, actor-bound idempotency, immutable audit and outbox.

A stronger Forge behavior may be `FORGE_SUPERSET`; do not weaken it to obtain superficial parity.

## R6 boundary

R7 audit is read-only with respect to production. This branch does not deploy, migrate production data, mutate provider state or reuse old-SHA evidence as current evidence.

## Exit gate

R7-A may claim `FRAPPE_PLATFORM_CLOSED` only when:

- source lock equals the declared Frappe 16 SHA;
- the matrix contains all 28 denominator domains exactly once;
- `GAP = 0`;
- `UNRESOLVED = 0`;
- every `OUT_OF_SCOPE` has an explicit rationale;
- every closed disposition has evidence;
- no stale/foreign baseline is used.

The executable gate is `npm run r7:frappe:certify` from `server/`.

Certification evidence: implementation head `ce64f77f8c2a1991a6d88ced76592d44aecd23d5` passed R7 GitHub Actions run `36984495200`, including `r7:frappe:certify`, changed-authority TypeScript, runtime safety and Workerd facade regression. R7-A is therefore closed for the pinned Frappe v16.19.0 platform denominator. This remains source/runtime certification only and does not authorize production mutation.
