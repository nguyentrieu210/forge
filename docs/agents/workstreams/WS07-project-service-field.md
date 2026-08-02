# WS07 — Project / PSA / Helpdesk / Field Service

Status: **REVIEW — independent WS07 scope implemented; non-UI merge/deploy approval required**  
Owner: **GPT-5.6 Thinking / WS07**  
Branch: `agent/ent-07-project-service-field`  
PR checkpoint: **#309**  
Product baseline: **Forge 0.2.0**  
Clean implementation base: `main@31233237d9310e628174e06677eaef117242ee9a`  
Latest convergence audit against: `main@3b25b50fe5bd16a3f7c86c2b73b4f8e869aaa4ad`  
Pre-handoff implementation head: `751288c288a9a71b9dfff94c1d3a1c371fd2428a`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Hoàn thiện Project/PSA, Helpdesk/Customer Service và Field Service theo North Star, ưu tiên metadata-first, server-authoritative workflow, mutation invariant, correction/cancel evidence, operational report và không tạo source-of-truth tài chính/kho giả trong WS07.

## Convergence note

WS07 được rebuild sạch từ exact `main@31233237...`. Trong khi thực hiện, `main` tiến thêm 35 commit tới `3b25b50f...`. Audit compare cho thấy delta mới của `main` nằm ở WS14 client/runtime và WS00 kernel/tenant-worker/spec; không sửa các WS07-owned package, `server/package.json` hoặc `server/scripts/verify-first-party-meta.mjs`. Branch vì vậy đang behind nhưng không có shared-file overlap được phát hiện tại checkpoint này. Không force-sync bằng cách replay 90+ commits chỉ để tạo hình thức “behind 0”; merge phải hội tụ trên latest main và re-audit exact base trước release.

## Architecture / source of truth

- First-party metadata packages:
  - `server/apps-src/projects`
  - `server/apps-src/support`
  - expanded `server/apps-src/maintenance`
- Domain business validation + assignment mutation scope:
  - `server/apps-src/ws07-worker`
  - Worker name `cloudforge-app-ws07`
- Generic MetaForge runtime remains presentation layer; WS07 không thêm custom React screen.
- Installed DocTypes/workflows/reports remain authoritative through App Registry / Document Kernel; không thêm ad-hoc D1 table.
- App Worker only rejects invalid writes and performs policy lookups through signed platform callback. It does not post GL, mutate stock ledger, create invoices or own cross-domain financial truth.
- `Project Change Order.commercial_reference`, `Project Acceptance Certificate.commercial_reference` and `Service Part Usage.stock_reference` are evidence seams only, deliberately not financial/stock transactions.

## Implemented — Project / PSA

### Core planning

- `Project Portfolio` + child portfolio items.
- `Project Template` + structured template task rows.
- `Project` with company/customer/department/template, planning horizon, objective, resource assignments, lifecycle, Kanban/Gantt metadata.
- `Project Task` with WBS parent, milestone, assignee, schedule, dependency rows, progress, correction/hold/cancel evidence and Gantt/Kanban metadata.
- `Project Task Dependency` supports FS/SS/FF/SF + lag.
- `Project Resource Assignment` supports user/employee/role/allocation/date window.
- `Project Capacity Plan` + capacity lines for available/planned hours and target utilization.

### Time / control

- `Project Timesheet` + detail rows, user/employee/project provenance, approval workflow, return/cancel, manager approval with no self-approval.
- `Project User` Timesheet is owner-scoped and Worker additionally requires `timesheet.user == actor.user_id` for mutations.
- Task creation reserved to Project Manager; Project User mutations require `task.assignee == actor.user_id` in Worker.

### Change / acceptance

- `Project Change Order` with scope/schedule/resource impact, approval/reject/cancel workflow and print evidence.
- `Project Acceptance Certificate` with task/milestone, progress %, deliverables, acceptance result, evidence, customer representative, signed document, approval/reject/cancel workflow and print evidence.
- Project User change-order/acceptance writes are `if_owner`; manager owns final approval.

### Reports

- Project Task Control.
- Project Timesheet Control.
- Project Change Order Control.
- Project Acceptance Control.

## Implemented — Helpdesk / Customer Service

### Ticket / queue / assignment

