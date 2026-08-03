# WS02 — CRM / Revenue 360

Status: **REVIEW**  
Owner: **ChatGPT / WS02**  
Branch: `agent/ent-02-crm-revenue`  
PR: **#321**  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Claimed from exact main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `1de8b543d4b3c2df47e30e2b9c4c97d910c65eaf`  
Implementation head before handoff-only commits: `57b8e2238130acfdfec548828057ea90f3dd6d8b`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission / target architecture

Build Revenue 360 as a CloudCRM layer feeding the existing ERP/O2C path. CloudCRM entities are namespaced (`CRM Lead`, `CRM Deal`, `CRM Activity`, `CRM Pipeline`, `CRM Stage`) and deliberately do not redefine ERPNext `Customer`, `Sales Order`, `Sales Invoice` or `Payment Entry`.

Existing Sales Order -> Delivery -> Invoice -> Payment controllers remain authoritative and are reused rather than rewritten.

## Phase A audit

- Core O2C in `server/packages/clouderp-selling` is already substantial and has server-authoritative money/UOM/fulfillment/reversal logic.
- `C03-022 Subscription` already has a controller; recurring billing/renewal orchestration is not evidenced.
- Before this branch there was no first-party CloudCRM Lead/Deal lifecycle implementation outside specs/reference material.
- `server/apps-src/visits` is potential C04 field-visit evidence, not a Revenue 360 pipeline.
- Legacy PR #216 pricing matrix is **SUPERSEDED**: old/unmergeable, shared-UI owned, and current main already has a stronger Item Price matrix.

## CRM-01 capability uplift

| Capability | Maturity after CRM-01 | Evidence |
|---|---|---|
| `C01-001 Lead` | Wired foundation | `CRM Lead` metadata + controller + lifecycle/events |
| `C01-004 Opportunity/Deal` | Wired foundation | `CRM Deal`, party refs, amount/currency/close date/company boundary |
| `C01-005 Pipeline stage` | Wired | `CRM Pipeline` + pipeline-scoped `CRM Stage` + fixtures |
| `C01-006 Probability` | Wired | stage-derived server authority |
| `C01-007 Activity timeline` | Foundation | typed reference-safe activities/events; 360 projection pending |
| `C01-008 Call` | Wired foundation | CRM Activity type |
| `C01-009 Email activity` | Wired foundation | CRM Activity type |
| `C01-010 Meeting` | Wired foundation | CRM Activity type |
| `C01-011 Follow-up/task` | Wired foundation | CRM Activity type |
| `C01-013 Lead source` | Wired foundation | `CRM Lead Source` master + fixtures |
| `C01-016 Win/loss analysis` | Foundation | configured close reasons + canonical Won/Lost events |
| `C01-017 Sales forecast` | Foundation | exact weighted value; aggregation/UI pending |

## Data / state / invariant contract

### CRM Lead
- Lifecycle: `New -> Open -> Qualified | Unqualified -> Converted` with explicit manager/System Manager correction paths.
- Company immutable after creation.
- Server validates Company, Territory, User and active `CRM Lead Source` references.
- `Converted` requires an existing ERP `Customer` and an existing `CRM Deal` linked to this lead/company.
- Events: `crm.lead.created`, `crm.lead.updated`, `crm.lead.status_changed`, `crm.lead.converted`.

### CRM Deal
- Party: `CRM Lead | Customer`.
- `CRM Stage` must belong to selected `CRM Pipeline`.
- Stage owns `Open/Won/Lost` plus probability; Won/Lost force `100/0`.
- `weighted_value = amount × probability / 100` uses shared scaled-decimal helpers, not float arithmetic.
- Won/Lost requires an active `CRM Deal Close Reason` whose configured outcome matches.
- Terminal reopen requires Sales Manager/System Manager.
- Events: `crm.deal.created`, `crm.deal.updated`, `crm.deal.stage_changed`, `crm.deal.won`, `crm.deal.lost`.

### CRM Activity
- Types: `Call | Email | Meeting | Task`.
- References: `CRM Lead | CRM Deal | Customer`; CRM references are company-safe.
- Completion timestamp is server authoritative.
- Completed/cancelled activity is immutable until manager status-only reopen correction.
- Events: `crm.activity.created`, `crm.activity.updated`, `crm.activity.status_changed`, `crm.activity.completed`.

### App package
- `server/apps-src/crm`, version `0.2.0`.
- Owns `CRM Lead`, `CRM Deal`, `CRM Activity`, `CRM Pipeline`, `CRM Stage`, `CRM Lead Source`, `CRM Deal Close Reason`.
- Declares `Sales User` and `Sales Manager` in `roles.json` so DocPerm parsing/install does not depend on undeclared roles.
- Default pipeline/stages/sources/win-loss reasons are fixtures.
- Metadata-first generic list/form rendering; no CRM schema hard-coded into shared React runtime.
- No migration, ledger, stock, auth, shared app-registry contract or shared frontend-runtime change.

## Changed zones

