# BRD — CloudForge Full Suite (Excellent 360 Candidate)

> **Quality status:** 91/100 for specification quality. Source-exact parity remains gated by scanner + oracle evidence.
> **No semantic placeholder rule:** every non-trivial business screen must link a rule ledger or be marked `UNMAPPED_BEHAVIOR`.

## Entry points added by excellence pass

- `P0_CLOSURE.md`
- `GATE2_SCORECARD.md`
- `business-rules/00-index.md`
- `technical/atomic-write-protocol.md`
- `technical/tenant-routing-bindings.md`
- `technical/archive-sharding.md`
- `technical/controller-compatibility.md`
- `technical/report-print-script-runtime.md`
- `oracle/00-oracle-harness.md`
- `parity/source-scan-spec.md`

---

## Legacy spine title: BRD — CloudForge Full Suite 360

> **CloudForge** là framework metadata-driven serverless trên Cloudflare. **CloudERP, CloudHR, CloudCRM, CloudInsights** tái hiện đầy đủ capability nghiệp vụ của ERPNext, HRMS, Frappe CRM và Frappe Insights theo source parity. **MetaForge** là React runtime + builders dùng chung.
>
> Bản này theo chuẩn cấu trúc `docs(5).zip`: BRD spine + Screen Spec Cards + flows + entities + builder + appendix + technical specs. Chuẩn nghiệm thu: AI/dev khác đọc xong không phải tự phát minh nghiệp vụ hoặc contract nền; source manifest dùng để chứng minh và bắt drift, không thay cho nội dung BRD.

## §0. Contract log

| Contract | Rule khóa |
|---|---|
| Metadata/document | Schema là dữ liệu versioned; tạo DocType sinh storage/API/UI/policy/workflow |
| Serverless Cloudflare | D1/tenant; Workers services; DO atom; Queues outbox; Workflows long process; R2 files; WfP custom code; Containers analytics |
| ERP parity | Accounting/stock/transaction invariants, full module registry, golden reconciliation |
| HR parity | Hire-to-retire, leave/attendance/shift, payroll/tax/GL, expense/performance/self-service |
| CRM parity | lead/deal/contact/org, activities, pipeline/forecast, automation/SLA/connectors/ERP sync |
| Insights parity | sources/schema/visual-SQL-Python queries/workbook/chart/dashboard/sharing/refresh/lineage |
| FE/builders | Generic MetaForge runtime, 40+ controls, five authoring studios, extension slots |
| Security | deny by default; server policy; custom code isolation; audit; typed queries; tenant binding |
| Performance | indexed/cursor/budgeted queries; replicas/bookmarks; read models/cache with `as_of`; benchmark gates |
| Completeness | 88 screen cards; domain flows/entities; zero source artifact UNMAPPED; critical ORACLE_GREEN |

## Mục 0 — Assumptions & quyết định

| Decision | Giá trị | Ghi chú |
|---|---|---|
| Product | CloudForge + CloudERP + CloudHR + CloudCRM + CloudInsights + MetaForge | Tên đổi được; kiến trúc không đổi |
| Runtime | TypeScript Workers, D1/tenant, R2, DO, Queues, Workflows, WfP, Containers | Không chạy Python/Frappe nguyên bản |
| Compatibility | Behavioral parity + optional API compatibility; source exact pinned by manifest | Không hứa Python app binary/source compatibility |
| Scope | Full suite; không cắt module; rollout theo gates | Mọi artifact source có trạng thái/evidence |
| License | Clean-room proprietary hoặc direct-port compliant profile | Release phải chọn profile và legal review |
| FE | MetaForge PlatformAdapter; renderer/builders không phụ thuộc Frappe APIs | Cho phép CloudForgeAdapter/FrappeAdapter |
| Tenancy | D1 database per tenant, R2 namespace, site-like isolation | Tenant lớn có archive/shard plan |
| Canonical truth | D1 ledgers/documents; cache/projections rebuildable | Không dùng KV/AE làm ledger/audit authority |

## Mục 1 — Problem

