# FORGE SKILL MATRIX

> **Canonical task-recipe map for humans and agents.**
>
> Strategic target: `FORGE_ENTERPRISE_NORTH_STAR.md`  
> Live state: `../CURRENT_STATUS.md`  
> Active queue: `../NEXT_TASKS.md`  
> Master operating doctrine: `../skills/forge-enterprise-completion/SKILL.md`

Ngày tạo: **2026-08-05**.

## 1. Mục đích

Forge không được phụ thuộc vào việc một agent “nhớ repo” hoặc tự đoán đường dẫn, package, DocType, migration, test hay release gate.

Skill Matrix định nghĩa lớp **task recipe** nằm dưới `forge-enterprise-completion`:

```text
User intent
   -> phase/truth resolver
   -> business/process/capability resolver
   -> authority owner
   -> exact repository surface
   -> smallest complete change
   -> validation/evidence
   -> authorized mutation boundary
```

North Star trả lời **Forge phải trở thành gì**. Master Skill trả lời **phải vận hành theo doctrine nào**. Skill Matrix trả lời **với một loại task cụ thể, agent phải đi đâu và làm gì**.

Không dùng Skill Matrix để thay thế exact GitHub/code truth. Nếu matrix drift với code, exact code + current phase authority thắng và matrix phải được sửa.

## 2. Nguyên tắc thiết kế Skill

1. **Một master doctrine, nhiều task recipe.** Không nhân bản truth hierarchy, release doctrine hoặc source-of-truth rules vào từng skill.
2. **Recipe phải chỉ được exact owner/path.** Không ghi kiểu “sửa backend” nếu repo đã có owner cụ thể.
3. **Metadata first.** App/customer mới ưu tiên brief -> manifest -> App Registry; không fork runtime.
4. **One business fact -> one authoritative owner.** Read model/UI/report có thể nhiều, write authority chỉ một.
5. **Package != capability.** Package lifecycle và capability activation là hai contract khác nhau.
6. **Tenant config != product source.** Customer-specific data/config không được hard-code vào shared code.
7. **Preview != production authorization.** Dry-run/compile/validate không tự cấp quyền import/deploy/cutover.
8. **Fail closed.** Unknown owner, missing dependency, permission gap, migration ambiguity hoặc evidence gap phải chặn claim hoàn tất.
9. **Idempotent by default.** Re-run provisioning/install/profile/bootstrap không tạo duplicate/churn vô nghĩa.
10. **Skill không được tạo authority mới chỉ để hoàn thành task nhanh.**

## 3. Status vocabulary

| Status | Nghĩa |
|---|---|
| `EXISTING_MASTER` | Skill đang tồn tại và là doctrine gốc. |
| `REQUIRED` | Skill task-recipe cần materialize thành `skills/<slug>/SKILL.md`. |
| `PHASE_RECIPE` | Skill chỉ dùng khi phase/gate tương ứng active. |
| `SPECIALIST` | Skill chuyên cho authority có blast radius cao. |

Việc một skill được đánh dấu `REQUIRED` **không có nghĩa current pilot phải dừng để tạo skill đó**. Current gate vẫn thắng theo master doctrine.

## 4. Canonical repository routing map

| Nhu cầu | Canonical surface | Quy tắc |
|---|---|---|
| Resolve live phase | `CURRENT_STATUS.md`, `NEXT_TASKS.md`, active `docs/pilot/**`/release authority | Đọc trước khi quyết định task. |
| Master doctrine | `skills/forge-enterprise-completion/SKILL.md` | Không copy doctrine sang recipe khác. |
| App brief | `server/briefs/<app>.json` | Nguồn mô tả ngắn khi app có thể compile từ metadata. |
| Brief compiler | `server/scripts/lib/compile-brief.mjs` | Brief -> package; không viết manifest dài bằng tay nếu compiler diễn đạt được. |
| App manifest contract | `server/packages/app-registry/src/manifest.ts` | Authority về package shape, DocType ownership, externalDocTypes, custom fields, nav/actions/screens/reports. |
| App install lifecycle | `server/packages/app-registry/src/installer.ts` | Install/upgrade/ownership/idempotency; không tạo installer thứ hai. |
| Capability profile | `server/packages/app-registry/src/capability-profile*.ts` | Package installed != capability enabled. |
| Generic backend behavior | `server/packages/<domain-owner>/**` | Generic invariant thuộc domain/platform owner, không thuộc vertical. |
| Vertical behavior | `server/apps-src/<app>-worker/**` | Chỉ logic thật sự ngành/app-specific; gọi public Forge surfaces. |
| Tenant schema migration | `server/migrations/tenant/**` | Append-only; không rewrite applied migration. |
| Generic client/runtime | `client/packages/**` | Chỉ sửa khi thiếu reusable runtime primitive; metadata trước React hard-code. |
| Product regression | `server/tests/**` và test package-owner tương ứng | Test theo authoritative behavior, fail closed. |
| Pilot contract/evidence | `docs/pilot/**` | Real data/cutover theo active pilot authority. |
| Release/certification | `docs/agents/r6/**`, `deploy-evidence/**` và phase-equivalent authority | Exact identity; old PASS không biến thành FAIL vì commit mới. |
| Customer raw data/secrets | **Không lưu trong Git** | Dùng private controlled source/secret/provider boundary. |

