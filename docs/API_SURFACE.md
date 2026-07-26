# Bề mặt API phải hiện thực

Danh sách rút **tự động** từ [client/packages/adapter-frappe/src/frappe-adapter.ts](../client/packages/adapter-frappe/src/frappe-adapter.ts)
— đây là toàn bộ endpoint MetaForge FE thực sự gọi. 47 endpoint Frappe thuần + 21 endpoint
`metaforge.api.*` (app Frappe đi kèm, nguồn `client/frappe-app/metaforge/metaforge/api.py`) + REST
`/api/resource/*`.

Trạng thái: ☐ chưa làm · ◐ đang làm · ☑ xong + có test

## Nền transport (bắt buộc trước mọi thứ)

| Bề mặt | Ghi chú | TT |
|---|---|---|
| `POST /api/method/login` · `logout` | Phiên cookie `sid`, không phải Bearer. CloudForge hiện dùng JWT Bearer → phải bắc cầu | ☐ |
| `X-Frappe-CSRF-Token` | Header CSRF trên mọi mutation | ☐ |
| Envelope `{ "message": … }` | Mọi `/api/method/*` bọc trong `message` | ☐ |
| `GET/POST/PUT/DELETE /api/resource/:doctype[/:name]` | CRUD của `frappe-react-sdk` | ☐ |
| **HTTP 417 TimestampMismatch** | Xung đột ghi. FE bắt mã này để hiện "bản ghi đã đổi" | ☐ |
| Lỗi: `exc_type`, `_server_messages` | `mapError` của FE phân nhánh theo các trường này | ☐ |

## Tier 1 — Desk boot được, xem và sửa được chứng từ (15)

| Endpoint | Cần gì ở kernel | TT |
|---|---|---|
| `metaforge.api.get_boot` | user, roles, sysdefaults, locale, danh sách doctype | ☐ |
| `frappe.desk.form.load.getdoctype` | dịch `DocTypeMeta` → hình dạng DocType của Frappe | ☐ |
| `frappe.desk.form.load.getdoc` | trả `{docs:[doc], docinfo}` — docinfo gồm comment/assign/share/version | ☐ |
| `/api/resource/:dt` GET (list) | có sẵn `documents/list`, cần dịch filter/order | ☐ |
| `/api/resource/:dt` POST | có sẵn `commands` action=create | ☐ |
| `/api/resource/:dt/:name` PUT | action=save + dịch `modified` ⇄ `version` | ☐ |
| `/api/resource/:dt/:name` DELETE | **kernel chưa có xoá** — phải thêm | ☐ |
| `frappe.client.submit` · `cancel` | có sẵn action=submit/cancel | ☐ |
| `frappe.client.get_value` | đọc 1 field theo filter | ☐ |
| `frappe.desk.reportview.get_count` | có sẵn `documents/count` | ☐ |
| `frappe.desk.search.search_link` | tìm cho Link field, có `filters` + `reference_doctype` | ☐ |
| `metaforge.api.get_capabilities` | quyền hiệu dụng theo doctype/doc — kernel đã có engine | ☐ |
| `metaforge.api.resolve_display_values` | tra `title_field` hàng loạt | ☐ |
| `metaforge.api.global_search` | **kernel chưa có** — cần index tìm kiếm | ☐ |
| `frappe.desk.form.utils.add_comment` | có sẵn `document_comments` | ☐ |

## Tier 2 — Workflow, chia sẻ, phân quyền, đa ngữ (20)

| Endpoint | Ghi chú | TT |
|---|---|---|
| `frappe.model.workflow.apply_workflow` | kernel đã có workflow engine | ☐ |
| `metaforge.api.get_workflow_transitions` | transition hợp lệ theo role | ☐ |
| `metaforge.api.workflow_action_with_comment` | | ☐ |
| `frappe.share.add` · `get_users` · `remove` | bảng `document_shares` đã có | ☐ |
| `frappe.desk.form.assign_to.add` · `remove` | bảng `assignments` đã có | ☐ |
| `metaforge.api.add_user_permission` · `remove_user_permission` | bảng `user_permissions` đã có | ☐ |
| `metaforge.api.set_user_roles` · `get_access_profile` · `explain_permission` | | ☐ |
| `permission_manager.*` (6 endpoint) | sửa DocPerm chuẩn — cần tầng tuỳ biến (Tier 3) | ☐ |
| `metaforge.api.translate_strings` | **kernel chưa có i18n** — cần bảng catalog dịch | ☐ |
| `frappe.client.rename_doc` | **kernel chưa có rename** (`allow_rename` là metadata chết) | ☐ |

## Tier 3 — Builder: chỗ quyết định "cài app nhanh" (9)

| Endpoint | Chặn bởi | TT |
|---|---|---|
| `/api/resource/DocType` POST/PUT | kernel đã có `doctype_definitions` | ☐ |
| `/api/resource/Custom Field` | **kernel chưa có Custom Field** | ☐ |
| `/api/resource/Property Setter` | **kernel chưa có Property Setter** | ☐ |
| `customize_form.save_customization` | cần cả hai cái trên | ☐ |
| `/api/resource/Workflow` | đã có bảng `workflows` | ☐ |
| `/api/resource/Print Format` | đã có bảng `print_formats` | ☐ |
| `/api/resource/Dashboard Chart` · `Number Card` | chưa có | ☐ |
| `frappe.desk.desktop.get_workspaces` · `get_desktop_page` | chưa có khái niệm workspace | ☐ |

## Tier 4 — Bề rộng view (24)

Kanban (3) · treeview (2 + `metaforge.api.add_tree_node`) · notification log (4) ·
`get_open_count` · data import (3 + 2 tải mẫu) · print (`printview.get_html_and_style`,
`download_pdf`) · email (`communication.email.make`) · query report (`run`, `get_script`) ·
tag (2) · `reportview.delete_items` · `export_query` · `dashboard_chart.get` ·
`number_card.get_result` · `backups.fetch_latest_backups` · `user.update_password` ·
`metaforge.api.logout_other_sessions` · `get_business_context` · `get_application_catalog` ·
`get_overview` · `get_processes` · `get_contextual_list` · `get_contextual_count` ·
`kanban_move_with_comment`

Bốn endpoint `get_business_context` / `get_application_catalog` / `get_overview` / `get_processes` là
**đặc thù MetaForge**, không có trong Frappe gốc — đọc `client/frappe-app/metaforge/metaforge/api.py`
để lấy hình dạng chính xác trước khi làm.
