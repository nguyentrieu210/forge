# M08 — Gantt View (renderer generic)

> Thanh thời gian từ start+end date field; phụ thuộc task nếu DocType có. Đối chiếu: Frappe Gantt v16 (frappe-gantt).

## Khối 1 — Định danh
- **Tên**: Gantt View — **route**: `/app/<doctype>/view/gantt`.
- **Role**: `read` (+ `write` để kéo/đổi).
- **Contract**: `screen-catalog-contract.md` Calendar (biến thể timeline).
- **Nguồn**: DocType có 2 date field (start/end) — meta chỉ định; `get_list` + trường progress nếu có.

## Khối 2 — Layout
**Desktop:** cột trái danh sách bản ghi (tên), phải là thanh Gantt theo Ngày/Tuần/Tháng/Quý (chọn scale). Kéo thanh = dời start/end; kéo mép = đổi thời lượng; % progress hiện trên thanh. Đường phụ thuộc (nếu DocType có field liên kết task). Bấm thanh → M11.

**Mobile:** Gantt khó dùng — fallback về danh sách + thanh mini theo hàng; kéo-thả tắt, dời qua form. (Cảnh báo: mobile ưu tiên xem, sửa qua M11.)

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 14 Calendar | **Áp dụng** — timeline thời gian; kéo dời start/end (confirm+audit) |
| 8 AI | Không áp dụng (vòng đầu) |
| 18 Lịch sử | Không áp dụng (ở M11) |
| 7/2/6/10/11/13 | | Không áp dụng |
| 4 báo cáo | **Áp dụng (một phần)** — % hoàn thành tổng |
| 5+12 | **Áp dụng có điều kiện** — dời mốc → notify |
| 15 Tiện VN | **Áp dụng** — format ngày; ngày lễ tô nhạt |
| 19 Danh mục | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `GanttChart` (frappe-gantt, lazy) | get_list (start/end/progress) | scale Ngày/Tuần/Tháng/Quý; kéo dời/resize | `write` để dời | skeleton |
| `TaskBar` | document | bấm → M11; hiện progress | `read` | màu theo status |
| `DependencyLine` | field liên kết | vẽ phụ thuộc nếu có | — | — |
| `ScaleTabs` | — | đổi scale | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Dời thanh (start/end) | confirm → `set_value` + audit | `write`; end≥start | cập nhật | "Ngày kết thúc trước bắt đầu" |
| Đổi scale | local | — | vẽ lại | — |
| Bấm thanh | mở M11 | `read` | 3 cột | — |

## Khối 5 — Autofill
> Không áp dụng — Gantt không có form (sửa qua M11 hoặc kéo).

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton hàng Gantt |
| Empty | "Không có bản ghi có mốc thời gian" |
| Error | tiếng Việt + Thử lại |
| Offline | banner; cache |
| Thiếu quyền | không `read` → chặn |
| Dữ liệu dài | virtualize hàng; scroll ngang thời gian |
| In-flight | thanh mờ khi đang lưu |

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
