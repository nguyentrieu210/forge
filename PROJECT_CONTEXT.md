# PROJECT CONTEXT

Ngày cập nhật: **2026-08-04**.

File này mô tả **kiến trúc và source-of-truth hiện hành**, không lưu branch/version/migration snapshot tạm thời. Exact GitHub/code/migration/test luôn thắng prose nếu có drift.

## 1. Product

Forge là enterprise operating platform/ERP đa tenant trên Cloudflare, gồm:

- **CloudForge** — authoritative backend/kernel, document lifecycle, permission, ledger, workflow, tenant/runtime infrastructure.
- **MetaForge** — React metadata-driven Desk/runtime/builder.
- **First-party domain apps/packages** — Finance/VN Accounting, HRM, CRM/Sales, Procurement, Stock/WMS, Manufacturing/QMS, Projects/Service, Workplace, Commerce và các domain khác.
- **Vertical apps** — Alumdoor là reference vertical; vertical phải compose shared authorities, không fork core.

Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
Capability denominator/status: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` + `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.

## 2. Current engineering checkpoint

RC4 integrated closure đã PASS và merge qua PR `#627` tại checkpoint `main@30346e08eabb7074f8623eeedae09efec25da072`.

Canonical maturity after RC4:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

Canonical evidence: `docs/agents/rc4/RC4_POST_INTEGRATION_FINAL.md`.

RC4 closure là engineering/evidence closure, không phải production certification của exact next release.

## 3. Backend authority

### Request/runtime

- Gateway resolves tenant and dispatches trusted identity to tenant/runtime workers.
- Tenant Worker owns authenticated API/runtime composition.
- Query/Jobs/Control Plane/Social Ingress workers provide bounded platform services where configured.

### Document writes

Authoritative business mutation flows through the Document Kernel / aggregate serialization path. Do not direct-write business documents/ledgers to bypass lifecycle, OCC, idempotency, permission or audit.

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
6. source edits should be required only when introducing/changing a capability contract, not for ordinary tenant composition.

Fine-grained capability-profile authoring/resolution is an R5 productization target; do not claim a completed GUI until exact implementation evidence exists.

## 6. Frontend authority

- Shared React runtime renders app surfaces from metadata/manifest contracts.
- Frappe-shaped adapter is the primary client/backend compatibility boundary.
- Server-side permission is authoritative; client visibility/editability is UX only.
- Shared views/shell/runtime should not contain vertical business schema when metadata/domain contracts can express it.
- Browser/mobile/PWA evidence must bind to exact source/release when used for maturity or production claims.

## 7. Alumdoor role

Alumdoor is the first reference vertical/pilot candidate. It should consume shared:

- Employee/HR directory primitives;
- Customer/CRM primitives;
- Sales/Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/AR/AP/Payment/GL;
- Warranty/Service.

Alumdoor-specific logic stays vertical only when genuinely industry-specific. Reusable behavior should move to domain/platform authority rather than be copied.

## 8. Security / tenant boundary

- Trusted tenant/user identity comes from server/runtime context, not arbitrary client fields.
- Role/DocPerm/owner/share/user-permission and sensitive security controls are enforced server-side.
- Authentication/session/revocation/provider credentials and security-sensitive operations follow canonical IAM contracts.
- No secret, production credential, private backup or customer data belongs in docs/source control.

## 9. Migration/release boundary

- Never rewrite a migration that may have been applied; add append-only migration under migration governance.
- Applied-state claims require target-environment inventory/checksum evidence.
- Merge != deploy.
- Production-ready claims require exact release SHA/hash plus the relevant provider/browser/recovery evidence.
- Production migration, backup restore/PITR, DNS/secrets/provider mutation and non-UI deployment require explicit authorization.

## 10. Current direction

Current sequence:

`RC4 DONE -> R5 integrated hardening/productization -> R6 production certification -> Alumdoor controlled pilot -> GA`

Active work is defined only in `NEXT_TASKS.md`. Documentation map/retention policy: `docs/README.md`.
