# MetaForge — Frappe API Contract (PHA 3, verified 16.28.0)

> Signature **grep-verify** trên VPS 222 / Frappe **16.28.0** (2026-07-23). Đây là **contract để code FrappeAdapter** — không phải danh sách tên. FrappeAdapter là nơi DUY NHẤT chạm các API này; renderer/view/builder chỉ gọi qua interface adapter (`architecture.md`).
>
> **Callable:** 🟢 client-callable (whitelisted, SPA gọi được) · 🔒 internal (job/hàm nội bộ — CẤM client gọi thẳng, cần wrapper) · 🌐 REST resource.
> **Type:** json / binary(file) / html.

## §0. Error types (map một chỗ — `FrappeAdapter.mapError`, §F)
| exc_type Frappe | HTTP | UX |
|---|---|---|
| `AuthenticationError` / no session | 401 | toast "phiên hết hạn" → /login |
| `PermissionError` | 403 | empty-state/toast không-quyền |
| `DoesNotExistError` | 404 | "Không tìm thấy" |
| `ValidationError`/`MandatoryError`/`LinkValidationError`/`LinkExistsError` | **417** | inline field / "còn liên kết" |
| **`TimestampMismatchError`** | **417** | Conflict UI (phân biệt validation qua `exc_type`) |
| rate limit | 429 | "thử lại sau" |
| `ServerError`/khác | 500 | toast + mã tra cứu (không lộ stack) |
| network/offline | — | banner "mất kết nối". **V1: đọc từ cache (SWR) được phép; GHI bị disable** (nút mờ + tooltip). Offline write-queue = **P2** (không hứa V1) |

## §1. Auth & Boot
| Method | Callable | Request | Response | Role | Type | Err |
|---|---|---|---|---|---|---|
| `login` | 🟢 `POST /api/method/login` | `{usr, pwd}` | set-cookie `sid` + `{message, home_page, full_name}` | Public | json | 401, 429 |
| `logout` | 🟢 `POST /api/method/logout` | — | 200 | Auth | json | — |
| `frappe.auth.get_logged_user` | 🟢 GET | — | `"<username>"` (**chỉ username**) | Auth | json | 401 |
| **`metaforge.api.get_boot`** (orch, wrap `frappe.boot.get_bootinfo`) | 🟢 GET | — | **BootDTO** `{user, full_name, roles[], user_permissions, lang, csrf_token, sysdefaults{date/number/time_zone/currency}, allowed_workspaces[]}` (đủ field ở appendix §S — orch chỉ trả các key này, không passthrough toàn bộ bootinfo) | Auth | json | 401 |
| Public login context | 🟢 (website ctx) | — | `{social_login_providers[], app_name, logo, lang}` | Public | json | — |

## §2. Meta (§F5, §Q)
| Method | Callable | Request | Response | Role | Err |
|---|---|---|---|---|---|
| `frappe.desk.form.load.getdoctype` | 🟢 | `{doctype, with_parent?}` (**KHÔNG có `cached_timestamp`** — cache theo timestamp là logic riêng của FrappeAdapter, không phải tham số RPC) | `{docs:[FullDocTypeMeta + fields[] + permissions[] + assets(__js,__custom_js,__list_js,__custom_list_js,__calendar_js,__tree_js,__dashboard,__kanban_column_fields,__workflow_docs,__print_formats,__templates,__form_grid_templates,__css)], user_settings}` + `masked_fields` (FormMeta). `docs[0]` = **toàn bộ meta DocType** (adapter map field cần, passthrough phần còn lại) | read(dt) | 403 |
| `frappe.desk.form.load.getdoc` | 🟢 | `{doctype, name}` | `{docs:[doc(**masked value**)], docinfo}` | read(doc) | 403,404 |
| `frappe.desk.form.load.get_docinfo` | 🟢 | `{doctype, name}` | `{comments[], versions[], communications[], assignments[], attachments[], permissions{}}` | read | 403 |

