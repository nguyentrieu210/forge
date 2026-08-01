# W01 — Đăng nhập & phiên

## Khối 1 — Định danh

- Route: `/login`; route sau đăng nhập: `/today` hoặc deep-link hợp lệ.
- Tác nhân: Guest, Authenticated User, Owner.
- Dữ liệu: User, Session, Login Attempt, MFA Enrollment; không lưu credential trong KV/client.
- Mục tiêu: đăng nhập đúng tenant, quản lý phiên và phục hồi ngữ cảnh an toàn.

## Khối 2 — Layout desktop/mobile

- Desktop: card đăng nhập ở giữa; chọn tenant theo hostname/email; panel trợ giúp nhỏ; sau đăng nhập, trang quản lý phiên dùng bảng thiết bị + vị trí + lần hoạt động.
- Mobile: form full-height một cột, input ≥16px, CTA sticky trong vùng an toàn; danh sách phiên là card có nút “Đăng xuất thiết bị này”.
- Shared logic: schema, tenant discovery, rate-limit response, session mutation và error map; render desktop/mobile tách riêng.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Không áp dụng; phiên không có pipeline. |
| #8 AI | Không áp dụng; AI không tham gia xác thực. |
| #18 Vòng đời | Session `active→revoked→expired`; MFA `unenrolled→active→disabled`. |
| #2 Xóa | Revoke, không xóa lịch sử đăng nhập/audit. |
| #4 Báo cáo | Owner xem phiên đang hoạt động và đăng nhập bất thường; drill-down theo user/device. |
| #5+#12 Thông báo | In-app + email/Zalo khi thiết bị mới hoặc nhiều lần sai; không Web Push. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | QR chỉ dùng enroll TOTP; secret không đi vào audit/client log. |
| #11 In | Không áp dụng. |
| #13 Mã tự động | Session/login attempt dùng UUID/correlation ID server. |
| #14 Lịch | Không áp dụng; timeline phiên theo thời gian. |
| #15 Tiện ích VN | Lỗi tiếng Việt, nhớ tenant/user name; không nhớ mật khẩu; hỗ trợ múi giờ Asia/Bangkok. |
| #19 Master data | Identity provider và auth policy là setup versioned. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `TenantAwareLoginForm` | email/user, password/passkey, MFA, rate-limit countdown | Guest |
| `SessionCardListMobile` / `SessionTableDesktop` | thiết bị, IP rút gọn, vị trí ước tính, hoạt động gần nhất | own; Owner chỉ metadata tenant |
| `RecoveryPanel` | yêu cầu reset có token một lần và hết hạn | Guest |
| `NewDeviceAlertSettings` | chọn in-app/email/Zalo | Authenticated/Owner policy |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Đăng nhập | rate limit, credential, tenant, MFA, CSRF/origin | chuyển deep-link; lỗi không nói user có tồn tại hay không |
| Đăng xuất phiên | own session hoặc Owner recent-auth | revoke ngay, audit; phiên hiện tại về `/login` |
| Đăng xuất tất cả | recent-auth + MFA nếu policy yêu cầu | revoke trừ/bao gồm phiên hiện tại theo xác nhận rõ |
| Enroll/disable MFA | recent-auth, recovery code | secret chỉ hiện một lần; audit không chứa secret |

## Khối 5 — Autofill

- Tenant từ hostname/email domain; người dùng phải xác nhận khi có nhiều tenant.
- Locale/timezone từ profile, device chỉ là gợi ý; không ghi đè field đã chọn.
- Sau hết phiên, giữ route và draft key; đăng nhập lại quay đúng chỗ nếu còn quyền.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton card, nút đăng nhập disabled. |
| Chưa có dữ liệu | Tenant mới hiển thị hướng dẫn liên hệ owner, không tự tạo owner. |
| Lọc không ra | Session search không ra có nút xóa lọc. |
| Error | Câu tiếng Việt + việc tiếp theo + correlation ID khi 500. |
| Thiếu quyền | Owner-only section ẩn dữ liệu và trả 403 ở API. |
| Saved/success | Nút đổi “Đã đăng nhập ✓”; revoke highlight thiết bị vừa xử lý. |
| Mạng gián đoạn | Khóa submit, giữ input không nhạy cảm; không queue, không service worker/PWA. |
