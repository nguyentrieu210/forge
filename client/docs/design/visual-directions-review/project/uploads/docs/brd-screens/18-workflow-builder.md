# M18 — Workflow Builder (Frappe v16)

> Thiết kế Workflow đúng data model Frappe **16.28** (đã grep-verify VPS 222). KHÔNG phải graph editor chung — bám đúng doctype `Workflow` + child `Workflow Document State` + child `Workflow Transition` + master `Workflow State`.

## Khối 1 — Định danh
- **Tên**: Workflow Builder — **route**: `/app/workflow-builder/<name>` (+ `/app/workflow/<name>` form thô).
- **Role**: System Manager.
- **Contract**: `screen-catalog-contract.md` + `brd-builder/00-builder-engine.md` (Node-Graph canvas) + appendix §R (workflow+comment atomic).
- **Nguồn (v16 verified)**:
  - `Workflow` (parent): `document_type`, `workflow_name`, **`workflow_state_field` (Data = tên fieldname lưu state)**, `is_active`, `override_status`, `send_email_alert`, `enable_action_confirmation`, `workflow_data`.
  - child **`states[]` = Workflow Document State**: `state`(Link→**Workflow State** master), `doc_status`(0/1/2), `allow_edit`(role), `update_field`, `update_value`, `is_optional_state`, `avoid_status_override`, `evaluate_as_expression`, `send_email`, `message`, `next_action_email_template`, `workflow_builder_id`.
  - child **`transitions[]` = Workflow Transition**: `state`→`action`→`next_state`, `allowed`(role), **`condition` (Python, `frappe.safe_eval`)**, `allow_self_approval`, `send_email_to_creator`, `transition_tasks`, `workflow_builder_id`.
  - **`Workflow State`** = master (Link target, tên+style) — KHÔNG phải child; state mới có thể cần tạo master trước.
  - Apply runtime: `frappe.model.workflow.apply_workflow(doc, action)`; điều kiện: `is_transition_condition_satisfied` (Python).

## Khối 2 — Layout
**Desktop:** canvas Node-Graph (builder-engine) —
- **Nodes = Workflow Document State** (kéo đặt; node hiện: state name, **docstatus badge 0/1/2**, allow_edit role, cờ `is_optional_state`/`avoid_status_override`).
- **Edges = Workflow Transition** (nối state→next_state; nhãn = `action`; `allowed` role; `condition` Python; `allow_self_approval`).
- Panel phải: **Workflow settings** (`document_type`, `workflow_state_field` — nếu field CHƯA có trên DocType, cảnh báo "Frappe sẽ tạo hidden Custom Field Link→Workflow State"; `is_active`, `override_status`, `send_email_alert`, `enable_action_confirmation`). Chọn node → sửa Workflow Document State; chọn edge → sửa Transition (condition editor ghi rõ **Python**).
- **State đầu = `states[0]`** (idx đầu) — đánh dấu rõ, KHÔNG suy bằng indegree.

