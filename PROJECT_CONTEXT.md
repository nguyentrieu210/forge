# FORGE ERP — PROJECT CONTEXT

Ngày cập nhật: **2026-08-05**.

File này mô tả kiến trúc và source-of-truth hiện hành của Forge ERP. Exact GitHub state, code, migration và tests luôn thắng prose nếu có drift. Live execution phase được xác định từ `CURRENT_STATUS.md`, `NEXT_TASKS.md` và phase authority đang active.

## 1. Product

**Forge ERP** là enterprise resource planning và operating platform multi-tenant, metadata-driven, cloud-native trên Cloudflare.

Sản phẩm được tổ chức thành các lớp chính:

- **CloudForge** — authoritative backend/kernel, document lifecycle, permission, workflow, ledgers, jobs, storage và tenant/runtime infrastructure.
- **MetaForge** — React metadata-driven workspace/runtime/builder.
- **First-party domain packages** — Finance/VN Accounting, HCM, CRM/Sales, Procurement, Stock/WMS, Manufacturing/QMS, Projects/Service, Workplace, Commerce và các capability doanh nghiệp khác.
- **Vertical applications** — các ứng dụng ngành compose shared authorities và chỉ sở hữu logic đặc thù ngành.
- **Integration & migration services** — các boundary phục vụ nhập dữ liệu, tích hợp hệ thống và chuyển đổi vận hành mà không thay đổi authoritative business model.

Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.  
Capability denominator/status: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` + `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.  
Execution doctrine: `skills/forge-enterprise-completion/SKILL.md`.

## 2. Current verified phase

Forge ERP đã hoàn tất:

- RC4 integrated closure — **DONE**;
- R5 hardening/productization — **DONE / R5-GO**;
- R6 Production Certification — **DONE / PILOT-GO**;
- Pilot-00 — **DONE / PILOT-00-LOCKED**.

Certified/deployed R6 baseline:

- source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`;
- UI bundle hash: `838218167db020d8`;
- Alumdoor `2.2.3`;
- HRM `1.8.0`;
- VN Accounting `1.6.1`;
- capability profile `alumdoor-pilot@1`.

Current phase: **CONTROLLED_PILOT**.

Pilot-01 đã ingest source thực và đang reconcile + normalize master/opening data để đạt một private `PREVIEW_PASS` batch theo contract.

Portfolio maturity hiện hành:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

Portfolio maturity là thước đo độ phủ sản phẩm, không thay thế current gate hoặc release/pilot evidence.

## 3. Backend authority

### Request/runtime

- Gateway resolve tenant và dispatch trusted identity tới tenant/runtime workers.
- Tenant Worker sở hữu authenticated API/runtime composition.
- Query, Jobs, Control Plane và Social Ingress workers cung cấp các bounded platform services theo deployment contract.
- Business/runtime contracts của Forge ERP là authoritative source cho lifecycle, permission, state transition và domain behavior.

### Document writes

Authoritative business mutation đi qua **Document Kernel / aggregate serialization path**. Không direct-write business documents hoặc ledgers để bypass lifecycle, OCC, idempotency, permission hoặc audit.

### Storage

- D1 là authoritative tenant/query persistence layer dưới append-only migration governance.
- Durable Objects serialize authoritative mutation khi cần.
- Queues hỗ trợ outbox, background jobs, retry và DLQ.
- R2 lưu files/artifacts/backups theo configured role.
- KV phục vụ cache/routing/config support, không thay thế business authority.

## 4. Domain source-of-truth

- **Finance:** canonical GL + Payment Ledger.
- **Inventory:** canonical Stock Ledger, valuation và repost semantics.
- **Payroll:** Salary Structure/Assignment -> Salary Slip -> Payroll Entry -> canonical Finance posting.
- **CRM/Sales:** canonical customer/contact/opportunity/order document authorities.
- **Procurement:** supplier/PO/receipt/invoice lineage gắn với canonical Stock/Finance side effects.
- **Manufacturing:** BOM/Work Order/operations sử dụng canonical Stock và Finance authorities.
- **Legal/statutory:** effective-dated, versioned, source-bound và auditable rules.

Read models, dashboards và vertical projections không được trở thành write authority thứ hai.

## 5. App packaging / App Factory

Canonical app lifecycle nằm trong App Registry/App Factory contracts tại `server/packages/app-registry/**` cùng app compiler/install tooling.

Principles:

1. platform authority được giữ shared;
2. domain package sở hữu generic business behavior;
3. vertical app/profile compose các capability cần thiết;
4. capability activation tách khỏi package installation;
5. disable capability không tự động xóa package hoặc historical data;
6. source edits chỉ cần khi thay đổi capability contract;
7. app/vertical extension không được định nghĩa lại canonical Finance, Stock, Permission hoặc Document authorities.

## 6. Frontend authority

- **MetaForge** là shared React metadata-driven runtime/builder của Forge ERP.
- UI surfaces consume Forge metadata, document, query, permission và action contracts.
- Server-side permission là authoritative; client visibility/editability chỉ phục vụ UX.
- Shared views/shell/runtime không hard-code vertical business schema khi metadata/domain contracts có thể diễn đạt.
- Browser/mobile/PWA evidence phải bind tới exact source/release khi dùng cho maturity hoặc production claims.

## 7. Integration & migration boundary

Forge ERP hỗ trợ integration, import và migration thông qua bounded adapters/services.

Rules:

- translation diễn ra ở integration edge;
- canonical validation, permission, lifecycle, idempotency và ledger semantics luôn do Forge ERP sở hữu;
- imported data phải qua normalization, mapping, validation và reconciliation phù hợp;
- integration contract không được tạo duplicate source of truth;
- production import/write vẫn tuân theo explicit authorization boundary của phase hiện hành.

## 8. Alumdoor role

Alumdoor là reference vertical và controlled pilot đầu tiên. Alumdoor consume shared:

- Employee/HCM primitives;
- Customer/CRM primitives;
- Sales/Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/AR/AP/Payment/GL;
- Warranty/Service.

Logic đặc thù cửa nhôm ở vertical layer; reusable behavior được nâng về domain/platform authority.

## 9. Security / tenant boundary

- Trusted tenant/user identity đến từ server/runtime context.
- Role/DocPerm/owner/share/user-permission và security-sensitive controls được enforce server-side.
- Authentication/session/revocation/provider credentials theo canonical IAM contracts.
- Secrets, production credentials, private backups và raw customer data không được lưu trong docs/source control.

## 10. Migration / release boundary

- Không rewrite migration có khả năng đã được apply; thêm append-only migration.
- Applied-state claims cần environment/checksum evidence.
- Merge != deploy.
- Production-ready claims cần exact release SHA/hash cùng provider/browser/recovery evidence phù hợp.
- R6 historical PASS giữ nguyên theo exact certified candidate.
- Product-source change tạo candidate mới và rerun/relock affected evidence theo current evidence matrix/phase contract.
- Production migration, restore/PITR, DNS/secrets/provider mutation, customer-data mutation, cutover và non-UI production deployment là explicit authorization boundaries.

## 11. Current execution doctrine

Forge ERP được điều hành theo live phase thay vì static completion wave.

Trước mọi task, resolve current phase từ `CURRENT_STATUS.md`, `NEXT_TASKS.md` và active phase authority.

Current sequence:

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 reconcile/normalize -> Pilot-02 dry run -> Pilot-03 parallel run -> Pilot-04 cutover decision -> Pilot-05 hypercare/exit -> ACCEPTED_REFERENCE -> GA_EVOLUTION`

Default priority:

`current gate blocker -> correctness/regression -> pilot/operator usability -> evidence gap -> required reusable primitive -> post-gate hardening -> enterprise backlog`

North Star giữ vai trò strategic direction; current gate và exact evidence quyết định execution priority.
