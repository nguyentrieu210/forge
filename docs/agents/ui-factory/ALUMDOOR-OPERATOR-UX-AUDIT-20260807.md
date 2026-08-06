# ALUMDOOR OPERATOR UX AUDIT — 2026-08-07

Status: **IMPLEMENTATION AUDIT / UI-ONLY SLICE**  
Repository: `nguyentrieu210/forge`  
Exact audited `main`: `2af60ed2a095271dfdfa1af84cbd922a715e715f`  
Reference interaction: current Alumdoor Sales Sheet after PR #777  
Engineering risk of this slice: **FAST / presentation + create-surface routing only**  
Release impact: **NEW_CANDIDATE**; no production mutation, no backend authority change.

## 1. Decision

Sales is the operator reference because it is task-first and keeps authoritative rules on the server while letting the operator finish a real job in one coherent surface.

For this audit a screen is **Operational** only when the visible UI can support the relevant operator chain:

`navigate -> input -> validate/preview -> save/submit/action -> authoritative write -> reopen/readback -> downstream/report/history -> correction/retry`

Navigation convergence by itself is not enough.

This audit follows `skills/forge-enterprise-completion/SKILL.md` and `docs/FORGE_ENTERPRISE_NORTH_STAR.md`:

- declaration-first;
- canonical metadata before renderer changes;
- no business-schema hardcode in generic React;
- backend remains authoritative for money, stock, finance and business validation;
- installed capability is different from operator-usable capability.

## 2. Root UI defect fixed in this slice

`DocTypeMeta.viewPolicy.quickEntry` already exists as the canonical declaration and the metadata audit explicitly defines quick entry as **opt-in**. `NewFormContainer` already knows how to render `quick` versus `expanded` form policy.

Before this slice `DoctypeWorkspace` still opened `/new` in a dialog for every non-single DocType, and did not pass `presentation="dialog"`. Consequences:

1. transaction documents such as Stock Entry, Work Order, Payment Entry, Warranty Claim and many HR transactions were forced into a modal instead of an operator-sized page;
2. a declared `quickEntry` policy was not actually selected by the workspace modal;
3. a metadata-disabled quick-entry could surface a disabled-form message instead of falling back to the canonical expanded form;
4. the same generic workspace felt materially less operational than the Sales reference.

Implemented rule:

- `viewPolicy.quickEntry.enabled === true` -> quick-entry dialog + `presentation="dialog"`;
- missing/false quick-entry policy -> full-page create + `presentation="page"`;
- no DocType-name branch and no Alumdoor literal;
- save/permission/validation/serialization stay in the existing canonical form stack.

## 3. Whole-system operator audit

| Workspace | Current operator surface | Status after this slice | Evidence / decision |
| --- | --- | --- | --- |
| Bán hàng | Unified Sales Sheet + Sales Order list + delivery + report + history | **Operational reference** | Current Sales Sheet owns customer mode, domain-derived measurement basis, live preview totals and server-authoritative save/submit. Navigation 2.3.2 exposes `Tạo đơn` first. |
| Mua hàng | `Mua hàng` rich action + direct receipt + supplier report + history | **Operational** | Rich child-grid inputs, server preview/commit, canonical Purchase Order/Purchase Receipt readback. |
| Kho — nhập/xuất/chuyển | Canonical Stock Entry workspace | **Operational CRUD improved** | Creation now uses full-page expanded form unless metadata explicitly opts into quick entry. Stock authority stays canonical. |
| Kho — chọn lô/cắt | `de-xuat-lo-cat` -> `cat-nhom` | **Operational** | Explicit preview before draft cut order, then irreversible cut confirmation; correction actions remain installed outside daily strip. |
| Kho — kiểm kê | snapshot -> Stock Reconciliation -> approve | **Operational** | `chot-so-so-kiem-ke` produces lines; canonical reconciliation is editable; `duyet-kiem-ke` posts correction. Full-page create removes modal constraint. |
| Sản xuất — lập lệnh | `don-hang-thanh-san-xuat` -> Work Order | **Operational** | Preview + creation of production request/work orders; canonical Work Order creation/edit is now full-page by default. |
| Sản xuất — năng lực/tăng ca | `lap-tai-san-xuat` | **Partial / structured-input blocker** | Backend capability exists, but UI requires raw `demands_json` and `resource_json`. This is not operator-grade and must not be papered over with shared-renderer field-name hardcode. |
| Công nợ | Canonical Payment Entry + contextual finance reports | **Operational CRUD improved** | Payment Entry now gets the expanded page create surface by default. Financial authority remains canonical/server-side. A dedicated Sales-like collector cockpit is optional product enhancement, not required to make Payment Entry usable. |
| Bảo hành — tiếp nhận/xử lý | open claim -> Warranty Claim -> confirm resolution | **Operational core / one partial input** | Intake and resolution are named actions; Warranty Claim create/edit is full-page. Optional `customer_costs_json` remains a structured-input UX debt. |
| Quỹ kho | Dependency-owned canonical operating flow | **Operational / unchanged** | Prior operating-UX audit intentionally keeps the canonical `vn-accounting` flow rather than duplicating authority in Alumdoor. |
| Nhân sự & Tiền lương | Curated canonical HRM routes | **Operational CRUD improved / process proof pending** | Existing HRM documents remain canonical; transaction create surfaces benefit from the same full-page rule. Browser E2E proof remains separate from navigation composition. |
| Danh mục / Cài đặt | Canonical master/single forms | **Appropriate CRUD** | Masters may explicitly opt into quick entry; Single DocTypes already use page settings forms. They should not be forced into Sales-style transaction composition. |
| Báo cáo / Lịch sử | contextual operational report/history renderers | **Operational read model** | Sales/Purchase use first-class generic report/history screens. Dependency reports remain canonical and are projected near the owning workspace. |

