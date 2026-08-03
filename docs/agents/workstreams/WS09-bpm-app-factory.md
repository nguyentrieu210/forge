# WS09 — BPM + Low-code App Factory

Status: **ACTIVE**  
Owner: **GPT-5.6 Thinking / WS09**  
Branch: `agent/ent-09-bpm-app-factory`  
PR: **#319 (draft)**  
Product baseline: **Forge 0.2.0**  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Biến metadata/app-registry/builder hiện có thành moat chính: workflow/BPM và App Factory đủ để domain mới chủ yếu khai metadata + rules + integration thay vì fork runtime.

## Own

`server/packages/app-registry/**`, manifest/compiler/install/upgrade contracts, workflow/BPM primitives, action/rule/formula/report/dashboard/print/role-permission builder contracts, client builder package phối hợp WS14.

## Risk

**STANDARD/CRITICAL** tuỳ slice. App registry/compiler contract là shared platform seam; thay đổi manifest có thể ảnh hưởng mọi app đã cài. Không merge/deploy backend contract khi chưa có review/authorization.

## Phase A audit

### Capability maturity snapshot

| Capability | Current maturity | Evidence / gap |
|---|---|---|
| `B01-001` Workflow definition | Wired | `WorkflowMeta`, D1 metadata store, manifest workflow install path và generic controller consume workflow. |
| `B01-002` Workflow state | Wired | `validateWorkflow()` parse state + docstatus + allow_edit; controller derives document state/docstatus. |
| `B01-003` Workflow transition | Wired | transition state/action/next_state/allowed_role/condition/self-approval contract exists and unknown-state refs fail closed. |
| `B01-004` Sequential approval | Wired | role-gated transition model + approval experiences exist; needs broader correction/permission regression before RC. |
| `B01-005` Parallel approval | Missing | No first-class multi-actor join/quorum state contract found. |
| `B01-006` Approval matrix | Foundation/Wired policy seam | `Approval Policy` is an effective-dated, condition-driven document with ordered `steps_json` and SoD enforcement. Current submit guard validates membership in the policy steps, but does not persist/advance per-step approval instances, so this is not yet a full matrix execution engine. |
| `B01-007` Conditional routing | Foundation/Wired | workflow transition `condition` plus safe `Approval Policy.condition_json` exist; enterprise expression/version/audit coverage remains split across seams. |
| `B01-008` Delegation | Wired | `Delegation` is a submittable security DocType with effective dates, action/org scope; `canActThroughDelegation()` is consumed by workflow transition access and approval-policy submit guards. |
| `B01-009` Escalation | Missing | No generic escalation policy primitive found. |
| `B01-010` SLA/timer | Missing | No first-class workflow timer/deadline/escalation contract; delegation effective dates are access validity, not process SLA. |
| `B01-011` Scheduled action | Missing | No workflow-owned scheduler action contract found. |
| `B01-012` Event trigger | Foundation | App hooks/event subscriptions exist, but not yet a first-class BPM trigger graph. |
| `B01-013` Business rule | Foundation/Wired seams | App validators, safe approval conditions, SoD rules and field conditions exist, but no single generic versioned rule artifact/builder spans them yet. |
| `B01-014` Formula rule | Foundation | Metadata fields can carry formula source semantics, but no generic audited formula builder/evaluator contract is established here. |
| `B01-015` Webhook/external action | Foundation | Hook/worker dispatch seam exists; BPM node/action contract not yet first-class. |
| `B01-016` Process analytics | Missing | No generic process instance/transition timing fact model found. |
| `B01-017` Bottleneck analysis | Missing | Depends on process analytics facts. |
| `B01-018` Visual workflow builder | Foundation/Wired | `client/packages/builder/src/workflow/WorkflowBuilder.tsx` has state/transition editor + React Flow graph + serializer; enterprise BPM nodes remain absent. |
| `B02-001` App manifest | Wired | Canonical `server/packages/app-registry/src/manifest.ts` validates app package shape; WS09 adds a compatibility parser view for first-class action tables. |
| `B02-002` App dependency | Wired | `requires` + minimum version checks exist. |
| `B02-003` App version | Wired | Semantic package version + platform requirement/version comparison exist. |
| `B02-004` App install | Wired/RC | `AppInstaller.install()` validates then commits metadata activation transactionally; exact full regression still required for RC claim. |
| `B02-005` App upgrade | Wired | Existing install path handles version/content-hash change and refuses downgrade. |
| `B02-006` App rollback | Missing | Downgrade explicitly refused; no reversible app revision/rollback contract. |
| `B02-007` App catalog/marketplace | Foundation | Installed app catalog/list seams exist, but marketplace lifecycle/signing/trust not complete. |
| `B02-008` DocType builder | Foundation/Wired | Builder package exists; needs full app-package roundtrip/evidence review. |
| `B02-009` Field builder | Foundation/Wired | Same builder seam. |
| `B02-010` Child Table builder | Foundation | Metadata supports child tables; full builder/product flow not yet audited to RC. |
| `B02-011` Form builder | Foundation | Generic metadata form exists; authored presentation builder depth incomplete. |
| `B02-012` List builder | Foundation | View policy/Bulk View exists; generic authored list builder not yet enterprise-complete. |
| `B02-013` Workflow builder | Foundation/Wired | WorkflowBuilder + serializer exist for state/transition subset. |
| `B02-014` Rule builder | Missing/Foundation | No canonical generic rule artifact with lifecycle/versioning found. |
| `B02-015` Formula builder | Missing/Foundation | No canonical generic formula builder/evaluator lifecycle found. |
| `B02-016` Action builder | **Wired server/tooling; client pending** | First-class repeatable input contract compiles, validates and lowers through AppInstaller; WS14 renderer still consumes compatibility field. |
| `B02-017` Report builder | Foundation | Manifest has declarative reports; visual authoring depth not yet established. |
| `B02-018` Dashboard builder | Foundation | Declarative charts/screens exist; full dashboard authoring lifecycle not yet established. |
| `B02-019` Print builder | Foundation | Print format metadata exists; builder maturity requires separate audit. |
| `B02-020` Role builder | Foundation | App roles exist; builder UX/lifecycle not yet complete. |
| `B02-021` Permission builder | Foundation | DocPerm metadata exists; builder UX + server-side policy evidence needs deeper audit with WS11. |
| `B02-022` Preview/test app | Foundation | compile/parse/test seams exist; isolated preview environment lifecycle incomplete. |
| `B02-023` Package export/import | Foundation | Package/pack tooling exists; compatibility/signing/roundtrip hardening remains. |

