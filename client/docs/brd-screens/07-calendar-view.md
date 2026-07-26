# M07 — Calendar View (renderer generic)

> Ngày/Tuần/Tháng từ date/datetime field (hoặc start+end) của DocType. Đối chiếu: Frappe Calendar v16.

## Khối 1 — Định danh
- **Tên**: Calendar View — **route**: `/app/<doctype>/view/calendar`.
- **Role**: `read` (+ `write` để tạo/dời).
- **Contract**: `screen-catalog-contract.md` Calendar view.
- **Nguồn**: DocType `Calendar` settings (field ngày bắt đầu/kết thúc, title, màu) + `get_list` trong khoảng đang xem.

## Khối 2 — Layout
**Desktop:** 3 chế độ Ngày/Tuần/Tháng + nút "Hôm nay"; sự kiện màu theo trạng thái HOẶC theo người/phòng (toggle + chú giải). **Kéo-thả dời** sự kiện (confirm + audit + hỏi có nhắn khách không); kéo mép đổi thời lượng; bấm ô trống = tạo mới prefill giờ. Filter theo người/phòng/chi nhánh. Đồng bộ filter với List. Ngày lễ VN tô nhạt.

**Mobile:** mặc định Ngày/agenda; xem + bấm mở M11; dời qua form (không kéo-thả).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 14 Calendar | **Áp dụng — cốt lõi** — 3 chế độ + kéo-thả dời (confirm+audit+notify prompt); cảnh báo trùng khi kéo/tạo |
| 8 AI | **Áp dụng có điều kiện** — gợi ý khung giờ trống khi tạo (nếu DocType có nguồn lực) |
| 18 Lịch sử | Không áp dụng (ở M11) |
| 7 Kanban | Không áp dụng |
| 2 soft-delete | Không áp dụng |
| 4 báo cáo | Không áp dụng |
| 5+12 | **Áp dụng** — dời/tạo sự kiện → hỏi gửi nhắc (Notification) |
| 6/10/11/13 | | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — ngày lễ VN; format ngày dd/MM; giờ mở cửa (nếu site cấu hình) |
| 19 Danh mục | **Áp dụng có điều kiện** — filter theo Link (người/phòng) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `CalendarGrid` | Calendar settings + get_list | Ngày/Tuần/Tháng; render sự kiện | `read` | skeleton |
| `EventBlock` | document | bấm → M11; kéo-thả dời/resize (desktop) | `write` để dời | màu theo status/người |
| `ViewModeTabs` | — | Ngày/Tuần/Tháng + Hôm nay | — | — |
| `ColorLegend` | field status/người | toggle chế độ tô màu + chú giải | — | — |
| `Filters` | Link fields | lọc người/phòng/chi nhánh | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tạo (bấm ô trống) | mở M11 prefill start/end | `create` | form mới | — |
| Dời sự kiện (kéo) | confirm → `set_value`(date) + audit | `write` + không trùng nguồn lực | sự kiện dời + hỏi "nhắn khách?" | "Trùng lịch <người/phòng>" → không dời |
| Đổi thời lượng (kéo mép) | `set_value`(end) | `write` | cập nhật | — |
| Đổi chế độ/filter | get_list refetch | — | lịch cập nhật | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Tạo từ ô trống | start/end = giờ ô đó | prefill form |
| Chọn nguồn lực | gợi ý khung giờ trống (AI, nếu có) | bản nháp |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton lưới lịch |
| Empty | "Không có sự kiện trong khoảng này" |
| Error | tiếng Việt + Thử lại |
| Offline | banner; cache khoảng đã xem |
| Thiếu quyền | không `read` → chặn |
| Dữ liệu dài | nhiều sự kiện/ngày → "+N nữa" mở popover |
| In-flight | đang dời: sự kiện mờ tới khi server xác nhận |

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
