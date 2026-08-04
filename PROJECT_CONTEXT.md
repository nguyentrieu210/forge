# PROJECT CONTEXT

Ngày cập nhật: **2026-08-05**.

File này mô tả **kiến trúc và source-of-truth hiện hành**. Không dùng nó để lưu branch/CI snapshot tạm thời. Exact GitHub state, code, migration, tests và production evidence thắng prose khi có drift.

## 1. Product model

**Forge** là enterprise operating platform/ERP đa tenant trên Cloudflare.

Một platform gồm:

- shared platform kernel/runtime;
- ERP/domain packages: Finance/VN Accounting, HRM, CRM/Sales, Procurement, Stock/WMS, Manufacturing/QMS, Projects/Service, Workplace, Commerce và các domain khác;
- App Registry/App Factory + capability profile;
- shared metadata-driven client/runtime/builder;
- vertical apps, với **Alumdoor** là reference vertical đầu tiên.

`@metaforge/*`, `metaforge.api.*` và `cloudforge-*` là technical identifiers/compatibility namespaces đã tồn tại, không phải các umbrella product brand riêng. Naming authority: `docs/BRAND_AND_NAMING.md`.

Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
Capability denominator/status: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` + `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.

## 2. Current engineering/release checkpoint

- RC4: **DONE**.
- R5 integrated hardening/productization: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Pilot-00: **DONE / PILOT-00-LOCKED**.
- Pilot-01 control plane: **READY / PREVIEW-ONLY**.
- Pilot-01 real source batch: **PILOT-01-WAITING-SOURCE-BATCH**.
- Frozen certified pilot source: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- R6 certification matrix: **23/23 PASS**.

Canonical maturity distribution remains:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

R6/Pilot scope certification does not imply all 956 capabilities are Hardened/GA.

## 3. Runtime authority

### Request / tenant routing

- Gateway resolves trusted tenant routing from host/control-plane state.
- Tenant/runtime worker owns authenticated application/API composition.
- Query, Jobs, Control Plane, Social Ingress and other workers provide bounded platform services where configured.
- Exact `cloudforge-*` worker/resource names may remain as deployment identifiers until a dedicated migration proves a rename safe.

### Document/business writes

Authoritative business mutation flows through the Document Kernel / aggregate serialization path.

Do not direct-write business documents or ledgers to bypass:

- lifecycle/state transitions;
- OCC/version checks;
- idempotency;
- permission/tenant rules;
- audit/outbox;
- canonical side effects.

### Storage

- D1: authoritative tenant/query persistence under append-only migration governance.
- Durable Objects: serialization/coordination where required.
- Queues: outbox/background/retry/DLQ processing.
- R2: files/artifacts where configured.
- KV: routing/cache/config support, not authoritative ERP storage.

## 4. Domain source-of-truth rules

- **Finance:** canonical GL + Payment Ledger; no app/vertical shadow finance ledger.
- **Inventory:** canonical Stock Ledger/valuation/repost semantics; no Alumdoor-specific stock authority.
- **Payroll:** salary/payroll domain posts through canonical Finance authority.
- **CRM/Sales:** canonical customer/contact/opportunity/order authorities; Customer 360/read models do not become write authorities.
- **Procurement:** supplier/PO/receipt/invoice lineage consumes canonical Stock/Finance side effects.
- **Manufacturing:** BOM/Work Order/operations consume canonical Stock/Finance authorities.
- **Legal/statutory:** rules are effective-dated, versioned, source-bound and auditable; unsupported numeric claims fail closed.

## 5. App Registry / App Factory / capability profiles

Canonical lifecycle is server-authoritative.

Principles:

1. platform authority stays shared;
2. domain packages own reusable generic business behavior;
3. vertical apps/profiles compose capabilities;
4. capability activation is distinct from package installation;
5. disabling a capability does not uninstall a package or erase historical data;
6. ordinary tenant composition should not require source forks;
7. install/upgrade/profile state must remain versioned and auditable.

R5 completed the capability-profile productization path used by the current Alumdoor pilot. Do not repeat old prose that describes this as a future target.

## 6. Client/runtime authority

- Shared React runtime renders app surfaces from metadata/manifest contracts.
- Existing `@metaforge/*` packages are the technical namespace of the Forge client stack.
- Frappe-shaped API compatibility remains a boundary used by the client and interoperability tests; it is not the product identity.
- Server-side permission is authoritative; client permission is UX only.
- Shared runtime must not hard-code vertical business schema where metadata/domain contracts can express it.
- Browser/mobile/PWA evidence must bind to exact source/release when used for production/maturity claims.

## 7. Alumdoor role

Alumdoor is the first controlled-pilot/reference vertical.

It consumes shared:

- HR/Employee primitives;
- CRM/Customer/Sales;
- Procurement;
- Stock/WMS;
- Manufacturing/QMS;
- Finance/AR/AP/Payment/GL;
- Warranty/Service.

Industry-specific cut/order rules remain vertical. Reusable behavior moves down to domain/platform authority instead of being copied.

## 8. Current pilot boundary

Pilot-00 froze software/package/profile/data-mapping authority.

Pilot-01 has preview tooling/control-plane ready but is waiting for a real approved immutable customer/master/opening source batch. `PREVIEW_PASS` is required before Pilot-01 can become READY.

No Pilot-01 real production import/write has occurred.

Active sequence:

`R6 PILOT-GO -> Pilot-00 LOCKED -> Pilot-01 source PREVIEW_PASS -> Pilot-02 Dry Run -> Pilot-03 Parallel Run -> Pilot-04 Cutover Decision -> Pilot-05 Hypercare/Exit -> Accepted Production Reference -> GA`

Exact queue: `NEXT_TASKS.md`.

## 9. Security / tenant boundary

- Trusted tenant/user identity comes from server/runtime context, not arbitrary client fields.
- Role/DocPerm/owner/share/user-permission and sensitive controls are server-enforced.
- Authentication/session/revocation/provider credentials follow canonical IAM contracts.
- No secret, private backup or customer source data belongs in docs/source control.

## 10. Migration / release boundary

- Never rewrite an applied migration; add append-only migrations.
- Applied-state claims require environment/checksum evidence.
- Merge != deploy.
- Source/config presence != provider/live proof.
- Production claims require exact release SHA/hash and required browser/provider/recovery evidence.
- Production migration, restore/PITR, DNS/secrets/provider mutation, customer-data import/write, cutover and non-UI deploy require explicit authorization.

## 11. Documentation / brand authority

Read current state via:

1. `CURRENT_STATUS.md`;
2. `NEXT_TASKS.md`;
3. `docs/README.md`;
4. `docs/BRAND_AND_NAMING.md`;
5. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.

Historical CloudForge/MetaForge component snapshots do not override live Forge authority.
