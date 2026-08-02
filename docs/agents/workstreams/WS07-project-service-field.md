# WS07 — Project / PSA / Helpdesk / Field Service

Status: **REVIEW — independent WS07 scope implemented; non-UI merge/deploy approval required**  
Owner: **GPT-5.6 Thinking / WS07**  
Branch: `agent/ent-07-project-service-field`  
Canonical PR: **#337**  
Historical checkpoints: `#309` closed after an earlier branch reset; `#340` was a failed technical reverse-sync attempt and is not canonical.  
Product baseline: **Forge 0.2.0**  
Clean rebuild base: `main@b9cbf3ac014fff337f38b09a4d06eba0670eeddb`  
Snapshot provenance: `snapshot/ws07-autonomous-20260803@7960529e6edb34cbaea979b8e80aaac1740e21af`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Why the branch was rebuilt

WS07 originally accumulated implementation while many workstreams were merging in parallel. The only real three-way conflict on PR #337 was `server/package.json`, where WS10 added Integration Hub to `app:check` while WS07 added its own package/worker gates. The file content was reconciled to preserve both, but Git ancestry still marked the PR conflicted.

To remove stale ancestry without replaying unrelated workstream history, the full WS07 head was snapshotted, the feature branch was force-reset to exact `main@b9cbf3ac...`, then the audited WS07 diff was replayed onto that base. The replayed `server/package.json` preserves WS10 `integration-hub` coverage and adds WS07 gates; no WS10 behavior is removed.

## Mission

Deliver Project/PSA, Helpdesk/Customer Service, Warranty/Maintenance and Field Service foundations using Forge metadata-first/runtime contracts, server-authoritative workflow, explicit correction/cancel evidence and strict domain boundaries. WS07 must not create duplicate accounting, stock, IAM or mobile sources of truth merely to make a capability matrix look greener.

## Architecture / source of truth

First-party metadata packages:

- `server/apps-src/projects`
- `server/apps-src/support`
- expanded `server/apps-src/maintenance`

Business-rule and assignment-mutation enforcement:

- `server/apps-src/ws07-worker`
- Worker: `cloudforge-app-ws07`
- endpoint: `/hooks/validate`

The generic MetaForge runtime remains presentation infrastructure. WS07 adds no custom React business screen. Installed DocTypes, workflows, reports and permissions remain authoritative through App Registry / Document Kernel. No WS07-specific D1 table or custom ledger is introduced.

Cross-domain references are deliberately evidence-only where another workstream owns truth:

- `Project Change Order.commercial_reference`
- `Project Acceptance Certificate.commercial_reference`
- `Service Part Usage.stock_reference`

These fields do not create GL, invoice or stock transactions.

## Implemented — Project / PSA

### Planning and portfolio

- `Project Portfolio` + child portfolio items.
- `Project Template` + structured template-task rows.
- `Project` with company/customer/department/template, planning horizon, objective, resource assignments, lifecycle, Kanban and Gantt metadata.
- `Project Task` with WBS parent, milestone, assignee, schedule, dependencies, progress, correction/hold/cancel evidence and Gantt/Kanban metadata.
- `Project Task Dependency` supporting Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish and lag.
- `Project Resource Assignment` with User/Employee, project role, allocation and date window.
- `Project Capacity Plan` + capacity rows for available/planned hours and utilization target.

### Time and execution control

- `Project Timesheet` + detail rows, user/employee/project provenance, approval, return and cancel workflow.
- Project User Timesheet permission uses `if_owner`; WS07 Worker also requires `timesheet.user == actor.user_id` for mutation.
- Project Task creation is manager-owned; Project User mutation requires `task.assignee == actor.user_id`.
- Manager final approvals disable self-approval where appropriate.

### Change and acceptance

- `Project Change Order` with scope/schedule/resource impact, approval/reject/cancel workflow and print evidence.
- `Project Acceptance Certificate` with task/milestone, progress %, deliverables, result, evidence, customer representative, signed document and approval/reject/cancel workflow.
- Project User change-order and acceptance edits are owner-scoped; manager owns final approval.

### Project reports

- Project Task Control.
- Project Timesheet Control.
- Project Change Order Control.
- Project Acceptance Control.

### Intentional project boundaries

No shadow fields or writers were introduced for budget, actual cost, revenue, profit, billing amount, cash flow, retention, GL or invoice state. Those remain cross-workstream authority.