## §3. Document CRUD
| Method | Callable | Request | Response | Role | Err |
|---|---|---|---|---|---|
| Get 1 | 🌐 `GET /api/resource/<dt>/<name>` · `frappe.client.get` | filters/name | `{data: doc}` | read | 403,404 |
| List | 🌐 `GET /api/resource/<dt>` · `frappe.client.get_list` · `reportview.get` | `fields[], filters, or_filters, order_by, limit_start, limit_page_length, parent` | `{data:[...]}` | read | 403 |
| Count | 🟢 `frappe.client.get_count` · `reportview.get_count` | `{doctype, filters}` | int | read | — |
| Get value (fetch_from) | 🟢 `frappe.client.get_value` | `{doctype, filters, fieldname}` | `{message:{...}}` | read | 403 |
| Create | 🌐 `POST /api/resource/<dt>` · `frappe.client.insert` | `{...fields}` | `{data: doc}` (naming cấp) | create | 417 |
| Update | 🌐 `PUT /api/resource/<dt>/<name>` · `frappe.client.set_value` | `{...fields, modified}` | `{data: doc}` | write | **417 TimestampMismatch** / validation |
| Submit | 🟢 `frappe.client.submit` | `{doc: JSON}` | doc(docstatus=1) | submit | 417 |
| Cancel | 🟢 `frappe.client.cancel` | `{doctype, name}` | doc(docstatus=2) | cancel | 417 |
| Delete | 🌐 `DELETE /api/resource/<dt>/<name>` · `frappe.client.delete` | — | `{message:"ok"}` (**hard delete, no undo**) | delete | 417 LinkExists |
| Rename | 🟢 `frappe.client.rename_doc` · `frappe.model.rename_doc` | `{doctype, old_name, new_name, merge?}` | new name | write | 417 |
| Bulk delete | 🟢 `frappe.desk.reportview.delete_items` | `{items[], doctype}` | per-item | delete | — |

## §4. Workflow (E05, §R)
| Method | Callable | Request | Response | Role | Err |
|---|---|---|---|---|---|
| `frappe.model.workflow.apply_workflow` | 🟢 | `{doc(JSON), action}` | doc(state mới) | transition role | 417 |
| `frappe.model.workflow.get_transitions` | 🟢 | `{doc}` | transitions[] (lọc role+condition) | read | — |
| **`metaforge.api.workflow_action_with_comment`** (orch) | 🟢 | `{doctype, name, action, comment?}` | doc | transition role | 417,403 |

## §5. Timeline / Search / File
| Method | Callable | Request | Response | Role | Type | Err |
|---|---|---|---|---|---|---|
| `frappe.desk.form.utils.add_comment` | 🟢 | `{reference_doctype, reference_name, content, comment_email, comment_by}` | Comment | read(doc) | json | 403 |
| `frappe.desk.form.assign_to.add` | 🟢 | `{assign_to[], doctype, name, description?, assignment_rule?}` | ToDo[] | write | json | — |
| `frappe.desk.search.search_link` | 🟢 | `{doctype, txt, query?, filters?, page_length=10, searchfield?, reference_doctype?, ignore_user_permissions?, link_fieldname?}` | `[{value, description}]` | read(dt) | json | — |
| Upload | 🟢 `POST /api/method/upload_file` (multipart) | `file, is_private, doctype, docname, fieldname, folder` | File doc | write | json | 413 |

## §6. Print (§C3)
| Method | Callable | Request | Response | Role | Type |
|---|---|---|---|---|---|
| `frappe.www.printview.get_html_and_style` | 🟢 | `{doctype, name, print_format?, letterhead?, no_letterhead?, _lang?}` | **`{html, style}`** (v16 KHÔNG whitelist `get_html` — chỉ `get_html_and_style`) | print | json |
| `frappe.utils.print_format.download_pdf` | 🟢 | `{doctype, name, format?, no_letterhead=0, letterhead?, language?, pdf_generator="wkhtmltopdf"\|"chrome"}` | **PDF** | print | **binary** |
| `frappe.core.doctype.communication.email.make` | 🟢 | `{doctype, name, recipients, subject, content, send_email=True, print_format?, cc?, bcc?, attachments?, send_me_a_copy?}` (kiểm quyền email) | `{name}` | email | json |

## §7. Report (B5)
| Method | Callable | Request | Response |
|---|---|---|---|
| `frappe.desk.query_report.get_script` | 🟢 | `{report_name}` | `{script, html_format, execution_time?}` (chạy `script` IIFE trong executor) |
| `frappe.desk.query_report.run` | 🟢 | `{report_name, filters?, ignore_prepared_report=False, custom_columns?, is_tree=False, parent_field?, are_default_filters=True, js_filters?}` | `{result, columns, message, chart, report_summary, skip_total_row, status?, execution_time?}` |
| `frappe.desk.reportview.export_query` | 🟢 | query params | file | (binary) |

