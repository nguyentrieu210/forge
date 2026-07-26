# Bề mặt API — trạng thái thực tế

Danh sách rút **tự động** từ [client/packages/adapter-frappe/src/frappe-adapter.ts](../client/packages/adapter-frappe/src/frappe-adapter.ts)
— toàn bộ endpoint MetaForge FE thực sự gọi: 47 endpoint Frappe thuần + 21
endpoint `metaforge.api.*` + REST `/api/resource/*`.

Trạng thái: ☑ xong, có test E2E trên workerd thật · ✖ **cố ý không làm**, kèm lý do

Bằng chứng chạy thật: [VERIFICATION.md](VERIFICATION.md).

## Nền transport

| Bề mặt | TT |
|---|---|
| `POST /api/method/login` · `logout` — phiên cookie `sid` | ☑ |
| `X-Frappe-CSRF-Token` — double-submit có ràng buộc nonce trong phiên | ☑ |
| Envelope `{ "message": … }` cho mọi `/api/method/*` | ☑ |
| `/api/resource/:doctype[/:name]` GET/POST/PUT/DELETE | ☑ |
| **HTTP 417 TimestampMismatchError** cho xung đột ghi | ☑ |
| `exc_type` + `_server_messages` (lồng 2 lớp, mang `fieldname`) | ☑ |
| Guest gọi method cần đăng nhập → `PermissionError`/403 kèm "Login to access" | ☑ |

## Tier 1 — Desk boot, xem và sửa chứng từ

| Endpoint | TT |
|---|---|
| `metaforge.api.get_boot` — `site_name` = tenant | ☑ |
| `frappe.desk.form.load.getdoctype` (+`with_parent`, `masked_fields`) | ☑ |
| `frappe.desk.form.load.getdoc` (+`docinfo`, quyền hiệu dụng) | ☑ |
| `/api/resource/:dt` GET list · POST create | ☑ |
| `/api/resource/:dt/:name` PUT save · DELETE | ☑ |
| `frappe.client.submit` · `cancel` | ☑ |
| `frappe.client.get_value` · `get_count` | ☑ |
| `frappe.desk.reportview.get` · `get_count` | ☑ |
| `frappe.desk.search.search_link` | ☑ |
| `metaforge.api.get_capabilities` (fail-closed) | ☑ |
| `metaforge.api.resolve_display_values` | ☑ |
| `metaforge.api.global_search` (permission-aware, fail-closed) | ☑ |
| `frappe.desk.form.utils.add_comment` | ☑ |

## Tier 2 — Workflow, chia sẻ, phân quyền, đa ngữ

| Endpoint | TT |
|---|---|
| `frappe.model.workflow.apply_workflow` | ☑ |
| `metaforge.api.get_workflow_transitions` (kèm `has_workflow`) | ☑ |
| `metaforge.api.workflow_action_with_comment` | ☑ |
| `frappe.share.add` · `get_users` · `remove` | ☑ |
| `frappe.desk.form.assign_to.add` · `remove` | ☑ |
| `frappe.desk.doctype.tag.tag.add_tag` · `remove_tag` | ☑ |
| `metaforge.api.add_user_permission` · `remove_user_permission` | ☑ |
| `metaforge.api.set_user_roles` · `get_access_profile` · `explain_permission` | ☑ |
| `metaforge.api.logout_other_sessions` | ☑ |
| `frappe.core.doctype.user.user.update_password` | ☑ |
| `metaforge.api.translate_strings` | ☑ |
| `frappe.client.rename_doc` / `frappe.model.rename_doc` | ☑ |
| `frappe.core.page.permission_manager.permission_manager.*` (6) | ✖ DocPerm sửa qua Property Setter / DocType resource; endpoint riêng sẽ là con đường thứ hai vào cùng dữ liệu, dễ lệch nhau |

## Tier 3 — Builder

| Endpoint | TT |
|---|---|
| `/api/resource/DocType` GET/POST/PUT | ☑ |
| `/api/resource/Custom Field` POST/PUT/DELETE | ☑ |
| `/api/resource/Property Setter` POST/PUT/DELETE | ☑ |
| `frappe.custom.doctype.customize_form.customize_form.save_customization` | ☑ |
| `/api/resource/Workflow` · `/api/resource/Print Format` | ☑ |
| `frappe.desk.desktop.get_workspaces` · `get_desktop_page` (suy từ app đã cài) | ☑ |

## Tier 4 — Bề rộng view

| Endpoint | TT |
|---|---|
| `frappe.www.printview.get_html_and_style` | ☑ |
| `frappe.desk.reportview.delete_items` (báo theo từng item) | ☑ |
| `frappe.desk.reportview.export_query` (CSV, chống formula injection) | ☑ |
| `frappe.desk.notifications.get_open_count` | ☑ |
| `frappe.desk.treeview.get_children` · `add_node` · `metaforge.api.add_tree_node` | ☑ |
| `frappe.desk.query_report.run` | ☑ |
| `frappe.desk.query_report.get_script` | ☑ trả script rỗng — platform không thể chạy report script (code tuỳ ý); rỗng để FE vẽ bảng thường thay vì báo lỗi |
| `data_import.get_preview_from_template` · `form_start_import` | ☑ |
| `kanban_board.get_kanban_boards` · `update_order_for_single_card` · `metaforge.api.kanban_move_with_comment` | ☑ |
| `notification_log.*` (4) | ☑ |
| `metaforge.api.get_business_context` · `get_contextual_list` · `get_contextual_count` | ☑ |
| `metaforge.api.get_application_catalog` | ☑ |
| `data_import.download_template` · `download_errored_template` · `get_import_status` | ✖ import ở đây là đồng bộ một lượt, không có job nền nên không có "status" để hỏi; mẫu tải về là file tĩnh, thuộc FE |
| `metaforge.api.get_overview` · `get_processes` | ✖ **nội dung nghiệp vụ của APP**, không phải của nền tảng. Nền tảng dựng ra là bịa số liệu. Đúng chỗ là Worker của app (Pha 5) |
| `dashboard_chart.get` · `number_card.get_result` | ✖ cùng lý do trên — định nghĩa biểu đồ là cấu hình của app |
| `communication.email.make` | ✖ chưa cấu hình mail transport. Trả rỗng "đã gửi" là nói dối về một việc người dùng tin là đã xảy ra |
| `frappe.utils.backups.fetch_latest_backups` | ✖ backup của D1 là Time Travel phía Cloudflare, không phải file tải về. Trả đường dẫn giả sẽ khiến người ta tin có bản sao lưu mà không có |

Mọi endpoint ✖ khi gọi vào đều trả **404 `DoesNotExistError`**, không bao giờ trả
"thành công rỗng" — màn hình phải báo lỗi chứ không được render như thể có dữ liệu.

## Ngoài giao thức Frappe

Frappe cài app bằng CLI trên filesystem nên không có endpoint để bắt chước. Ba
endpoint dưới đây đặt tên `forge.*` chứ không `frappe.*`, để một client Frappe
không gọi vào thứ mang nghĩa khác ở đây:

| Endpoint | TT |
|---|---|
| `forge.apps.list` | ☑ |
| `forge.apps.install` (cài/nâng cấp; gói giống hệt là no-op) | ☑ |
| `forge.apps.uninstall` (từ chối khi doctype còn dữ liệu) | ☑ |

## Metadata chưa có consumer

`track_seen` vẫn là metadata được validate và lưu nhưng chưa tầng nào đọc. Ghi ra
đây để không ai tưởng nó đã có tác dụng. (`is_single` **đã** hiện thực.)