## 4. UI Surface Resolver

### Shared create surface

- **UI Surface:** `/app/:doctype/new`
- **Owning App/DocType:** generic MetaForge runtime / target DocType
- **Current declaration source:** `DocTypeMeta.viewPolicy.quickEntry`
- **Canonical metadata contract:** `DocTypeViewPolicy.quickEntry.enabled`
- **Renderer:** `DoctypeWorkspace -> NewFormContainer -> FormView`
- **Requested change:** make operational documents use a full working form instead of an unconditional modal; preserve genuine quick create where declared
- **Chosen layer:** shared renderer consuming existing canonical metadata
- **Why declaration alone is insufficient:** declaration already existed; `DoctypeWorkspace` ignored it when choosing page versus dialog and failed to set dialog presentation
- **Engineering risk:** FAST
- **Release impact:** NEW_CANDIDATE

No authoritative behavior, action method, permission, schema, migration, ledger or worker contract changes in this slice.

## 5. Dependency Requests

### DR-UI-001 — typed structured input for capacity planning

**Surface:** `action:lap-tai-san-xuat`  
**Current contract:** `demands_json:Text`, `resource_json:Text`  
**Problem:** a normal operator should enter demand/resource rows, not JSON.  
**Required owner decision:** add a canonical AppAction structured-input/serialization contract, or change the named capacity endpoint to accept typed arrays while preserving server authority.  
**Why not fixed here:** changing a shared action-input contract is a cross-workstream contract change; hardcoding `lap-tai-san-xuat` or its field names in generic views would violate the Skill/North Star.

### DR-UI-002 — typed warranty cost rows

**Surface:** `action:mo-ho-so-bao-hanh`  
**Current contract:** optional `customer_costs_json:Text`  
**Problem:** cost-by-job details are not operator-friendly as raw JSON.  
**Preferred resolution:** reuse the same structured input primitive as DR-UI-001; do not add a second bespoke warranty editor.

### DR-E2E-001 — current-main browser operator proof

The repo already defines the correct operator acceptance chain and has historical PR #749 for broad E2E coverage, but that branch is not current-main mergeable evidence. Recreate/rebase the acceptance harness against current `main` and prove Sales, Purchase, Stock, Manufacturing, Finance, Warranty and HR by visible controls. Missing fixture/config must surface as `BLOCKED_DATA` / `BLOCKED_CONFIG`, not be hidden.

## 6. Implementation plan from here

### Slice A — merged by this change

- consume `viewPolicy.quickEntry` at the workspace boundary;
- full-page create when quick entry is not explicitly enabled;
- quick-entry dialog uses the actual quick presentation policy;
- regression test locks the metadata-driven choice.

### Slice B — next UI contract work

- resolve DR-UI-001 once a typed action-input contract is owned;
- reuse it for warranty cost rows;
- remove any remaining raw JSON operator fields from daily task strips.

### Slice C — operator proof

- current-main browser E2E by workspace;
- prove save/submit/readback/report-history/correction paths;
- produce per-workspace evidence, not screenshot-only acceptance.

### Slice D — polish only after proof

- density/alignment/keyboard flow;
- empty/loading/error states;
- mobile behavior;
- no new business logic in presentation code.

## 7. Acceptance for this slice

This slice is accepted when:

1. generic workspace contains no Alumdoor/Stock/Manufacturing/Finance/Warranty branch for create-surface selection;
2. quick entry is chosen only by canonical metadata opt-in;
3. quick modal passes `presentation="dialog"`;
4. non-quick create uses `presentation="page"` and preserves cancel/create navigation;
5. TypeScript/client validation remains green;
6. no backend, migration, worker, ledger, permission or production deployment file changes are included.
