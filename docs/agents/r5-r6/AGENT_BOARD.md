# R5 / R6 / ALUMDOOR PILOT — AGENT BOARD

Date: **2026-08-04**  
Planning seed: `main@211ba858ca232c3da062553285a97c32e8fe4346`  
Program: `docs/agents/r5-r6/R5_R6_ALUMDOOR_PILOT_PROGRAM_20260804.md`  
Status: **PLANNED — execution branches open only from current main/candidate at start time**

## 1. Operating rules

- Every worker audits exact current `main` before implementation.
- Shared authorities stay single-owner: IAM/session, Document Kernel, App Registry/App Factory, ledgers, migration governance, release/SRE.
- A worker may not silently replace another workstream's shared contract.
- If locally blocked, record a Dependency Request and continue all independent work.
- No source-only PASS claim; evidence identifies exact head + executable gate where applicable.
- No production/provider mutation just to close a checklist.
- UI-only validated changes may use the established UI fast path. Non-UI merge/deploy remains approval-gated.

---

# 2. R5 — Integrated Convergence

| Lane | Suggested branch | Primary scope | Risk | Depends on | Exit artifact |
|---|---|---|---|---|---|
| R5-A0 | `agent/r5-00-integration-control` | RC4 final-head inventory, dependency DAG, integration manifest | STANDARD | RC4 A24 | source-of-truth manifest |
| R5-A1 | `agent/r5-01-platform-kernel-security` | IAM, kernel, migration/cutover, App Factory prerequisites | CRITICAL | A0 | shared-authority integrated candidate |
| R5-A2 | `agent/r5-02-finance-hcm-statutory` | Finance/VN statutory, HCM/payroll, correction/reconciliation | CRITICAL | A1 | finance/payroll integrated evidence |
| R5-A3 | `agent/r5-03-app-packaging-capability-profile` | package lifecycle, capability activation, resolver | CRITICAL shared contract | A1 | canonical profile contract + server tests |
| R5-A4 | `agent/r5-04-crm-p2p-wms` | CRM/Sales/P2P/Inventory residual convergence | CRITICAL | A1,A2 | integrated transaction evidence |
| R5-A5 | `agent/r5-05-manufacturing-service` | Manufacturing/QMS/Projects/Service/Warranty | CRITICAL | A1,A4 | integrated production/service evidence |
| R5-A6 | `agent/r5-06-integration-bi-workplace-commerce` | Integration, semantic/BI, workplace, logistics/POS | STANDARD/CRITICAL | A1,A3 | integrated secondary-domain evidence |
| R5-A7 | `agent/r5-07-capability-profile-ui` | App Factory capability-profile UI and preview | UI-only unless contract changes | A3 | browser-tested authoring surface |
| R5-A8 | `agent/r5-08-package-migration-rehearsal` | install/upgrade/reinstall/profile/migration lifecycle | CRITICAL | A2-A7 | disposable-tenant lifecycle evidence |
| R5-A9 | `agent/r5-09-integrated-qa-convergence` | exact combined QA, reconciliation, capability rematerialization | CRITICAL evidence | A1-A8 | immutable R5 candidate + verdict |

## 3. R5 lane details

### R5-A0 — coordinator

For every RC4 lane record:

- final immutable head;
- independent PASS provenance;
- already-on-main vs branch-only;
- integration action;
- migrations;
- shared contracts touched;
- dependency order;
- required post-integration gate.

No stale/superseded head may enter the integration manifest.

### R5-A1 — shared prerequisites

Integrate shared contracts before domain consumers. Do not make business-rule fixes unless required to resolve an integration defect in a shared authority.

Must prove:

- tenant/security boundaries unchanged or strengthened;
- kernel shared reads preserve domain ownership;
- migration/cutover paths consume A21 governance;
- App Factory persisted runtime has one authoritative registration path.

### R5-A2 — finance/statutory

Must prove:

