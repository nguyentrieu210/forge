# M02 — Workspace / Trang chủ (meta-driven)

> Render Frappe **Workspace** (shortcuts + number cards + charts + links) theo module + role. Đối chiếu: Frappe Desk Workspace v16.

## Khối 1 — Định danh
- **Tên**: Workspace — **route**: `/app` (mặc định theo role), `/app/<workspace-name>`.
- **Role**: mọi role; Workspace nào hiện theo `Workspace.roles` + `public`/`for_user`.
- **Contract**: `screen-catalog-contract.md` Dashboard + `polish-contract.md` §7 (KPI so kỳ + drill-down).
- **Nguồn**: `frappe.desk.desktop.get_workspace_sidebar_items` (danh sách) + `get_desktop_page(workspace)` (blocks: shortcut/card/chart/onboarding/quick-list) + Number Card/Dashboard Chart data.

## Khối 2 — Layout
**Desktop:** header (tên workspace + nút "Chỉnh sửa" nếu System Manager → M22 Dashboard Builder cho phần chart). Nội dung theo **blocks** của Workspace (thứ tự do meta): **Shortcuts** (thẻ bấm → List/Report/URL, số đếm nếu `stats_filter`) → **Number Cards** (KPI + delta so kỳ, bấm drill-down) → **Charts** (Recharts, từ Dashboard Chart) → **Quick Lists** (bảng ngắn "cần xử lý") → **Links** (nhóm DocType của module — cũng là "Danh mục").

**Mobile:** stat cards grid 2 cột; việc-cần-làm ưu tiên trên chart; chart thu gọn/chuyển list nếu khó đọc.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7 Kanban | Không áp dụng (là M06) |
| 8 AI | **Áp dụng** — nút "Vì sao?" trên Number Card (AI giải thích tăng/giảm từ dữ liệu thật, đúng quyền) |
| 18 Lịch sử | Không áp dụng |
| 2 soft-delete | Không áp dụng (màn đọc) |
| 4 báo cáo | **Áp dụng — cốt lõi** — Number Card + Chart; **100% số bấm được drill-down** ra List đã lọc (polish §7) |
| 5+12 Thông báo | **Áp dụng (một phần)** — khối cảnh báo (hết hạn/quá hạn) kèm nút hành động (notify) |
| 6/10/11/13 | | Không áp dụng |
| 14 Calendar | **Áp dụng có điều kiện** — Quick list "hôm nay" nếu module có lịch |
| 15 Tiện VN | **Áp dụng** — delta so kỳ mũi tên màu theo chiều tốt; format số VN; rút gọn tiền thông minh |
| 19 Danh mục | **Áp dụng** — khối Links = nhóm DocType master của module |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `WorkspaceSidebar` (ở M00) | get_workspace_sidebar_items | chọn workspace | theo role | skeleton |
| `ShortcutCard` | shortcut block (+`stats_filter`) | bấm → List/Report đã lọc; số đếm live | theo `read` đích | skeleton |
| `NumberCard` | Number Card (aggregate) | value + **delta so kỳ** (mũi tên màu theo chiều tốt); bấm → drill-down List | theo quyền nguồn | skeleton; che số nhạy cảm theo role (polish §8) |
| `DashboardChart` (Recharts) | Dashboard Chart (timeseries/group) | bấm cột/lát → List đã lọc; format trục VN | theo quyền | empty state |
| `QuickList` | quick-list block | bảng ngắn cần-xử-lý + action inline | theo quyền | empty |
| `LinksBlock` | link block | nhóm DocType → mở List | theo `read` | — |
| `AskWhyAI` | card context | AI giải thích biến động (bản nháp, đúng quyền) | theo quyền | "chưa cấu hình AI" |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Bấm Number Card/Chart/Shortcut | điều hướng List/Report đã lọc | — | mở đúng danh sách lọc | — |
| Chỉnh sửa workspace (chart/card) | M22 — create `POST /api/resource/<meta-dt>`; update `PUT /api/resource/<meta-dt>/<name>` (Number Card / Dashboard Chart / Workspace) | System Manager | lưu block | "Không có quyền chỉnh" |
| "Vì sao?" (AI) | endpoint AI site | — | giải thích nháp | "chưa cấu hình AI" |

> **Màn chủ yếu chỉ đọc** — không có form CRUD (trừ chỉnh workspace qua builder).

## Khối 5 — Autofill
> Không áp dụng — Workspace không có form nhập liệu.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton từng block (card/chart) |
| Empty | workspace chưa có block → "Chưa có nội dung" + (System Manager) nút "Thêm thẻ/biểu đồ" |
| Error | block lỗi tải → error state trong CHÍNH block (không vỡ cả trang) + Thử lại |
| Offline | banner offline; hiện số cache gần nhất |
| Thiếu quyền | card/chart nguồn không quyền → không render card đó |
| Dữ liệu dài | nhiều block → cuộn; chart lazy-mount |
| In-flight | refresh nền: stale-while-revalidate, không skeleton lại |

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
