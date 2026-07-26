# MetaForge (Frappe app)

Custom Frappe app đóng gói SPA MetaForge + orchestration methods (§11).

`metaforge.api`:
- `get_boot` — Boot DTO cho SPA (wrap bootinfo)
- `workflow_action_with_comment` — apply_workflow + add_comment (1 txn)
- `kanban_move_with_comment` — update_order_for_single_card + add_comment (Kanban field, KHÔNG workflow)
- `add_tree_node` — wrap treeview.add_node, trả doc đã tạo
- `logout_other_sessions` — clear_sessions(keep_current=True)

Deploy: site RIÊNG trên VPS 222, compose thủ công (KHÔNG `dc.sh`). Xem `docs/technical/architecture.md §5`.