- `Support Team` + members and roles Agent/Lead/Escalation.
- `Support Ticket` with customer, source channel, priority, team, assignee, SLA policy, due-time seams, escalation evidence, resolution and lifecycle.
- Workflow: New -> Assigned -> In progress / Waiting customer -> Resolved -> Manager close; return/manual escalation/cancel supported.
- Support User mutation is assignment-scoped by Worker; manager/system roles bypass assignment scope.
- Closing without resolution is blocked by metadata + Worker invariant.

### SLA contract

- `Support SLA Policy`.
- Priority rows with response/resolution/escalation minutes.
- Business-hour workday rows.
- Active period, customer applicability, default flag and pause-status contract.
- Worker validates target positivity, response <= resolution, duplicate priority/day, active date ordering and work-hour ordering.
- `response_due_at`, `resolution_due_at`, `sla_state` remain server-owned/read-only seams; no fake automatic clock claim.

### Knowledge / service quality

- `Support Knowledge Article` with publication/review governance.
- `Support Canned Response`.
- `Support Feedback` CSAT 1-5 + follow-up evidence.
- Ticket print evidence.
- Support Ticket Queue report.
- Support CSAT report.

### Explicit connector boundary

`source_channel` supports Manual / Email / Chat / Social / Portal as provenance values only. Only Manual intake is implemented by WS07 itself. No claim is made that email/chat/social/portal ingestion exists until connector/portal work lands.

## Implemented — Warranty / Maintenance / Field Service

### Intake / entitlement

Expanded `Maintenance Request` with:
- incident / warranty / preventive maintenance / inspection type;
- customer/priority/time/contact;
- Service Contract + Delivery Note provenance;
- Item + Serial No;
- warranty reference fallback;
- parts-planning note.

Added `Service Contract` + covered-item rows:
- Warranty / AMC / preventive contract type;
- customer/delivery provenance;
- validity dates;
- response/resolution targets;
- included visits / parts coverage;
- item/serial-specific coverage periods;
- approval/return/cancel workflow;
- final approval disallows self-approval.

### Warranty claim

`Warranty Claim` separates:
- intake complaint;
- entitlement result and reason;
- source request/contract/delivery/item/serial;
- Service Order execution link;
- resolution and customer confirmation;
- reject/cancel evidence.

Workflow separates entitlement verification from technician execution and manager confirmation. Worker blocks inconsistent state/result combinations and requires a Service Order before final confirmation states.

### Field execution

- `Service Technician` master linked to User.
- `Service Order` with source request/claim/contract, technician, schedule, item/serial, actual execution time, structured checklist, structured parts evidence, work performed, resolution, photo, customer confirmer/signature and cancellation evidence.
- Schedule exposed through calendar metadata; operations exposed through Kanban/mobile compact metadata.
- Workflow: New -> Scheduled -> In progress -> Pending confirmation -> Completed, with return/cancel paths and manager no-self final approval.
- Worker resolves Service Technician -> User and only allows the assigned Maintenance Technician to mutate the Service Order.
- Warranty Claim technician mutation follows the technician of the linked Service Order.

### Structured field evidence

- `Service Checklist Item`: item/result/note/photo.
- `Service Part Usage`: Item/qty/UOM/serial/stock reference/note.
- Part rows are structured evidence only; stock reservation/issue/return remains WS04-authoritative.
- Field service completion print loops checklist and parts evidence.
- Warranty resolution print.
- Service Contract print.
- Service Order Control report.
- Warranty Claim Control report.

## WS07 Worker hardening

Worker config: `server/apps-src/ws07-worker/wrangler.jsonc`  
Entrypoint: `src/entry.ts` -> mutation scope -> `src/index.ts` business invariants.

### Partial-save safety

For non-create writes the Worker reads the current authoritative document through the signed `/_app/` callback and shallow-merges the partial payload before validating. This mirrors the existing Alumdoor validator precedent and avoids validating a half-document.

### Business invariants currently enforced

Maintenance / service:
- warranty intake requires contract or warranty reference;
- contract dates and coverage dates ordered;
- response/resolution targets positive; response <= resolution;
- included visits non-negative;
- warranty workflow state consistent with entitlement result;
- final warranty states require linked Service Order;
- service scheduled/actual time ordering;
- pending/final service requires checklist + overall result + work performed + resolution;
- checklist rows require item/result;
- part rows require item + positive quantity + UOM.

Projects:
- project date ordering;
- resource allocation 0 < allocation <= 100 and date windows ordered;
- project-template unique task keys, valid parent keys, no self-parent, positive duration, bounded weight;
- portfolio duplicate-project refusal;
- task date order, progress 0-100, no self-parent/self-dependency;
- capacity dates, non-negative hours, utilization 0-100;
- timesheet period/detail time ordering and positive hours;
- acceptance progress 0-100, period ordering and signed-document requirement at confirmed state.

