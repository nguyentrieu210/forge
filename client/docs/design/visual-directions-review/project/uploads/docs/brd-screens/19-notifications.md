# M19 — Notifications (chuông + danh sách)

> Bell topbar + danh sách, deep-link mở đúng bản ghi. Map Frappe **Notification Log**. Đối chiếu: Frappe notifications v16 + `notify-contract.md`.

## Khối 1 — Định danh
- **Tên**: Notifications — **route**: dropdown (chuông) + `/app/notifications` (trang đầy đủ).
- **Role**: mọi role (chỉ thấy notification của mình).
- **Contract**: `notify-contract.md` (in-app bell + badge + deep-link + opt-out).
- **Nguồn**: `Notification Log` (get_list filter `for_user`) + realtime/poll số chưa đọc.

## Khối 2 — Layout
**Desktop:** chuông topbar + badge số chưa đọc. Dropdown: danh sách (icon loại + tiêu đề + thời gian tương đối + chưa đọc đậm), nút "Đánh dấu tất cả đã đọc", link "Xem tất cả" → trang. Bấm 1 dòng → mark read + **deep-link** mở đúng document (M11). Trang đầy đủ: filter (Tất cả/Chưa đọc/theo loại), phân trang.

**Mobile:** chuông trên topbar; bấm mở full-screen list; cùng hành vi.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 5+12 Thông báo | **Áp dụng — cốt lõi** — in-app bell + badge + deep-link; kênh Zalo/email là Frappe `Notification` DocType (engine hiển thị, không tự gửi) |
| 8 AI | Không áp dụng |
| 18/7/2/4/6/10/11/13/14/19 | | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — thời gian tương đối tiếng Việt ("3 phút trước"); nội dung tiếng Việt |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `NotificationBell` | count unread (poll/realtime) | badge; mở dropdown | mọi role | — |
| `NotificationList` | Notification Log (for_user) | bấm → mark read + deep-link | chỉ của mình | empty |
| `MarkAllRead` | — | đánh dấu tất cả đã đọc | mọi role | — |
| `NotificationFilters` | — | Tất cả/Chưa đọc/loại | mọi role | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Mở & đọc 1 tin | mark_seen + điều hướng deep-link | — | mở đúng doc + badge giảm | "Bản ghi không còn tồn tại" |
| Đánh dấu tất cả đã đọc | mark_all_as_read | — | badge = 0 | — |
| Lọc | get_list refetch | — | list cập nhật | — |

## Khối 5 — Autofill
> Không áp dụng — không có form nhập liệu.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton danh sách |
| Empty | "Không có thông báo" |
| Error | tiếng Việt + Thử lại |
| Offline | banner; hiện cache |
| Thiếu quyền | chỉ thấy của mình (server lọc) |
| Dữ liệu dài | phân trang/tải thêm |
| In-flight | mark read optimistic |

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
