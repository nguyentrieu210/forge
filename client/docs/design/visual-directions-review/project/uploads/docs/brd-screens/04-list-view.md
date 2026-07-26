# M04 — List View (renderer generic)

> Render danh sách MỌI DocType từ meta: cột từ `in_list_view`, filter từ `in_standard_filter`, bấm dòng → 3 cột. Đối chiếu: Frappe Desk List View v16.

## Khối 1 — Định danh
- **Tên**: List View — **route**: `/app/<doctype>` (mặc định), `/app/<doctype>/view/list`.
- **Role vào**: user có `read` DocType (server lọc record theo User Permission/if_owner).
- **Contract**: `data-table-contract.md` (toàn bộ) + `screen-catalog-contract.md` (Layout 3 cột, CRUD list) + `operator-convenience.md`.
- **Nguồn**: `getdoctype` (meta cột/filter/quyền) + `frappe.client.get_list`/`/api/resource/<dt>?fields&filters&or_filters&order_by&limit_start&limit_page_length` + `get_count` (tổng).

## Khối 2 — Layout
**Desktop (≥768px):**
- **Chưa chọn dòng**: bảng full-width. Page header (tên DocType số nhiều + mô tả + nút `+ Tạo mới` primary). Toolbar: Search (placeholder theo `search_fields` meta: "Tìm theo <field>…"), filter trạng thái (từ `in_standard_filter` — Segmented nếu ≤6 giá trị Select, Popover nếu nhiều), filter thời gian nếu có date field, nút **Cột** (chọn/ẩn cột), nút **Xuất/Nhập Excel**, toggle **view** (List/Report/Kanban/Calendar/Gantt/Tree tuỳ DocType hỗ trợ), ô **"Hỏi AI"**.
- **Cột bảng** (thứ tự chuẩn data-table): (1) checkbox pin trái, (2) STT cố định, (3) ảnh/avatar nếu DocType có `image_field`, (4) **title** (`title_field` hoặc `name`) + subtitle, (5) các field `in_list_view` (badge cho Select/workflow_state, tiền/ngày format VN, Link hiện title), (6) cột hành động sticky right (inline theo docstatus/workflow). Cột 4-5 **resize + chọn hiển thị**, lưu localStorage `meta-forge:<doctype>:<user>`. **Dòng tổng ghim cuối** (sum các field số của trang + toàn bộ kết quả — operator-convenience #25).
- **Bấm 1 dòng → 3 cột**: bảng co thành cột trái (giữ cột chính), **M11 Form (chỉ đọc/sửa nhanh) ở cột giữa**, ngữ cảnh/timeline/AI ở cột phải. ↑↓ chuyển dòng; queue mode. Esc → full-width.

**Mobile (<768px):**
- Search full-width đầu trang; filter trong bottom sheet/chips. **MobileRecordList card** (KHÔNG bảng ngang): mỗi card = ảnh + title + subtitle + badge trạng thái + 2-4 meta + 1 primary inline action. Swipe: khai theo DocType (mặc định vuốt phải `Sửa`, vuốt trái action workflow đầu tiên). Bấm card → M11 full-screen. Bulk qua long-press. Tạo mới qua FAB (M00).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7 Kanban | **Áp dụng** — toggle sang M06 nếu DocType có Select field + Kanban Board (chung filter) |
| 8 AI | **Áp dụng** — ô "Hỏi AI" toolbar: gõ tự nhiên → dịch thành `filters` áp vào list + 1 câu trả lời tổng hợp (đúng quyền người hỏi); badge cảnh báo AI trên dòng bất thường (tuỳ DocType) |
| 18 Lịch sử | Không áp dụng ở List (ở Detail M11) |
| 2 soft-delete | **Áp dụng** — bulk delete qua Frappe (chặn nếu link/submitted); **KHÔNG undo hard delete** (Frappe xoá cứng — confirm mạnh trước; vào `Deleted Document` nếu site bật để tra, không phải undo tức thời) |
| 4 báo cáo | **Áp dụng** — Xuất Excel theo lọc/chọn (Frappe export); toggle Report View (M05) |
| 5+12 Thông báo | **Áp dụng (một phần)** — bulk "Assign"/"Email" bắn Notification Log |
| 6 barcode | **Áp dụng có điều kiện** — nếu DocType có field `Barcode`: ô tìm match barcode (quét súng vào ô search ra ngay) |
| 10 media | **Áp dụng** — cột ảnh bấm để cập nhật (chụp/tải) nếu `image_field` + có quyền write |
| 11 in | **Áp dụng** — bulk "In" (Print Format M13) / in tem nếu DocType hàng hoá |
| 13 mã | Không áp dụng (mã sinh ở form M11) |
| 14 Calendar | **Áp dụng** — toggle sang M07 nếu DocType có date field |
| 15 Tiện VN | **Áp dụng** — SĐT bấm gọi/Zalo trên cột/card; tìm không dấu; tìm 4 số cuối SĐT (#14); giữ filter qua URL query |
| 19 Danh mục | **Áp dụng** — List của 1 DocType master (Item Group…) CHÍNH là màn quản lý danh mục; Link ở filter = combobox |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `AppWebDataView` (TanStack) | `get_list` (fields = `in_list_view`+title+image+`docstatus`+`_assign`+`modified`) | sort/filter/paginate server-side; resize/chọn cột; bấm dòng → 3 cột; virtualize >200 dòng | server scope record theo User Permission | skeleton theo cột |
| `SearchInput` | `search_fields` meta | debounce 250ms → `or_filters` like; tìm không dấu | mọi role | — |
| `StandardFilters` | `in_standard_filter` fields | Segmented/Popover → `filters` → refetch; giữ qua URL | mọi role | — |
| `ViewSwitcher` | DocType hỗ trợ view nào | List/Report/Kanban/Calendar/Gantt/Tree | theo quyền | ẩn view không áp dụng |
| `ColumnPicker` | meta fields | bật/tắt/resize cột (trừ checkbox/STT/title/action); nút Mặc định | mọi role | lưu localStorage |
| `StatusBadge` | Select/`workflow_state` field | màu theo giá trị (map ổn định) | đọc | — |
| `BulkActionBar` | dòng đã chọn | Xoá / Đổi trạng thái (nếu workflow) / Xuất đã chọn / Assign / In | theo `delete`/`write` | "Đã chọn N/M" (#36) |
| `ImageCell` | `image_field` | bấm → chụp/tải cập nhật (upload_file) | `write` | placeholder initials |
| `RowActions` | docstatus/workflow | inline theo trạng thái; ⋯ cho phụ; nguy hiểm cách xa | theo quyền | chỉ hiện action hợp lệ |
| `AskAI` | list context | câu hỏi → filters + trả lời | theo quyền người hỏi | "chưa cấu hình AI" nếu site thiếu |
| `SummaryRow` | field số | tổng trang + tổng toàn bộ lọc | đọc | — |
| `Pagination` | get_count | "Hiển thị X-Y/Z"; page size 10/20/50/100 | — | — |

**Sort resolution (v16):** 1) saved user setting → 2) DocType `sort_field`+`sort_order` → 3) fallback **`creation desc`** (KHÔNG `modified desc`).

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| `+ Tạo mới` | mở M11 `/app/<dt>/new` | có `create` | form trống + default | ẩn nếu không `create` |
| Đổi filter/search/sort | `get_list` refetch | — | bảng cập nhật, URL đổi | error state khối |
| Xoá hàng loạt | `DELETE /api/resource/<dt>/<name>` từng id | `delete` + confirm số dòng | toast "Đã xoá N" (**KHÔNG undo hard delete — confirm mạnh trước**) | "Không xoá được <name>: đang liên kết…" (từng id, không tin list client) |
| Đổi trạng thái hàng loạt | `apply_workflow`/`set_value` | role phù hợp | badge đổi + refetch | "Không đổi được X: sai trạng thái nguồn" |
| Xuất Excel | Frappe export (`/api/method/frappe.desk.reportview.export_query`) | — | file `<dt>_<ngày>.xlsx` theo lọc/chọn; format VN; audit | "Xuất lỗi — thử lại" |
| Nhập Excel | mở M14 (Data Import) | System Manager/`import` | wizard 5 bước | — |
| Inline action dòng | tuỳ (`set_value`/`apply_workflow`/`submit`) | quyền + trạng thái | cập nhật dòng + badge | tiếng Việt theo lỗi |

## Khối 5 — Autofill
> Không áp dụng — List không có form nhập liệu (autofill thuộc M11). Riêng filter: nhớ bộ lọc gần nhất theo user (localStorage) + giữ qua URL.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton hàng theo cột (không spinner trơ); refetch nền không xoá bảng cũ |
| Empty — chưa có | "Chưa có <DocType> nào" + nút `+ Tạo mới` (nếu `create`) |
| Empty — lọc không ra | "Không có kết quả phù hợp" + nút "Xoá bộ lọc" |
| Error | câu tiếng Việt + "Thử lại"; không lộ stack |
| Offline | banner offline; đọc từ cache nếu có |
| Thiếu quyền | không `read` DocType → "Bạn không có quyền xem dữ liệu này" (server 403), không nút tạo |
| Dữ liệu dài | virtualize + pagination server-side; giữ vị trí cuộn khi quay lại (#18) |

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
