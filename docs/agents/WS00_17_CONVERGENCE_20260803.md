# WS00–WS17 convergence record — 2026-08-03

Status: **CONVERGENCE COMPLETE / APPROVAL GATES REMAIN**  
Evidence priority: exact GitHub state > workstream handoff/status prose > `NEXT_TASKS.md` > project context > North Star.  
Policy: `skills/forge-enterprise-completion/SKILL.md` + `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.  
Final cleanup snapshot main: `57461b481a8b22c8ab687af3e3f40468a9880958`.

## Rules applied

1. Stale workstream history was never merged back into `main` merely to remove conflicts.
2. Conflicted workstreams were rebuilt from exact current `main` and only their audited net delta was replayed.
3. Shared hot spots were reconciled against current `main`; newer auth, stock-integrity, runtime, SRE and release changes were preserved.
4. Tenant migrations were globally renumbered rather than reusing stale WS-local numbers.
5. UI-only work may use the project fast path. Backend/schema/business-rule changes remain approval-gated.
6. Existing test files are evidence of coverage, not evidence that a run passed. Missing CI/runtime evidence stays NOT RUN / UNPROVEN.
7. Stale PRs may be closed as superseded. Branch deletion was not performed because it is destructive cleanup.
8. Later main-only UI Factory reference/docs changes were replayed into the clean queue only when exact comparison proved no workstream overlap.

## WS00–WS17 final convergence matrix

| WS | Domain | Canonical state | Remaining gate |
|---|---|---|---|
| WS00 | Kernel / platform contracts | **MERGED** #306 | Foundation on main. |
| WS01 | Finance + VN compliance | **CLEAN PR #367** | One net commit on snapshot main. Finance/VN statutory source, TT99, VAT/e-invoice/tax evaluator and Finance Budget preserved. Migrations `0089..0098`. Backend/schema approval required. |
| WS02 | CRM / Revenue 360 | **CLEAN PR #321** | One net commit on snapshot main, exact `behind 0`. No migration. Business-rule/metadata approval required. Shared conversion/provider/projection dependencies remain boundaries. |
| WS03 | Procurement | **MERGED** #347 | #342/#353 superseded/closed. |
| WS04 | Inventory / WMS | **MERGED** #307 | Canonical stock foundation remains authority for WS05/WS16. |
| WS05 | Manufacturing / MRP II / QMS | **CLEAN PR #380** | Exact 50-path domain delta, one net commit, `behind 0`. Bulk BOM closure, MRP/netting, capacity, costing read, genealogy, QMS lifecycle and 15 targeted tests preserved. No tenant migration. Backend/runtime approval required. |
| WS06 | HCM + statutory payroll | **CLEAN PR #372** | One net commit on snapshot main. Deterministic/effective-dated payroll evaluator, workforce/recruitment/lifecycle/geofence/employee-finance/talent preserved. Migrations `0099..0104`. Loan-at-separation policy remains a business decision. |
| WS07 | Project / service / field service | **MERGED** #352 | Canonical current-main implementation. |
| WS08 | BI / reporting | **MERGED** #311 | Canonical reporting foundation. |
| WS09 | BPM + App Factory | **CLEAN PR #362** | One net commit, exact `behind 0`. AppAction repeatable input tables, compatibility lowering, BPM formula/rule/approval/timer/trigger, App Factory revision/rollback preserved. Migration `0088`. Approval required. |
| WS10 | Integration Hub | **MERGED** #308 | Provider-specific delivery/e-sign/extraction remains an integration boundary for dependent WSs. |
| WS11 | IAM / SaaS security | **MERGED** #317 | Canonical IAM/security authority. |
| WS12 | SRE / operations | **MERGED** #320 | Release/deploy truth remains evidence-driven. |
| WS13 | Migration / onboarding | **MERGED** #313 | Canonical migration/onboarding foundation. |
| WS14 | Frontend runtime / mobile | **UI fast-path merged** | UI/runtime slices and Alumdoor HR/Employee Lite changes are on main. Generic runtime/browser evidence is still not inferred without exact release evidence. |
| WS15 | Workplace / DMS / Contract / Collaboration | **CLEAN PR #377** | One net commit on snapshot main. Migrations `0105..0109`. Notification ACL separation, owner scoping, DMS/contract controls and evidence-backed OCR/signature states preserved. Backend/schema/auth approval required. |
| WS16 | Logistics / POS / Social Commerce | **CLEAN PR #310** | One net commit on snapshot main, exact `behind 0`. Logistics/POD/freight/loading, POS hardening and social-commerce canonical order/profile deltas preserved. No migration. Business-rule approval required. |
| WS17 | Alumdoor vertical | **MERGED** #316 | Vertical baseline plus later product-specific Alumdoor overlays on main. |

## Clean review queue

All seven non-UI convergence branches were replayed directly on snapshot main `57461b481a8b22c8ab687af3e3f40468a9880958`; no stale-main sync PR is required:

- WS09 — #362 — migration `0088`.
- WS01 — #367 — migrations `0089..0098`.
- WS06 — #372 — migrations `0099..0104`.
- WS15 — #377 — migrations `0105..0109`.
- WS05 — #380 — no tenant migration.
- WS02 — #321 — no tenant migration.
- WS16 — #310 — no tenant migration.

These PRs are intentionally **not merged or deployed** by convergence cleanup because they contain non-UI backend/schema/business-rule changes and require explicit approval.

## Final-head CI evidence

Evidence was queried after the last replay onto `57461b48`.

| PR | Final head | PR workflow runs | Combined commit statuses | Evidence state |
|---|---|---:|---:|---|
| #362 WS09 | `ff05c35313246419cc6df1463564523521782c24` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #367 WS01 | `e1e8a70a0122ffcbe5c13ff670d6805fefad681a` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #372 WS06 | `974fccf61e20bb74237d64f6aa98eb971a0cf45e` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #377 WS15 | `508ec596b90ec44b3c95225e6112b57375b16f95` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #380 WS05 | `7afb134e5f4cb45e40e96471c297240ce9228af4` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #321 WS02 | `7135633163609b16ff453e0bf915a1b3180d369e` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #310 WS16 | `1e202f86912ef5499c16cbc656e80824932822b4` | 0 | 0 | **NOT RUN / UNPROVEN** |

Committed tests remain useful regression source, but none of these final heads may be described as CI-green from current GitHub evidence.

## Migration convergence map

Current merged main remains occupied through the existing pre-convergence range (at least `0087`). The approval queue reserves:

- `0088` — WS09 App Factory revision history (#362).
- `0089..0098` — WS01 Finance/VN (#367).
- `0099..0104` — WS06 HCM/payroll (#372).
- `0105..0109` — WS15 Workplace/DMS (#377).

Reservation is coordination, not merge permission. Immediately before each approved merge, re-audit current main migration occupancy and renumber if another merged change has claimed the range.

## Remaining Dependency Requests

### DR-WS06-BIZ-001 — Employee Loan at separation

The repository does not establish one authoritative business policy for an outstanding Employee Loan when an employee separates. Valid models include acceleration into final settlement, continued receivable/recovery, approved restructuring or write-off. WS06 does not silently choose one.

### DR-WS05-BIZ-001 — Rework operating model

WS05 preserves NCR disposition and QMS/manufacturing controls without inventing whether rework must be a dedicated Work Order, Stock Entry path, operation loop or company-specific hybrid.

### DR-WS05-INT-002 — Subcontract / demand integration

Subcontract orchestration and demand-source policy remain cross-workstream integration boundaries. MRP/QMS baseline remains deterministic without duplicating Procurement/Inventory/Finance authorities.

### DR-WS15-001 — Scheduled collaboration/contract jobs

Periodic reminders, recurrence, retention/archive, contract expiry and obligation schedules require the shared scheduler/job boundary owned by platform/SRE workstreams.

### DR-WS15-002 — OCR / external signature providers

WS15 enforces evidence-backed success states but does not fabricate OCR or e-sign provider success. OCR/extraction remains an integration capability; provider credential/delivery/e-sign lifecycle remains WS10/WS11 territory.

### DR-WS14-EVIDENCE-001 — Generic runtime/release evidence

Merge state alone is not deployment proof. For generic WS14 slices not covered by a concrete production apply/release identity, browser/E2E and release evidence stays evidence-driven.

### DR-WS02-* — Shared CRM orchestration/provider projections

Atomic Lead conversion/reversible merge, provider messaging, Customer 360/funnel projections, Quotation→Sales Order orchestration and replayable sell-in projections remain shared-kernel/integration/runtime dependencies. #321 does not duplicate their authorities.

## Superseded PR cleanup completed

Closed/superseded examples include:

- WS03 stale/reverse-sync #342/#353, canonical merged #347.
- WS09 stale/reverse-sync #319/#356, canonical clean #362.
- WS01 stale/invalid/sync paths including #312/#349/#350, canonical clean #367.
- WS06 stale/sync #322/#355 and legacy Wave-1 #269, canonical clean #372.
- WS15 stale #314 and reverse-sync #357, canonical clean #377.
- WS05 stale #327 and reverse-sync #354, canonical clean #380.
- Temporary exact-main sync PRs that became zero-diff after tree replay were closed/no-longer-needed.

Stale source branches were **not deleted** during this pass.

## Legacy/parallel PRs intentionally not closed

A PR was not closed merely because it is old. Exact file audit found material independent deltas:

- **#278 accounting integrity hardening — KEEP / RECONCILE:** core accounting controllers, ledger company/branch scope, FX Journal Entry, purchase-receipt/stock-entry/delivery-note valuation/GL guards, reconciliation case and migrations are not represented by WS01 #367.
- **#286 TT99 localization hardening — KEEP / RECONCILE:** `TT99 Transition Map`, standalone `E-Invoice Document`, localization-specific integrity/update migrations and tests are not represented by WS01 #367.
- **#267 bulk Stock Reconciliation — KEEP:** independent WS04 maturity delta.
- **#201 manufacturing actual costing — KEEP:** independent costing/freeze/valuation work not proven absorbed by WS05 #380.
- **#208 Plastic ERP Production Run — KEEP:** separate vertical/domain delta.
- **#216 pricing matrix UI — KEEP:** separate UI/pricing delta relevant to later Matrix extraction work.
- **#295 Tiến Đạt purchase completion — KEEP:** separate procurement/accounting operational delta.
- **#199 Daily Detailed Ledger hardening — KEEP:** separate ledger hardening delta.

These are outside the WS00–17 branch-convergence cleanup and require their own exact-main reconciliation rather than ceremonial closure.

## Final approval boundary

Convergence and PR cleanup are complete at snapshot `57461b48`. Remaining work:

1. produce exact executable verification evidence for the seven final review heads;
2. resolve genuine business decisions where release scope requires them;
3. reconcile the explicitly retained parallel PRs against canonical workstreams;
4. approve and merge non-UI PRs in a migration-safe order;
5. deploy only after corresponding approval/release gates.

No convergence cleanup step merged the seven non-UI review PRs or performed their production deploys.
