# R5 / R6 / ALUMDOOR PILOT PROGRAM

Date: **2026-08-04**  
Status: **PROPOSED EXECUTION PROGRAM — non-UI merge/deploy gated**  
Planning seed: `main@211ba858ca232c3da062553285a97c32e8fe4346`  
Program branch: `program/r5-r6-production-pilot-20260804`

## 1. Purpose

Move Forge from completed RC4 engineering/evidence closure into one integrated candidate, certify that exact candidate against real Cloudflare/runtime evidence, then run Alumdoor as the first controlled production pilot.

Sequence:

`RC4 DONE -> R5 integrated convergence -> R6 production certification -> Alumdoor controlled pilot -> Pilot Exit -> GA`

This is not another horizontal feature/review wave.

## 2. Authoritative inputs

- `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — strategic completion target.
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — canonical 956-capability denominator.
- RC4 A24 R2 — **RC4 engineering/evidence closure GO**.
- RC4 A19 — **18/18 worker lanes PASS**.
- RC4 A20 R2 — **956/956 deterministic convergence**, candidate `H=0 / RC=66 / Wired=406 / Foundation=327 / Missing=157`.
- RC4 A21 — migration numbering/checksum/applied-state governance.
- RC4 A22 — cross-ledger reconciliation.
- RC4 A23 — performance/scale/cost evidence.
- WS09 App Factory — app registry/compiler/install/upgrade authority.
- WS17 / Alumdoor — reference vertical, consumer of generic Forge authorities.

RC4 closure does not mean all backend worker work is already canonical on `main`, nor that provider/live production state is proven.

## 3. Invariants

1. **No 157-Missing sweep.** Only capabilities required by the pilot or shared safety dependencies enter R5/R6 scope.
2. **One authority per domain.** No duplicate GL, Payment Ledger, Stock Ledger, document kernel, auth/session, workflow or migration authority.
3. **Exact SHA evidence.** Branch existence, mergeability or source presence never equals integrated/deployed proof.
4. **No live-evidence fabrication.** Provider state remains unverified until directly observed.
5. **Verticals compose, never copy.** Alumdoor consumes HRM/CRM/Finance/Stock/Manufacturing contracts.
6. **Capability disable != package uninstall.** Disable preserves package, metadata and historical data.
7. **UI is an editor, not authority.** App Factory/profile UI writes versioned server-validated metadata.
8. Production/provider/destructive operations remain separately gated.

---

# PART I — R5 INTEGRATED CONVERGENCE

## 4. R5 objective

Produce one immutable integrated Forge candidate from the validated RC4 work, close package/composition residuals required for repeatable customer deployment, then rerun integrated QA and capability convergence on that single tree.

R5 is primarily integration, contract closure and hardening.

## 5. R5 lanes

### R5-A0 — Integration control

- pin exact starting `main`;
- inventory RC4 final immutable heads and independent PASS provenance;
- classify each lane `already-main / integrate / evidence-only / intentionally-deferred`;
- define dependency order;
- reject stale/superseded heads;
- maintain machine-readable integration manifest.

### R5-A1 — Platform / IAM / Kernel / Migration

Converge shared prerequisites first:

- IAM/privacy/session;
- shared document-kernel contracts;
- migration/cutover runtime;
- migration numbering/checksum governance;
- App Factory persisted-runtime prerequisites.

Never rename potentially applied migrations without applied-state evidence.

### R5-A2 — Finance / VN statutory / HCM payroll

Converge:

- Finance/VN statutory residuals;
- payroll statutory evidence/runtime;
- correction/cancel/reversal;
- GL/Payment Ledger consumers and reconciliation.

Unsupported legal claims stay fail-closed or explicitly bounded.

### R5-A3 — App packaging + Capability Profile contract

This lane is mandatory before R6 because customer deployment must not require source edits.

#### Product model

1. **Platform:** IAM, Kernel, App Factory, shared runtime/SRE.
2. **Domain packages:** HRM, CRM, Finance/VN Accounting, Stock, Manufacturing, Projects, Support, etc.
3. **Vertical profile:** Alumdoor and future customer/industry compositions.

Package dependencies remain coarse-grained/versioned. Capability activation is fine-grained per tenant/profile.

Conceptual example only:

```yaml
app: alumdoor
profile: production-v1
requires_packages:
  - hrm
  - crm
  - vn-accounting
  - stock
  - manufacturing
