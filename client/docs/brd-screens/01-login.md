# M01 — Đăng nhập (Frappe session)

> Auth = Frappe (KHÔNG JWT/D1 tự dựng). Đa khách = site-per-tenant Frappe (subdomain → site). Đối chiếu: Frappe `/login` v16 + guide §8 (điều chỉnh cho Frappe).

## Khối 1 — Định danh
- **Tên**: Đăng nhập — **route**: `/login` — **Public**. Route phụ: `/update-password` (đặt lại qua Frappe), `/#forgot` (yêu cầu reset).
- **Contract**: `screen-catalog-contract.md` Login + `brd-writing-guide.md` §8 (adapt: cơ chế do Frappe lo, KHÔNG tự dựng lockout/rotation).
- **Nguồn**: Frappe auth endpoints.

## Khối 2 — Layout
**Desktop:** card giữa `max-w-[420px]`, nền gradient nhẹ (token, dark mode riêng). Trên: logo/tên site → subtitle "Đăng nhập để tiếp tục" → alert lỗi → **Email/Username** → **Mật khẩu** + nút hiện/ẩn (Eye) → hàng: checkbox "Ghi nhớ đăng nhập" trái, link "Quên mật khẩu?" phải → nút **Đăng nhập** full-width → (tuỳ site) nút **Social login** (Google…) nếu site bật → text "Liên hệ quản trị viên để được cấp tài khoản". Footer: Điều khoản / Bảo mật.

**Mobile:** full-screen, logo trên, form stacked, nút Đăng nhập sticky bottom; "Quên mật khẩu?" mở sheet.

> Đa khách: tenant xác định bởi **subdomain của site Frappe** (vd `meta.kairo.vn`) — KHÔNG có ô nhập tenant (Frappe route theo site host). Localhost/dev: site theo `--site` / host resolve của bench.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 7/8/14/18/others | | Không áp dụng — Login không phải màn dữ liệu |
| 1 Phân quyền | **Áp dụng** — sau login nạp roles từ boot → Shell (M00) dựng menu theo role |
| 15 Tiện VN | **Áp dụng** — thông báo tiếng Việt; nhớ email (không nhớ mật khẩu) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `Input` email/usr | form | auto-focus; Enter → xuống password | Public | border đỏ khi sai định dạng |
| `Input` password | form | Enter → submit; Eye toggle | Public | border đỏ khi sai |
| `Checkbox` Ghi nhớ | form | **UI-only**: lưu email localStorage (KHÔNG mật khẩu). MetaForge KHÔNG tự đặt TTL session — **bỏ lời hứa "kéo dài TTL"** (session expiry theo site config Frappe; ⚠️pin cơ chế PHA 3 nếu thật cần) | Public | mặc định off |
| `Button` Đăng nhập | — | `POST /api/method/login`; disable+spinner | Public | "Đang đăng nhập…" |
| `Link` Quên mật khẩu | — | `POST frappe.core.doctype.user.user.reset_password` (hoặc thông báo liên hệ admin nếu site tắt) | Public | — |
| `SocialLoginButtons` | boot social login keys | chỉ hiện provider site đã bật (Google/FB…) | Public | ẩn nếu chưa bật |

## Khối 4 — Hành động (auth — Frappe lo cơ chế)
| Thao tác | API Frappe | Validate | Thành công | Lỗi (tiếng Việt) |
|---|---|---|---|---|
| Đăng nhập | `POST /api/method/login` (`usr`,`pwd`) | email/usr + password bắt buộc | Frappe set **session cookie** (`sid`) → nạp boot → redirect `/app` (hoặc `?redirect=`) | "Email hoặc mật khẩu không đúng"; "Tài khoản bị vô hiệu hoá"; Frappe rate-limit/lockout → "Thử lại sau…" |
| Đăng xuất | `POST /api/method/logout` | có session | clear cookie → `/login` | "Không đăng xuất được" |
| Quên mật khẩu | `reset_password` | email hợp lệ | "Nếu email tồn tại, link đặt lại đã được gửi" (không leak) | rate-limit → "thử lại sau" |
| Đặt lại mật khẩu | `update_password` (link token Frappe) | mật khẩu theo policy site | "Đã đặt lại mật khẩu" → `/login` | "Link hết hạn — yêu cầu link mới" |
| Social login | Frappe OAuth flow | — | redirect callback → session | "Đăng nhập <provider> thất bại" |
| Kiểm phiên | `GET /api/method/frappe.auth.get_logged_user` | — | có user → vào app | 403 → về /login |

> **KHÔNG tự dựng** lockout/rotation/reuse-detection (guide §8.3 là cho backend tự viết) — Frappe đã có (rate limit, `User.login_attempts`, session management). Engine chỉ hiển thị thông báo Frappe trả về.

## Khối 5 — Autofill
> Không áp dụng khuôn CRUD. "Ghi nhớ đăng nhập" → tự điền email lần sau (localStorage, KHÔNG mật khẩu). Redirect sau login về `?redirect=` nếu bị kick do hết phiên.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | không skeleton (màn tĩnh); chỉ spinner trên nút khi gọi |
| Empty | không áp dụng |
| Error — sai mật khẩu | border đỏ + "Email hoặc mật khẩu không đúng"; highlight "Quên mật khẩu?" |
| Error — khoá/rate-limit | thông báo Frappe trả (thử lại sau); nút disable nếu cần |
| Offline | "Không có kết nối mạng — thử lại"; nút disable |
| In-flight | nút spinner "Đang đăng nhập…"; input disable |
| Hết phiên (bị kick) | `/login?reason=expired` → toast vàng "Phiên đăng nhập hết hạn — đăng nhập lại" (không đỏ) |

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