- GL/Payment Ledger authority remains unique;
- correction/cancel/reversal paths remain deterministic;
- statutory rules retain source/version/effective-date evidence;
- payroll and finance integration reconciles without shadow ledger behavior.

### R5-A3 — capability-profile contract owner

Must deliver:

- canonical capability identifier -> package/version binding;
- versioned tenant/app profile definition;
- transitive dependency resolver;
- required/enabled/disabled/blocked states;
- server enforcement for disabled tenant-facing capability surfaces/actions;
- safe job/integration activation semantics;
- no auto-uninstall;
- impact preview;
- profile audit/version lifecycle;
- tests proving two profiles can use different subsets of the same installed package without code fork or authority duplication.

Must not embed Alumdoor business rules in the shared resolver.

### R5-A4 — commercial/inventory convergence

Must preserve canonical Transaction Closure flows and prove cross-domain lineage/reconciliation after integration.

### R5-A5 — manufacturing/service convergence

Do not fabricate closure for deferred rework/subcontract/field-offline operating models when the pilot profile does not require them.

### R5-A6 — secondary domains

Live provider calls are not required for R5. Source/runtime integration and permission/idempotency boundaries are required.

### R5-A7 — UI owner

Consumes A3. Must not create another profile store.

Required UI:

- installed packages;
- selected vertical/profile;
- grouped capability checklist;
- dependency/conflict explanation;
- current/proposed diff;
- affected navigation/jobs/integrations preview;
- validation errors;
- version/publish/apply status.

**Bỏ tick = deactivate.** Uninstall stays a separate admin path.

### R5-A8 — lifecycle rehearsal

Use disposable tenant fixtures only.

Minimum scenario:

1. fresh tenant;
2. install required domain packages;
3. install Alumdoor;
4. apply Alumdoor pilot profile;
5. verify disabled features hidden and non-executable through normal tenant surface;
6. upgrade one package;
7. reapply same profile idempotently;
8. enable one optional capability;
9. disable it again;
10. prove historical data retained;
11. rerun runtime/browser/package gates.

### R5-A9 — final gate

Runs only after approved integration into one candidate tree.

Verdict:

- `R5-GO`, or
- `R5-NO-GO` with exact blocker list.

Branch-only green evidence cannot satisfy A9.

## 4. R5 preferred dependency order

`A0 -> A1 -> (A2 + A3) -> (A4 + A6) -> A5 -> A7 -> A8 -> A9`

Parallel work is allowed where ownership does not overlap. A9 must rerun from the exact integrated candidate.

---

# 5. R6 — Production Certification

R6 starts only from an approved immutable R5 candidate.

| Lane | Suggested branch | Primary scope | Risk | Depends on | Exit artifact |
|---|---|---|---|---|---|
| R6-A0 | `agent/r6-00-release-lock` | exact SHA/hash/package/profile lock | STANDARD | R5-A9 | certification manifest |
| R6-A1 | `agent/r6-01-provider-observed-state` | Cloudflare desired-vs-observed inventory | CRITICAL ops | A0 | provider observation evidence |
| R6-A2 | `agent/r6-02-recovery-drill` | backup/restore/PITR/rollback drill | CRITICAL | A0,A1 | measured recovery evidence |
| R6-A3 | `agent/r6-03-migration-cutover-rehearsal` | migration inventory + production-like rehearsal | CRITICAL | A0,A2 | cutover/rollback runbook |
| R6-A4 | `agent/r6-04-exact-release-proof` | approved release + health/release/browser proof | PRODUCTION | A0-A3 | exact deployed release evidence |
| R6-A5 | `agent/r6-05-performance-provider` | bounded performance/load/cost proof | CRITICAL ops | A4 | p95/p99/error/cost evidence |
| R6-A6 | `agent/r6-06-security-integration-recovery` | auth/tenant/provider/DLQ/alerts | CRITICAL | A1,A4 | security/recovery matrix |
| R6-A7 | `agent/r6-07-alumdoor-golden-order` | authenticated exact-release Alumdoor Golden Flow | CRITICAL business | A4,A6 | Golden Flow + corrections |
| R6-A8 | `agent/r6-08-pilot-readiness-gate` | final certification | CRITICAL governance | A1-A7 | `PILOT-GO` / `PILOT-NO-GO` |