`Project Template` is deliberately **Foundation**, not claimed as full template application: the current app-method seam can perform writes but does not expose one atomic/idempotent multi-document transaction envelope for safely creating an entire WBS in one operation. WS07 does not implement a network-sensitive loop of Task creates and pretend it is transactional.

## Implemented — Helpdesk / Customer Service

### Ticket / queue / assignment

- `Support Team` + team-member rows with Agent/Lead/Escalation roles.
- `Support Ticket` with customer, source-channel provenance, priority, team, assignee, SLA policy seams, escalation evidence, resolution and lifecycle.
- Workflow: New -> Assigned -> In progress / Waiting customer -> Resolved -> Manager close, plus return/manual escalation/cancel paths.
- Support User mutation is assignment-scoped by WS07 Worker; manager/system roles retain supervisory scope.
- Closing/resolved states without resolution are rejected.

### SLA contract

- `Support SLA Policy`.
- priority rows with response/resolution/escalation minutes.
- business-hour workday rows.
- active-period/default/customer applicability/pause-status metadata.
- Worker validates positive targets, response <= resolution, unique priorities/days, active-date ordering and work-hour ordering.
- `response_due_at`, `resolution_due_at` and `sla_state` remain server-owned/read-only seams.

No automatic SLA deadline engine is claimed yet. The background business-calendar clock, pause/resume, breach recomputation and automatic escalation require a durable scheduler/outbox integration outside this independent WS07 slice.

### Knowledge and service quality

- `Support Knowledge Article` with publication/review governance.
- `Support Canned Response`.
- `Support Feedback` with CSAT 1-5 and follow-up evidence.
- Support Ticket print evidence.
- Support Ticket Queue report.
- Support CSAT report.

### Connector boundary

`Support Ticket.source_channel` accepts Manual / Email / Chat / Social / Portal as provenance values. Only manual creation is implemented by WS07 itself. Email/chat/social/portal ingestion is not claimed until connector/portal work lands.

## Implemented — Warranty / Maintenance / Field Service

### Intake and entitlement

Expanded `Maintenance Request` with:

- incident / warranty / preventive maintenance / inspection type;
- customer, priority, reported/preferred visit time and contact;
- Service Contract and Delivery Note provenance;
- Item and Serial No;
- warranty reference fallback;
- parts-planning note.

Added `Service Contract` + covered-item rows:

- Warranty / AMC / preventive-maintenance type;
- customer/delivery provenance;
- validity dates;
- response/resolution targets;
- included visits and parts coverage;
- item/serial-specific coverage windows;
- approval/return/cancel workflow;
- manager final approval with no self-approval.

### Warranty claim

`Warranty Claim` separates intake, entitlement verification and field execution:

- source request/contract/delivery/item/serial;
- eligibility result + reason;
- linked Service Order;
- resolution/customer confirmation;
- reject/cancel evidence.

Workflow separates entitlement verification from technician execution and manager confirmation. Worker blocks inconsistent workflow-state/eligibility combinations and requires linked Service Order before final confirmation states.

### Field execution

- `Service Technician` master linked to User.
- `Service Order` with source request/claim/contract, technician, schedule, item/serial, execution time, checklist, parts evidence, work performed, resolution, photo, customer confirmation/signature and cancel evidence.
- calendar, Kanban and mobile-compact metadata.
- workflow New -> Scheduled -> In progress -> Pending confirmation -> Completed, with return/cancel paths and manager no-self final approval.
- Worker resolves Service Technician -> User and only allows the assigned technician to mutate that Service Order.
- Warranty Claim technician mutation follows the technician on its linked Service Order.

Structured field evidence:

- `Service Checklist Item`: item/result/note/photo.
- `Service Part Usage`: Item/qty/UOM/serial/stock reference/note.
- part rows are structured evidence only; stock reserve/issue/return remains WS04-authoritative.
- Field service completion print loops checklist and part rows.
- Warranty print, Service Contract print, Service Order Control and Warranty Claim Control reports.

## WS07 Worker hardening

Config: `server/apps-src/ws07-worker/wrangler.jsonc`  
Entrypoint: `src/entry.ts` -> actor/assignment scope -> `src/index.ts` business invariants.

### Partial-save safety

For non-create writes the Worker reads the current authoritative document through the signed platform callback and shallow-merges the partial payload before validation. This follows the existing Alumdoor validator pattern and prevents validating an incomplete patch as though it were the full document.