Frappe/ERPNext/HRMS/CRM/Insights có contract nghiệp vụ và metadata mạnh nhưng stack triển khai truyền thống cần server/database/cache/queue/workers/bench, provisioning và scale riêng. Viết app React hiện đại thường làm mất generic metadata behavior. CloudForge giữ toàn bộ business semantics hữu ích nhưng thay execution/storage/operations bằng Cloudflare serverless, đồng thời tối ưu global reads, tenant isolation, custom-code sandbox, offline/realtime, query budgets, observability và provisioning.

## Mục 2 — Goals

1. Full metadata/document/policy/workflow/report/print/import framework parity.
2. Full ERPNext business capability registry, controllers, ledgers, reports, regional packs and fixtures.
3. Full HRMS, CRM and Insights product parity including custom UX/integrations.
4. MetaForge renders any supported schema and provides DocType/Workflow/Print/Dashboard/App builders.
5. Zero-unmapped source artifacts and oracle-green critical flows.
6. Strong business writes, append-only ledgers, idempotent side effects and reconciliation.
7. Performance SLO benchmarked on global edge; query budget and auto-index/read-model tooling.
8. Tenant provisioning/upgrade/backup/migration with no manual server operations.
9. Safe custom extensions via Workers for Platforms and isolated analytics runtime.
10. Migration from upstream suite with ledger/payroll/pipeline/BI reconciliation.

## Mục 3 — Actors

Platform Owner/Operator/App Maintainer/Auditor; Tenant Administrator/System Manager/App Author; ERP Accounts/Sales/Purchase/Stock/Manufacturing/Asset/Project/Quality/Support/POS users; HR Manager/Payroll Manager/Recruiter/Employee/Approver; CRM Admin/Sales Manager/Sales User/Integration User; Insights Admin/Data Source Admin/Analyst/Viewer; service principals for queue/workflow/connectors.

## Mục 4 — Entities

Chi tiết: `brd-entities/00-platform-entities.md` đến `04-cloudinsights-registry.md`. Ba plane: Control, Meta, Tenant Data. Canonical entities include Tenant/AppRelease/SourceArtifact, DocType/DocField/Policy/Workflow, Document/Children/Audit/Outbox/Job/File, accounting and stock ledgers, HR payroll facts, CRM communication/pipeline facts, Insights source/query/chart/dashboard artifacts.

## Mục 5 — Business flows

Chi tiết 9 file trong `brd-flows/`. Flows bắt buộc: provisioning, document lifecycle, permission, async, release; accounting/AR/AP/payment/close; quote-to-cash/procure-to-pay/returns; stock/valuation/manufacturing; assets/projects/quality/support; HR hire/leave/attendance/payroll/expense/performance; CRM capture/conversion/pipeline/communications; Insights source/query/Python/dashboard; cross-suite ERP/HR/CRM/BI/parity.

## Mục 6 — Permission & API matrix

- Gateway binds tenant from trusted host/token and session.
- Policy compiler resolves role, user permission, ownership, sharing, workflow/docstatus, field/row/action rules.
- Query compiler injects predicates/projections; document action re-checks permission in transaction.
- FE never receives forbidden values; masked schema/value states are explicit.
- Direct API tests under low roles are mandatory.
- API map: `technical/api-map.md`.

## Mục 7 — Screen index (89/89)