## 5. Full Skill Matrix

| ID | Skill | Status | Trigger chính | Authority/paths phải đọc | Output bắt buộc | Gate chính |
|---|---|---|---|---|---|---|
| S00 | `forge-enterprise-completion` | `EXISTING_MASTER` | Mọi task Forge | `CURRENT_STATUS.md`, `NEXT_TASKS.md`, phase authority, exact GitHub/code | phase, risk, release impact, owner, evidence scope | Truth hierarchy + mutation boundary |
| S01 | `forge-task-router` | `REQUIRED` | Yêu cầu tự nhiên chưa chỉ rõ layer | S00 + authority map + capability map | task class + skill chain + dependency requests | Không được đoán owner khi có registry/code authority |
| S02 | `forge-business-model-resolution` | `REQUIRED` | Khách/app/vertical mới | capability map, domain docs, existing vertical contracts | actors, processes, capabilities, data, rules, gaps | Không mở app mới nếu existing capabilities đủ |
| S03 | `forge-process-resolution` | `REQUIRED` | “bán hàng”, “mua hàng”, “sản xuất”, “bảo hành”… | domain authority + Golden Flows | canonical E2E process incl. correction/cancel | Process phải kết thúc ở canonical side effect/readback |
| S04 | `forge-authority-resolution` | `REQUIRED` | Cần tạo/sửa data object hoặc business rule | `PROJECT_CONTEXT.md`, owner package, manifest contract | owner: platform/domain/app/vertical/tenant-config | One fact -> one write authority |
| S05 | `forge-capability-composition` | `REQUIRED` | Chọn module/app cho tenant | App Registry + capability-profile authority | package set, dependency closure, capability profile, blocked reasons | Package/capability resolution fail closed |
| S06 | `forge-customer-provisioning` | `REQUIRED` | “Tạo khách/tenant mới” | S02-S05 + control plane + App Registry | reproducible provisioning plan + dry-run + acceptance plan | No product code if existing packages/profile suffice |
| S07 | `forge-tenant-bootstrap` | `REQUIRED` | Tenant mới hoặc setup company | tenant/control-plane + canonical masters | company/branch/fiscal/currency/CoA/cost center/warehouse/UOM/tax/price-list/series setup plan | Idempotent; customer config stays outside shared source |
| S08 | `forge-persona-access` | `REQUIRED` | User/role/persona/approval scope | auth/IAM, DocPerm, owner/share/user-permission, app roles | persona -> role -> record/field/action scope + approval authority | Server-side permission only |
| S09 | `forge-app-authoring` | `REQUIRED` | Capability app/vertical mới | `server/briefs/**`, compiler, `manifest.ts`, App Registry | brief/package, dependencies, surfaces, tests | Metadata-first; Worker only if metadata insufficient |
| S10 | `forge-doctype-authoring` | `REQUIRED` | Cần DocType/field/table mới | `manifest.ts`, frappe-model contracts, owner package | reuse vs custom_field vs new DocType decision + schema contract | Không duplicate canonical Customer/Item/Employee/etc. |
| S11 | `forge-workflow-permission-authoring` | `REQUIRED` | Workflow/approval/action mới | workflow metadata + permission contracts | states/transitions/docstatus/roles/actions/failure path | Workflow không được thay backend authority |
| S12 | `forge-worker-authoring` | `REQUIRED` | App behavior không biểu đạt bằng metadata | `server/apps-src/**`, public app Worker contract, owner APIs | namespaced methods, preview/commit split, auth propagation, idempotency | Không import private server internals hoặc direct D1 authority |
| S13 | `forge-report-print-screen-authoring` | `REQUIRED` | Report/chart/print/action/screen | manifest + MetaForge generic runtime | metadata surfaces tied to permission-aware data paths | Không tạo React screen riêng nếu manifest surface đủ |
| S14 | `forge-vertical-boundary` | `SPECIALIST` | Ngành mới/vertical-specific behavior | North Star industry rule + reference vertical contract | generic vs vertical decomposition + dependency map | No shadow GL/Stock/CRM/HCM authority |
| S15 | `forge-money-ledger-change` | `SPECIALIST` | Finance/payment/valuation/cost/payroll posting | canonical ledger packages + invariants + tests | fixed-point/decimal semantics, posting, correction/reversal, reconciliation | `CRITICAL`; no silent history rewrite |
| S16 | `forge-stock-manufacturing-change` | `SPECIALIST` | Stock valuation/reservation/BOM/WO/WIP | Stock/Manufacturing authority + reconciliation tests | quantity/UOM/valuation/repost/correction contract | Canonical Stock Ledger only |
| S17 | `forge-statutory-change` | `SPECIALIST` | PIT/BHXH/VAT/CIT/e-invoice/legal rule | legal source + effective-dated rule authority | source, effective date, version, hash, approval, deterministic fixtures | `CRITICAL`; no prompt/hard-code-only legal truth |
| S18 | `forge-integration-authoring` | `REQUIRED` | Bank/e-invoice/Zalo/provider/webhook/API | integration hub/provider owner + queues/secrets contracts | connector/mapping/retry/idempotency/credential boundary | Secrets external; provider mutation requires authorization |
| S19 | `forge-data-onboarding` | `REQUIRED` | Import master/opening data | migration/import boundary + customer mapping contract | source digest -> mapping -> normalization -> preview -> reconcile plan | Preview is not write authorization |
| S20 | `forge-migration-reconciliation` | `SPECIALIST` | Schema/data migration/opening balances | `server/migrations/**`, migration governance, domain reconciliation | append-only migration + replay/checksum + before/after reconciliation | `CRITICAL`; applied migrations immutable |
| S21 | `forge-ui-safe-change` | `REQUIRED` | Layout/copy/style/responsive/UI composition | MetaForge/client owner + current release identity | FAST/behavioral classification + visual/build evidence | UI-only must not mutate business contract; deployed pilot UI may need relock |
| S22 | `forge-security-tenant-change` | `SPECIALIST` | Auth/session/tenant/permission/security | IAM/kernel/gateway trusted context + isolation tests | threat/invariant map + fail-closed regression | `CRITICAL`; never trust client tenant/role claims |
| S23 | `forge-release-identity` | `REQUIRED` | Source/package/profile/deploy/release change | exact commit, workflows, R6/phase evidence matrix | old baseline vs new candidate, identity diff, affected evidence | Merge != deploy; historical certification remains historical truth |
| S24 | `forge-pilot-operations` | `PHASE_RECIPE` | Pilot-00..05 | `docs/pilot/**`, frozen identity, business acceptance | gate-specific preview/dry-run/reconcile/cutover/hypercare evidence | No real write/cutover outside explicit authority |
| S25 | `forge-acceptance-certification` | `REQUIRED` | Claim “xong/ready/go-live” | tests, Golden Flows, reconciliation, release evidence | machine-readable acceptance matrix + gaps | Screen count/test count alone never equals complete |
| S26 | `forge-sre-operability` | `REQUIRED` | Deploy/queue/backup/recovery/observability | SRE/release docs + provider evidence | health/log/metric/trace/queue/recovery/rollback evidence | Provider/source presence != observed state |
| S27 | `forge-customer-lifecycle` | `REQUIRED` | Upgrade/add-disable capability/suspend/archive tenant | App Registry + control plane + data governance | lifecycle plan preserving package/data/history semantics | Disable != uninstall/purge; destructive operation explicit |
| S28 | `forge-ai-tool-safety` | `REQUIRED` | AI reads/actions over enterprise data | semantic layer + permission + tool approval contracts | context/tool/approval boundary + audit behavior | AI never bypasses permission or becomes source of truth |