### Business invariants enforced

Maintenance / service:

- warranty intake requires Service Contract or warranty reference;
- contract and item coverage dates ordered;
- response/resolution targets positive and response <= resolution;
- visits included non-negative;
- warranty workflow state consistent with eligibility result;
- final warranty states require linked Service Order;
- service scheduled/actual time ordering;
- pending/final service requires checklist, overall result, work performed and resolution;
- checklist rows require item/result;
- part rows require Item, positive quantity and UOM.

Projects:

- project date ordering;
- resource allocation `0 < allocation <= 100` and ordered date windows;
- template unique task keys, valid parent keys, no self-parent, positive duration and bounded weight;
- portfolio duplicate-project refusal;
- task date ordering, progress 0-100, no self-parent/self-dependency;
- capacity dates, non-negative hours and utilization 0-100;
- timesheet period/detail ordering and positive hours;
- acceptance progress 0-100, period ordering and signed-document requirement at confirmed state.

Support:

- SLA active-date ordering;
- unique priority targets and weekdays;
- positive SLA target values, response <= resolution;
- valid business-hour windows;
- assignment required once Ticket leaves New;
- resolution required before Resolved/Closed;
- escalation requires reason + recipient.

### Mutation scope enforced by Worker

- Maintenance Technician -> assigned Service Order only.
- Maintenance Technician -> Warranty Claim only through linked Service Order assignment.
- Project User -> assigned Project Task only.
- Project User -> Timesheet only when `user == actor.user_id`; DocPerm also uses `if_owner`.
- Support User -> assigned Support Ticket only once assignment exists.
- Manager / System Manager / Administrator retains supervisory mutation scope.

## Capability maturity

`WIRED` means the metadata/workflow/validator/report path is present and focused executable tests are authored. It does **not** mean RC/HARDENED until exact-checkout execution evidence exists.

### J01 — Project / PSA

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| J01-001 | Portfolio | **WIRED** | Portfolio + child rows + duplicate validator. |
| J01-002 | Project | **WIRED** | Lifecycle/resources/Gantt/Kanban/date validation. |
| J01-003 | Project Template | **FOUNDATION** | Template/WBS contract + validator; atomic/idempotent multi-Task application intentionally not fabricated. |
| J01-004..007 | WBS / dependency / Gantt / milestone | **WIRED** | Task hierarchy/dependency/schedule/milestone/workflow/report; deep cross-document cycle detection remains a hardening gap. |
| J01-008 | Resource | **WIRED** | Resource assignment + bounds. |
| J01-009 | Capacity planning | **FOUNDATION/WIRED** | Capacity plan + bounds; automatic HR calendar/leave-derived availability not implemented. |
| J01-010 | Timesheet | **WIRED** | Detail, approval, ownership and actor mutation guard. |
| J01-011 | Expense by Project | **DEPENDENCY** | Financial authority outside WS07. |
| J01-012 | Procurement by Project | **DEPENDENCY** | WS03 procurement contract. |
| J01-013 | Inventory by Project | **DEPENDENCY** | WS04 inventory contract. |
| J01-014..020 | Budget/cost/billing/profitability/cash flow/EVM/retention | **DEPENDENCY** | WS01 finance/project-accounting authority; no duplicate money source created. |
| J01-021 | Change Order | **WIRED** | Approval/correction/evidence/report; commercial impact reference-only. |
| J01-022 | Progress / Acceptance | **WIRED** | Signed acceptance workflow/evidence/report; invoice/retention linkage stays WS01. |
| J01-023 | Project reports | **FOUNDATION/WIRED** | Operational reports implemented; financial reports depend on WS01. |

### S01 — Helpdesk / Customer Service

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| S01-001..003 | Ticket / queue / assignment | **WIRED** | Ticket/team/workflow/report + assignment mutation scope. Assignment-based read filtering remains dependency. |
| S01-004..005 | SLA / SLA calendar | **FOUNDATION/WIRED** | Governed policy/calendar + validators; automatic deadline/pause/breach clock absent. |
| S01-006 | Escalation | **WIRED manual** | Auditable manual escalation; automatic SLA-driven escalation depends scheduler. |
| S01-007..008 | Email/chat/social-to-ticket | **DEPENDENCY** | Channel labels only; connector ingestion absent. |
| S01-009 | Knowledge base | **FOUNDATION** | Governed article metadata/publication. |
| S01-010 | Canned response | **FOUNDATION** | Governed reusable templates. |
| S01-011 | Customer portal | **DEPENDENCY** | External actor/portal surface outside independent WS07 slice. |
| S01-012 | CSAT | **FOUNDATION/WIRED** | Feedback DocType + report; external collection depends portal/communications. |
| S01-013 | Warranty Claim | **WIRED** | Entitlement/execution workflow, validator, report and print. |
| S01-014..015 | Service / Maintenance Contract | **WIRED** | Unified Warranty/AMC/Preventive contract + coverage + approval. |