capabilities:
  hrm.employee-directory: enabled
  hrm.payroll: disabled
  crm.customer-contact: enabled
  crm.marketing: disabled
  finance.receivable: enabled
  finance.cash-bank: enabled
  manufacturing.work-order: enabled
```

Implementation must extend/reuse canonical App Registry/App Factory metadata rather than create another config authority.

#### Capability activation semantics

When disabled:

- navigation/surface is hidden;
- tenant-facing execution is rejected/suppressed server-side as appropriate;
- capability-owned jobs/integrations stop when safe;
- package installation remains;
- historical data remains;
- unrelated capabilities in the package remain;
- audit/version history remains.

**No automatic package uninstall.**

#### Explicit uninstall semantics

Uninstall is a separate admin operation with:

- reverse dependency analysis;
- data/reference impact preview;
- installed-version/migration-state checks;
- retain-data default;
- destructive purge as a separate strongly gated action;
- actor/reason/version audit.

#### Capability Profile Builder UI

Target path:

`App Factory -> App/Profile -> Dependencies & Capabilities -> Preview -> Validate -> Version -> Approve -> Apply`

Required behavior:

- group by domain;
- show `Required / Enabled / Disabled / Blocked`;
- explain transitive dependencies;
- prevent disabling required capabilities;
- preview affected nav/jobs/integrations/permissions;
- diff current vs proposed profile;
- preview effective package set;
- version each published profile;
- approval for high-risk/shared activation changes.

#### Dependency resolver

Must:

- resolve transitive capability requirements deterministically;
- resolve minimum package versions;
- detect cycles/conflicts;
- fail closed on unknown capability IDs;
- never silently broaden enabled scope;
- output an inspectable resolution plan.

#### Packaging acceptance matrix

Every sellable/installable first-party package used by pilot must prove:

`validate -> fresh install -> dependency resolution -> upgrade -> idempotent reinstall -> activate/deactivate -> runtime load -> browser smoke`

R5 does not require destructive uninstall/purge proof, but auto-uninstall must not exist.

### R5-A4 — CRM / Sales / P2P / Inventory

Converge validated residuals without replacing Transaction Closure authority.

Required checks:

- Customer -> Quotation -> Sales Order;
- Supplier -> PO -> Receipt -> Invoice;
- stock reservation/receipt/delivery;
- AR/AP + Stock/GL reconciliation;
- cancel/correction behavior;
- scanner/mobile permission boundaries where integrated.

### R5-A5 — Manufacturing / QMS / Projects / Service

Converge:

- Manufacturing/MRP/QMS;
- Projects/Service/Field;
- Warranty/service lifecycle.

Deferred operating-model decisions remain bounded when not needed by Alumdoor pilot.

### R5-A6 — Integration / BI / Workplace / Logistics

Converge:

- provider-neutral integration + DLQ/replay contracts;
- semantic/BI/dashboard seams;
- workplace scheduling/reminders;
- logistics/POS/commerce permissions.

Live providers remain R6 evidence.

### R5-A7 — Capability Profile UI

Consume A3's server contract. No second profile store.

Must provide browser-tested authoring for package/profile visibility, dependency preview, capability checklist, diff, validation and publish/apply state.

UI-only portions may use the existing fast path after required gates.

### R5-A8 — Package lifecycle / migration rehearsal

On disposable/non-production tenants:

- fresh bootstrap;
- package dependency install order;
- install/upgrade/reinstall idempotency;
- migration sequence/checksum validation;
- profile activate/deactivate;
- data retention after disable;
- failed-upgrade recovery semantics;
- import/migration reconciliation.

### R5-A9 — Integrated QA / convergence

Run on one converged candidate only:

- risk-based build/type gates;
- IAM/session/tenant/permission;
- App Factory/package/profile;
- Sales/O2C;
- Procurement/P2P;
- Inventory/valuation;
- Manufacturing/QMS;
- Finance/payroll;
- Warranty/service;
- cross-ledger auditor;
- browser/mobile/PWA smoke;
- migration verifier;
- capability rematerialization across exactly 956 IDs.

Output `R5-GO` or exact `R5-NO-GO` blockers.

## 6. R5 GO criteria

- one exact integrated candidate;
- every integrated RC4 delta traceable to independent evidence;
- combined gates green on integrated head;
- no authority collision;
- migration numbering/checksum green;
- deterministic fail-closed package/profile resolver;
- Alumdoor composes shared domain authorities without fork/copy;
- disable preserves package/data;
- no unresolved P0/P1 inside Alumdoor pilot capability set;
- capability status materialized from integrated evidence.

Production/provider proof is not required for R5 GO.

---

# PART II — R6 PRODUCTION CERTIFICATION

## 7. R6 objective

Prove that the exact R5 candidate operates safely in the real deployment topology and that the selected Alumdoor profile is cutover-ready.

R6 is evidence/certification. No broad source redesign.

## 8. R6 lanes

### R6-A0 — Immutable candidate lock

Pin exact R5 SHA, bundle hash, package versions and Alumdoor profile version. Reject evidence from another SHA.

### R6-A1 — Provider observed state

Observe approved Cloudflare environment for resources actually used:

- Workers / Workers for Platforms;
- D1/session/replication state as applicable;
- Queues/DLQ;
- KV/R2;
- Workflows;
- AI Gateway/Browser only when enabled;
- routes/bindings/config.

Source config alone cannot satisfy this lane.

### R6-A2 — Backup / Restore / PITR / Rollback drill

In approved safe/drill environment:

- fresh backup;
- manifest/hash/integrity verification;
- isolated restore;
- tenant/application integrity;
- PITR/time travel where supported and approved;
- Worker/app rollback evidence;
- measured recovery times.

Measured RTO/RPO evidence is not automatically a customer SLA.

### R6-A3 — Migration / Cutover rehearsal

- read-only target `d1_migrations` inventory;
- filename/checksum reconciliation under A21;
- production-like migration rehearsal;
- retry/idempotency/correction boundaries;
- opening/import reconciliation;
- cutover + rollback runbook.

### R6-A4 — Exact release proof

Approved release path:

`build once -> backup -> migration plan/apply -> tenant/app workers -> gateway -> /health -> /release.json -> exact SHA/hash -> browser smoke`

Merged never means deployed.

### R6-A5 — Representative performance / cost

Bounded safe evidence:

- p95/p99/error rate;
- list/report/ledger/reconciliation query behavior;
- queue backlog/retry;
- browser responsiveness;
- observed architecture vs cost projection.

No uncontrolled production stress test.

### R6-A6 — Security / Integration / Recovery

- auth/session/revocation;
- tenant/permission negative tests;
- provider callbacks/signatures/idempotency where enabled;
- DLQ/quarantine/replay where enabled;
- monitoring/alerts/runbooks;
- secret exposure audit.

### R6-A7 — Alumdoor Golden Order

Authenticated exact-release Golden Flow for selected profile:

`Customer -> Quotation -> Sales Order -> Procurement -> Receipt -> Manufacturing -> Delivery -> Sales Invoice -> Payment -> GL/AR/Stock reconciliation -> Warranty/Service`

Correction/failure coverage:

- partial payment;
- cancel/amend/retry;
- return/reversal;
- stock/material shortage;
- permission denial;
- duplicate/idempotent request;
- warranty/service linkage.

Shared defects are fixed in the shared owner, not Alumdoor-only patches.

### R6-A8 — Final certification

Output one verdict only:

- `PILOT-GO`, or
- `PILOT-NO-GO` with exact blockers.

## 9. PILOT-GO criteria

For the selected pilot capability set:

- exact release SHA/hash observed;
- required package/profile versions observed;
- relevant provider state observed;
- backup/restore drill PASS;
- migration inventory/rehearsal PASS;
- applicable rollback path proven;
- auth/permission/tenant negative tests PASS;
- cross-ledger reconciliation PASS;
- Golden Flow + correction paths PASS;
- representative performance within engineering envelope;
- no unresolved P0/P1;
- no CRITICAL Missing capability inside pilot scope.

Global 956-capability maturity does not need to be 100% RC/Hardened for a bounded pilot.

---

# PART III — ALUMDOOR CONTROLLED PILOT

## 10. Pilot principle

Alumdoor is the first reference vertical because it already exercises Forge domain packages and has production history/evidence. It is not an uncontrolled test customer.

Pilot proves operational truth: real users, data, transactions, reconciliation, support and cutover behavior.

## 11. P0 — Scope freeze

Create/version `Alumdoor Production Profile`.

Recommended initial surface:

- identity/roles/session essentials;
- Employee/Employee Lite only as required;
- Customer/Contact;
- Supplier;
- Item/UOM/BOM;
- pricing used by current flow;
- Sales / Quotation / Sales Order / Delivery / Sales Invoice;
- Purchase / PO / Receipt / Purchase Invoice;
- Inventory / stock movement / reconciliation;
- Manufacturing / Work Order / Job Card where required;
- AR/AP;
- cash/bank/payment paths actually used;
- warranty/service;
- daily operational reports.

Do not enable unused Payroll, Recruitment, Marketing CRM, advanced AI, complex collaboration, SAML/SCIM or deep offline merely because the package is installed.

## 12. P1 — Data mapping / migration rehearsal

Map and rehearse:

- users/roles;
- Employee;
- Customer/Contact;
- Supplier;
- Item/UOM/BOM;
- warehouses;
- price lists;
- opening stock;
- AR/AP opening balances;
- cash/bank/opening GL if in scope;
- open Sales/Purchase/Manufacturing documents if required.

Every import records source identity, counts, rejects and reconciliation.

## 13. P2 — Business dry run

Use representative production-like transactions.

Required scenarios include:

- edit before submit;
- cancel/amend;
- return;
- partial receipt/delivery/payment;
- stock shortage;
- duplicate/retry;
- insufficient permission;
- manufacturing variance where relevant;
- warranty/service continuation.

## 14. P3 — Parallel run

Forge runs alongside the current operating record for at least one representative business cycle.

Daily minimum reconciliation:

| Area | Required comparison |
|---|---|
| Inventory | item/UOM/warehouse qty + valuation |
| AR | customer/invoice/outstanding |
| AP | supplier/invoice/outstanding |
| Cash/bank | receipts/payments/balances in scope |
| Sales | orders/deliveries/invoices |
| Procurement | PO/receipt/invoice progress |
| Manufacturing | material/WIP/FG evidence in scope |
| Finance | debit=credit + control reconciliation |

Every difference must be classified as source-data, timing, expected policy, defect or unresolved. Material unresolved differences block cutover.

## 15. P4 — Cutover

1. announce cutover window;
2. freeze writes in prior operating source for selected scope;
3. final backup/export;
4. import delta/open transactions;
5. reconcile counts/balances;
6. smoke + Golden Flow subset;
7. enable Forge writes for pilot users;
8. keep prior source read-only;
9. record exact release/profile/data-cutoff evidence.

## 16. P5 — Hypercare

- monitor errors, latency, queues/provider failures;
- reconcile critical ledgers daily;
- classify P0/P1/P2/P3 incidents;
- preserve request/document/audit IDs;
- hotfix only through normal authority/release gates;
- no routine direct database patching.

## 17. P6 — Pilot Exit

Mark `ACCEPTED PRODUCTION REFERENCE` only when:

- no open P0;
- no open P1 without approved safe workaround;
- live Golden Flow remains green;
- critical reconciliation stays clean through a representative cycle;
- key users operate without developer intervention;
- support-ticket rate stabilizes/declines;
- backup/recovery evidence remains valid;
- no unresolved systemic corruption requiring rollback;
- package/profile upgrades are repeatable;
- deferred capability list is explicit.

After Pilot Exit, customer onboarding must use package + capability profile composition rather than customer forks.

---

# PART IV — CHANGE / REVIEW POLICY

## 18. Severity

- **P0:** data loss/corruption, tenant/security breach, unrecoverable release, materially wrong ledger/stock authority. Stop/rollback.
- **P1:** core flow blocked/materially wrong without safe workaround. Blocks phase exit.
- **P2:** important defect with safe workaround. Fix with risk-based regression.
- **P3:** minor UX/report/docs issue. Normal backlog.

## 19. Regression after R6

Do not open R7 horizontal review for ordinary changes.

- UI-only -> affected browser/mobile/a11y flow.
- Finance -> Finance + ledger reconciliation + affected upstream/downstream.
- Inventory -> Stock Ledger/valuation + affected Finance/Sales/Purchase.
- IAM -> auth/session/tenant/permission/security.
- Shared Kernel/App Factory -> broad regression due cross-domain blast radius.
- Migration -> replay + checksum/applied-state + data integrity.
- Release/SRE -> deployment/recovery/health/exact-release evidence.

A new full certification cycle is justified only by major platform/architecture generation change.

## 20. Program Definition of Done

1. R5 immutable integrated candidate is green.
2. R6 returns `PILOT-GO` on an exact release.
3. Alumdoor completes controlled pilot and Pilot Exit.
4. Forge has repeatable onboarding through packages + capability profiles.
5. Remaining Missing/Foundation/Wired capabilities become market-driven backlog, not a reason for another blanket RC wave.

## 21. Safety boundary

This document authorizes planning only.

- Non-UI R5 integration merge requires explicit approval.
- Production/provider/migration/restore/cutover actions require explicit approval at the relevant boundary.
- UI-only validated work may follow the existing Forge fast path.