Maturity above là audit snapshot, không tự ý sửa capability map. Không capability nào được claim `Hardened`.

Cross-package correction: workflow/BPM capability không chỉ nằm trong `frappe-model`. Exact-main audit phải tính cả `frappe-api` và `organization-security`; vì vậy delegation được nâng từ đánh giá ban đầu `Missing` lên `Wired`, còn approval matrix được giữ ở `Foundation/Wired policy seam` vì policy steps hiện chưa là persisted step-instance engine.

## Active implementation slice — first-class AppAction input-table

### User outcome

AppAction có thể khai bảng nhập lặp lại như dữ liệu first-class thay vì giấu JSON trong `Text.options`, để Purchase Receipt, Stock Reconciliation, BOM và app mới dùng chung contract mà không hard-code business vertical vào runtime.

### Author-facing brief

```json
{
  "name": "bulk-receive",
  "permission": "Receipt",
  "inputTables": [{
    "fieldname": "lines",
    "label": "Chi tiết",
    "columns": [
      { "fieldname": "item_code", "label": "Mã hàng", "fieldtype": "Data", "required": true },
      { "fieldname": "qty", "label": "Số lượng", "fieldtype": "Float", "required": true }
    ],
    "minRows": 1,
    "maxRows": 200,
    "allowPaste": true
  }],
  "commit": "app.commit | Ghi nhận"
}
```

