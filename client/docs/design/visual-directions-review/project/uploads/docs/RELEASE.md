# MetaForge — Release Notes v0.1.0

Engine React **meta-driven** copy 1:1 hành vi metadata-driven của **Frappe/ERPNext Desk**, chạy trên backend **Frappe v16 headless**. Đầu ra: **engine kit tái dùng** (`@metaforge/*`) + **1 app demo**.

> Baseline (from-scratch): `tsc -b` exit 0 · `selfcheck` **46/46** · `vite build` 1012 modules (code-split) · ~6.7K LOC. Verified live trên Frappe **16.28.0**.

## 1. Đã build (100% code lõi)

### Engine (`@metaforge/core`)
- **43 fieldtype** (grep-verified `docfield.json` 16.29.0) + Long Int runtime; `mapError` §0 (`TimestampMismatchError`→**417 conflict** phân biệt validation qua `exc_type`).
- **MetaResolver**: 6 field-state (hidden/masked/locked/editable) + `depends_on`/`mandatory_depends_on`/`read_only_depends_on` (array-truthiness, `fn:`) + permlevel + docstatus.

### Adapter (`@metaforge/adapter-frappe`)
- `FrappeAdapter` interface = **contract đầy đủ** (`api-map.md`, verified 16.29.0) — 7 fix review#4 + 6 runtime fix nằm trong type.
- `FrappeAdapterImpl` (frappe-js-sdk, token-auth headless, custom headers) + 5 orch Python `metaforge.api.*`.

### Controls (`@metaforge/controls`)
- **36/43 = 100% field-value fieldtype** có control (text/số/select/link/date/check/media Attach/Image/Signature-canvas/Barcode/Geolocation…). 7 còn lại = layout/Button (FormView xử lý).

### Views (`@metaforge/views`) — **9/9**
List (TanStack Table: sort+paginate) · Form (RHF+Zod, resolve reactive, 417 conflict) · Kanban (`update_order_for_single_card`) · Tree (NestedSet lazy) · Report · Print (iframe cô lập) · Dashboard (Recharts) · Calendar · Gantt · **ChildGrid (M12)** + container (`MetaForgeProvider`/`FormContainer`/`ListContainer` + TanStack Query).

### Builder (`@metaforge/builder`) — **4/4**
BuilderKernel (undo/redo) · **M17 DocType** (palette 43 → dnd-kit canvas → meta, **live FormView preview**) · **M18 Workflow** (React Flow graph) · **M21 Print Format** · **M22 Dashboard** (react-grid-layout).

### Shell (`@metaforge/shell`)
AppShell (sidebar/topbar) · CommandPalette (Ctrl/Cmd+K) · theme 3-mode.

## 2. Stack (đúng RULES)
Vite · React 18 · TS (strict) · **TanStack Table + Query** · **RHF + Zod** · **Recharts** · **dnd-kit** · **React Flow** · **react-grid-layout** (v1.4.4) · frappe-js-sdk. Lazy code-split: builder chunk (271KB) tách khỏi main.
> frappe-gantt: GIỮ SVG native có chủ đích (lib imperative, React-fit kém).

## 3. Verify (live, site cô lập `metaforge.localhost`)
| Hạng mục | Kết quả |
|---|---|
| `selfcheck` 46/46 (logic + 30 render thật) | ✅ chạy được ngay (esbuild→node) |
| Adapter E2E (curl **+ TS thật** qua tunnel) | ✅ getBoot/getMeta/getList/search/workspaces |
| Meta có `__js` assets (§Q) | ✅ |
| **417 optimistic-lock** | ✅ `exc_type=TimestampMismatchError` |
| **Phân quyền server** (§F5) | ✅ 403 SysMgr-endpoint · 403 doctype · **field permlevel masking** (lowpriv mất `mf_secret`, giữ `description`) |

## 4. Còn lại (deferred)
- **UI verify (cần browser)**: 4 luật trọng yếu (Detail 3-cột / Kanban chip lý do / AI gợi ý / Lịch sử) + screenshot baseline. Chạy: xem `DEPLOYMENT.md` §Run live.
- **Serve SPA publicly**: nginx `frontend` hardcode `FRAPPE_SITE_NAME_HEADER=frontend` ⇒ cần route riêng cho `metaforge.localhost` (maintenance window). Xem `DEPLOYMENT.md` §Serve.
- **Polish sâu**: server-side filter/sort/paginate cho tập lớn; AI gợi ý lý do (Kanban); realtime socketio; PWA offline (read cache, write disabled V1).

## 5. Chấm điểm (reviewer, tiến trình)
Cổng 2 DUYỆT · Cổng 3 (contract verified 16.29.0) · **Cổng 4 8.9/10** · PHA 5 code+polish + tích hợp + smoke live + security verified.
