# FORGE ENTERPRISE NORTH STAR

> **Strategic completion target, not live status.**
>
> Live state: `../CURRENT_STATUS.md`  
> Active queue: `../NEXT_TASKS.md`  
> Execution skill: `../skills/forge-enterprise-completion/SKILL.md`  
> Detailed capability checklist: `FORGE_ENTERPRISE_CAPABILITY_MAP.md`

Ngày khởi tạo: **2026-08-03**.

## 1. Tuyên ngôn sản phẩm

Forge phải tiến từ một ERP engine/meta-runtime thành **enterprise operating platform cho doanh nghiệp**, với bốn lớp:

1. **Platform kernel** mạnh, an toàn, multi-tenant, metadata-driven.
2. **ERP/HCM/CRM core** đủ sâu để vận hành doanh nghiệp thật.
3. **Vietnam compliance + ecosystem** đủ để cạnh tranh tại Việt Nam.
4. **App Factory + AI + vertical apps** đủ để tạo lợi thế mà ERP generic khó bắt chước.

Đích không phải clone MISA hoặc ERPNext. Benchmark được dùng để tránh tự đánh giá quá cao:

- ERPNext/Frappe đại diện cho generic ERP depth, extensibility và long-tail transaction behavior.
- MISA AMIS đại diện cho Vietnam compliance, HR/local operations, digital office và productization.
- Forge phải đạt đủ độ sâu của ERP core nhưng vượt ở **verticalization speed, Cloudflare SaaS economics, metadata/app factory và AI-assisted operations**.

## 2. Điều kiện để gọi Forge là “hoàn thiện”

Không dùng số lượng màn hình làm thước đo.

Forge chỉ đạt mục tiêu khi đồng thời có:

- quy trình xuyên phòng ban chạy end-to-end;
- source of truth rõ ràng;
- transaction correction/cancel/reversal;
- permission và tenant isolation cưỡng chế phía server;
- accounting/stock/payroll reconciliation;
- migration/import/onboarding khách hàng;
- report/BI để kiểm soát nghiệp vụ;
- legal rule có version/source/effective date;
- mobile/offline cho actor ngoài hiện trường khi cần;
- integration ecosystem;
- backup/restore/release/observability;
- App Factory tạo được app mà không fork runtime;
- AI hoạt động trên semantic/context/tool layer có permission và approval.

## 3. Maturity target theo lớp

| Layer | Nội dung | Target |
|---|---|---:|
| L0 Platform | Kernel, metadata, permission, security, SaaS, app factory, integration, SRE | **95%+ Hardened/RC** |
| L1 ERP Core | Finance, sales, purchase, inventory, HR, assets, projects | **90%+ business-complete** |
| L2 Enterprise Depth | WMS, MRP II, QMS, treasury, consolidation, service, BI | **75–85%+** |
| L3 Vertical | Alumdoor và ngành mục tiêu | **95% nghiệp vụ ngành được chọn** |

Không cần làm mọi ngành. Cần làm platform đủ tốt để ngành mới có thể đóng gói nhanh.

## 4. 12 trụ chiến lược

### NS-01 — Full Finance + Vietnam Compliance Engine

Phải bao phủ:

- General Ledger, Journal Entry, fiscal periods, opening/closing.
- AR/AP, aging, advance, allocation, reconciliation, write-off.
- Cash/bank/treasury, bank statement, auto-match, payment batch, cash flow.
- Budget, commitment, budget vs actual, rolling forecast.
- Cost center, project accounting, branch accounting, management accounting.
- Multi-currency, FX gain/loss, revaluation.
- Intercompany, elimination, consolidation.
- Revenue recognition và deferred revenue nếu market yêu cầu.
- Fixed asset accounting tích hợp lifecycle tài sản.
- VAT, CIT/TNDN, PIT/TNCN, BHXH/BHYT/BHTN.
- Statutory financial statements.
- E-invoice, digital signature, legal filing integrations.
- Legal rule engine: source, effective date, version, hash, approval, deterministic regression.

Đây là trụ ưu tiên số 1 vì financial correctness là ranh giới giữa “ERP dùng thử” và “ERP doanh nghiệp”.

### NS-02 — CRM / Revenue 360

Bao phủ toàn bộ vòng đời:

`Lead -> Account/Contact -> Opportunity -> Activity -> Quotation -> Order -> Delivery -> Invoice -> Payment -> Service/Renewal`

Năng lực:

- Customer 360.
- Pipeline, probability, stage, forecast.
- Calls, emails, meetings, follow-ups.
- Territory, sales team, target, commission.
- Campaign, source attribution, segmentation.
- Lead scoring và duplicate detection.
- Pricing, promotion, discount approval.
- Loyalty, contract, subscription, recurring billing.
- Distributor/dealer/field-sales support khi ngành yêu cầu.
- AI summary, next-best-action, email draft và opportunity risk với dữ liệu có quyền.

