# API Contract Matrix — FrappeAdapter ↔ endpoint

> Gate 1 deliverable. Mỗi method `FrappeAdapter` map đúng **1** endpoint (native Frappe hoặc `metaforge.api.*`).
> Verified: `V-live` = có bằng chứng live trên metaforge.localhost (Frappe 16.28) hoặc curl/E2E; `V-native` =
> native Frappe 16.29 đã grep-verify (header `api.py`); `UNVERIFIED_LIVE` = chưa có fixture live.
> Envelope: hầu hết trả `{message: …}` (unwrap 1 chỗ `this.unwrap`). Lỗi: `mapError` (§0) — xem KNOWN_GAPS.

## metaforge.api.* (orchestration THIN — 6 method)
| Adapter | Endpoint | Verify |
|---|---|---|
| getBoot | `metaforge.api.get_boot` | V-live (boot E2E) |
| workflowActionWithComment | `metaforge.api.workflow_action_with_comment` | V-live (workflow E2E) |
| kanbanMove(+comment) | `metaforge.api.kanban_move_with_comment` | V-native |
| addTreeNode | `metaforge.api.add_tree_node` | V-native |
| logoutOtherSessions | `metaforge.api.logout_other_sessions` | V-native |
| **globalSearch** | **`metaforge.api.global_search`** | **V-live ✅ MỚI** (P0-02 fix; scoped get_list lọc quyền, global=index+has_permission hậu-lọc; text rỗng→[]) |

## CRUD / doc (native)
| Adapter | Endpoint | Verify |
|---|---|---|
| getDoc | `frappe.desk.form.load.getdoc` | V-live |
| getMeta/getAssets | `frappe.desk.form.load.getdoctype` | V-live |
| getList / getCount | `frappe.client.get_list`* (reportview) | V-live |
| getValue | `frappe.client.get_value` | V-native |
| createDoc/updateDoc/deleteDoc | REST `/api/resource` + `reportview.delete_items` | V-live |
| submit / cancel | `frappe.client.submit` / `.cancel` | UNVERIFIED_LIVE (ToDo không submittable) |
| rename | `frappe.client.rename_doc` | V-native |
| amend | createDoc(amended_from) | V-native |

## Workflow / social / search / file (native)
| Adapter | Endpoint | Verify |
|---|---|---|
| getTransitions / applyWorkflow | `frappe.model.workflow.get_transitions` / `apply_workflow` | V-live |
| addComment | `frappe.desk.form.utils.add_comment` | V-live |
| assign / assignRemove | `frappe.desk.form.assign_to.add` / `remove` | V-live |
| addTag / removeTag | `frappe.desk.doctype.tag.tag.add_tag` / `remove_tag` | V-live |
| searchLink | `frappe.desk.search.search_link` | V-live |
| getShares/addShare/removeShare | `frappe.share.get_users` / `add` / `remove` | V-live |
| uploadFile | SDK `file().uploadFile` | V-live |
| callGet/callPost | (generic whitelisted — App-mode) | V-live (aphvh.api.wms.*) |

## System / desk (native)
| Area | Endpoint(s) | Verify |
|---|---|---|
| workspaces | `frappe.desk.desktop.get_workspaces` / `get_desktop_page` | V-live |
| permissions | `permission_manager.get_roles_and_doctypes` / `get_permissions` / `add`/`remove`/`update`/`reset` | V-live (get*), UNVERIFIED_LIVE (mutate) |
| notifications | `notification_log.get_notification_logs` / `mark_as_read` / `mark_all_as_read` / `get_open_count` | V-live |
| data import | `data_import.download_template` / `get_preview_from_template` / `form_start_import` / `get_import_status` / `download_errored_template` | V-live (import E2E) |
| report / print | `query_report.run` / `get_script` · `printview.get_html_and_style` / `print_format.download_pdf` | V-native |
| kanban / dashboard / tree | `kanban_board.*` · `dashboard_chart.get` / `number_card.get_result` · `treeview.get_children` | V-native |
| backup / password / customize | `backups.fetch_latest_backups` · `user.update_password` · `customize_form.save_customization` | V-native |
| email | `communication.email.make` | V-native |

## Known contract gaps (→ Gate 1 tiếp / KNOWN_GAPS)
- **DTO chưa runtime-validate**: response cast trực tiếp (chưa schema). → step DTO-schema.
- **Error envelope**: `mapError` dựa `exc_type`; SDK có thể để lỗi ở `exception`/`_server_messages` → có thể misclassify. → step error-normalize.
- **Cache**: queryKey `["meta", doctype]` chưa gồm site/user/lang/version. → step cache-scope.
- **Capabilities**: `permsFrom` optimistic full-perm khi thiếu key (P0-05). → step effective-capabilities fail-closed.
- **global_search global-mode**: phụ thuộc index `__global_search` (site này chưa build → []). Scoped mode (Awesomebar) OK.
- submit/cancel/amend + permission-mutate: UNVERIFIED_LIVE (cần doctype submittable + fixture).
