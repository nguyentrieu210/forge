# PROJECT CONTEXT

Ngày cập nhật: **2026-08-16**.

File này mô tả các authority và invariant ổn định của Forge. Nó không phải release manifest và không được dùng thay exact GitHub/code/migration/test state.

## Product

Forge là enterprise operating platform/ERP đa tenant trên Cloudflare, gồm:

- **CloudForge** — authoritative backend/kernel, document lifecycle, permission, ledger, workflow và tenant/runtime infrastructure.
- **MetaForge** — React metadata-driven Desk/runtime/builder.
- **Shared domain packages** — ERP/HCM/CRM/Sales/Procurement/Stock/Manufacturing/Finance và platform services.
- **Vertical apps** — Alumdoor là reference vertical và phải compose shared authorities thay vì fork core.

## Authority model

### Business writes

Authoritative mutation đi qua Document Kernel / aggregate serialization path. Không direct-write business documents, ledger hoặc lifecycle state để bypass OCC, idempotency, permission, workflow hay audit.

### Storage/runtime

- D1: tenant/query persistence dưới migration governance.
- Durable Objects: serialize authoritative aggregate mutation khi cần.
- Queues: outbox/background/retry/DLQ contracts.
- R2: file/artifact storage theo binding hiện hành.
- KV/config/routing stores: support plane, không thay business authority.

### Domain authorities

- Finance: canonical GL + Payment Ledger.
- Inventory: canonical Stock Ledger/valuation/reservation authority.
- Sales/pricing: shared server-side commercial authority; client totals không phải source of truth.
- Payroll: shared HCM/payroll path và Finance posting; vertical không tạo payroll ledger riêng.
- Manufacturing: BOM/Work Order/operations consume shared Stock/Finance authorities.
- Permission: tenant/role/DocPerm/owner/share/user-permission được enforce server-side.

## Frontend

MetaForge runtime dùng shared packages dưới `client/packages/**`. `adapter-frappe` là compatibility boundary tới Frappe-shaped API. Shared `core`, `controls`, `views`, `shell`, `ui`, `builder` không nên chứa schema/logic vertical nếu metadata/domain contract có thể biểu đạt.

## App/vertical composition

App Registry/App Factory và manifest/brief contracts quyết định lifecycle/capability composition. Platform authority ở shared layer; domain behavior ở domain package; vertical chỉ giữ behavior thực sự đặc thù ngành.

## Migration/release

- Migration đã có khả năng applied là append-only.
- Merge != deploy.
- Production-ready claim phải gắn exact release identity và evidence phù hợp.
- Production migration, restore/PITR, secrets/DNS/provider mutation và customer-data mutation là explicit authorization boundaries.

## Navigation

- Repo/ownership: `SENTRUX_MAP.md`.
- Canonical architecture: `docs/ARCHITECTURE.md`.
- Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
- Capability model: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` và `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.
- Agent policy: `skills/forge-enterprise-completion/SKILL.md`.