Support:
- SLA active date ordering;
- unique priorities, positive targets, response <= resolution;
- unique weekdays and valid business-hour windows;
- ticket assignment required after New;
- resolution required before Resolved/Closed;
- escalation requires reason + recipient.

### Mutation scope enforced by Worker

- Maintenance Technician -> assigned Service Order only.
- Maintenance Technician -> Warranty Claim only through linked Service Order assignment.
- Project User -> assigned Project Task only.
- Project User -> Timesheet only when `user == actor.user_id`; DocPerm also uses `if_owner`.
- Support User -> assigned Support Ticket only after assignment.
- Manager / System Manager / Administrator retains supervisory mutation scope.

## Capability maturity

No capability is labelled RC/HARDENED solely from authored code because exact checkout execution is unavailable in this connector session. `WIRED` means full metadata/workflow/validator/report path is present and focused executable tests are authored; execution evidence is still NOT RUN.

### J01 — Project / PSA

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| J01-001 | Portfolio | **WIRED** | Portfolio + rows + duplicate validator. |
| J01-002 | Project | **WIRED** | Lifecycle, resources, Gantt/Kanban, date validator. |
| J01-003 | Project Template | **FOUNDATION** | Template/WBS contract + validator exists; atomic/idempotent multi-Task apply action intentionally not implemented because current app-method seam does not provide one multi-document atomic/idempotency envelope. |
| J01-004..007 | WBS / dependency / Gantt / milestone | **WIRED** | Task hierarchy/dependency/schedule/milestone/workflow/report; deep cross-document cycle detection remains a hardening gap. |
| J01-008 | Resource | **WIRED** | Resource assignment + mutation invariants. |
| J01-009 | Capacity planning | **FOUNDATION/WIRED** | Capacity plan contract and bounds; automatic HR calendar/leave-derived availability not implemented. |
| J01-010 | Timesheet | **WIRED** | Detail rows, approval, ownership + actor mutation guard. |
| J01-011 | Expense by project | **DEPENDENCY** | Financial/expense authority outside WS07. |
| J01-012 | Procurement by project | **DEPENDENCY** | WS03 procurement contract. |
| J01-013 | Inventory by project | **DEPENDENCY** | WS04 inventory contract. |
| J01-014..020 | Budget/cost/billing/profitability/cash flow/EVM/retention | **DEPENDENCY** | WS01 finance/project-accounting authority; no duplicate money fields created. |
| J01-021 | Change Order | **WIRED** | Approval/correction/evidence/report; commercial impact remains reference-only. |
| J01-022 | Progress / Acceptance | **WIRED** | Signed acceptance workflow/evidence/report; invoice/retention linkage stays WS01. |
| J01-023 | Project reports | **FOUNDATION/WIRED** | Task/timesheet/change/acceptance operational reports; financial reports depend on WS01. |

### S01 — Helpdesk / Customer Service

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| S01-001..003 | Ticket / queue / assignment | **WIRED** | Ticket/team/workflow/report + assignment mutation scope. Assignment-based read filtering still dependency. |
| S01-004..005 | SLA / SLA calendar | **FOUNDATION/WIRED** | Governed policy/calendar + validators; no automatic deadline/pause/breach clock. |
| S01-006 | Escalation | **WIRED manual** | Auditable manual escalation path; automatic SLA-driven escalation depends on scheduler. |
| S01-007..008 | Email/chat/social-to-ticket | **DEPENDENCY** | Channel labels only; real connector ingestion absent. |
| S01-009 | Knowledge base | **FOUNDATION** | Governed article metadata/publication. |
| S01-010 | Canned response | **FOUNDATION** | Reusable governed templates. |
| S01-011 | Customer portal | **DEPENDENCY** | Portal/auth/external actor surface outside current WS07-only slice. |
| S01-012 | CSAT | **FOUNDATION/WIRED** | Feedback DocType + report; external customer collection depends on portal/communication surface. |
| S01-013 | Warranty Claim | **WIRED** | Entitlement/execution workflow, validator, report/print. Automatic warranty-from-delivery rule remains product/contract specific. |
| S01-014..015 | Service / Maintenance Contract | **WIRED** | Unified contract type Warranty/AMC/Preventive, coverage rows and approval. |

### S02 — Field Service

