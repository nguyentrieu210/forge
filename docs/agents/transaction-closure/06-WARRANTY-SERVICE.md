# AGENT 06 — WARRANTY / AFTER-SALES SERVICE CLOSURE

Status: **PR READY — NOT MERGED / NOT DEPLOYED**
Branch: `rc/transaction-closure-06-warranty-service`
PR: `#507`
Program baseline: `rc/transaction-closure-00-control@641a909ee27dad8ff9766dacaeecd82ec0da8911`
Implementation audit baseline: current `main` reviewed through `fe0c2f1a9c490eb400e19a5d55baea9a4b60c307`; the five commits after the worker merge-base are UI-only and do not overlap this service implementation.
Risk: **CRITICAL at stock/finance boundary**

## Mission

Close after-sales traceability from a delivered customer/item/serial into service and financial/stock consequences:

`Delivery/Serial/Customer -> warranty eligibility -> claim/ticket -> service order -> parts/replacement/return -> service billing/credit -> closure/audit`

Capability focus: `C03-021`, `S01-001..S01-015`, `S02-001..S02-013`, consume `M04-010` customer traceability and canonical stock/finance contracts.

## Authority / negative space

Closure-06 owns warranty/service lifecycle and verification. It does **not** create a shadow stock ledger, shadow receivable, shadow invoice or service-owned financial balance.

Canonical evidence consumed by this branch:

- delivered ownership/provenance: `Delivery Note` + `Serial No`;
- warranty/service entitlement: `Warranty Claim` or active `Service Contract`;
- spare-part and return movement: submitted `Stock Entry`;
- billable service: submitted `Sales Invoice`;
- tenant boundary: platform callback executes in the current tenant and actor identity;
- company/branch boundary: Maintenance Request, Service Contract, Warranty Claim and Service Order carry explicit scope and the validator refuses inconsistent authoritative evidence.

Creation/reversal of stock and finance documents stays with their owning workstreams. Closure-06 fails closed when required canonical evidence does not exist.

## Historical audit / disposition

### PR #337 — Project / Helpdesk / Warranty / Field Service

**REUSE / HARDEN, not rewrite.** This is the current WS07 foundation: Maintenance Request, Service Contract, Warranty Claim, Service Order, technician assignment scope, structured checklist/parts evidence and synchronous worker validation. Its explicit limitation was that `Service Part Usage.stock_reference` was evidence-only and service billing remained a finance dependency.

### PR #309 — earlier WS07 foundation

**PRECEDENT only.** Same architecture direction, superseded by the rebuilt/canonical WS07 work. No blind cherry-pick.

### ERPNext v16 Warranty Claim / Serial No

**BENCHMARK only.** Used to confirm canonical serial ownership/warranty fields such as item/customer/company/warranty expiry and delivery provenance. Upstream source is not treated as Forge maturity evidence.

## Implemented closure hardening

### 1. Scoped intake / entitlement authority

`Maintenance Request` now carries `company` and `branch`; company becomes mandatory once the request leaves its initial workflow state.

`Service Contract` now carries required `company` plus `branch`, so a service entitlement cannot float across company scope merely because customer names happen to match.

`Warranty Claim` carries explicit:

- `company`;
- `branch`;
- canonical `source_delivery_note`;
- `correction_of` + mandatory `correction_reason` lineage.

### 2. Warranty provenance and eligibility

The server-side WS07 entry validator verifies, once a claim leaves the initial state:

- Maintenance Request exists and agrees with customer/company/branch/item/serial/delivery provenance when the source dimensions are populated;
- source Delivery Note exists and is submitted;
- an **eligible** claim belongs to the same delivered customer/company/branch;
- delivered item/serial appears on the Delivery Note, or canonical Serial No directly points back to that Delivery Note;
- Serial No item/customer/company lineage is consistent when those authoritative fields are populated;
- Service Contract claims use a submitted `Hiệu lực` contract for the same customer/company/branch, valid claim date and matching covered item/serial window;
- non-contract warranty requires a serial whose `warranty_expiry_date` covers the claim date.

Invalid ownership or expired warranty may still be **recorded as rejected evidence**, but cannot be marked `Đủ điều kiện`.

### 3. Claim -> Service Order reciprocal closure

A Warranty Claim in `Chờ xác nhận` / `Hoàn tất` cannot close merely because `service_order` contains the name of an existing document.

The linked Service Order must:

- exist;
- link back to the exact Warranty Claim;
- share the same Maintenance Request;
- agree on customer/company/branch/item/serial;
- itself be in `Chờ xác nhận` or `Hoàn tất`.

This closes the two-way claim/service lineage rather than accepting a decorative Link field.

### 4. Duplicate / retry / correction behavior

Before accepting another Warranty Claim for the same `Maintenance Request`, the validator queries the authoritative Warranty Claim collection.

- retry against an existing active claim is refused;
- the caller must reuse the existing claim rather than create a duplicate;
- a new claim may supersede a terminal `Hoàn tất` / `Từ chối` / `Hủy` claim only through explicit `correction_of` + reason;
- Service Order correction similarly requires a terminal `Hoàn tất` / `Hủy` source plus explicit reason.

This is lineage, not silent historical mutation.

### 5. Free-service authority fails closed

`Service Order.billing_mode` supports:

- `Bảo hành`;
- `Bao gồm hợp đồng`;
- `Tính phí`.

A finalizing service cannot claim a free-service path without the authority it names:

- `Bảo hành` requires a linked eligible Warranty Claim;
- `Bao gồm hợp đồng` requires a submitted `Hiệu lực` Service Contract for the same customer/company/branch, within the service date and covering the service item/serial;
- `Tính phí` requires the canonical submitted Sales Invoice described below.

This prevents “free because the select box says so”, a surprisingly popular accounting model when software forgets to object.

### 6. Spare-part stock closure

`Service Part Usage.stock_reference` changed from free-form `Data` to `Link -> Stock Entry`.

Before a Service Order enters `Chờ xác nhận` / `Hoàn tất`, every used-part row must have a canonical submitted Stock Entry that:

- exists in the current tenant;
- matches the Service Order company and branch when branch is exposed by the stock document;
- contains the referenced item and serial when serial evidence is provided.

The service worker does not create or value stock. It only refuses to close service without authoritative stock evidence.

### 7. Replacement / return traceability

`Service Order` now declares:

- `resolution_type`: Sửa chữa / Thay thế / Đổi trả / Không phát hiện lỗi;
- `replacement_delivery_note`;
- `replacement_serial_no`;
- `return_stock_entry`.

For replacement closure:

- replacement Delivery Note must be submitted;
- `issue_purpose` must be `Đổi bảo hành`;
- customer/company/branch must remain aligned;
- replacement item/serial must be present on the Delivery Note.

For return closure:

- a submitted canonical Stock Entry must evidence movement of the returned item/serial under the same company/branch scope.

No replacement inventory state is stored locally in Maintenance.

### 8. Service billing boundary

`Service Order` now declares `sales_invoice: Link -> Sales Invoice`.

A finalizing `Tính phí` service cannot close without a submitted, non-return Sales Invoice for the same customer/company/branch.

No amount, outstanding balance or settlement status is copied into Service Order. AR/payment/GL remain Finance authority.

### 9. Scope and audit surfaces

Warranty Claim and Service Order reports expose/filter company, branch and the relevant delivery/billing reference. Existing technician mutation scope is retained: only the technician assigned through `Service Technician -> User` may mutate the Service Order / linked Warranty Claim unless a supervisory role applies.

`maintenance` package version is now `1.5.0`; external contracts explicitly declare `Stock Entry` and `Sales Invoice` in addition to existing Delivery Note / Serial No seams.

## Regression evidence authored

### Updated

- `server/tests/maintenance-field-service.test.mjs`
  - package 1.5.0;
  - canonical external dependencies;
  - Maintenance Request / Service Contract / Claim / Order company-branch metadata;
  - correction metadata;
  - `Stock Entry` typed part reference;
  - Sales Invoice / replacement / return fields.

- `server/tests/ws07-scope-validator.test.mjs`
  - keeps assignment-scope tests valid with the new provenance checks;
  - callback fake supports authoritative collection lookup used by duplicate protection.

### Added

- `server/tests/transaction-closure-warranty-service.test.mjs`
  - valid in-warranty delivered customer/item/serial;
  - invalid ownership rejection path;
  - expired warranty denial;
  - duplicate/retry claim refusal;
  - explicit terminal correction path;
  - warranty mode cannot close without Warranty Claim authority;
  - contract-included mode validates active company-scoped coverage;
  - spare-part Stock Entry required and matched;
  - billable service Sales Invoice required and company-scoped;
  - replacement Delivery Note / serial trace;
  - return Stock Entry trace;
  - Service Order correction boundary.

