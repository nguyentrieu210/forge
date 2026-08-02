# WS09 — BPM + Low-code App Factory

Status: **ACTIVE**  
Owner: **GPT-5.6 Thinking / WS09**  
Branch: `agent/ent-09-bpm-app-factory`  
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
| `B01-006` Approval matrix | Foundation | Roles/conditions can model simple routing, but no first-class matrix/version/effective rule contract. |
| `B01-007` Conditional routing | Foundation/Wired | `condition` exists in transition metadata; enterprise expression/version/audit coverage remains thin. |
| `B01-008` Delegation | Missing | No generic delegation primitive in workflow contract. |
| `B01-009` Escalation | Missing | No generic escalation policy primitive. |
| `B01-010` SLA/timer | Missing | No first-class timer/deadline/escalation contract in workflow model. |
| `B01-011` Scheduled action | Missing | No workflow-owned scheduler action contract found. |
| `B01-012` Event trigger | Foundation | App hooks/event subscriptions exist, but not yet a first-class BPM trigger graph. |
| `B01-013` Business rule | Foundation | Validators/field conditions exist as seams, not yet a generic versioned rule builder/runtime. |
| `B01-014` Formula rule | Foundation | Metadata fields can carry formula source semantics, but no generic audited formula builder/evaluator contract is established here. |
| `B01-015` Webhook/external action | Foundation | Hook/worker dispatch seam exists; BPM node/action contract not yet first-class. |
| `B01-016` Process analytics | Missing | No generic process instance/transition timing fact model found. |
| `B01-017` Bottleneck analysis | Missing | Depends on process analytics facts. |
| `B01-018` Visual workflow builder | Foundation/Wired | `client/packages/builder/src/workflow/WorkflowBuilder.tsx` has state/transition editor + React Flow graph + serializer; enterprise BPM nodes remain absent. |
| `B02-001` App manifest | Wired | Canonical `server/packages/app-registry/src/manifest.ts` validates app package shape. |
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
| `B02-016` Action builder | Foundation | AppAction scalar fields/preview/commit exist; repeatable input-table is current hardening slice. |
| `B02-017` Report builder | Foundation | Manifest has declarative reports; visual authoring depth not yet established. |
| `B02-018` Dashboard builder | Foundation | Declarative charts/screens exist; full dashboard authoring lifecycle not yet established. |
| `B02-019` Print builder | Foundation | Print format metadata exists; builder maturity requires separate audit. |
| `B02-020` Role builder | Foundation | App roles exist; builder UX/lifecycle not yet complete. |
| `B02-021` Permission builder | Foundation | DocPerm metadata exists; builder UX + server-side policy evidence needs deeper audit with WS11. |
| `B02-022` Preview/test app | Foundation | compile/parse/test seams exist; isolated preview environment lifecycle incomplete. |
| `B02-023` Package export/import | Foundation | Package/pack tooling exists; compatibility/signing/roundtrip hardening remains. |

Maturity above is audit snapshot, not a capability-map status mutation. `Hardened` is intentionally not claimed anywhere.

## Active implementation slice — first-class AppAction input-table

### User outcome

Một AppAction có thể khai bảng nhập lặp lại như dữ liệu first-class thay vì giấu JSON trong `Text.options`, để Purchase Receipt, Stock Reconciliation, BOM và app mới dùng chung contract mà không hard-code business vertical vào runtime.

### Contract

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
- column fieldname unique;
- chỉ fieldtype mà ActionScreen có control mới được nhận;
- Link/Select phải có options;
- contract không validate business rule của từng dòng; app controller vẫn authoritative;
- legacy `Text` + `BulkTransaction:<json>` phải decode được trong giai đoạn chuyển tiếp, không ép flag-day trên installed package.

### Code landed on branch

- `server/packages/app-registry/src/action-input-table.ts`
  - `AppActionInputTable` / `AppActionInputColumn`.
  - parser fail-closed + bounds/type/link validation.
  - legacy Bulk Transaction decoder.
  - scalar/table input-key collision guard.
- `server/packages/app-registry/src/index.ts` exports the contract.
- `server/tests/app-action-input-table.test.mjs` covers normalization/defaults/failure/legacy/collision cases.

Current maturity of this slice: **Foundation**. It is not yet canonical `parseAppManifest()` / brief compiler / shared client renderer wiring, so it must not be presented as end-to-end complete.

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
- Why generic: already evidenced by Purchase Receipt and Stock Reconciliation; BOM is queued as another consumer.
- Contract proposed: use the WS09 `fieldname/columns/min_rows/max_rows/allow_paste` shape; `ActionScreen` posts `values[fieldname]` as array rows and reuses existing control registry/paste UX.
- Blocking: **yes** for end-to-end first-class AppAction UX; **no** for server contract foundation.
- Temporary workaround: current compatibility transport remains authoritative for existing Alumdoor package until WS14 consumes the new contract.

### Dependency note — WS11

`permission_doctype` / server permission remains existing authority. Input-table metadata must not introduce a new client-trusted permission path. No WS11 code change requested yet.

## Phase B priority

1. Finish canonical server manifest + brief compiler wiring for AppAction input-table with backward compatibility.
2. Coordinate DR-09-01 with WS14 for client types/renderer, then migrate a real consumer away from compatibility transport.
3. Extract batch action primitive only after 2+ consumers prove the same pattern.
4. Extend BPM contract: parallel/quorum -> matrix -> delegation -> escalation/timer -> event/scheduled actions.
5. Rule/formula builder lifecycle.
6. App version/dependency/upgrade/rollback and marketplace trust contract.

## Guard

Không nhét business rule ngành vào shared compiler. Nếu pattern chỉ dùng một vertical, giữ ở vertical cho tới khi có bằng chứng tái sử dụng. Không sửa shared React runtime/core/views của WS14 từ branch này.

## Verification

- Branch exact compare after first implementation slice: ahead of current claim baseline, not behind at the time of audit.
- Regression source added for new contract, but full repository build/typecheck/test has **not** been claimed yet.
- No production deploy, migration, secret/DNS or customer-data mutation.

## Handoff

Workstream: WS09  
Branch: `agent/ent-09-bpm-app-factory`  
Status: ACTIVE  
Capabilities: `B01-001..018`, `B02-001..023`; active slice `B02-016`  
Changed zones: `server/packages/app-registry/src/action-input-table.ts`, app-registry export, targeted test, this workstream file  
Migration: none  
Dependency requests: DR-09-01 -> WS14  
Known gaps: canonical manifest/compiler/client wiring; enterprise BPM primitives; app rollback  
Recommended merge order: WS00/WS11 foundations as needed -> WS09 server contract -> WS14 renderer integration -> domain consumer migrations.