### NS-03 — Procurement 360 / Source-to-Pay

Flow chuẩn:

`Purchase Request -> RFQ -> Supplier Quotations -> Comparison -> Approval -> PO -> Receipt -> QC -> Invoice -> Payment`

Năng lực:

- Approved supplier list.
- Supplier onboarding/evaluation/rating.
- Blanket order/contract purchasing.
- Price history.
- Three-way match PO/Receipt/Invoice.
- Purchase variance.
- Landed cost.
- Delivery schedule.
- Supplier portal.
- Procurement budget và analytics.
- Supplier debt/provisional liability/hold/offset khi domain cần.

### NS-04 — Inventory + WMS

Core inventory:

- Item/variant/UOM.
- Warehouse hierarchy.
- Stock entry/transfer/reconciliation.
- Batch/serial/expiry.
- Reservation.
- FIFO/Moving Average/standard cost theo scope.
- Landed cost và valuation adjustment.
- Backdated transaction/repost semantics.

WMS:

- zone/bin/rack.
- putaway.
- picking/wave picking.
- packing.
- replenishment.
- cycle count.
- barcode/QR/mobile scanner.
- stock aging, ABC, slow/dead stock.
- safety stock/min-max/reorder/forecast.

Mọi valuation path phải đối soát được với financial posting khi tích hợp accounting.

### NS-05 — MRP II + QMS

Manufacturing generic phải vượt mức “có BOM/Work Order”.

MRP II:

- BOM multi-level/version/effective date.
- alternate/substitute/phantom BOM.
- routing/operation/workstation.
- demand forecast/MRP/material planning.
- finite capacity planning/scheduling.
- Work Order/Job Card/WIP.
- material issue/transfer/FG receipt.
- scrap/rework/subcontracting.
- downtime/labor/machine utilization.
- standard vs actual manufacturing cost và variance.
- lot genealogy và full traceability.

QMS:

- quality plan/template.
- incoming/in-process/final inspection.
- sampling.
- NCR/non-conformance.
- root cause.
- CAPA.
- supplier quality/customer complaint.
- calibration.
- quality KPI.

Vertical Alumdoor phải dùng các primitive generic khi có thể và chỉ giữ logic cửa/nhôm đặc thù ở app layer.

### NS-06 — Full HCM + Statutory Payroll VN

Organization/workforce:

- company/branch/department/designation.
- manpower/headcount planning.
- org chart và position planning.

Talent acquisition:

- job opening/applicant/interview/scorecard/offer.
- candidate pool/CV parsing/career portal.

Employee lifecycle:

- employee/contract/onboarding/transfer/promotion/discipline/separation.
- personnel documents và expiry/renewal.

Time:

- leave/policy/allocation.
- shift/roster/check-in/attendance.
- geofence/mobile attendance.
- overtime/time rules.

Payroll:

- salary structure/assignment.
- additional salary.
- payroll period/slip/entry.
- benefits/loan/advance/expense.
- deterministic PIT/BHXH and legal versioning.
- bank salary transfer and payroll accounting.

Performance/talent:

- KPI/OKR.
- appraisal/360 review.
- competency.
- training/LMS/certificate.
- succession/talent pool.
- employee self-service/mobile.

### NS-07 — Project + Service + Field Service

Project/PSA:

- portfolio/project/WBS/task/dependency/Gantt/milestone.
- resource/capacity planning.
- timesheet/expense/procurement/inventory by project.
- project budget/cost/billing/profitability/cash flow.
- earned value/change order/acceptance where relevant.

Helpdesk/service:

- ticket/queue/assignment/SLA/escalation.
- email/chat-to-ticket.
- knowledge base/canned response/customer portal.
- warranty/service/maintenance contract.
- CSAT.

Field service:

- service order.
- technician schedule/dispatch.
- map/route/GPS.
- offline mobile.
- spare parts/checklist/photo/signature.
- service report/billing.

### NS-08 — BI Semantic Layer + Planning

Không để mỗi module tự dựng dashboard rời rạc.

Cần:

- trusted metric definitions.
- dimensions/measures.
- permission-aware semantic layer.
- operational dashboard.
- KPI cards.
- chart/pivot/report builder.
- drill-down/drill-through.
- scheduled/subscribed reports.
- Excel/PDF.
- forecast/scenario planning.
- executive cockpit.
- data warehouse/BI feed khi scale cần.

AI query dữ liệu doanh nghiệp phải đi qua semantic/query layer thay vì tự đoán schema raw.

### NS-09 — BPM + Low-code App Factory

Đây là moat chính.

