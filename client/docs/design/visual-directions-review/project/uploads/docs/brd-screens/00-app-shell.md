# M00 — App Shell (khung dùng chung mọi màn)

## Khối 1 — Định danh
- **Tên**: App Shell — **route**: bọc toàn bộ `/app/*` — **role**: mọi role đã đăng nhập.
- **Contract**: `frontend-360-contract.md` (Shell bắt buộc) + `mobile-pwa-contract.md` + `polish-contract.md` §3.
- **Nguồn dữ liệu**: boot (`frappe.desk.desktop.get_workspace_sidebar_items` + roles + `get_list` DocType có quyền) để dựng menu theo role.

## Khối 2 — Layout
**Desktop (≥768px):**
- **Sidebar trái** thu gọn được (240–280px ↔ 64–72px, nút toggle, nhớ localStorage): logo/tên site → **Workspaces** theo role (nhóm module) → trong mỗi workspace: link tới List của các DocType (mục "Danh mục" = nhóm DocType master). Icon lucide.
- **Topbar** (56–64px): breadcrumb, ô **Awesomebar/Ctrl+K** (M03), nút **AI** (cạnh Ctrl+K), chuông **Notifications** (M19) + badge, theme selector 3 chế độ, avatar menu (hồ sơ/đổi mật khẩu/đăng xuất — qua Frappe User).
- **Main** `min-w-0 overflow-y-auto`, padding 16–24px; page header title + primary action.

**Mobile (<768px):**
- **MobileTopbar** (52–60px): tên màn + nút tìm (Ctrl+K) + chuông.
- **BottomNav** cố định (64–76px + safe-area): 4 mục + FAB. Trái: **Tổng quan** (Workspace mặc định). Phải: **Danh sách** (app-launcher grid mọi DocType role được xem) + **Cài đặt** (M20). Giữa: **FAB `+`** 56px `-mt-8 ring-4` → bottom sheet chọn nhanh DocType tạo mới (những DocType user có `create`, ≥2 loại → sheet; 1 loại → mở form thẳng; ≤2 chạm tới form).
- Content `pb-[calc(80px+env(safe-area-inset-bottom))]`.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7 Kanban / 18 Lịch sử / 14 Calendar | | Không áp dụng — Shell là khung, không render dữ liệu |
| 8 AI | **Áp dụng** — nút AI ở topbar (entry thống nhất) mở panel hỏi-đáp (dịch câu hỏi → điều hướng/filter) |
| 2 soft-delete / 4 báo cáo / 6 barcode / 10 media / 11 in / 13 mã | | Không áp dụng ở Shell (thuộc màn con) |
| 5+12 Thông báo | **Áp dụng** — chuông + badge chưa đọc (M19), deep-link |
| 15 Tiện VN | **Áp dụng** — theme, cỡ chữ (Settings), tìm không dấu ở Awesomebar |
| 19 Danh mục | **Áp dụng** — sidebar nhóm Workspace/DocType master = "Danh mục"; module launcher sheet mobile |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `AppWebSidebar` | boot workspaces + DocType có quyền | thu gọn, nhớ localStorage; chỉ hiện mục role thấy | theo role | skeleton menu khi boot |
| `AppWebTopbar` | session user | breadcrumb, Ctrl+K, AI, chuông, theme, avatar | mọi role | — |
| `AppWebCommandPalette` (M03) | search doctype+record | Ctrl+K mở; hành động (tạo/xuất/đổi theme) | mọi role | recent records |
| `ThemeProvider` | localStorage | Sáng/Tối/Hệ thống | mọi role | — |
| `AppWebBottomNav` + FAB | boot | 4 mục + FAB sheet tạo nhanh | theo `create` | — |
| `AppWebPwaManager` | SW | banner cài + banner cập nhật | mọi role | — |
| `NotificationBell` (M19) | Notification Log | badge chưa đọc, dropdown | mọi role | — |
| `ErrorBoundary` | — | khối lỗi tiếng Việt + Tải lại, gửi log | — | — |
| `apiClient`/`FrappeAdapter` | session | tự xử hết phiên: toast "Phiên hết hạn" TRƯỚC khi về /login | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Đổi theme | localStorage | — | áp ngay | — |
| Đăng xuất | `POST /api/method/logout` | có session | về /login | "Không đăng xuất được — thử lại" |
| Mở FAB tạo nhanh | — | user có `create` DocType đó | sheet/hoặc form `?new=1` | ẩn nếu không có DocType create |
| Cài PWA | `beforeinstallprompt` | — | cài | ẩn nếu không hỗ trợ |

## Khối 5 — Autofill
> Không áp dụng — Shell không có form nhập liệu (menu/chrome).

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton sidebar + topbar khi boot |
| Empty | user không có workspace nào → sidebar tối thiểu (Awesomebar + Settings) |
| Error | boot lỗi → trang lỗi "Không tải được không gian làm việc" + Thử lại |
| Offline | banner offline mỏng đỉnh trang |
| Thiếu quyền | mục không role thấy → không render |
| Dữ liệu dài | nhiều workspace/DocType → sidebar cuộn + nhóm gập |
| In-flight | chuyển route: progress bar mảnh đỉnh trang |

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