Action chỉ có `inputTables` cũng hợp lệ; adapter dùng scalar stub nội bộ để đi qua compiler/schema cũ rồi loại stub trước khi package được tạo.

### Package/server contract

```text
AppAction.input_tables[]
  fieldname: key POST tới app method; value là array row object
  label / description
  columns[]: fieldname / label / fieldtype / options / required / default / description
  min_rows: 1..500
  max_rows: 1..500, >= min_rows
  allow_paste: boolean
```

Invariants:
- table fieldname không được đụng scalar action fieldname;
- table và column fieldname unique;
- chỉ fieldtype ActionScreen hiện có control mới được nhận;
- Link/Select phải có options; Link target phải app-owned hoặc declared external;
- tối đa 64 cột/table, 500 rows/table;
- compiler/schema helper không mutate brief nguồn;
- lowering không mutate package nguồn;
- business validation của từng row vẫn nằm ở app controller/server authoritative;
- legacy `Text` + `BulkTransaction:<json>` decode được trong giai đoạn chuyển tiếp, không ép flag-day trên installed package.

### Wired path on branch

1. `server/scripts/lib/action-input-table-brief.mjs`
   - author-facing validation/normalization;
   - schema compatibility adapter;
   - table-only action support qua compiler-only stub.
2. `server/scripts/lib/compile-brief-app-factory.mjs`
   - giữ compiler cũ làm lõi;
   - emit `input_tables` first-class;
   - xóa compiler-only stub trước khi package ra ngoài.
3. `server/scripts/forge-app.mjs`
   - dùng App Factory compiler adapter;
   - validate bằng `parseAppManifestWithInputTables`;
   - `--out` ghi clean source package;
   - install gửi `pkg` nguồn, không gửi decorated tooling view.
4. `server/packages/app-registry/src/action-input-table.ts`
   - `AppActionInputTable` / `AppActionInputColumn`;
   - parser fail-closed + bounds/type/link validation;
   - legacy Bulk Transaction decoder;
   - scalar/table input-key collision guard.
5. `server/packages/app-registry/src/action-input-table-compat.ts`
   - lower first-class table thành compatibility `Text` field trước canonical parser/storage;
   - decorate installed action/tooling view ngược lại thành `input_tables`;
   - `parseAppManifestWithInputTables` reuse canonical manifest parser, không fork validation logic.
6. `server/packages/app-registry/src/input-table-installer.ts`
   - exported AppInstaller lowers package đúng một lần ở install boundary;
   - `list()` decorate action để consumer mới đọc first-class metadata;
   - core installer vẫn giữ authority cho transaction/dependency/ownership/versioning.
7. `server/packages/app-registry/src/index.ts`
   - export contract, compatibility parser view và input-table-aware AppInstaller.

Current maturity: **Wired ở server/tooling**, chưa end-to-end UI vì shared ActionScreen thuộc WS14 vẫn render compatibility transport. Native storage/parser schema cũng chưa được đổi trực tiếp; bridge hiện tại cố ý tách riêng để rolling upgrade an toàn và có thể xóa sau.

## Regression evidence added

- `server/tests/app-action-input-table.test.mjs`
  - normalize/default/bounds/type/link/collision/legacy/lowering/decorating.
- `server/tests/app-action-input-table-manifest.test.mjs`
  - canonical parser reuse + first-class tooling view.
- `server/tests/app-action-input-table-brief.test.mjs`
  - brief schema extension + compiler output + collision guard.
- `server/tests/app-action-input-table-table-only-brief.test.mjs`
  - table-only action + no leaked stub + no source mutation.
- `server/tests/app-action-input-table-app-factory-contract.test.mjs`
  - brief compiler -> package -> server-authoritative parser view.

Full repository build/typecheck/test chưa được claim: connector session không có checkout/dependency tree và GitHub chưa trả CI run/status cho PR head.

## Legacy PR disposition

