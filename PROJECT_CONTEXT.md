# PROJECT CONTEXT

Ngày cập nhật: **2026-08-05**.

File này mô tả **kiến trúc và source-of-truth hiện hành**. Exact GitHub/code/migration/test luôn thắng prose nếu có drift. Live execution phase nằm trong `CURRENT_STATUS.md`, `NEXT_TASKS.md` và phase authority tương ứng.

## 1. Product identity

Forge là một **ERP / enterprise operating platform độc lập**, multi-tenant, metadata-driven và cloud-native trên Cloudflare.

Forge không phụ thuộc Frappe/ERPNext hoặc ERP bên thứ ba để làm runtime/source of truth. Các external framework/ERP chỉ có thể xuất hiện như benchmark, migration source, interoperability adapter hoặc regression/reference corpus.

Các lớp sản phẩm chính:

- **CloudForge** — authoritative backend/kernel, document lifecycle, permission, ledger, workflow, jobs, storage và tenant/runtime infrastructure.
- **MetaForge** — React metadata-driven workspace/runtime/builder.
- **First-party domain packages** — Finance/VN Accounting, HCM, CRM/Sales, Procurement, Stock/WMS, Manufacturing/QMS, Projects/Service, Workplace, Commerce và các domain khác.
- **Vertical apps** — Alumdoor là reference vertical; vertical compose shared authorities, không fork core.
- **Compatibility/migration surfaces** — các adapter/source connector mang tên external system nếu còn tồn tại; chúng không được trở thành architectural authority.

Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
Capability denominator/status: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` + `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.
Execution doctrine: `skills/forge-enterprise-completion/SKILL.md`.

## 2. Current verified phase

Forge đã hoàn tất:

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

Pilot-01 real source set has been observed/hashed/ingested. Current verdict is `PILOT-01-SOURCE-INGESTED-PREVIEW-BLOCKED`; active work is reconciliation + normalization toward a private real `PREVIEW_PASS` batch.

Portfolio maturity remains:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

This maturity distribution is a portfolio metric, not a reason to reopen a blanket foundation wave while the controlled-pilot gate is active.

## 3. Backend authority

### Request/runtime

- Gateway resolves tenant and dispatches trusted identity to tenant/runtime workers.
- Tenant Worker owns authenticated API/runtime composition.
- Query/Jobs/Control Plane/Social Ingress workers provide bounded platform services where configured.
- Forge-native business/runtime contracts are authoritative. Compatibility routes/adapters may translate external shapes but may not own business semantics.

### Document writes

Authoritative business mutation flows through the **Document Kernel / aggregate serialization path**. Do not direct-write business documents/ledgers to bypass lifecycle, OCC, idempotency, permission or audit.

### Storage

- D1 is the authoritative tenant/query persistence layer under append-only migration governance.
- Durable Objects serialize authoritative mutation where required.
- Queues support outbox/background/retry/DLQ contracts.
- R2 stores files/artifacts where used.
- KV is cache/routing/config support, not a substitute for business authority.

## 4. Domain source-of-truth rules

- **Finance:** canonical GL + Payment Ledger; no domain/vertical shadow ledger.
- **Inventory:** canonical Stock Ledger/valuation/repost semantics; no Alumdoor-specific inventory ledger.
- **Payroll:** Salary Structure/Assignment -> Salary Slip -> Payroll Entry -> canonical Finance posting.
- **CRM/Sales:** canonical customer/contact/opportunity/order document authorities; read models such as Customer 360 do not become write authorities.
- **Procurement:** supplier/PO/receipt/invoice lineage consumes canonical Stock/Finance side effects.
- **Manufacturing:** BOM/Work Order/operations consume canonical Stock and Finance authorities.
- **Legal/statutory:** effective-dated, versioned, source-bound, auditable rules; unsupported numeric legal claims fail closed.

## 5. App packaging / App Factory

Canonical app lifecycle lives in App Registry/App Factory contracts under `server/packages/app-registry/**` plus app compiler/install tooling.

Principles:

1. platform authority stays shared;
2. domain package owns generic business behavior;
3. vertical app/profile composes required domain capabilities;
4. capability activation is separate from package installation;
5. disabling a capability must not automatically uninstall a package or erase historical data;
6. source edits should be required only when introducing/changing a capability contract, not for ordinary tenant composition;
7. app/vertical extension must not redefine canonical Finance/Stock/Permission/Document authorities.

## 6. Frontend authority

- **MetaForge** is Forge's shared React metadata-driven runtime/builder.
- UI surfaces consume Forge-owned metadata, document, query, permission and action contracts.
- Server-side permission is authoritative; client visibility/editability is UX only.
- Shared views/shell/runtime should not contain vertical business schema when metadata/domain contracts can express it.
- Browser/mobile/PWA evidence must bind to exact source/release when used for maturity or production claims.
- Legacy/external-shaped adapters may remain for compatibility; they are translation boundaries only and must not dictate Forge's product model, naming, state machine or authoritative behavior.

## 7. External compatibility boundary

Forge may deliberately support external system shapes for migration/interoperability/backward compatibility.

Rules:

- compatibility is **optional/bounded**, not product identity;
- compatibility package names do not imply runtime dependency;
- translation occurs at edges;
- canonical validation, permission, lifecycle, idempotency and ledger semantics remain Forge-owned;
- new Forge capabilities should target Forge-native contracts first;
- external parity is a benchmark/interop concern, not an architecture constraint unless a current accepted contract explicitly requires it.

## 8. Alumdoor role

Alumdoor is the first reference vertical and controlled pilot. It consumes shared:

- Employee/HCM primitives;
- Customer/CRM primitives;
- Sales/Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/AR/AP/Payment/GL;
- Warranty/Service.

Alumdoor-specific logic stays vertical only when genuinely industry-specific. Reusable behavior moves to domain/platform authority rather than being copied.

## 9. Security / tenant boundary

- Trusted tenant/user identity comes from server/runtime context, not arbitrary client fields.
- Role/DocPerm/owner/share/user-permission and sensitive security controls are enforced server-side.
- Authentication/session/revocation/provider credentials and security-sensitive operations follow canonical IAM contracts.
- No secret, production credential, private backup or raw customer data belongs in docs/source control.

## 10. Migration/release boundary

- Never rewrite a migration that may have been applied; add append-only migration under migration governance.
- Applied-state claims require target-environment inventory/checksum evidence.
- Merge != deploy.
- Production-ready claims require exact release SHA/hash plus relevant provider/browser/recovery evidence.
- R6 historical PASS remains tied to its exact certified candidate.
- A later product-source change creates a new candidate; only affected evidence must rerun/relock according to the current evidence matrix/phase contract.
- Production migration, backup restore/PITR, DNS/secrets/provider mutation, customer-data mutation, cutover and unauthorized non-UI deployment remain explicit authorization boundaries.

## 11. Current execution doctrine

Forge is no longer driven by a static foundation/completion wave.

Before every task, resolve live phase from `CURRENT_STATUS.md`, `NEXT_TASKS.md` and the active phase authority.

Current sequence:

`RC4 DONE -> R5 DONE -> R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 reconcile/normalize -> Pilot-02 dry run -> Pilot-03 parallel run -> Pilot-04 cutover decision -> Pilot-05 hypercare/exit -> ACCEPTED_REFERENCE -> GA_EVOLUTION`

Default priority:

`current gate blocker -> correctness/regression -> pilot/operator usability -> evidence gap -> required reusable primitive -> post-gate hardening -> enterprise backlog`

North Star remains strategic direction. It does not override the current gate or reopen a closed certification program by itself.
