# M10 — Dashboard / Chart View (renderer generic)

> Render Frappe **Dashboard** (tập hợp Number Card + Dashboard Chart). Khác M02 Workspace (trang chủ theo module) — đây là dashboard độc lập theo tên. Builder = M22. Đối chiếu: Frappe Dashboard v16.

## Khối 1 — Định danh
- **Tên**: Dashboard View — **route**: `/app/dashboard/<name>`.
- **Role**: mọi role (card/chart tự lọc theo quyền nguồn).
- **Contract**: `screen-catalog-contract.md` Dashboard + `polish-contract.md` §7 (KPI so kỳ + drill-down 100%) + `dataviz` khi vẽ chart.
- **Nguồn**: `Dashboard` (danh sách cards/charts) + `Number Card`(aggregate) + `Dashboard Chart`(timeseries/group/report).

## Khối 2 — Layout
**Desktop:** header (tên dashboard + chọn khoảng thời gian + nút "Chỉnh sửa" → M22). Grid: **Number Cards** hàng trên (value + delta so kỳ, mũi tên màu theo chiều tốt, bấm drill-down) → **Charts** (Recharts: line/bar/pie/donut/heatmap theo `type`; filter thời gian chung). Mỗi chart có nút "Vì sao?" (AI).

**Mobile:** cards grid 2 cột; chart cuộn dọc, thu gọn/chuyển list nếu khó đọc.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 4 báo cáo | **Áp dụng — cốt lõi** — Number Card + Chart; **100% số bấm drill-down** ra List đã lọc |
| 8 AI | **Áp dụng** — "Vì sao?" giải thích biến động (đúng quyền, bản nháp) |
| 18/7/2/6/10/11/13/14 | | Không áp dụng (màn đọc) |
| 5+12 | **Áp dụng có điều kiện** — card cảnh báo kèm nút hành động |
| 15 Tiện VN | **Áp dụng** — delta so kỳ, format số VN, rút gọn tiền, màu theo chiều tốt |
| 19 Danh mục | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `NumberCard` | Number Card aggregate | value + delta so kỳ; bấm drill-down List | theo quyền nguồn | skeleton; che số nhạy cảm theo role |
| `DashboardChart` (Recharts) | Dashboard Chart | line/bar/pie/donut/heatmap; bấm điểm → List lọc; palette theo token (dataviz) | theo quyền | empty state |
| `TimeRangePicker` | — | đổi khoảng → refetch tất cả | mọi role | nhớ theo user |
| `AskWhyAI` | card/chart context | giải thích biến động | theo quyền | "chưa cấu hình AI" |
| `EditButton` | — | → M22 Dashboard Builder | System Manager | ẩn nếu không quyền |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Bấm card/điểm chart | điều hướng List đã lọc | — | mở danh sách | — |
| Đổi khoảng thời gian | refetch card/chart | — | cập nhật | error trong khối |
| Chỉnh sửa | → M22 | System Manager | mở builder | "Không có quyền" |
| "Vì sao?" | endpoint AI | — | giải thích nháp | "chưa cấu hình AI" |

## Khối 5 — Autofill
> Không áp dụng — Dashboard không có form nhập liệu.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton từng card/chart |
| Empty | dashboard chưa có card/chart → "Chưa có nội dung" + (quyền) nút thêm |
| Error | lỗi 1 card/chart → error trong CHÍNH khối đó (không vỡ trang) + Thử lại |
| Offline | banner; số cache gần nhất |
| Thiếu quyền | card/chart nguồn không quyền → không render card đó |
| Dữ liệu dài | chart nhiều điểm → aggregate/downsample; lazy-mount |
| In-flight | stale-while-revalidate khi refetch |

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