## §8. Data Import (B3 — partial success)
| Method | Callable | Request | Response |
|---|---|---|---|
| `download_template` | 🟢 | `{doctype, export_fields?, export_records?, export_filters?, file_type}` | file (binary) |
| `get_preview_from_template` | 🟢 | `{data_import, import_file?, google_sheets_url?}` | preview `{columns, data, warnings}` |
| **`form_start_import`** | 🟢 | `{data_import}` | enqueue (job) — **client gọi cái này** |
| `start_import` | 🔒 | (job nội bộ) | — **KHÔNG client gọi** |
| `get_import_status` | 🟢 | `{data_import_name}` | `{status, success?, failed?, total_records}` — `status` là **giá trị raw của DocType Data Import** |
| `download_errored_template` | 🟢 | `{data_import_name}` | file dòng lỗi (binary) |
(module `frappe.core.doctype.data_import.data_import`)

**Status — raw backend vs UI phase (KHÔNG trộn).** `status` trả về là 1 trong 5 giá trị raw (field Select `data_import.status`, default `Pending`):
```ts
type DataImportRawStatus = "Pending" | "Success" | "Partial Success" | "Error" | "Timed Out";
// "Queued"/"Running" KHÔNG phải giá trị backend — chúng là trạng thái UI suy ra khi đang enqueue/poll.
type DataImportUiPhase   = "queued" | "running" | "completed" | "failed";
// map: Pending→queued|running (theo job) · Success/Partial Success→completed · Error/Timed Out→failed
```
Adapter PHẢI so khớp đúng chuỗi raw (`"Partial Success"`, không phải `"partial"`) nếu không polling không kết thúc đúng.

## §9. Permission (M8, M16) — **toàn bộ module: `only_for("System Manager")`**
| Method | Callable | Request | Response |
|---|---|---|---|
| `permission_manager.get_roles_and_doctypes` | 🟢 (SysMgr) | — | `{roles: {label,value}[], doctypes: {label,value}[], doctype_ptype_map: Record<doctype, string[]>}` — **ptype phụ thuộc TỪNG DocType** qua `doctype_ptype_map`, KHÔNG phải mảng ptype toàn cục |
| `permission_manager.get_permissions` | 🟢 | `{doctype?, role?}` | rules[] (DocPerm+Custom) |
| `permission_manager.add` | 🟢 | `{parent, role, permlevel}` | ok |
| `permission_manager.update` | 🟢 | `{doctype, role, permlevel, ptype, value, if_owner=0}` | ok (+clear cache) |
| `permission_manager.remove` | 🟢 | `{doctype, role, permlevel, if_owner=0}` | ok |
| `permission_manager.reset` | 🟢 | `{doctype}` | ok (xoá Custom DocPerm) |
| `user.update_password` | 🟢 | `{new_password, logout_all_sessions=0, key?, old_password?}` | ok | 
| `user.reset_password` | 🟢 | `{user}` | gửi link |
| `frappe.sessions.clear_sessions` | 🔒 | `{user, keep_current, force}` | — (cần wrapper cho SPA) |

## §10. Dashboard / Tree / Backup
| Method | Callable | Request | Response |
|---|---|---|---|
| `number_card.get_result` | 🟢 | `{doc, filters, to_date?}` | number |
| `dashboard_chart.get` | 🟢 | `{chart_name?, chart?, no_cache?, filters?, from_date?, to_date?, timespan?, time_interval?, heatmap_year?, refresh?}` | `{labels[], datasets[]}` |
| `treeview.get_children` | 🟢 | `{doctype, parent, include_disabled?}` | nodes[] |
| `treeview.get_all_nodes` | 🟢 | `{doctype, label, parent, tree_method?}` | nodes[] |
| `treeview.add_node` | 🟢 | form_dict `{doctype, parent, is_root, <parent_field>, ...fields}` | **`null`** — chỉ `doc.save()`, KHÔNG trả node. Adapter phải refetch children (hoặc dùng orchestration `metaforge.api.add_tree_node` trả `TreeNodeDTO`) |
| Tree reparent | 🌐 | set `parent_<dt>` + **save** (NestedSet rebuild lft/rgt) | doc |
| `backups.fetch_latest_backups` | 🟢 (SysMgr) | `{partial?}` | `{database, public, private, config}` — **LIỆT KÊ path backup 30 ngày gần nhất, KHÔNG tạo backup mới**. Tạo backup/Data Export = luồng riêng |

