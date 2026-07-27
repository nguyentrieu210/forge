# MetaForge — Implementation Traceability Matrix

> Ngăn "báo xong bằng số test". **UI req chỉ được `Done` khi CÓ screenshot baseline + E2E.** `tsc/selfcheck xanh` = chỉ `Wired` (logic không vỡ), KHÔNG phải `Done`. Cập nhật cột Status mỗi checkpoint. Tracker (`PHASE_TRACKER.md`) phải khớp bảng này.
>
> Status: `Todo` · `Wired` (code + tsc/unit xanh, chưa có ảnh/E2E) · `Done` (đủ screenshot + E2E).

## Checkpoint A — Foundation  (shell code SẠCH lint; verified ảnh light+dark; E2E spec = Pha cuối)
| REQ | Component | Route | Adapter/API | E2E | Screenshot | Status |
|---|---|---|---|---|---|---|
| M00-SHELL-01 sidebar+topbar dùng chung mock/Live | `AppShell`/`DemoShell` | mọi route | `getBoot`/`getWorkspaces` | shell.spec (TODO) | ✅ shell-form-1280-light/dark | **Wired** |
| M00-SHELL-02 theme 3-mode (data-theme→Tailwind dark) | `useTheme`+styles.css | mọi route | — | shell.spec (TODO) | ✅ shell-form-1280-dark | **Wired** |
| M00-SHELL-03 breadcrumb route-driven | `AppShell` topbar | mọi route | router | shell.spec (TODO) | ✅ (Task › Form) | **Wired** |
| M03-AWESOME-01 Ctrl+K và `/` mở palette mọi route | `CommandPalette`(cmdk) | mọi route | searchDocTypes/searchRecords | awesome.spec (TODO) | trigger ✅ | **Wired** |
| M03-AWESOME-02 search record (debounce/cancel/stale/perm) | `CommandPalette` | mọi route | `metaforge.api.global_search` (C1) | awesome.spec (TODO) | — | Wired (Live=searchLink tạm; global_search C1) |
| SHELL-LIVE-01 LiveApp bọc AppShell+CommandPalette | `LiveApp`+`DemoShell` | mọi route | getBoot | live.spec (TODO) | (cần backend) | **Wired** (code sạch lint) |
| AI-SHELL-01 AI trigger topbar + panel "chưa cấu hình" | `AIPanel`/`AIActionRegistry` | mọi route | — (Pha 2 nối) | ai.spec (TODO) | trigger ✅ | **Wired** |
| UI-LINT-01 no-native-UI script | `scripts/check-native-ui.mjs` | — | — | ci | — | **96 vi phạm (toàn views)** → gate 0 sau B/C |

## Checkpoint B — List + split detail
| REQ | Component | Route | Adapter/API | E2E | Screenshot | Status |
|---|---|---|---|---|---|---|
| M04-LIST-01 render cột từ metadata (in_list_view) | `ListView`/`deriveColumns` | `/app/:dt` | `getMeta`,`getList` | list.spec (TODO) | ✅ list-1280-light/dark | **Wired** |
| M04-LIST-02 search + standard filters → server | `ListToolbar`/`buildServerQuery` | `/app/:dt` | `getList(filters/orFilters)` | list.spec (TODO) | ✅ list-filter/search-1280 | **Wired** |
| M04-LIST-03 column picker (ẩn/hiện/resize/order/reset) lưu theo site+user | `ColumnPicker` + `column-preferences` | `/app/:dt` | `metaforge:list-columns:v2:<scope>:<dt>` | list.spec: ẩn→reload→reset + Alt←/→ | ✅ desktop-chromium-list | **Done** |
| M04-LIST-04 checkbox + STT tách riêng, status badge+số phải+ngày | `ListView` cols/`cells.tsx` | `/app/:dt` | `getList` | list.spec: render metadata | ✅ desktop-chromium-list | **Done** |
| M04-LIST-05 selection + bulk (xoá/xuất) | `BulkActionBar` | `/app/:dt` | `bulkDelete`(Live) | list.spec (TODO) | ✅ list-bulk-1280 | **Wired** (mock toast; Live bulkDelete nối) |
| M04-LIST-06 pagination X–Y/Z + summary row Σ | `PaginationBar`,`TableFooter` | `/app/:dt` | `getCount` | list.spec (TODO) | ✅ (1–12/12, Σ=460%) | **Wired** |
| M04-LIST-07 URL giữ q/filters/sort/page/selected | `useListUrlState`+bridge | `/app/:dt?...` | — | list.spec (TODO) | ✅ reload filter/sel giữ đúng | **Wired** |
| M04-STATE-01 skeleton + 3 empty + error VN | `ListView` states | `/app/:dt` | — | list.spec (TODO) | (empty/search/filter states) | **Wired** (code; ảnh empty TODO) |
| M11-LAYOUT-01 3 cột resizable+lưu layout (≥1280) | `SplitView`(autoSaveId) | `/app/:dt/:name` | — | split.spec (TODO) | ✅ split-1280-light/dark | **Wired** |
| M11-LAYOUT-02 responsive 900 list+detail(context Sheet) / 390 stack+drawer | `SplitView`+`AppShell` drawer | `/app/:dt/:name` | — | split.spec (TODO) | ✅ split-tablet-900 / mobile-390 | **Wired** |
| M11-LAYOUT-03 click row mở split (không chuyển màn) + Esc order | `SplitView`+`?open`/`:name` | `/app/:dt` → `:name` | — | split.spec (TODO) | ✅ (list vẫn hiện, row active highlight) | **Wired** (↑↓ điều hướng: C) |
| M11-FORM-01 header sticky + tabs sticky ≥3 tab (shadcn) | `FormView` | `/app/:dt/:name` | `getDoc` | form.spec (TODO) | ✅ split-1280 (3 tab) | **Wired** |
| M00-SHELL-04 sidebar drawer mobile (<768) không vỡ | `AppShell` | mọi route | — | shell.spec (TODO) | ✅ list-390 / split-mobile-390 | **Wired** |