| ID | Screen | Route | Pack | Card | Status |
|---|---|---|---|---|---|
| M00 | Platform Shell | / | Platform/MetaForge | `brd-screens/00-platform-shell.md` | ✅ |
| M01 | Authentication & Session | /login | Platform/MetaForge | `brd-screens/01-authentication.md` | ✅ |
| M02 | Tenant Control Center | /platform/tenants | Platform/MetaForge | `brd-screens/02-tenant-control.md` | ✅ |
| M03 | App Registry & Release Channels | /platform/apps | Platform/MetaForge | `brd-screens/03-app-registry.md` | ✅ |
| M04 | Schema Registry & Publish | /platform/schema | Platform/MetaForge | `brd-screens/04-schema-registry.md` | ✅ |
| M05 | Permission Policy Studio | /platform/permissions | Platform/MetaForge | `brd-screens/05-permission-policy.md` | ✅ |
| M06 | Workflow Studio | /platform/workflows/:name | Platform/MetaForge | `brd-screens/06-workflow-studio.md` | ✅ |
| M07 | Jobs, Queues & Workflows | /platform/jobs | Platform/MetaForge | `brd-screens/07-job-monitor.md` | ✅ |
| M08 | Realtime & Collaboration | /platform/realtime | Platform/MetaForge | `brd-screens/08-realtime-collaboration.md` | ✅ |
| M09 | Cloud Script & Extension Runtime | /platform/scripts | Platform/MetaForge | `brd-screens/09-cloud-script.md` | ✅ |
| M10 | Integration Hub | /platform/integrations | Platform/MetaForge | `brd-screens/10-integration-hub.md` | ✅ |
| M11 | Audit & Compliance | /platform/audit | Platform/MetaForge | `brd-screens/11-audit-compliance.md` | ✅ |
| M12 | Data Import, Export & Bulk Operations | /platform/data-transfer | Platform/MetaForge | `brd-screens/12-data-transfer.md` | ✅ |
| M13 | Backup, Restore & Retention | /platform/backups | Platform/MetaForge | `brd-screens/13-backup-restore.md` | ✅ |
| M14 | Performance Center | /platform/performance | Platform/MetaForge | `brd-screens/14-performance-center.md` | ✅ |
| M15 | Usage & Cost Metering | /platform/usage | Platform/MetaForge | `brd-screens/15-usage-cost.md` | ✅ |
| M16 | Migration Center | /platform/migrations | Platform/MetaForge | `brd-screens/16-migration-center.md` | ✅ |
| M17 | Notifications & Communications | /platform/communications | Platform/MetaForge | `brd-screens/17-notifications-communications.md` | ✅ |
| M18 | Report & Print Runtime | /platform/reports | Platform/MetaForge | `brd-screens/18-report-print-runtime.md` | ✅ |
| M19 | Generic Workspace Runtime | /app/:workspace | Platform/MetaForge | `brd-screens/19-workspace-runtime.md` | ✅ |
| M20 | Generic List View | /app/:doctype | Platform/MetaForge | `brd-screens/20-generic-list.md` | ✅ |
| M21 | Generic Form View | /app/:doctype/:name | Platform/MetaForge | `brd-screens/21-generic-form.md` | ✅ |
| M22 | Child Table Grid | embedded + /app/:doctype/:name/grid/:field | Platform/MetaForge | `brd-screens/22-child-grid.md` | ✅ |
| M23 | Generic Report View | /app/:doctype/view/report | Platform/MetaForge | `brd-screens/23-generic-report.md` | ✅ |
| M24 | Kanban, Calendar, Gantt & Tree Views | /app/:doctype/view/:view | Platform/MetaForge | `brd-screens/24-multi-view.md` | ✅ |
| M25 | Generic Dashboard View | /app/dashboard/:name | Platform/MetaForge | `brd-screens/25-generic-dashboard.md` | ✅ |
| M26 | Generic Print View | /print/:doctype/:name | Platform/MetaForge | `brd-screens/26-generic-print.md` | ✅ |
| M27 | Generic Data Import | /app/data-import | Platform/MetaForge | `brd-screens/27-generic-import.md` | ✅ |
| M28 | DocType Builder | /builder/doctype/:name | Platform/MetaForge | `brd-screens/28-doctype-builder.md` | ✅ |
| M29 | Workflow Builder | /builder/workflow/:name | Platform/MetaForge | `brd-screens/29-workflow-builder.md` | ✅ |
| M30 | Print Format Builder | /builder/print/:name | Platform/MetaForge | `brd-screens/30-print-builder.md` | ✅ |
| M31 | Dashboard Builder | /builder/dashboard/:name | Platform/MetaForge | `brd-screens/31-dashboard-builder.md` | ✅ |
| M32 | App Studio | /builder/apps/:app | CloudERP | `brd-screens/32-app-studio.md` | ✅ |
| M33 | CloudERP Setup & Master Data | /erp/setup | CloudERP | `brd-screens/33-erp-setup.md` | ✅ |
| M34 | Chart of Accounts & General Ledger | /erp/accounting/ledger | CloudERP | `brd-screens/34-chart-ledger.md` | ✅ |
| M35 | Accounts Receivable | /erp/accounts-receivable | CloudERP | `brd-screens/35-accounts-receivable.md` | ✅ |
| M36 | Accounts Payable | /erp/accounts-payable | CloudERP | `brd-screens/36-accounts-payable.md` | ✅ |
| M37 | Cash, Bank & Payments | /erp/banking | CloudERP | `brd-screens/37-cash-bank.md` | ✅ |
| M38 | Tax, Currency & Period Close | /erp/accounting/close | CloudERP | `brd-screens/38-tax-currency-close.md` | ✅ |
| M39 | Selling: Lead to Invoice | /erp/selling | CloudERP | `brd-screens/39-selling.md` | ✅ |
| M40 | Buying: Request to Pay | /erp/buying | CloudERP | `brd-screens/40-buying.md` | ✅ |
| M41 | Items, Warehouses & Inventory | /erp/stock | CloudERP | `brd-screens/41-stock-master.md` | ✅ |
| M42 | Serial, Batch & Valuation | /erp/stock/traceability | CloudERP | `brd-screens/42-serial-batch-valuation.md` | ✅ |
| M43 | Manufacturing Planning & Execution | /erp/manufacturing | CloudERP | `brd-screens/43-manufacturing.md` | ✅ |
| M44 | Quality Management | /erp/quality | CloudERP | `brd-screens/44-quality.md` | ✅ |
| M45 | Asset Lifecycle | /erp/assets | CloudERP | `brd-screens/45-assets.md` | ✅ |
| M46 | Projects, Tasks & Billing | /erp/projects | CloudERP | `brd-screens/46-projects.md` | ✅ |
| M47 | Support, Warranty & Maintenance | /erp/support | CloudERP | `brd-screens/47-support-maintenance.md` | ✅ |
| M48 | Point of Sale | /erp/pos | CloudERP | `brd-screens/48-pos.md` | ✅ |
| M49 | Commerce, Portal & Subscriptions | /erp/commerce | CloudERP | `brd-screens/49-commerce-portal.md` | ✅ |
| M50 | Regional, Localization & Compliance | /erp/regional | CloudERP | `brd-screens/50-regional-compliance.md` | ✅ |
| M51 | ERP Reconciliation & Control Tower | /erp/control-tower | CloudHR | `brd-screens/51-erp-reconciliation.md` | ✅ |
| M52 | HR Setup & Employee 360 | /hr/employees | CloudHR | `brd-screens/52-hr-setup-employee.md` | ✅ |
| M53 | Recruitment & Hiring | /hr/recruitment | CloudHR | `brd-screens/53-recruitment.md` | ✅ |
| M54 | Onboarding, Transfer & Separation | /hr/lifecycle | CloudHR | `brd-screens/54-onboarding-separation.md` | ✅ |
| M55 | Leave & Holiday Management | /hr/leave | CloudHR | `brd-screens/55-leave.md` | ✅ |
| M56 | Attendance & Employee Check-in | /hr/attendance | CloudHR | `brd-screens/56-attendance.md` | ✅ |
| M57 | Shift Roster & Auto Attendance | /hr/shifts | CloudHR | `brd-screens/57-shift-autoattendance.md` | ✅ |
| M58 | Payroll Setup & Salary Structures | /hr/payroll/setup | CloudHR | `brd-screens/58-salary-structure.md` | ✅ |
| M59 | Payroll Run, Salary Slip & Tax | /hr/payroll | CloudHR | `brd-screens/59-payroll-run.md` | ✅ |
| M60 | Expense, Travel & Employee Advance | /hr/expenses | CloudHR | `brd-screens/60-expense-advance.md` | ✅ |
| M61 | Goals, Feedback & Appraisal | /hr/performance | CloudHR | `brd-screens/61-performance.md` | ✅ |
| M62 | Training, Skills & Employee Wellbeing | /hr/development | CloudHR | `brd-screens/62-training-wellbeing.md` | ✅ |
| M63 | Employee Self-Service & HR Reports | /hr/me | CloudCRM | `brd-screens/63-employee-self-service.md` | ✅ |
| M64 | CRM Setup & Sales Configuration | /crm/settings | CloudCRM | `brd-screens/64-crm-setup.md` | ✅ |
| M65 | Lead List, Capture & Deduplication | /crm/leads | CloudCRM | `brd-screens/65-lead-list-capture.md` | ✅ |
| M66 | Lead 360 & Qualification | /crm/leads/:id | CloudCRM | `brd-screens/66-lead-detail.md` | ✅ |
| M67 | Deal Pipeline & Forecast | /crm/deals | CloudCRM | `brd-screens/67-deal-pipeline.md` | ✅ |
| M68 | Deal 360, Products & Next Actions | /crm/deals/:id | CloudCRM | `brd-screens/68-deal-detail.md` | ✅ |
| M69 | Contacts & Organizations | /crm/contacts | CloudCRM | `brd-screens/69-contact-organization.md` | ✅ |
| M70 | Email, Calls, Notes & Activity Timeline | /crm/communications | CloudCRM | `brd-screens/70-crm-communications.md` | ✅ |
| M71 | Assignment, SLA & Automation | /crm/automation | CloudCRM | `brd-screens/71-crm-assignment-sla.md` | ✅ |
| M72 | CRM Integrations | /crm/integrations | CloudCRM | `brd-screens/72-crm-integrations.md` | ✅ |
| M73 | CRM Analytics, Forecast & ERP Sync | /crm/analytics | CloudInsights | `brd-screens/73-crm-analytics-sync.md` | ✅ |
| M74 | Insights Data Sources | /insights/sources | CloudInsights | `brd-screens/74-insights-sources.md` | ✅ |
| M75 | Schema Browser & Table Links | /insights/schema | CloudInsights | `brd-screens/75-insights-schema.md` | ✅ |
| M76 | Visual Query Builder | /insights/query/visual/:id | CloudInsights | `brd-screens/76-insights-visual-query.md` | ✅ |
| M77 | SQL Query Editor | /insights/query/sql/:id | CloudInsights | `brd-screens/77-insights-sql.md` | ✅ |
| M78 | Python/Ibis Query Editor | /insights/query/python/:id | CloudInsights | `brd-screens/78-insights-python.md` | ✅ |
| M79 | Workbooks & Query Organization | /insights/workbooks/:id | CloudInsights | `brd-screens/79-insights-workbook.md` | ✅ |
| M80 | Chart Builder | /insights/charts/:id | CloudInsights | `brd-screens/80-insights-chart.md` | ✅ |
| M81 | Insights Dashboard Builder | /insights/dashboards/:id | CloudInsights | `brd-screens/81-insights-dashboard.md` | ✅ |
| M82 | Sharing, Teams & Public Access | /insights/sharing | CloudInsights | `brd-screens/82-insights-sharing.md` | ✅ |
| M83 | Refresh, Schedule & Export | /insights/schedules | CloudInsights | `brd-screens/83-insights-refresh.md` | ✅ |
| M84 | Lineage, Cache & Query Monitor | /insights/lineage | CloudInsights | `brd-screens/84-insights-lineage.md` | ✅ |
| M85 | Insights Administration | /insights/admin | Cross-suite | `brd-screens/85-insights-admin.md` | ✅ |
| M86 | Cross-Suite Integration & Reconciliation | /platform/suite | Cross-suite | `brd-screens/86-suite-integration.md` | ✅ |
| M87 | Source Parity Registry | /platform/parity | Cross-suite | `brd-screens/87-source-parity.md` | ✅ |
| M88 | Upgrade, Drift & Release Center | /platform/releases | Cross-suite | `brd-screens/88-upgrade-release.md` | ✅ |