BPM:

- visual workflow builder.
- sequential/parallel approval.
- approval matrix.
- conditions.
- delegation/escalation/SLA/timer.
- event/scheduled trigger.
- webhook/external action.
- process analytics/bottleneck.

App Factory:

- DocType/Field/Child Table builder.
- Form/List builder.
- Workflow/Rule/Formula builder.
- Action builder.
- Report/Dashboard builder.
- Print builder.
- Role/Permission builder.
- manifest/dependency/versioning.
- install/upgrade/rollback.
- app marketplace/catalog.

Goal: app nghiệp vụ mới chủ yếu là metadata + domain rules + integrations, không fork runtime.

### NS-10 — Integration Hub + Ecosystem

Platform capabilities:

- REST/API key/OAuth/service account.
- webhooks/event subscriptions.
- connector SDK.
- mapping/transformation.
- queue/retry/dead-letter/idempotency.
- import/export APIs.

Vietnam/business connectors ưu tiên:

- banks.
- e-invoice.
- tax.
- BHXH.
- payment gateways.
- shipping.
- e-sign.
- email/SMS/Zalo.
- Facebook/social.
- Shopee/Lazada/TikTok Shop.
- Google Workspace/Microsoft 365.

### NS-11 — Enterprise Security + SaaS Control Plane + SRE

Security/governance:

- RBAC/record/field/owner/share/user permissions.
- approval authority/segregation of duties.
- MFA.
- OIDC/SAML/SSO.
- SCIM/user lifecycle.
- session/device/IP policy.
- immutable audit.
- PII classification/masking/retention/consent.
- security alerting.

SaaS control plane:

- tenant provisioning.
- domain/subdomain.
- plan/subscription/billing/usage/quota.
- feature flags/module enablement.
- app install/upgrade/rollback.
- tenant migration.
- backup/restore/suspend/delete.
- audited support access/impersonation.

SRE:

- health/metrics/logs/traces.
- alerting/error tracking.
- queue monitoring/recovery.
- integrity/reconciliation jobs.
- backup/PITR/DR.
- release/rollback.
- migration verification.
- load/performance testing.
- rate limit/abuse protection.

### NS-12 — Migration + Implementation + Customer Success

Không có migration thì không có đường lấy khách từ hệ thống cũ.

Migration:

- Excel/CSV import wizard.
- field mapping.
- validation/preview.
- duplicate handling.
- opening balances.
- incremental migration.
- post-migration reconciliation.
- adapters: MISA/ERPNext/Odoo/FAST/Bravo/legacy SQL theo demand.

Implementation:

- setup wizard.
- company/accounting/HR/warehouse setup.
- guided tour.
- implementation checklist.
- go-live checklist.
- seed/demo data.
- training/help center/knowledge base.
- support workflow.
- adoption analytics.

## 5. Capability families bổ sung bắt buộc

Ngoài 12 trụ, các family sau phải được xem là cross-cutting, không để “lọt giữa module”:

### Digital Workplace

- personal/team tasks.
- Kanban/calendar/meeting/minutes.
- internal request/announcement/news.
- employee directory/discussion.
- approval inbox/reminder/delegation.
- recurring work/work report.

### Document & Contract Management

- folders/file manager.
- metadata/version/OCR/full-text search.
- approval/access/retention/archive/expiry.
- templates/e-sign.
- customer/supplier/employee/service contracts.
- obligations/renewal/amendment/SLA/value.

### Communications & Collaboration

- comments/mentions/assign/follow/watch/share.
- timeline/attachments/tags/checklists.
- in-app/email/SMS/Zalo/push/web-push.
- digest/reminder/escalation/template/delivery log.

### Mobile & Offline

- responsive PWA/installability.
- offline read/write queue.
- sync/conflict resolution.
- camera/barcode/GPS/signature.
- push/background sync.

### Search & Command Surface

- global/full-text/fuzzy search.
- recent/favorites/saved search.
- permission-aware search.
- command palette.
- AI search.

### Master Data Management

- ownership/approval/effective dating.
- duplicate detection/merge.
- master quality and references.
- canonical company/branch/department/warehouse/item/customer/supplier/employee/account/cost center/project/UOM/currency/tax/address/contact.

### Data Governance

- catalog/lineage.
- data quality rules.
- reconciliation.
- history/snapshot.
- archive/export.
- BI feed/change data capture where justified.

### Internationalization

- language/translation.
- locale/timezone.
- currency/exchange.
- fiscal calendars.
- country tax/chart/statutory packs.

## 6. Industry packs

Platform không cần tự làm mọi ngành một lúc. Chỉ mở vertical khi có nhu cầu thị trường/khách hàng.

Vertical candidates:

- Aluminum/doors/manufacturing — Alumdoor là reference vertical đầu tiên.
- Distribution.
- Retail/F&B.
- Construction.
- Logistics.
- Agriculture.
- Professional services.
- Maintenance services.
- Hospitality.
- Education.
- Real estate.
- Automotive.
- Healthcare nếu compliance cho phép và có chuyên gia domain.

Rule:

> Vertical phải tái sử dụng platform/generic ERP càng nhiều càng tốt; phần đặc thù phải đóng gói độc lập và không làm bẩn core.

## 7. Execution waves

### Wave A — ERP Core 90%

1. Finance/AR/AP/Cash/Bank.
2. VN compliance foundation.
3. CRM core.
4. Source-to-Pay.
5. Inventory/WMS core.
6. Manufacturing/MRP core.
7. HCM/payroll core.

Exit criteria:
- các flow core có correction/cancel/report/permission;
- accounting/stock/payroll có reconciliation;
- end-to-end demo không phụ thuộc mock.

### Wave B — Enterprise Depth

1. Treasury/Budget/Consolidation.
2. QMS/CMMS/EAM.
3. Projects/PSA.
4. Helpdesk/Field Service.
5. Logistics/distribution.
6. Contracts/DMS/Digital Workplace.

### Wave C — Platform Moat

1. App Factory builders.
2. BPM/rule engine.
3. BI semantic layer.
4. AI with tool/approval model.
5. Integration SDK/event platform.

### Wave D — Vietnam Ecosystem

1. E-invoice.
2. Bank/payment.
3. Tax/BHXH.
4. E-sign.
5. Zalo/social/marketplace/shipping/payment connectors.

### Wave E — Vertical Scale

Đóng 1 ngành tới 95% trước khi mở quá nhiều ngành song song.

## 8. Completion scorecard

Khi đo coverage, không dùng “có module = 100%”.

Mỗi domain chấm theo 10 tiêu chí, mỗi tiêu chí 0–2:

1. Core happy path.
2. Exception/correction path.
3. Permission/tenant isolation.
4. Authoritative accounting/stock/data integrity.
5. Reports/analytics.
6. Import/migration.
7. Integration.
8. UI/mobile usability.
9. Tests/evidence.
10. Operational hardening.

Điểm domain:

- 0–4: Missing/Foundation.
- 5–9: Foundation/Wired.
- 10–14: Wired.
- 15–17: RC.
- 18–20: Hardened trong scope.

Không dùng scorecard thay thế review chuyên môn cho statutory/security/finance.

## 9. Definition of Enterprise Complete

Forge đạt “Enterprise Complete v1” khi:

- L0 Platform >= 95% target capability.
- L1 ERP Core >= 90%.
- L2 Enterprise Depth >= 80% ở domain cam kết bán.
- Vietnam statutory pack đủ cho customer segment mục tiêu và có legal regression/source evidence.
- Ít nhất một vertical pack đạt >=95% nghiệp vụ ngành mục tiêu.
- Migration từ ít nhất Excel + một ERP phổ biến có reconciliation.
- Backup/restore/release/rollback có evidence.
- Security/tenant isolation có regression.
- App Factory có thể tạo một app nghiệp vụ chuẩn mà không sửa runtime core.
- AI có thể đọc/đề xuất/thực thi tool có approval mà không vượt permission.

## 10. Điều không được làm

- Không tạo 700 màn hình rỗng để tăng “coverage”.
- Không fork core cho từng khách hàng.
- Không nhét rule kế toán/pháp lý vào prompt AI.
- Không hard-code business schema vào generic runtime nếu metadata giải quyết được.
- Không tự nhận parity chỉ vì tên DocType giống ERPNext/MISA.
- Không sửa dữ liệu lịch sử tài chính/stock/payroll lặng lẽ.
- Không làm vertical mới nếu platform primitive cần thiết vẫn đang lặp lại ở nhiều app.
- Không deploy production ngoài policy vận hành hiện hành.

## 11. North Star cuối cùng

Forge không cần thắng cuộc thi “ai có nhiều menu nhất”.

Forge cần trở thành nền mà một doanh nghiệp có thể:

1. vận hành tài chính, bán hàng, mua hàng, kho, sản xuất, nhân sự và dịch vụ;
2. tin được số liệu cuối kỳ;
3. đáp ứng quy định Việt Nam;
4. tích hợp hệ sinh thái ngoài;
5. tự tạo workflow/report/app mới;
6. triển khai tenant mới nhanh;
7. tạo vertical app sâu mà không fork core;
8. dùng AI như lớp điều phối thông minh trên dữ liệu và tool có kiểm soát.

Khi tám điều này cùng đúng, Forge mới thực sự chuyển từ “ERP tự build” thành **enterprise operating system**.