## 6. Skill chaining rules

### 6.1 New customer

Default chain:

```text
S00 phase resolve
 -> S01 task route
 -> S02 business model
 -> S03 processes
 -> S04 authority
 -> S05 capability/package composition
 -> S06 customer provisioning
 -> S07 tenant bootstrap
 -> S08 persona/access
 -> S19 data onboarding (if data exists)
 -> S18 integrations (if required)
 -> S25 acceptance
 -> S23 release identity only if product source/artifact changed
```

Call S09-S14 only when gap resolution proves new app/schema/worker/vertical behavior is required.

### 6.2 New app/vertical

```text
S00 -> S02 -> S03 -> S04 -> S14
 -> S05 existing capability reuse
 -> S09 app authoring
 -> S10 DocType only for app-owned facts
 -> S11 workflow/permission
 -> S12 Worker only for non-metadata behavior
 -> S13 surfaces
 -> S25 acceptance
 -> S23 candidate/release impact
```

### 6.3 Critical authority change

Finance/stock/statutory/security/migration changes must route through their specialist skill and cannot be downgraded because the diff is small.

## 7. Customer provisioning decision matrix

| Situation | Product source change? | Correct action | Forbidden shortcut |
|---|---:|---|---|
| New tenant, existing vertical/profile fits | Usually **No** | Provision tenant, install existing packages, apply profile, bootstrap masters/users, validate | Clone vertical/app for customer |
| New tenant, existing generic capabilities fit | Usually **No** | Compose packages/profile + tenant config | Install every package by default |
| Existing DocType needs customer/vertical field | Maybe app metadata | `custom_fields` from owning extension app when appropriate | Create `CustomerXYZ`/`ItemXYZ` duplicate master |
| App links to shared DocType | App metadata | `externalDocTypes` + package dependency | Copy shared DocType into app |
| New industry-specific fact | Yes, app package | App-owned DocType in brief/package | Put vertical schema in generic runtime |
| New generic invariant reusable across industries | Yes, domain package | Implement in canonical domain owner, then consume from vertical | Keep generic behavior in first vertical that needed it |
| Metadata can render form/list/report/action/screen | Usually metadata only | Brief/manifest surface | Hand-written shared React route |
| App needs complex industry calculation/integration | Yes, bounded Worker | `server/apps-src/<app>-worker/**`, public Forge APIs | Direct tenant D1/ledger writes |
| Existing connector fits | Tenant/provider config | Configure connector/secret externally | Copy provider code into vertical |
| Legacy/opening data exists | No product change unless adapter gap | Normalize -> preview -> reconcile -> authorized import | Raw direct DB import |
| Customer policy changes approval | Usually metadata/config | Workflow/role/profile policy | Hard-code customer name in controller |