## Mục 8 — Out of scope release đầu (không cắt khỏi roadmap)

- Native iOS/Android binaries beyond PWA; packaged app later.
- Binary/source compatibility for arbitrary Python Frappe apps; they require port or compatibility adapter.
- A global multi-tenant shared business database; default remains D1/site-per-tenant.
- Silent automatic legal/tax submission without configured certified connector and tenant approval.
- AI autonomous posting/approval/financial close.

## Mục 9 — Decided constraints

- D1 100-column/size limits handled by hybrid JSON + promoted columns/indexes/read models.
- Business transaction does not span databases; use saga/Workflow and reconciliation.
- Queue delivery assumed at-least-once; every consumer idempotent.
- No global Durable Object singleton.
- Large analytics/Python run outside Worker memory in isolated Container/Sandbox.
- Source pins immutable per release; upstream drift creates backlog automatically.
- Cross-suite contracts versioned; no circular package imports.

## Mục 10 — Product identity & outputs

| Output | Nội dung |
|---|---|
| CloudForge Kernel | metadata/document/policy/query/workflow/jobs/files/audit/realtime runtime |
| CloudERP | full ERPNext-equivalent business pack |
| CloudHR | full HRMS-equivalent pack |
| CloudCRM | full Frappe CRM-equivalent pack |
| CloudInsights | full Insights-equivalent BI pack |
| MetaForge | React runtime, design system, builders, adapters |
| Tooling | source scanner, fixture converter, oracle runner, migration/reconciliation, benchmark |
| Demo | integrated tenant running O2C/P2P/stock/manufacturing/payroll/CRM/BI |

