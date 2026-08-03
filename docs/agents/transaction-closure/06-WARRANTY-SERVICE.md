# AGENT 06 — WARRANTY / AFTER-SALES SERVICE CLOSURE

Status: SEEDED
Branch: `rc/transaction-closure-06-warranty-service`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Risk: CRITICAL at stock/finance boundary

## Mission

Close after-sales traceability from a delivered customer/item/serial into service and financial/stock consequences:

`Delivery/Serial/Customer -> warranty eligibility -> claim/ticket -> service order -> parts/replacement/return -> service billing/credit -> closure/audit`

Capability focus: `C03-021`, `S01-001..S01-015`, `S02-001..S02-013`, consume `M04-010` customer traceability and canonical stock/finance contracts.

## Own

- warranty claim, helpdesk/service-order and field-service domain lifecycle;
- warranty eligibility/traceability logic using delivered authoritative evidence;
- service-specific regressions and closure evidence.

## Do not own

- Sales/O2C delivery/invoice authority: Agent 01;
- stock/serial/valuation authority: Agent 03;
- GL/AR/payment/report authority: Agent 04;
- manufacturing genealogy implementation: Agent 02;
- generic shared runtime/App Factory.

## Required audit

- current warranty fields/doctype/service/helpdesk implementations;
- delivery/customer/item/serial traceability;
- Issue/Ticket/SLA/assignment/escalation;
- Warranty Claim and Service Order if present;
- spare-parts consumption and replacement/return seams;
- service billing/payment linkage;
- customer signature/photo/service report evidence if current product contract supports it;
- cancellation/reopen/correction behavior;
- substantive historical support/service/warranty PRs: classify before rewrite.

## Required evidence

- valid in-warranty claim;
- out-of-warranty or invalid ownership rejection;
- duplicate/retry claim protection;
- serial/customer/delivery provenance;
- spare-parts issue consumes canonical stock path;
- replacement/return preserves stock traceability;
- billable service consumes canonical Sales/Finance path rather than shadow receivable;
- cancellation/reopen/correction/audit trail;
- tenant/company/branch/service-team permission isolation.

## Dependency behavior

Any change to delivery/invoice semantics goes to Agent 01; stock/serial/valuation goes to Agent 03; GL/AR/payment/report goes to Agent 04; manufacturing genealogy goes to Agent 02. Raise Dependency Request and continue service lifecycle work.

## Merge boundary

PR-ready autonomously. Non-UI merge/deploy requires explicit user approval.

## Startup prompt

Đọc handoff + program artifacts + Forge Skill + exact branch/main + service/warranty/sales/stock code evidence. Audit historical warranty/service work trước khi code. Warranty phải trace về delivery/customer/item/serial thật; không tạo shadow stock hay shadow receivable. Dependency sang owner khác thì ghi request và tiếp tục. Verify CRITICAL boundaries, cập nhật Completion Record, dừng trước merge/deploy.

## Completion record

Pending worker execution.