| IDs | Capability | Status | Evidence / gap |
|---|---|---|---|
| S02-001 | Service Order | **WIRED** | Workflow, invariant Worker, reports/print. |
| S02-002 | Technician | **WIRED** | Technician master -> User. |
| S02-003..004 | Schedule / dispatch | **WIRED** | Calendar schedule + assigned technician mutation guard. Capacity/route optimization absent. |
| S02-005..007 | GPS / route / offline mobile | **DEPENDENCY** | WS14 shared mobile/offline/GPS surface. |
| S02-008 | Spare parts | **FOUNDATION** | Structured usage evidence; authoritative reservation/issue/return depends WS04. |
| S02-009 | Checklist | **WIRED** | Structured rows + completion invariant. |
| S02-010 | Photo | **FOUNDATION/WIRED** | Attachment evidence at row/order level; field/mobile capture UX depends WS14. |
| S02-011 | Signature | **FOUNDATION/WIRED** | Customer signature attachment + confirmation data; dedicated signature UX depends WS14. |
| S02-012 | Service report | **WIRED** | Print evidence + operations report. |
| S02-013 | Service billing | **DEPENDENCY** | WS01 authority. |

## Dependency Requests

### DR-WS07-01 — assignment-based READ row scope
Target: **WS11 IAM / organization-security policy owner**.  
Need: an app-safe, server-authoritative row-policy primitive expressing actor equality to a Link/User field (e.g. `Service Order.technician -> Service Technician.user`, `Project Task.assignee`, `Support Ticket.assignee`) or governed app-owned Role Policy provisioning.  
Current mitigation: mutation scope is enforced in WS07 Worker; write/read restrictions using `if_owner` are applied where system owner semantics are correct.  
Blocking independent WS07 work: **no**. Blocking HARDENED assignment confidentiality: **yes**.

### DR-WS07-02 — SLA clock / background escalation
Target: **platform jobs/scheduler owner (WS00/WS12 coordination)**.  
Need: durable audited scheduled recomputation of response/resolution due times across business calendars, pause/resume, breach state and automatic escalation, with idempotency/outbox evidence.  
Current seam: SLA policy/calendar and read-only due/SLA fields are ready.  
Blocking independent Helpdesk metadata: **no**. Blocking SLA HARDENED: **yes**.

### DR-WS07-03 — project/service finance authority
Target: **WS01 Finance / VN Accounting**.  
Need: project expense/budget/cost/billing/profitability/cash flow/EVM/retention and field-service billing contract; authoritative invoice/GL linkage from approved Timesheet/Acceptance/Service Order.  
Current seam: approved Timesheet, Change Order commercial reference, Acceptance commercial reference, Service Order completion.  
Blocking independent planning/service execution: **no**.

### DR-WS07-04 — project procurement
Target: **WS03 Procurement**.  
Need: authoritative project/task dimension on PR/PO/receipt/invoice procurement lifecycle.  
Blocking current WS07 planning: **no**.

### DR-WS07-05 — project inventory / field spare parts
Target: **WS04 Inventory**.  
Need: project/task stock attribution plus service part reserve/issue/return transaction contract.  
Current seam: structured `Service Part Usage.stock_reference`.  
Blocking field evidence: **no**. Blocking inventory-integrated field service: **yes**.

### DR-WS07-06 — email/chat/social intake and customer communications
Target: **WS10 communications/integration + WS15 DMS/customer communication surfaces**.  
Need: authenticated inbound connector -> Support Ticket creation/dedupe/thread provenance, outbound reply threading, attachments/KB references.  
Current seam: `Support Ticket.source_channel`, KB and canned response metadata.  
Blocking manual Helpdesk: **no**.

### DR-WS07-07 — customer portal / external CSAT
Target: **portal/auth communication owners (WS10/WS11/WS15)**.  
Need: external customer actor access to own tickets/warranty/service status and secure feedback submission.  
Blocking internal Support flow: **no**.

### DR-WS07-08 — field mobile / GPS / route / offline
Target: **WS14 Frontend Runtime/Mobile**.  
Need: GPS capture, route/map UX, offline sync-safe Service Order execution, camera/signature capture and conflict policy.  
Current seam: mobile compact metadata, schedule, Attach evidence.  
Blocking desktop/generic runtime execution: **no**.