- `server/packages/clouderp-selling/src/crm-types.ts`
- `server/packages/clouderp-selling/src/crm-controllers.ts`
- `server/packages/clouderp-selling/src/registry.ts`
- `server/packages/clouderp-selling/src/index.ts`
- `server/apps-src/crm/**`
- `server/tests/crm-revenue.test.mjs`
- `docs/agents/workstreams/WS02-crm-revenue.md`

## Exact-main drift

Final source-relevance check: `main` = `b63c9a7a07e63dd73f944f450618c0b92f10067c`.

WS02 is behind by 11 commits from its claim merge-base. All drift is confined to `CURRENT_STATUS.md`, `NEXT_TASKS.md` and WS14/client AppShell/PWA/mobile/child-grid/pull-to-refresh verification files. No WS02 server/app-source file overlaps. PR #321 remains structurally non-overlapping; unrelated WS14 changes were not copied into this branch merely to erase the behind count.

## Dependency requests

### Dependency request DR-WS02-01
- Target stream: **WS12**
- Need: include `server/apps-src/crm` in central first-party metadata/package verification (`verify-first-party-meta` / `app:check`).
- Why generic: release/SRE verification scripts are shared WS12 hotspots, not CRM domain ownership.
- Contract proposed: the release gate must parse CRM source and run the equivalent of `pack-app.mjs apps-src/crm --check` alongside other first-party apps.
- Blocking: **yes before claiming CRM fully release-gated; no for reviewing this domain slice**.
- Temporary workaround: `server/tests/crm-revenue.test.mjs` parses CRM app source through the canonical manifest parser.

### Dependency request DR-WS02-02
- Target stream: **WS00**
- Need: an atomic multi-document domain command/plan for Lead conversion that can create/link `CRM Contact`, `CRM Organization`, `CRM Deal` and ERP Customer mapping in one D1 transaction with idempotency/outbox evidence.
- Why generic: current `DocumentKernel` mutation plan commits one canonical document per command; multi-document atomicity is a kernel primitive, not CRM-local code.
- Contract proposed: one server-authoritative command returns a single success/failure boundary for all conversion writes, preserving source Lead/timeline and emitting conversion evidence only after the batch commits.
- Blocking: **yes for exact BRD C2 conversion parity and full `C01-002` closure; no for this lifecycle foundation**.
- Temporary workaround: conversion accepts only pre-existing Customer + CRM Deal and validates that the deal belongs to the same lead/company. It does not fake atomic record creation.

## Verification evidence

Committed `server/tests/crm-revenue.test.mjs` encodes:
- app-source parse, namespaced DocTypes, roles and ERP external dependencies;
- CRM Lead lifecycle, conversion binding, wrong-deal rejection, company immutability and correction policy;
- CRM Deal pipeline/stage consistency, server-derived probability, exact weighted value, cross-company rejection, configured win/loss reasons and terminal reopen;
- CRM Activity reference/company safety, server completion time, terminal immutability and manager correction.

Executable green status is **not claimed**. GitHub had no workflow run for the implementation head, and the available local runtime cannot resolve `github.com`, so clone/build/test execution was unavailable. Shared money/error/manifest/kernel signatures were checked directly against current `main` source.

## Remaining WS02 gaps

1. `C01-002` CRM Contact + Organization, relationship graph, PII/consent and reversible duplicate merge.
2. `C01-003/C01-012` Customer/Account 360 read model joining CRM + O2C + activities.
3. `C01-014/C01-015` duplicate detection/merge + lead scoring.
4. `C01-017..021` forecast aggregation, territory/team, target/quota and commission.
5. `C02` campaign/segment/list/automation/attribution/funnel/consent depth.
6. `C03-001..003` quotation/version/approval bridge from CRM Deal into existing O2C.
7. `C03-023` recurring billing/renewal orchestration around Subscription.
8. C04 distribution/dealer/field-sales integration beyond Visit Note foundation.

## Risk / merge discipline

Risk class: **STANDARD**. CRM business behavior/controllers + app metadata only; no financial/stock/legal/migration logic.

Per protocol: **branch + PR + review only. Do not merge or deploy PR #321 without explicit user approval.**

## Handoff

Workstream: WS02  
Branch: `agent/ent-02-crm-revenue`  
Owner: ChatGPT / WS02  
Implementation head: `57b8e2238130acfdfec548828057ea90f3dd6d8b`  
Status: REVIEW  
Capabilities: `C01-001`, `C01-004..011`, `C01-013`, `C01-016` wired/foundation; `C01-017` foundation  
Changed zones: selling CRM controllers/types/registry, `apps-src/crm`, targeted tests, this handoff  
Tests: targeted regression committed; executable run unavailable/no GitHub workflow  
Migration: none  
Dependency requests: `DR-WS02-01 -> WS12`, `DR-WS02-02 -> WS00`  
Known gaps: atomic Contact/Organization conversion, Customer 360, duplicate/scoring, forecast/team/targets/commission, marketing, quotation bridge, recurring renewal  
Recommended merge order: after review + executable verification; current unrelated WS14 main drift is non-blocking.
