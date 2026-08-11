# UI-REC-05 — QA / COVERAGE GATES

Branch: `agent/ui-rec-05-qa-gates-20260811`
Fork point: `program/backend-ui-reconciliation-20260811@c4209b8318ac36110ca84094d905ce724ffae3d5`
Status: BOOTSTRAPPED
Risk: tests/CI by default; shared workflow/runtime changes require normal review.

## Mission

Turn the current class of backend↔metadata↔UI drift into permanent automated failures and certify one exact convergence candidate across static contracts and representative browser flows.

## Read first

1. exact branch/main state;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`;
4. `docs/agents/backend-ui-reconciliation/PROGRAM.md`;
5. `BACKEND_UI_SURFACE_MATRIX_CONTRACT.md`;
6. UI-REC-01/02/03/04 outputs as they become available;
7. Grid parity program and exact candidate head for child-grid/browser certification;
8. current MetaForm/Grid/AlumDoor browser QA and CI workflows as reusable evidence lanes.

## Required static gates

Build or extend narrowly-scoped checks for:

```text
schema field/type/link/child target parity
metadata target existence
preview output -> declared metadata projection
required-field reachability where statically provable
internal/server field leakage
manifest/nav target existence
dead action/method references
role/permission declaration mismatch candidates
generated-source/output consistency
forbidden business literals in generic renderer where applicable
```

Do not create false rules such as `every backend field must be visible` or `every DocType must have a menu entry`.

## Required representative flows

At convergence, browser/smoke evidence should include at least:

### Sales

```text
open customer/item masters
create Quotation or Sales Order
select representative door/item
Sales Option path available when configured
server preview updates commercial outputs
save/submit path remains authoritative
```

### Procurement / Stock

```text
create PO
child-grid operator workflow via Grid candidate
receipt path
current dimensional/count/catch-weight fields behave according to metadata/backend
```

### Attendance / Payroll

```text
attendance operational screen opens by role
correction request/review path visible
payroll period/slip actions visible according to role/state
```

### Master data / navigation

```text
intended AlumDoor catalog entries reachable
missing/dead target regression blocked
role-restricted entries hidden where appropriate
```

## Viewports

Use desktop as mandatory for all primary flows. Add tablet/mobile proof where the surface is expected to operate there, especially shared forms/grids and attendance/mobile experiences.

## Exact-candidate rule

Certification is bound to one immutable convergence SHA. Any source-changing fix after certification invalidates affected evidence and requires rerun.

## Ownership rule

QA must not solve runtime/business failures by hiding tests or adding substitute logic. Issue a Dependency Request to UI-REC-01/02/03/04, GRID owner or domain owner and keep independent QA work moving.

## Acceptance

- all planned drift classes have either an automated gate or an explicit reason they require runtime/manual evidence;
- representative actor/browser flows pass on exact candidate;
- Grid parity evidence is consumed, not duplicated;
- build/typecheck/targeted tests/diff hygiene are recorded;
- no unsupported production-ready claim;
- no deploy/install/tenant mutation;
- branch stops before non-trivial merge unless explicitly authorized.

## Startup prompt

`Đọc docs/agents/backend-ui-reconciliation/UI-REC-05-QA.md, PROGRAM.md, Surface Matrix contract và Forge Enterprise Completion Skill. Bootstrap permanent schema/meta/nav/form/action drift gates, reuse current MetaForm/Grid browser lanes, and prepare exact-candidate Sales/Procurement/Attendance-Payroll/master-data evidence. Không che test fail bằng logic QA. Route Dependency Request đúng owner. Không merge/deploy.`