## §11. Orchestration MetaForge (§R — CHỈ các method này)
| Method | Việc | Atomic |
|---|---|---|
| `metaforge.api.get_boot` | wrap `get_bootinfo` → BootDTO | read |
| `metaforge.api.workflow_action_with_comment` | apply_workflow + add_comment (**CHỈ Workflow Action**) | 1 txn |
| `metaforge.api.kanban_move_with_comment` (nếu cần atomic) | `update_order_for_single_card` + add_comment (Kanban **field Select/Link**, KHÔNG phải workflow) | 1 txn |
| `metaforge.api.add_tree_node` (nếu cần trả node) | wrap `treeview.add_node` rồi trả `TreeNodeDTO` (vì native trả `null`) | 1 txn |
| `metaforge.api.logout_other_sessions` (nếu cần) | wrap `frappe.sessions.clear_sessions(keep_current=True)` | — |

> Thêm method ngoài §11 = phải cập nhật bảng này + appendix §R. Mọi dòng 🔒 CẤM client gọi thẳng — phải qua wrapper/orchestration.

## §12. Notification / Workspace / Kanban (đóng vòng 1:1 với FrappeAdapter)
| Method | Callable | Request | Response |
|---|---|---|---|
| `notification_log.get_notification_logs` | 🟢 | `{limit=20}` | `{notification_logs[], user_info}` |
| `notification_log.mark_as_read` | 🟢 | `{docname}` | — |
| `notification_log.mark_all_as_read` | 🟢 | — | — |
| `notification_log.trigger_indicator_hide` | 🟢 | — | — (publish realtime ẩn chấm đỏ) |
| _unread count_ | — | (KHÔNG có method riêng) | lấy từ boot / `Notification Settings`, không tự chế API |
| `desktop.get_workspaces` | 🟢 | — | **`{pages[], has_access, has_create_access}`** (KHÔNG phải mảng thẳng — adapter bóc `.pages`) |
| `desktop.get_desktop_page` | 🟢 | `{page}` = **JSON `{name, title?, public?}`** (backend `loads(page).get("name")`; bare name cũng chạy nhưng nên gửi đủ để cache-hit) | `{charts, shortcuts, cards, onboardings, quick_lists, number_cards, custom_blocks}` |
| `kanban_board.get_kanban_boards` | 🟢 | `{doctype}` | boards[] |
| `kanban_board.update_order_for_single_card` | 🟢 | `{board_name, docname, from_colname, to_colname, old_index, new_index}` | board — **`set_value(dt, name, board.field_name, to_colname)`** (đổi cột = set field) |
| `kanban_board.add_card` / `add_column` / `archive_restore_column` / `update_column_order` / `save_settings` | 🟢 | (xem source) | board |

## §13. Amend & Builder-schema mutations (ghi qua meta-DocType)
> Builder KHÔNG có RPC riêng — nó **CRUD trên các meta-DocType** qua §3 (`/api/resource`). Đây là ánh xạ adapter→doctype:

| Adapter method | Cơ chế thật | Meta-DocType đích |
|---|---|---|
| `amend(dt,name)` | client tạo doc mới, set `amended_from=name` rồi insert (§3 Create) | (chính DocType đó) |
| `saveMeta` | CRUD **DocType** + child **DocField** (dev mode) | `DocType` / `DocField` |
| `saveCustomize` | CRUD **Custom Field** + **Property Setter** (`customize_form.save_customization`) | `Custom Field` / `Property Setter` |
| `saveWorkflow` | CRUD **Workflow** + child `Workflow Document State` / `Workflow Transition` | `Workflow` |
| `savePrintFormat` | CRUD **Print Format** (`format_data` JSON hoặc `html`+`css`) | `Print Format` |
| `saveDashboard` | CRUD **Dashboard** + child `Dashboard Chart Link`(charts) / `Number Card Link`(cards) + `chart_options` | `Dashboard` |

> `customize_form.save_customization` là whitelisted; DocType/DocField save cần dev-mode/System Manager. Mọi mutation vẫn đi qua §3 CRUD + các whitelisted trên — KHÔNG có "builder API" ẩn.
