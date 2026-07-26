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
| M04-LIST-01 render cột từ metadata (in_list_view) | `ListView` | `/app/:dt` | `getMeta`,`getList` | list.spec | 1280 | Todo |
| M04-LIST-02 search + standard filters → server | `SearchInput`,`StandardFilters` | `/app/:dt` | `getList(filters/orFilters)` | list.spec | 1280 | Todo |
| M04-LIST-03 column picker (ẩn/hiện/resize) lưu localStorage | `ColumnPicker` | `/app/:dt` | — | list.spec | 1280 | Todo |
| M04-LIST-04 checkbox+STT+ảnh+status badge | `ListView` cols | `/app/:dt` | `getList` | list.spec | 1280 | Todo |
| M04-LIST-05 selection + bulk (xoá/xuất) | `BulkActionBar` | `/app/:dt` | `bulkDelete`,`exportQuery` | list.spec | 1280 | Todo |
| M04-LIST-06 pagination X-Y/Z + summary row | `Pagination`,`SummaryRow` | `/app/:dt` | `getCount` | list.spec | 1280 | Todo |
| M04-LIST-07 URL giữ filter/view/sort/page/selected | router state | `/app/:dt?...` | — | list.spec | — | Todo |
| M04-STATE-01 skeleton + 3 empty + error VN | `ListView` states | `/app/:dt` | — | list.spec | empty | Todo |
| M11-LAYOUT-01 3 cột resizable (≥1280) | `SplitView` | `/app/:dt/:name` | — | split.spec | 1280 | Todo |
| M11-LAYOUT-02 responsive 768 Sheet / 390 stack+BottomNav | `SplitView` | `/app/:dt/:name` | — | split.spec | 768,390 | Todo |
| M11-LAYOUT-03 click row mở split (không chuyển màn) + ↑↓/Esc | `SplitView` | `/app/:dt` → `:name` | — | split.spec | 1280 | Todo |
| M11-FORM-01 header sticky + tabs sticky ≥3 tab | `FormView` | `/app/:dt/:name` | `getDoc` | form.spec | 1280 | Todo |

## Checkpoint C — Context + workflow
| REQ | Component | Route | Adapter/API | perm | optimistic/refetch | E2E | Screenshot | Status |
|---|---|---|---|---|---|---|---|---|
| M11-TIMELINE-01 timeline (comments/versions/comm) | `Timeline` | `/app/:dt/:name` | `getDoc.docinfo` | read | refetch | timeline.spec | detail-right | Todo |
| M11-COMMENT-01 add/delete comment | `ContextPanel` | doc | add=`addComment` del=`deleteDoc("Comment")` | read | refetch timeline | ctx.spec | — | Todo |
| M11-ASSIGN-01 assign add/remove | `ContextPanel` | doc | add=`assign_to.add` remove=`assign_to.remove`(THÊM) | write | refetch | ctx.spec | — | Todo |
| M11-ATTACH-01 attach list/upload/delete | `ContextPanel` | doc | list=`docinfo.attachments` up=`uploadFile` del=`deleteDoc("File")` | write | refetch | ctx.spec | — | Todo |
| M11-TAGS-01 tags add/remove | `ContextPanel` | doc | `frappe.desk.doctype.tag.tag`(THÊM) | write | optimistic | ctx.spec | — | Todo |
| M11-SHARE-01 shared/connections | `ContextPanel` | doc | API riêng (THÊM/ghi "chưa nối" nếu chưa) | — | refetch | ctx.spec | — | Todo |
| M11-WF-01 workflow actions server-driven | `WorkflowActionBar`+`WorkflowResolver`(presentation) | doc | src=`get_transitions`(THÊM) apply=`applyWorkflow` → refetch doc+trans+timeline | transition role | refetch | wf.spec | 1280 | Todo |
| M11-ACTIONS-01 Save/Submit/Cancel/Amend/Delete metadata-driven | `FormHeader` | doc | perms+docstatus+workflow | theo perm | — | form.spec | 1280 | Todo |

## Adapter methods CẦN THÊM (Checkpoint C)
`assignRemove` (`assign_to.remove`) · `getTransitions` (`frappe.model.workflow.get_transitions`) · `addTag`/`removeTag` · `globalSearch` (orch `metaforge.api.global_search`) · (share/connections nếu làm). Mỗi cái cập nhật `api-map.md` + interface + verify 16.x.

## Gate
- Đóng REQ UI = phải có ô Screenshot (đường dẫn ảnh) + E2E (tên spec chạy xanh). Không thì tối đa `Wired`.
- `PHASE_TRACKER.md` chỉ ghi checkpoint `Done` khi mọi REQ của checkpoint đó `Done`.