### DR-WS07-09 — calculated project capacity from HR availability
Target: **WS06 HR/workforce authority**.  
Need: work calendar/shift/leave-derived available hours and utilization projection.  
Current seam: Project Capacity Plan stores governed available/planned hours but does not fabricate HR availability.  
Blocking manual capacity planning: **no**.

## Legacy / precedent disposition

| Source | Disposition |
|---|---|
| PR #146 Alumdoor process 25.7 | **REUSE PATTERN / already merged** — vertical warranty/defect/capacity evidence; no cherry-pick and no copying Alumdoor-specific eligibility rules into generic WS07. |
| PR #141 Alumdoor operational prints | **REUSE PRINT PATTERN** — source-specific, no cherry-pick. |
| ERPNext v16 Project / SLA / Warranty / Maintenance upstream | **BENCHMARK only** — parity/source evidence, not Forge runtime maturity by itself. |
| Existing `apps-src/visits` | **KEEP independent** — lightweight Visit Note package; not treated as field-service execution. |

## Verification authored

Focused tests added:
- `server/tests/maintenance-field-service.test.mjs`
- `server/tests/projects-psa.test.mjs`
- `server/tests/support-helpdesk.test.mjs`
- `server/tests/ws07-validator.test.mjs`
- `server/tests/ws07-scope-validator.test.mjs`
- `server/tests/ws07-project-timesheet-scope.test.mjs`

Coverage includes:
- metadata/nav/report/role contracts;
- workflow correction/cancel/no-self-approval;
- financial/stock negative-space assertions;
- app `pack-app --check` calls;
- validator invalid/valid cases;
- partial-save merge with authoritative current document;
- technician/agent/assignee/timesheet actor mutation scope;
- manager bypass where supervisory authority is intended.

Global gates updated:
- `server/scripts/verify-first-party-meta.mjs` now includes maintenance/projects/support.
- `server/package.json app:check` now packs maintenance/projects/support.
- `check:ws07-worker` dry-run command.
- `deploy:ws07-worker` release command.

### Executed vs NOT RUN

Executed through GitHub connector:
- source/manifest/spec/permission/method-dispatch audit;
- exact branch/main compare and changed-path audit;
- legacy PR/source benchmark review.

NOT RUN in this connector session:
- repository-wide TypeScript build;
- Node unit test execution;
- `app:check` command execution;
- `check:ws07-worker` Wrangler dry-run;
- release manifest regeneration/verify;
- authenticated tenant lifecycle smoke;
- production install/upgrade/deploy.

Reason: this ChatGPT connector session has no exact working-tree checkout/dependency tree. Current project policy no longer treats GitHub Actions as development CI; lack of a local checkout is recorded as `NOT RUN`, not converted into a blocker or fake PASS.

## Migration / rollout / rollback

### Migration

- No custom D1 migration added.
- New domain data lives in first-party App Registry DocTypes/children/workflows/reports.
- Existing `maintenance` package upgrades from 1.0.0 to 1.4.0; upgrade/install must use authoritative app installer on target tenant.
- New `projects` package 1.3.0 and `support` package 1.2.0 must be installed explicitly where product composition requires them.

### Rollout order after merge approval

1. Run exact-checkout build + focused tests + `npm run app:check` + `npm run check:ws07-worker`.
2. Regenerate/verify release content manifest on exact merge candidate.
3. Deploy `cloudforge-app-ws07` Worker with `npm run deploy:ws07-worker`.
4. Upgrade/install first-party app manifests on staging tenant.
5. Authenticated smoke for Manager/User/Technician/Support Agent roles including direct API negative permission/invariant cases.
6. Only then promote target tenant(s) per release policy.

### Rollback

- No production mutation has occurred in this workstream session.
- If rollout validation fails before tenant data entry: roll back Worker version and app package version/install state.
- If tenant documents already exist, do **not** destructively uninstall/drop data; revert code/Worker and preserve documents pending a migration/compatibility plan.
- No secrets/DNS changes are required by WS07.

## Definition of Done verdict

**Independent WS07-owned implementation is complete to REVIEW/WIRED level, not HARDENED.** Remaining capability gaps are either explicitly cross-workstream authority, platform shared-contract requirements, or require exact-checkout execution evidence. There is no remaining safe independent WS07 feature slice identified that can close those gaps without duplicating finance/stock/IAM/mobile/platform ownership or inventing unsafe multi-document atomic behavior.

Next stopping boundary is therefore the project rule for **merge/deploy of non-UI changes**. PR #309 remains the merge checkpoint; do not deploy/merge to production solely from this handoff without explicit authorization.
