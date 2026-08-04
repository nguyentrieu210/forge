# RC4-A14 — Project / Service / Field

Status: REVIEW — source-complete; executable checkout gate unavailable in connector-only session
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-14-project-service-field
Risk: STANDARD

## Mission

Close project/PSA/helpdesk/field-service/warranty residuals that are owned by WS07 without duplicating Finance, Inventory, CRM, IAM, shared scheduler/notification or shared mobile authority.

## Exact-state audit

- WS07 source authority was already merged to `main` through PR #352; historical `agent/ent-07-project-service-field` is not a candidate branch.
- Transaction Closure subsequently hardened warranty/service in `server/apps-src/ws07-worker/src/entry.ts` with Delivery Note / Serial No / Stock Entry / Sales Invoice provenance, correction lineage and canonical cross-domain checks.
- A14 therefore leaves `entry.ts` untouched and hardens only the base WS07 validator plus app-owned metadata/reports/tests.
- Current capability truth remains evidence-based; this branch does not promote RC/Hardened merely because source exists.

## Implemented on A14

### Project / PSA

- Project lifecycle now server-validates hold/completion/cancel evidence.
- Project Template requires at least one task and rejects multi-node parent cycles in addition to missing/self parents.
- Project Task validates dependency presence/type/uniqueness and requires 100% progress + completion evidence before pending/final completion.
- Project Timesheet requires non-empty detail rows, task/activity provenance, positive ordered time rows, duplicate-row protection and return/cancel evidence.
- Project Change Order is now registered with the WS07 pre-commit validator; reject/cancel evidence and numeric schedule impact are validated.
- Project Acceptance validates conditional/non-acceptance notes plus reject/cancel evidence while preserving signed-document confirmation.
- Operational reports expose timesheet user and commercial-reference evidence without introducing budget/revenue/GL authority.
- Package version: `projects@1.3.1`.

### Helpdesk / SLA / CSAT

- SLA policy requires non-empty priority and workday tables.
- Priority targets remain positive, keep `response <= resolution`, and require escalation not to occur after the resolution deadline. Early escalation remains valid because the current `Leo thang sau (phút)` contract does not prove it must wait until the response deadline.
- Duplicate priority/weekday controls remain; at most one SLA priority may be marked default.
- Support Ticket cancellation now requires server-side reason evidence in addition to assignment/resolution/escalation controls.
- Support Feedback/CSAT is now pre-commit validated: integer rating 1..5 and mandatory follow-up note when follow-up is requested.
- Support Ticket Queue now exposes customer, source channel, response deadline and resolution deadline fields already owned by the ticket model.
- Package version: `support@1.2.1`.

### Warranty / Field Service

- Service Contract requires non-empty unique coverage rows with item/type, ordered coverage dates and coverage bounded by contract validity; cancellation requires reason.
- Warranty Claim finalization requires resolution timestamp/result and customer confirmation; reject/cancel evidence is enforced.
- Service Order pending/final completion requires actual start/end in addition to structured checklist/work evidence; final completion requires customer confirmation; cancellation requires reason.
- Existing Transaction Closure stock/sales/warranty authority in `entry.ts` is preserved unchanged.
- Operational reports now expose resolution type, actual completion, correction lineage, linked service order and warranty resolution timestamp.
- Package version: `maintenance@1.5.1`.

## Regression evidence authored

- Updated `server/tests/projects-psa.test.mjs` for `projects@1.3.1`, Change Order validation and report evidence.
- Updated `server/tests/support-helpdesk.test.mjs` for `support@1.2.1`, CSAT validator and SLA deadline queue evidence.
- Updated `server/tests/maintenance-field-service.test.mjs` for `maintenance@1.5.1` and closure/correction report evidence.
- Added `server/tests/rc4-a14-project-service-field.test.mjs` covering service contract coverage, warranty/service terminal evidence, WBS cycles, task dependencies/completion, timesheet integrity, Change Order/Acceptance exceptions, SLA target bounds including valid early escalation, and CSAT/cancel failure paths.
- Existing Transaction Closure warranty/service tests were audited for compatibility; A14 does not replace their canonical stock/sales/provenance coverage.

Executable Node/package tests are **NOT RUN** in this session because the available environment has GitHub connector access but no repository checkout/network path to GitHub. Do not report PASS from authored tests alone. GitHub PR workflows observed for the A14 head were skipped rather than executed. No production deploy or migration was attempted.

## Dependency Requests

### DR-A14-01 — durable SLA clock / automatic escalation

Owner: A2 SRE/provider + A9 architecture/kernel coordination.

Need: durable audited calculation/recalculation of response/resolution deadlines across business calendars, pause/resume, breach transitions and idempotent automatic escalation/outbox delivery. Current A14 only validates SLA policy and exposes server-owned due fields; it does not fabricate a scheduler.

Blocks manual Helpdesk: no. Blocks S01-004/005 automatic SLA RC/Hardened: yes.

### DR-A14-02 — project finance / expense / billing / profitability

Owner: A4 Finance/VN statutory, with project references consumed from A14.

Need: authoritative project expense, budget, actual cost, billing/revenue, profitability/cash-flow/EVM/retention linkage using canonical Finance documents/ledger. A14 deliberately adds no money ledger or shadow totals.

Blocks operational Project/PSA: no. Blocks J01-011 and J01-014..020 closure: yes.

### DR-A14-03 — assignment-based READ row policy

Owner: A1 IAM/privacy + A9 kernel policy contract.

Need: server-authoritative row read policy for `Project Task.assignee`, `Support Ticket.assignee` and `Service Order.technician -> Service Technician.user`. A14 preserves existing mutation guards; UI filtering is not treated as confidentiality.

Blocks mutation safety: no. Blocks assignment confidentiality hardening: yes.

### DR-A14-04 — channel-to-ticket ingestion

Owner: A8 integration/provider + A10 CRM/revenue where customer-channel authority intersects.

Need: idempotent Email/Chat/Social/Portal intake with provenance, retry/dedup and actor/customer mapping. Current source-channel values remain provenance labels only.

Blocks manual Helpdesk: no. Blocks S01-007/008 and external collection depth: yes.

### DR-A14-05 — field mobile GPS / route / offline

Owner: A6 UI/mobile/offline.

Need: shared tenant/session/OCC-safe offline queue/conflict handling plus device geolocation/route evidence. A14 keeps service-order metadata mobile-friendly but does not create a domain-specific offline authority.

Blocks desktop/online field flow: no. Blocks S02-005..007 hardening: yes.

## Merge / deploy boundary

This is non-UI business-rule/metadata work. Open PR and stop before merge/deploy until explicit user approval. No schema migration, secret/DNS/provider mutation or production data operation is part of A14.