- `server/tests/transaction-closure-warranty-linkage.test.mjs`
  - claim close rejects a Service Order linked to another Warranty Claim;
  - reciprocal claim/Service Order lineage passes when request/customer/company/branch/item/serial and service state agree.

## Verification status

### Executed in this session

- exact repository/Skill/North Star/program/historical WS07 source audit through GitHub connector;
- current-main comparison: branch is behind `main` by five UI-only commits from merge-base `a99af64b6509477238bc9dc848e226828531b599`; no service-file overlap was found and GitHub reports PR #507 mergeable;
- isolated TypeScript `tsc --noEmit` syntax/type-shape check of the WS07 entry validator through the principal closure hardening pass using minimal Cloudflare stubs: **PASS**;
- `node --check` on the main transaction-closure test and the final reciprocal-linkage test source: **PASS**;
- earlier `node --check` on the maintenance metadata test source: **PASS** before the final assertion-only company/branch additions;
- GitHub Actions for the latest checked head exposed only `RC-021 Critical Validation`, conclusion **skipped**; combined commit status contains no checks. This is explicitly **not** CI PASS.

### NOT RUN — do not treat as PASS

This connector session does not have an exact Forge working-tree checkout/dependency tree. Therefore the following remain **NOT RUN**:

- full repository `npm run build`;
- focused Node execution against the actual built `dist`;
- `npm run test:unit`;
- `npm run app:check`;
- `npm run check:ws07-worker` / Wrangler dry-run;
- release manifest verification;
- authenticated staging lifecycle / direct-API negative smoke;
- production app upgrade / worker deploy.

Project policy does not convert missing checkout evidence into a fake green CI result.

## Dependency Requests

### DR-TC06-01 — canonical service stock commands

**Target:** Agent 03 — Inventory/WMS/Serial/Valuation.

Need an owner-defined idempotent contract to originate/reverse the authoritative Stock Entry or equivalent stock transaction from Service Order for:

- spare-part issue;
- unused-part return;
- customer return;
- warranty replacement movement;
- cancellation/reversal with serial and valuation preservation.

Current closure is safe but manual at the boundary: it requires a pre-existing submitted Stock Entry and never creates shadow stock. This dependency blocks automatic end-to-end stock orchestration, not service lifecycle integrity.

### DR-TC06-02 — canonical service billing / credit lineage

**Target:** Agent 01 Sales/O2C + Agent 04 Finance/AR.

Need an owner-defined idempotent service billing/credit contract that gives Sales Invoice / credit-note documents explicit Service Order provenance and canonical reversal/settlement behavior.

Current closure requires a submitted matching Sales Invoice for `Tính phí`, but intentionally does not invent invoice lines, AR balances, payment state or GL. This dependency blocks automatic service billing/credit orchestration.

### DR-TC06-03 — assignment-based READ row scope

**Target:** IAM / organization-security owner.

Mutation scope for technicians is server enforced. HARDENED confidentiality still needs authoritative read-row filtering for assigned Service Orders / Warranty Claims plus governed company/branch/service-team policy. Current mitigation is tenant-scoped callback authorization + existing DocPerm/User Permission behavior + explicit mutation assignment checks.

## Migration / rollout / rollback

- No custom D1 table or ledger migration added.
- Maintenance metadata upgrades `1.4.0 -> 1.5.0`.
- Existing terminal documents are preserved; new closure checks apply when relevant documents are mutated/finalized.
- No destructive uninstall/drop behavior is introduced.
- Rollback before production data mutation: revert Worker/app package version.
- After production documents use the new fields: preserve documents and roll back code compatibly; do not destructively remove data.

## Merge boundary

This branch contains backend/business-rule/schema metadata changes. It is **not UI-only**.

Per Forge policy:

- implementation and PR preparation may proceed autonomously;
- **merge/deploy require explicit user authorization**;
- no production mutation was performed by Closure-06.

## Completion record

Closure-06 independent work is complete to **PR READY / REVIEW** with warranty/service authority, stock evidence, billing evidence and correction lineage fail-closed at the boundaries owned by this workstream. It is **not claimed RC/HARDENED** until exact-checkout CRITICAL gates and staging lifecycle evidence run successfully, and the cross-workstream automatic stock/billing Dependency Requests are resolved.