## 6. R6 constraints

- Provider mutation only in explicitly approved environment.
- Build/merge does not count as deployed evidence.
- Recovery drills prefer isolated targets.
- Remote load stays bounded; no uncontrolled live stress.
- A7 evidence must bind exact A4 release SHA/hash/profile version.
- Any substantive architecture defect gets a bounded repair lane and affected certification gates rerun.

## 7. R6 preferred order

`A0 -> A1 -> A2 -> A3 -> A4 -> (A5 + A6) -> A7 -> A8`

---

# 8. Alumdoor Pilot

Starts only after `R6-A8 = PILOT-GO`.

| Phase | Focus | Required output | Exit gate |
|---|---|---|---|
| P0 | Scope freeze | versioned Alumdoor Production Profile | no required pilot capability unresolved |
| P1 | Data rehearsal | mapping, dry import, counts, opening reconciliation | no material unexplained variance |
| P2 | Business dry run | Golden Flow + correction/failure scenarios | core scenarios pass |
| P3 | Parallel run | daily old-vs-Forge reconciliation | stable representative cycle |
| P4 | Cutover | freeze/backup/delta/reconcile/smoke/go-live | production writes move to Forge |
| P5 | Hypercare | incident log, monitoring, daily reconciliation | no P0; P1 bounded |
| P6 | Pilot Exit | accepted reference report | `ACCEPTED PRODUCTION REFERENCE` |

## 9. Default Alumdoor pilot profile intent

Final capability IDs come from canonical metadata/map; this is product intent only.

### Enable

- identity/user/role/session essentials;
- Employee/Employee Lite required by current operation;
- Customer/Contact;
- Supplier;
- Item/UOM/BOM;
- pricing needed by current flow;
- Sales Order/Delivery/Sales Invoice;
- Purchase Order/Receipt/Purchase Invoice;
- Inventory/stock reconciliation;
- Manufacturing/Work Order/Job Card required by current process;
- AR/AP + Payment Entry;
- cash/bank paths currently used;
- warranty/service;
- daily operational reports;
- Alumdoor-specific UI/actions that consume shared authorities.

### Keep disabled unless a real requirement appears

- full Recruitment;
- full Payroll if pilot does not process payroll;
- Marketing automation;
- advanced CRM not operationally used;
- SAML/SCIM;
- advanced AI actions;
- deep offline write/sync where authority is not proven;
- complex field-service routing;
- broad collaboration features;
- optional Cloudflare primitives without demonstrated workload.

## 10. Reconciliation ownership

- Finance: GL, AR, AP, cash/bank, settlement.
- Warehouse: quantities, valuation, serial/batch where applicable.
- Procurement: PO -> receipt -> invoice.
- Sales: order -> delivery -> invoice -> receipt.
- Manufacturing: material/WIP/FG in enabled scope.
- SRE: exact release, backup, monitoring, recovery readiness.

Any material unresolved difference blocks cutover/Pilot Exit.

---

# 11. Dependency Request format

```text
Dependency Request: DR-R5-Ax-NN
Owner: <lane/workstream>
Need: <exact contract/evidence>
Why blocked: <what cannot be completed safely>
Can continue independently: <yes/no + remaining work>
Temporary compatibility path: <if any>
Acceptance evidence: <what closes the request>
```

Do not stall the whole program for a local blocker when independent work can continue.

# 12. Stop points

Explicit approval is required before:

- merging non-UI R5 integration branches to `main`;
- production migrations;
- Cloudflare provider mutations for certification;
- restore/PITR against production data;
- production backend deployment/cutover;
- switching authoritative Alumdoor production writes when operationally destructive/irreversible.

UI-only work follows existing fast-path policy after validation.