**Mobile:** xem đồ thị + sửa state/transition qua form list; không vẽ kéo-thả (builder-engine §13: "tốt nhất desktop").

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 1 Phân quyền | **Áp dụng — cốt lõi** — transition gated theo `allowed` role; state `allow_edit` role; `allow_self_approval` |
| 3 Audit | **Áp dụng** — sửa Workflow ghi Version |
| 7 Kanban | **Áp dụng (liên quan)** — `workflow_state_field` là field Kanban M06 dùng (chip lý do khi lùi) |
| 15 Tiện VN | **Áp dụng** — nhãn state/action tiếng Việt |
| 8/2/4/6/10/11/13/14/18/5/12/19 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `WorkflowCanvas` (React Flow) | states + transitions | kéo node; nối edge; auto-layout | System Manager | skeleton |
| `StateNode` | Workflow Document State | state(Link→Workflow State), doc_status, allow_edit, cờ optional/avoid_override | System Manager | badge docstatus |
| `TransitionEdge` | Workflow Transition | action + allowed role + **condition Python** + allow_self_approval | System Manager | — |
| `WorkflowSettings` | Workflow parent | document_type + workflow_state_field(Data) + is_active + override_status + send_email_alert + enable_action_confirmation | System Manager | cảnh báo tạo hidden field |
| `StateMasterPicker` | Workflow State master | chọn/tạo master state (Link) | System Manager | — |
| `ConditionEditor` | transition.condition | editor **Python** (không JS) + `doc.` gợi ý | System Manager | báo cú pháp |
| `Validator` | — | xem Khối 4 validate | — | chỉ chỗ lỗi trên canvas |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tạo Workflow | `POST /api/resource/Workflow` | có `document_type` + `workflow_state_field` + ≥1 state | doc mới | "Thiếu DocType/field trạng thái" |
| Sửa Workflow | **`PUT /api/resource/Workflow/<name>`** | như trên | lưu + clear cache | — |
| Thêm state (child) | trong doc Workflow (`states[]` = Workflow Document State) | `state`(master tồn tại/ tạo mới) + `doc_status` hợp lệ | node mới | "State master chưa tồn tại" |
| Thêm transition | `transitions[]` | `state`/`next_state` tồn tại + `action` + `allowed` role; `condition` Python hợp lệ | edge mới | "Transition trùng (state+action)"; "condition sai cú pháp Python" |
| Đặt workflow_state_field | field Data trên Workflow | field trên DocType tồn tại (hoặc chấp nhận Frappe tạo hidden Custom Field Link→Workflow State) | lưu | — |
| Bật (`is_active=1`) | PUT Workflow/<name> | System Manager | **cảnh báo: workflow ACTIVE khác cùng DocType sẽ bị vô hiệu** | — |
| Xoá state / đổi docstatus state | PUT/DELETE | **impact check**: có document đang ở state này không? | confirm mạnh nếu đang dùng | "N document đang ở state '<x>' — không xoá / cần di trú" |

**Validate đồ thị (đúng v16 `apply_workflow`):**
- Phải có `states[0]` (state đầu).
- **docstatus rules** (từ `apply_workflow` L207–220): cho phép `0→0`, `0→1`(submit), `1→1`, `1→2`(cancel). **CẤM** outgoing từ `2`(cancelled); **CẤM** `1→0`; **CẤM** `0→2`.
- Không transition trùng `(state, action)`; `next_state` tồn tại trong states.

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Tạo workflow mới | gợi ý state đầu docstatus 0 (Draft) | sửa được |
| Thêm transition | `allowed` mặc định = role đang chọn; `condition` trống | — |
| workflow_state_field | gợi ý field Select/Data có sẵn; nếu chọn field chưa có → thông báo Frappe tạo hidden field | — |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton canvas |
| Empty | workflow mới → gợi ý thêm state đầu (states[0]) |
| Error | đồ thị vi phạm docstatus rules / trùng transition → chặn lưu + chỉ chỗ lỗi |
| Offline | banner; cần mạng |
| Thiếu quyền | không System Manager → chặn |
| Dữ liệu dài | nhiều state → auto-layout + zoom/pan |
| In-flight | Lưu spinner; impact-check spinner khi xoá state |

## Acceptance Criteria (theo appendix §N)
- [ ] Render 100% từ metadata (bật 1 DocType chưa từng thấy → đúng như Desk v16, KHÔNG hardcode)
- [ ] Desktop/mobile tách cây riêng; test 390/412/768/1280
- [ ] Keyboard shortcut của màn + `?` cheatsheet (mục áp dụng)
- [ ] Permission chốt ở **SERVER** (role thấp bypass UI → 403/mask, không chỉ ẩn nút)
- [ ] Loading skeleton khớp cấu trúc + empty 3 trạng thái + error tiếng Việt (không lộ stack/SQL)
- [ ] Optimistic + rollback (thao tác nhẹ); 417 conflict không ghi đè (màn nào có ghi)
- [ ] Lifecycle §D + State machine §E đúng (không tự chế state)
- [ ] Error Matrix §F map đủ; Cache §G; Perf §H đạt ngân sách của màn
- [ ] Test: unit(logic) + integration(API+quyền) + visual baseline 390/768/1280 (light+dark)
- [ ] Mục nghiệp vụ không áp dụng → ghi "N/A + lý do", không bỏ trống
