# M06 — Kanban View (renderer generic)

> Board kéo-thả từ **Select field** (hoặc `workflow_state`) + Frappe **Kanban Board** meta. Áp **luật chip lý do khi đổi cột — KHÔNG NGOẠI LỆ** (screen-catalog Kanban). Đối chiếu: Frappe Kanban v16.

## Khối 1 — Định danh
- **Tên**: Kanban View — **route**: `/app/<doctype>/view/kanban/<board-name>`.
- **Role**: user có `read` (+ `write` để đổi cột).
- **Contract**: `screen-catalog-contract.md` Kanban/Pipeline (chip lý do) + `data-table-contract.md`.
- **Nguồn**: `Kanban Board` (field cột = `field_name` Select, filters, `columns` order) + `get_list` documents.

## Khối 2 — Layout
**Desktop:** cột = giá trị Select field (`field_name`). Đầu mỗi cột: tên + **đếm thẻ + tổng giá trị** (nếu có field tiền). Thẻ: title (`title_field`) + field quyết định (giá trị tiền, hạn, người phụ trách, tuổi thẻ — quá hạn đổi màu). **Kéo-thả** đổi cột = đổi giá trị Select thật. Toggle **Bảng ↔ Kanban** dùng chung filter. Nút thêm cột/đổi thứ tự cột (nếu quyền).

**Mobile:** KHÔNG kéo-thả — bấm thẻ → action sheet "Chuyển sang giai đoạn…" → cùng dialog chip lý do.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7 Kanban | **Áp dụng — cốt lõi**: mọi lần đổi cột (kéo-thả/sheet) mở **dialog xác nhận chip lý do** (<1s, không bắt gõ); bước LÙI/HỦY (vd về `Cancelled`/QC fail) **bắt buộc chọn chip lý do**; nút "AI gợi ý lý do"; lý do + ghi chú lưu qua **orchestration atomic RIÊNG cho Kanban** `metaforge.api.kanban_move_with_comment` (native `update_order_for_single_card` = board-aware `set_value(field_name=cột đích)` + `add_comment`, appendix §R). Nếu `field_name` = `workflow_state` thì server tự chạy workflow guard. **KHÔNG dùng `workflow_action_with_comment`** (nhận `action`, không nhận field/value). Huỷ dialog → thẻ về cột cũ |
| 8 AI | **Áp dụng** — "AI gợi ý lý do" (bản nháp, người xác nhận); badge cảnh báo thẻ bất thường (tuổi thẻ, giá trị) |
| 18 Lịch sử | **Áp dụng** — mỗi lần đổi cột ghi vào timeline bản ghi (M11) với chip lý do |
| 2 soft-delete | Không áp dụng (đổi trạng thái, không xoá) |
| 4 báo cáo | **Áp dụng (một phần)** — đếm + tổng đầu cột |
| 5+12 | **Áp dụng có điều kiện** — đổi cột đáng báo → Notification |
| 6/10/11/13/14 | | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — format tiền/ngày thẻ; tuổi thẻ tương đối |
| 19 Danh mục | **Áp dụng có điều kiện** — chip lý do có thể lấy từ 1 DocType "Lý do" (Link) nếu site cấu hình |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `KanbanBoard` | Kanban Board + get_list | kéo-thả (desktop); cột theo Select field | `write` để đổi | skeleton cột |
| `KanbanColumn` | giá trị Select | header đếm + tổng; thêm thẻ nhanh | theo quyền | empty cột |
| `KanbanCard` | document | field quyết định; bấm → M11 3 cột; tuổi thẻ màu | `read` | — |
| `StageChangeDialog` ⭐ | chip lý do theo cột đích | mở khi kéo/sheet; chip nhanh + ghi chú optional; LÙI/HỦY bắt buộc chip; nút AI gợi ý | `write` | — |
| `ViewSwitcher` | — | Bảng ↔ Kanban chung filter | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Kéo thẻ đổi cột | `StageChangeDialog` → `kanban_board.update_order_for_single_card(board, docname, from, to, oldIdx, newIdx)` (native: reorder + `set_value(field_name=to)`) + `add_comment`(lý do); atomic qua orch `kanban_move_with_comment` | chip lý do (bắt buộc nếu lùi/hủy); role `write`; nếu field=workflow_state → guard transition | thẻ sang cột mới + comment + audit + timeline | huỷ dialog → thẻ về cột cũ; "Không được chuyển sang <cột>" (workflow/permission chặn) |
| Thêm thẻ nhanh | mở M11 `?new=1` prefill cột hiện tại | `create` | thẻ mới đầu cột | — |
| Thêm/sắp cột | update `PUT /api/resource/Kanban Board/<name>` (create board = `POST /api/resource/Kanban Board`) | quyền sửa board | cột cập nhật | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Thêm thẻ từ 1 cột | field Select = giá trị cột đó | prefill khi mở form |
| Dialog chip lý do | AI gợi ý lý do theo ngữ cảnh thẻ | bản nháp, người xác nhận |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton cột + thẻ |
| Empty | board chưa có thẻ → "Chưa có thẻ" + nút thêm |
| Error | tiếng Việt + Thử lại |
| Offline | banner; đổi cột xếp hàng đợi nếu bật |
| Thiếu quyền | không `write` → chỉ xem, kéo-thả disable |
| Dữ liệu dài | cột nhiều thẻ → virtualize + "tải thêm" |
| In-flight | đang đổi cột: thẻ mờ + spinner tới khi server xác nhận |

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
