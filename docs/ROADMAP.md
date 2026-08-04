# FORGE ROADMAP

> **Strategic roadmap, not live status.**  
> Live state: `../CURRENT_STATUS.md`  
> Active queue: `../NEXT_TASKS.md`  
> Strategic completion target: `FORGE_ENTERPRISE_NORTH_STAR.md`

Ngày rebaseline: **2026-08-05**.

## 1. Product direction

Forge is one enterprise operating platform, not separate CloudForge/MetaForge products.

North Star:

- deep ERP core + Vietnam compliance;
- metadata-driven multi-tenant Cloudflare platform;
- App Factory/BPM/semantic BI/AI;
- fast verticalization without runtime forks;
- migration, implementation and SRE strong enough for real customer adoption.

Frappe/ERPNext and MISA are benchmarks/reference sources, not product identity.

## 2. Current program position

Completed:

- RC4 integrated engineering/evidence closure;
- R5 integrated hardening/productization;
- R6 production certification with `PILOT-GO`;
- Alumdoor Pilot-00 contract/profile/data-mapping lock.

Current active gate:

- **Pilot-01 — Master + Opening Data Readiness**;
- preview/control-plane ready;
- waiting for an approved immutable real source batch;
- no production import/write authorization implied.

The exact operational sequence is maintained only in `../NEXT_TASKS.md`.

## 3. Near-term roadmap — prove one real operating reference

Priority is not another blanket feature wave. Priority is proving that the frozen Alumdoor candidate can become an accepted production reference.

Sequence:

1. Pilot-01 real source batch + `PREVIEW_PASS`.
2. Pilot-02 representative transaction dry run.
3. Pilot-03 bounded parallel run + daily reconciliation.
4. Pilot-04 explicit cutover decision.
5. Pilot-05 hypercare + Pilot Exit Gate.
6. Accepted Production Reference.

Only after this proof should broad platform maturity work reopen unless a pilot blocker requires it.

## 4. North Star expansion priorities

After/alongside pilot lessons, product investment follows the 12 North Star pillars rather than old component/version roadmaps.

### Priority A — ERP financial/transaction correctness

- Finance + Vietnam compliance;
- CRM/Revenue 360;
- Source-to-Pay;
- Inventory/WMS;
- MRP II/QMS;
- HCM/statutory payroll;
- Project/Service/Field Service.

Target: end-to-end flows with correction/reversal, permission, reconciliation, import/export and reporting—not screen count.

### Priority B — platform moat

- BPM + App Factory;
- semantic BI/planning;
- Integration Hub;
- enterprise IAM/SaaS control plane/SRE;
- migration/implementation/customer success;
- permission-aware AI/automation.

### Priority C — verticalization

Open new verticals only when there is market/customer demand and the vertical can reuse shared authorities.

Alumdoor remains the reference vertical for proving:

- package/profile composition;
- industry-specific rules isolated from core;
- migration/onboarding;
- operational reporting;
- production pilot/cutover discipline.

## 5. Maturity targets

Strategic targets from the North Star:

| Layer | Target |
|---|---:|
| L0 Platform | 95%+ Hardened/RC |
| L1 ERP Core | 90%+ business-complete |
| L2 Enterprise Depth | 75–85%+ |
| L3 chosen vertical | 95% industry workflow coverage |

These are targets, not current claims. Current maturity truth remains in `FORGE_ENTERPRISE_CAPABILITY_STATUS.md` and `CURRENT_STATUS.md`.

## 6. Rules for opening work

A roadmap item should become active only when one of these is true:

- required by current pilot/customer outcome;
- closes a proven correctness/security/reconciliation gap;
- materially advances a North Star pillar;
- creates a reusable platform primitive needed by more than one app/domain;
- is required for legal/compliance/release evidence.

Do not create horizontal feature waves solely to increase capability counts.

## 7. Brand and architecture rule

Product-facing language uses **Forge**.

`@metaforge/*`, `metaforge.api.*`, `cloudforge-*` and `kairo.vn` may remain as technical identifiers/environment names where changing them would create compatibility or migration cost. See `BRAND_AND_NAMING.md`.

## 8. Production boundary

Roadmap does not authorize deploy, migration, customer-data mutation, restore/PITR, secrets/DNS/provider changes or cutover. Those remain governed by `../RUNBOOK.md`, `../DELIVERY_POLICY.md`, current pilot contracts and explicit authorization.

## 9. History

Old phase/component roadmaps, branch snapshots and temporary agent plans belong in Git/PR history or final convergence evidence, not in this live strategic roadmap.