| PR | Disposition | Reason |
|---|---|---|
| `#209` Purchase Receipt Bulk Transaction | **reuse as consumer/evidence** | Canonical merged implementation explicitly labels `BulkTransaction:<json>` as compatibility transport v1 and calls first-class AppAction input-table a follow-up. Keep Tiến Đạt/FIFO business logic in vertical/domain layer. |
| `#267` Stock Reconciliation Bulk Transaction | **reuse as consumer requirement; do not cherry-pick into WS09** | Demonstrates second repeatable-input consumer and larger row bound, but stock reconciliation/controller semantics belong WS04. |
| `#203` Purchase bulk source review | **superseded** | PR itself declares canonical replacement #209. |
| `#205` Purchase bulk clean-base iteration | **superseded** | PR itself declares canonical replacement #209. |
| `#190` Safe Bulk View | **reuse as UX/pattern evidence; ownership WS14** | Generic client Bulk View pattern is useful evidence but shared React renderer/runtime belongs WS14. |
| `#182` Old Bulk View | **superseded by #190** | Historical source only; do not merge stale branch. |

### Dependency request DR-09-01
- Target stream: **WS14**
- Need: shared client/core/view support for first-class `AppAction.input_tables` while keeping legacy `BulkTransaction:<json>` fallback during transition.
- Why generic: Purchase Receipt + Stock Reconciliation đã là 2 consumer; BOM là consumer tiếp theo.
- Contract: `fieldname/columns/min_rows/max_rows/allow_paste`; ActionScreen POST `values[fieldname]` là array rows, reuse control registry/paste UX.
- Renderer mới phải ưu tiên `input_tables` và suppress compatibility field tương ứng để không render đôi.
- Blocking: **yes** cho first-class UI end-to-end; **no** cho server/tooling slice.
- Temporary workaround: existing installed packages/old clients tiếp tục dùng compatibility transport.

### Dependency note — WS11

`permission_doctype` / server permission vẫn là authority. Input-table metadata không tạo client-trusted permission path mới. Cross-package audit cho thấy WS11/organization-security đã cung cấp Delegation + Approval Policy seams mà BPM runtime đang consume; WS09 không fork các policy primitive đó.

## Main drift review

Trong lúc WS09 làm, `main` tiến từ `bbe3494...` qua WS14 mobile/a11y và installable PWA tới `27fb727...`. Exact compare hiện branch diverged do các commit UI/PWA này; không file nào overlap zone WS09 (`server/packages/app-registry`, compiler/forge-app scripts). PR vẫn là integration boundary, không tự merge.

## Phase B priority

1. DR-09-01: WS14 consume `input_tables` native và giữ rolling fallback.
2. Migrate một consumer thật (#209/#267 pattern) sang first-class declaration sau khi renderer sẵn sàng.
3. Sau khi rollout ổn, fold bridge vào native `AppManifest`/JSON Schema rồi xóa compatibility adapter thay vì nuôi vĩnh viễn.
4. BPM enterprise: parallel/quorum -> persisted approval-step instances/matrix execution -> escalation/timer -> event/scheduled actions. Reuse existing Delegation/Approval Policy/SoD seams instead of rebuilding them.
5. Rule/formula builder lifecycle.
6. App rollback + marketplace trust/signing/catalog contract.

## Guard

Không nhét business rule ngành vào shared compiler. Nếu pattern chỉ dùng một vertical, giữ ở vertical cho tới khi có bằng chứng tái sử dụng. Không sửa shared React runtime/core/views của WS14 từ branch này.

## Handoff

Workstream: WS09  
Branch: `agent/ent-09-bpm-app-factory`  
PR: `#319` draft  
Status: ACTIVE  
Capabilities: `B01-001..018`, `B02-001..023`; active slice `B02-016`  
Changed zones: app-registry input-table contract/bridge/installer; forge-app compiler + schema adapter; targeted regressions; workstream doc  
Migration: none; compatibility bridge only  
Dependency requests: DR-09-01 -> WS14  
Known gaps: client native renderer, eventual native manifest/schema fold-in, parallel/quorum + persisted approval-step engine, escalation/SLA, app rollback  
Merge/deploy: **blocked by policy/approval** because this is backend/shared contract, not UI-only.