### S02 — Field Service

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| S02-001 | Service Order | **WIRED** | Workflow, invariant Worker, report/print. |
| S02-002 | Technician | **WIRED** | Technician master -> User. |
| S02-003..004 | Schedule / dispatch | **WIRED** | Calendar schedule + assignment mutation guard. Capacity/route optimization absent. |
| S02-005..007 | GPS / route / offline mobile | **DEPENDENCY** | WS14 shared mobile/offline/GPS surface. |
| S02-008 | Spare parts | **FOUNDATION** | Structured usage evidence; authoritative stock transaction depends WS04. |
| S02-009 | Checklist | **WIRED** | Structured rows + completion invariant. |
| S02-010 | Photo | **FOUNDATION/WIRED** | Attachment evidence; field capture UX depends WS14. |
| S02-011 | Signature | **FOUNDATION/WIRED** | Signature attachment + customer confirmer; dedicated UX depends WS14. |
| S02-012 | Service report | **WIRED** | Print evidence + operations report. |
| S02-013 | Service billing | **DEPENDENCY** | WS01 authority. |

## Dependency Requests

### DR-WS07-01 — assignment-based READ row scope

Target: **WS11 IAM / organization-security policy owner**.  
Need: server-authoritative row policy expressing actor equality to a Link/User field, including `Project Task.assignee`, `Support Ticket.assignee` and `Service Order.technician -> Service Technician.user`, or a governed app-safe Role Policy provisioning contract.  
Current mitigation: mutation scope enforced in WS07 Worker; `if_owner` used only where system-owner semantics are correct.  
Blocks independent WS07 work: **no**. Blocks HARDENED assignment confidentiality: **yes**.

### DR-WS07-02 — SLA clock / background escalation

Target: **platform jobs/scheduler owner, WS00/WS12 coordination**.  
Need durable audited recomputation of response/resolution deadlines across business calendars, pause/resume, breach state and automatic escalation with idempotency/outbox evidence.  
Current seam: SLA policy/calendar + server-owned due/SLA fields.  
Blocks manual Helpdesk: **no**. Blocks SLA HARDENED: **yes**.

### DR-WS07-03 — project/service finance authority

Target: **WS01 Finance / VN Accounting**.  
Need project expense/budget/cost/billing/profitability/cash-flow/EVM/retention and field-service billing contracts, plus authoritative invoice/GL linkage from approved Timesheet/Acceptance/Service Order.  
Current seam: approved Timesheet, Change Order commercial reference, Acceptance commercial reference, completed Service Order.

### DR-WS07-04 — project procurement

Target: **WS03 Procurement**.  
Need project/task dimension on PR/PO/receipt/invoice procurement lifecycle.

### DR-WS07-05 — project inventory / field spare parts

Target: **WS04 Inventory**.  
Need project/task stock attribution plus Service Part reserve/issue/return transaction contract.  
Current seam: structured `Service Part Usage.stock_reference` evidence.

### DR-WS07-06 — email/chat/social intake and customer communications

Target: **WS10 communications/integration + WS15 DMS/customer communication surfaces**.  
Need authenticated inbound connector -> Support Ticket creation/dedupe/thread provenance and outbound reply threading/attachments/KB reference.

### DR-WS07-07 — customer portal / external CSAT

Target: **WS10/WS11/WS15 portal/auth/communication owners**.  
Need external customer actor access to own tickets/warranty/service status and secure feedback submission.

### DR-WS07-08 — field mobile / GPS / route / offline

Target: **WS14 Frontend Runtime/Mobile**.  
Need GPS capture, route/map UX, offline sync-safe Service Order execution, camera/signature capture and conflict policy.  
Current seam: mobile compact metadata, schedule and attachment evidence.

### DR-WS07-09 — calculated project capacity from HR availability