## 8. DocType ownership resolver

Before creating any DocType, run this order:

```text
Does canonical DocType/field already express the fact?
  YES -> reuse.
  NO  -> Can existing owner be extended declaratively?
           YES -> custom field / metadata extension under an owning app.
           NO  -> Is the fact reusable across industries?
                    YES -> generic domain-owned capability/DocType.
                    NO  -> vertical/app-owned DocType.
```

Hard rule:

> Customer, Supplier, Item, Warehouse, Employee, Account, Payment, Stock Ledger, GL and other canonical masters/ledgers must not be redefined by a vertical merely to obtain a different UI or extra fields.

## 9. Package and capability resolver

Required pipeline:

```text
business requirement
 -> process set
 -> capability IDs
 -> authoritative package owner
 -> dependency closure
 -> installed package diff
 -> capability profile proposal
 -> preview blocked/enabled/required/disabled states
 -> apply only at authorized tenant boundary
```

Rules:

- install the minimum dependency-closed package set;
- do not equate package installation with enabling every capability;
- unknown/uninstalled dependency fails closed;
- explicit capability disable remains authoritative and may block dependents;
- deactivation never deletes package/data/history;
- a customer-specific profile must not become a second profile authority outside App Registry.

## 10. Provisioning lifecycle

Canonical lifecycle target:

```text
REQUEST_CAPTURED
 -> BUSINESS_MODEL_RESOLVED
 -> PROCESS_RESOLVED
 -> CAPABILITY_RESOLVED
 -> AUTHORITY_RESOLVED
 -> PACKAGE_PROFILE_RESOLVED
 -> APP_GAP_RESOLVED
 -> INSTALL_PREVIEW_PASS
 -> TENANT_BOOTSTRAP_READY
 -> ACCESS_READY
 -> DATA_PREVIEW_PASS
 -> INTEGRATION_READY
 -> REPRESENTATIVE_FLOW_PASS
 -> RECONCILIATION_PASS
 -> OPERABILITY_PASS
 -> GO_LIVE_READY
 -> AUTHORIZED_APPLY/CUTOVER
 -> HYPERCARE
 -> ACCEPTED_REFERENCE
```

