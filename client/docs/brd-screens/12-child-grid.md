# M12 — Child-table Grid (bảng con trong Form + full-page grid)

> Render fieldtype **`Table`** (child DocType `istable=1`) trong M11 + grid toàn trang. ⚠️ **`Table MultiSelect` KHÔNG dùng grid này** — nó là `TableMultiSelectControl` (chip multi-select Link + dedupe, xem M11 §3.2), chỉ tái dùng child-row model bên dưới, UX/validation riêng. Đối chiếu: Frappe Desk grid v16 (order items, taxes, BOM…).

## Khối 1 — Định danh
- **Tên**: Child Grid — **route**: nhúng trong M11 (`/app/<dt>/<name>`); không route riêng.
- **Role**: theo quyền của DocType cha (child không có permission riêng — Frappe: child permission theo parent + permlevel field child).
- **Contract**: `form-workflow-contract.md` (Bảng con) + `data-table-contract.md` (mobile card) + `field-ledger.md`.
- **Nguồn**: child DocType meta (getdoctype của child dt trong `options`) + giá trị rows trong doc cha; cột hiện = DocField child có `in_list_view`.

## Khối 2 — Layout
**Desktop:** table nhỏ trong section của form. Header: label bảng + nút `+ Thêm dòng`. Cột: STT, các field child `in_list_view` (mỗi ô là control inline theo fieldtype — Link/Select/Currency/Data…), cột xoá/nhân bản. **Dòng tổng** cho field số (`total`, `amount`). Sửa inline; bấm mở-rộng 1 dòng → form con đầy đủ (mọi field child kể cả không in_list_view) dạng popover/expand-row. Kéo đổi thứ tự `idx`.

**Mobile:** mỗi row = card/accordion (không bảng ngang). Nút thêm dòng full-width; mỗi card có nút xoá; mở card → field 1 cột. Tổng ghim cuối.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7/14/18 | | Không áp dụng — grid là thành phần trong form |
| 8 AI | **Áp dụng (một phần)** — "Paste nhiều dòng từ Excel" (operator #9) + AI map cột khi paste bảng kê (media-capture OCR bảng kê → prefill rows nháp) |
| 2 soft-delete | Không áp dụng — xoá row = sửa doc cha (Frappe xử khi save; doc submitted khoá) |
| 10 media | **Áp dụng có điều kiện** — nếu child có field Attach/Image (vd dòng có ảnh) |
| 13 mã | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — format tiền/số/ngày trong ô; ↑↓ tăng giảm số (#5); paste Excel (#9) |
| 19 Danh mục | **Áp dụng — cốt lõi** — field Link trong dòng (vd `item_code`) = combobox +Thêm mới, autofill `fetch_from` (chọn item → giá/ĐVT/thuế) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `ChildGrid` | child meta + rows | thêm/xoá/nhân bản/kéo-idx; sửa inline; validate từng dòng + tổng | theo parent write + permlevel field | skeleton dòng |
| Ô control theo fieldtype | child DocField | dùng lại catalog control của M11 §3.2 (Link/Select/Currency/Data/Date/Check…) | theo permlevel | readonly nếu doc submitted (trừ allow_on_submit) |
| `AddRowButton` | — | thêm dòng trống + focus ô đầu; Enter ô cuối = thêm dòng (#1) | write | ẩn nếu readonly |
| `RowExpand` | full child fields | mở form con đầy đủ (field không in_list_view) | theo quyền | — |
| `GridSummary` | field số child | tổng realtime khi nhập | đọc | — |
| `PasteExcel` | clipboard | dán nhiều dòng → parse thành rows (map cột) | write | báo dòng lỗi |
| `LinkCell` (ERPNext) | Link field child | combobox +Thêm mới nested (form gốc DocType đích) | theo quyền | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Thêm dòng | (local — lưu khi save cha) | — | dòng mới + focus | — |
| Xoá dòng | local | confirm nếu có dữ liệu | dòng biến mất | doc submitted → chặn "Chứng từ đã ghi sổ" |
| Nhân bản dòng | local | — | dòng copy | — |
| Sửa ô Link → autofill | `frappe.client.get_value` (fetch_from) | FK tồn tại | các ô fetch điền (nếu chưa dirty) | "Không tìm thấy <giá trị>" |
| Paste Excel | local parse | map cột + validate từng ô | rows thêm, ô lỗi đánh dấu | tooltip lý do từng ô |
| Lưu (cùng doc cha) | `PUT /api/resource/<parent>` | Zod từng dòng + tổng | lưu cả doc | field-level lỗi map về đúng dòng/ô |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Chọn Link trong dòng (vd item_code) | field khác cùng dòng có `fetch_from` | get_value; chỉ ô chưa dirty; `fetch_if_empty` |
| Thêm dòng mới | field child có `default` | set default; SL mặc định 1 nếu meta default |
| Paste Excel | map cột → điền | ô đã có giữ nguyên |

Client-side đúng Desk; giá trị gửi kèm doc cha khi save; server validate/controller chốt (không tự coi server chạy lại mọi fetch_from).

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton dòng khi form load |
| Empty | "Chưa có dòng nào" + nút `+ Thêm dòng` (nếu write) |
| Error | lỗi validate dòng → highlight ô + message dưới grid |
| Offline | theo form cha (xếp hàng đợi nếu bật) |
| Thiếu quyền | field child permlevel cấm → ô mask/readonly theo `apply_fieldlevel_read_permissions` |
| Dữ liệu dài | nhiều rows → virtualize grid |
| In-flight | lưu cùng cha: disable grid + spinner |

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