Target: **WS06 HR/workforce authority**.  
Need work-calendar/shift/leave-derived available hours and utilization projection.  
Current seam: Project Capacity Plan stores governed available/planned hours but does not fabricate HR availability.

## Legacy / precedent disposition

| Source | Disposition |
|---|---|
| PR #146 Alumdoor process 25.7 | **REUSE PATTERN / already merged** — vertical warranty/defect/capacity evidence only; no cherry-pick or blind genericization. |
| PR #141 Alumdoor operational prints | **REUSE PRINT PATTERN** — vertical-specific; no cherry-pick. |
| ERPNext v16 Project/SLA/Warranty/Maintenance upstream | **BENCHMARK only** — source evidence, not Forge runtime maturity. |
| Existing `apps-src/visits` | **KEEP independent** — lightweight Visit Note package, not treated as field-service execution. |

## Verification authored

Focused tests:

- `server/tests/maintenance-field-service.test.mjs`
- `server/tests/projects-psa.test.mjs`
- `server/tests/support-helpdesk.test.mjs`
- `server/tests/ws07-validator.test.mjs`
- `server/tests/ws07-scope-validator.test.mjs`
- `server/tests/ws07-project-timesheet-scope.test.mjs`

Coverage includes metadata/nav/report/role contracts, workflow correction/cancel/no-self-approval, finance/stock negative-space assertions, app `pack-app --check`, validator valid/invalid cases, partial-save authoritative merge, technician/agent/task/timesheet actor mutation scope and manager bypass.

Global gates:

- `server/scripts/verify-first-party-meta.mjs` includes maintenance/projects/support.
- `server/package.json app:check` packs maintenance/projects/support and preserves the existing WS10 `integration-hub` check.
- `check:ws07-worker` provides Wrangler dry-run command.
- `deploy:ws07-worker` provides explicit release command.

## Executed vs NOT RUN

Executed through GitHub connector:

- repo Skill/North Star/spec/permission/method-dispatch audit;
- current/legacy source review;
- PR/branch changed-path and conflict audit;
- clean rebuild from latest known main after preserving snapshot;
- shared-file reconciliation preserving Integration Hub gate.

**NOT RUN** in this connector-only session:

- repository TypeScript build;
- Node test execution;
- `npm run app:check` execution;
- `npm run check:ws07-worker` Wrangler dry-run;
- release manifest regeneration/verify;
- authenticated tenant lifecycle smoke;
- production app install/upgrade/deploy.

Reason: this ChatGPT connector session has no exact working-tree checkout/dependency tree. Project policy no longer treats GitHub Actions as development CI. Missing executable checkout evidence is recorded as `NOT RUN`, not converted to fake PASS and not used as a reason to abandon independent implementation.

## Migration / rollout / rollback

### Migration

- No custom D1 migration added.
- New data uses first-party App Registry DocTypes/children/workflows/reports.
- `maintenance` upgrades from 1.0.0 to 1.4.0.
- new `projects` 1.3.0 and `support` 1.2.0 require explicit app install where product composition enables them.

### Rollout order after non-UI merge/deploy authorization

1. On exact checkout: build + focused tests + `npm run app:check` + `npm run check:ws07-worker`.
2. Regenerate/verify release content manifest on exact merge candidate.
3. Deploy `cloudforge-app-ws07` Worker using `npm run deploy:ws07-worker`.
4. Upgrade/install the three first-party app manifests on staging tenant.
5. Run authenticated Manager/User/Technician/Support Agent lifecycle smoke, including direct-API negative permission/invariant cases.
6. Promote target tenant(s) only under current release policy.

### Rollback

- No production mutation occurred during WS07 implementation.
- Before tenant data entry: roll back Worker version and app package/install version.
- After tenant documents exist: do not destructively uninstall/drop data; revert code/Worker and preserve documents pending compatibility/migration plan.
- No secrets or DNS changes are required by WS07.

## Definition of Done verdict

**Independent WS07-owned implementation is complete to REVIEW/WIRED level, not HARDENED.** Remaining capability gaps require another workstream's authoritative contract, shared platform/IAM/mobile/scheduler support, or exact-checkout execution evidence. No remaining safe independent WS07 slice has been identified that would close those gaps without duplicating finance/stock/IAM/mobile/platform ownership or inventing unsafe multi-document transactional behavior.

The next project-rule boundary is therefore **merge/deploy of non-UI changes**. Canonical checkpoint is PR #337. Do not merge/deploy production from this handoff without explicit authorization.