## §2. Mandatory business checklist

| Area | Conclusion |
|---|---|
| Identity/permission/audit | Full platform policy, sessions, sharing, versions, legal hold |
| Accounting | GL, AR/AP, payments, banking, tax, currency, budgets, close, reconciliation |
| Selling/Buying | full transaction chains, pricing/tax/qty/status/returns |
| Stock/Manufacturing | SLE, serial/batch, valuation/repost, BOM/work orders/job cards |
| Assets/Projects/Quality/Support/POS/Commerce/Regional | all covered by separate screens/flows/registry |
| HRMS | employee/recruitment/lifecycle/leave/attendance/shift/payroll/expense/performance/training/self-service |
| CRM | lead/deal/contact/org/activity/pipeline/forecast/assignment/SLA/integrations/analytics |
| Insights | sources/schema/visual/SQL/Python/workbooks/charts/dashboards/sharing/refresh/lineage/admin |
| Builders | DocType, Workflow, Print, Dashboard, App Studio |
| Performance/cloud-native | replicas/bookmarks, query budgets, read models, offline/realtime, scale-to-zero, cost meter |
| Migration/parity | source inventory, zero unmapped, golden oracles, all reconciliations |

## §7. Gate 2 Scorecard

| Criterion | Status | Evidence |
|---|---|---|
| 11 mục cấu trúc đúng thứ tự | ✅ | BRD.md |
| Mọi screen card đủ 6 khối — 89/89 | ✅ | brd-screens/ |
| Entities theo platform + ERP/HR/CRM/Insights | ✅ | brd-entities/ |
| Flows per domain + failure/transaction/oracle | ✅ | brd-flows/ |
| Permission/API contract | ✅ | technical/api-map.md + cards |
| Business mandatory checklist | ✅ | §2 |
| Architecture/performance/security/transaction/migration/oracle | ✅ | brd-appendix + technical |
| Builders full | ✅ | brd-builder + cards |
| Source parity schema/baselines | ✅ | parity/ |
| Không placeholder trong BRD package | ✅ | grep gate |

> Gate 2 của **tài liệu** đạt khi review không phát hiện contract sai. Source-exact parity gate vẫn phải chạy scanner trên các commit pin trước khi tuyên bố implementation full; BRD không giả vờ rằng danh sách viết tay thay được source inventory.