States are conceptual until a provisioning engine materializes them. A state name must never be used to overclaim evidence that does not exist.

## 11. Minimum provisioning plan artifact

Every customer provisioning should eventually compile to a machine-readable plan with at least:

```json
{
  "customer_key": "<non-secret-key>",
  "archetype": "<resolved-business-model>",
  "processes": [],
  "packages": [],
  "capabilities": [],
  "existing_doctypes_reused": [],
  "custom_fields": [],
  "new_app_doctypes": [],
  "personas": [],
  "bootstrap": {},
  "integrations": [],
  "data_onboarding": {},
  "acceptance_flows": [],
  "release_impact": "NONE|NEW_CANDIDATE|PILOT_RELOCK|PRODUCTION_MUTATION"
}
```

No raw customer workbook, password, provider secret or production credential belongs in this artifact.

## 12. Acceptance matrix for “customer ready”

A tenant is not ready merely because menus render.

| Gate | Minimum evidence |
|---|---|
| Package | dependency closure, ownership conflict = 0, install/upgrade/idempotency PASS |
| Capability | profile resolves with no unexplained blocked capability |
| Metadata | DocType/Link/Table/field contract valid |
| Access | named personas can/cannot perform expected actions server-side |
| Bootstrap | required company/accounting/warehouse/HR/etc. masters exist and are coherent |
| Data | mapping/normalization/preview/reconciliation accepted when onboarding legacy data |
| Transaction | representative happy + failure + correction/cancel paths |
| Stock/Finance | canonical ledger side effects and reconciliation where in scope |
| Integration | sandbox/provider path, retry/idempotency/error behavior when in scope |
| UI | operator can complete required flow on supported surface |
| Operability | health/log/queue/backup/recovery evidence appropriate to target |
| Identity | exact package/profile/source/deployed identity known for any production claim |

## 13. Skill materialization template

Every new `skills/<slug>/SKILL.md` should contain the same sections:

1. **When to use / when not to use**.
2. **Truth sources** in read order.
3. **Input contract**.
4. **Decision tree**.
5. **Canonical owners and exact paths**.
6. **Files allowed to create/update**.
7. **Files/layers forbidden to touch** without escalation.
8. **Required outputs/artifacts**.
9. **Validation commands/evidence classes**.
10. **Release impact rules**.
11. **Stop/authorization boundaries**.
12. **Dependency Request format**.

A skill that only contains general advice and cannot route to an exact owner/path is incomplete.

## 14. Priority to materialize

Materialize in this order when it does not compete with an active pilot blocker:

### P0 — App Factory / customer determinism

- S01 `forge-task-router`
- S02 `forge-business-model-resolution`
- S04 `forge-authority-resolution`
- S05 `forge-capability-composition`
- S06 `forge-customer-provisioning`
- S09 `forge-app-authoring`
- S10 `forge-doctype-authoring`

### P1 — Safe implementation and rollout

- S07 `forge-tenant-bootstrap`
- S08 `forge-persona-access`
- S11 `forge-workflow-permission-authoring`
- S12 `forge-worker-authoring`
- S19 `forge-data-onboarding`
- S21 `forge-ui-safe-change`
- S23 `forge-release-identity`
- S25 `forge-acceptance-certification`

### P2 — Specialist hardening

- S15/S16/S17/S18/S20/S22/S24/S26/S27/S28 and remaining recipe skills.

## 15. End-state

The Skill system is complete when a user can say, for example:

> “Tạo khách bán điện thoại, 2 cửa hàng, quản IMEI, mua bán, công nợ và bảo hành; chưa cần HR.”

and Forge can deterministically produce:

- business archetype and processes;
- existing capabilities to reuse;
- packages to install and capability profile to enable;
- canonical DocTypes to reuse;
- custom fields/new vertical DocTypes only where justified;
- exact brief/Worker/migration/test paths if product changes are actually needed;
- tenant/bootstrap/persona/integration/data-onboarding plan;
- dry-run result and acceptance matrix;
- exact release impact;
- an explicit stop before any unauthorized production mutation.

The desired result is not “an AI that knows a lot about Forge”. It is a **deterministic Forge operating system whose knowledge, compiler, registry, recipes and evidence make the correct path discoverable and enforceable**.