## Checkpoint C — Context + workflow
| REQ | Component | Route | Adapter/API | perm | optimistic/refetch | E2E | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|
| M11-TIMELINE-01 timeline (comments/versions/comm) | `ContextPanel`/`ContextContainer` | `/app/:dt/:name` | `getDoc.docinfo` | read | refetch | timeline.spec (TODO) | ✅ split-1280 | **Wired** |
| M11-COMMENT-01 add comment | `ContextContainer` | doc | add=`addComment` → refetch | read | refetch | ctx.spec (TODO) | ✅ ô Bình luận | **Wired** (Live thật; del=follow-up) |
| M11-ASSIGN-01 assign add/remove | `ContextPanel`+adapter | doc | add=`assign_to.add` remove=`assign_to.remove` ✅ | write | refetch | ctx.spec (TODO) | (read ✅; add picker follow-up) | **Partial** (adapter ✅, picker UI sau) |
| M11-ATTACH-01 attach list/upload/delete | `ContextPanel` | doc | list=`docinfo.attachments` up=`uploadFile` del=`deleteDoc("File")` | write | refetch | ctx.spec (TODO) | (read ✅) | **Partial** (read ✅, upload UI sau) |
| M11-TAGS-01 tags add/remove | `ContextPanel`+adapter | doc | `add_tag`/`remove_tag` ✅ | write | optimistic | ctx.spec (TODO) | (read ✅) | **Partial** (adapter ✅, inline add sau) |
| M11-SHARE-01 shared/connections | — | doc | (chưa nối — ghi rõ) | — | — | — | — | Todo (ghi "chưa nối") |
| M11-WF-01 workflow actions server-driven | `WorkflowActionBar`+`resolveWorkflowActions`(presentation) | doc | src=`get_transitions` ✅ apply=`applyWorkflow`→refetch doc+trans | transition role | refetch | wf.spec (TODO) | ✅ split-1280 (Hoàn thành+menu) | **Wired** |
| M11-ACTIONS-01 Save/Submit/Cancel/Amend/Delete metadata-driven | `FormActionBar`+`resolveFormActions` | doc | perms(docinfo)+docstatus+workflow | theo perm | — | form.spec (TODO)+selfcheck#45c | ✅ split-1280 (Lưu+⋯Xoá) | **Wired** (selfcheck logic ✅) |
| AI-TAB-01 tab AI trong ContextPanel (placeholder) | `ContextPanel` aiSlot=`AIPanel` | doc | — (Pha 2) | — | — | — | ✅ split-ai-1280 | **Wired** |

## Adapter methods (Checkpoint C.1 — ✅ ĐÃ THÊM, verify 16.x, tsc 0)
`getTransitions` (`frappe.model.workflow.get_transitions`, POST doc) · `assignRemove` (`assign_to.remove`) · `addTag`/`removeTag` (`frappe.desk.doctype.tag.tag.add_tag`/`remove_tag`, dt/dn) · `globalSearch` (orch `metaforge.api.global_search`). DTO: `WorkflowTransition`, `GlobalSearchResult`. (share/connections: chưa nối — ghi rõ.)

## E2E (Playwright, mock :8099 — `pnpm --filter @metaforge/demo run e2e`) — **12/12 XANH**
`e2e/list.spec.ts` (7): render cột metadata+STT+badge+summary · standard-filter status + **URL giữ khi reload** + chip · search thu hẹp · chọn dòng → bulk bar · ẩn cột→reload→khôi phục mặc định · Alt←/→ đổi thứ tự hai hướng · resize→reload→reset width.
`e2e/list-responsive.spec.ts` (1): ảnh + overflow + renderer bảng/card tại 390/412/768/1280/1440; desktop kiểm checkbox 44px và STT 56px.
`e2e/split.spec.ts` (4): **click dòng mở 3 cột (list vẫn còn)** · mở URL `?open=` giữ đúng record · header có **workflow action + form action** (metadata-driven) · **tab AI** "Chưa cấu hình".
→ Các REQ có cả Screenshot + E2E xanh (M04-LIST-01/02/05/07, M11-LAYOUT-03, M11-ACTIONS-01, M11-WF-01, AI-TAB-01) đạt mức **Done**; số còn lại `Wired` (thiếu spec riêng hoặc cần backend Live).

## Gate
- Đóng REQ UI = phải có ô Screenshot (đường dẫn ảnh) + E2E (tên spec chạy xanh). Không thì tối đa `Wired`.
- `PHASE_TRACKER.md` chỉ ghi checkpoint `Done` khi mọi REQ của checkpoint đó `Done`.
- **lint no-native-UI (regex vá multi-line) = 0 — ĐẠT GATE.** 120→0: product + **4 builder + BuilderRoutes** đã re-skin. Script giờ **exit 1 nếu >0** (gate cứng CI, không còn report-only). Ngoại lệ allowlist: FileButton bọc `<input type=file>` trong `@metaforge/ui`; canvas signature; style động grid/gantt/%.
