# Deploy status — chotdon.kairo.vn

Ngày: 2026-07-27.

## Đã triển khai

- Custom Domain `chotdon.kairo.vn` → `cloudforge-gateway`.
- Custom Domain `social-ingress.kairo.vn` → `cloudforge-social-ingress`.
- Social Ingress version `80065363-2838-4658-b4f4-1bf6ce10baec` với Queue `cloudforge-social-events` và DLQ.
- Gateway version `428a1699-b440-44a6-8b4f-f994b7b2a847`, giữ nguyên `edu.kairo.vn` và `hrm.kairo.vn`, thêm route mới theo kiểu additive.
- Control Plane version `4cc6824a-190f-46b9-b290-c0f4252ae7b8`.
- Tenant Worker `cloudforge-tenant-chotdon` trong dispatch namespace `cloudforge-production`, version `428ba9f4-f985-494b-8f1e-b20413b6baee`.
- D1 `cloudforge-chotdon`, id `1b08b4bc-a1fa-4789-9d92-c43d61588712`, region APAC; đã áp đủ migration `0001`–`0020`.
- Control D1 đã backup trước thay đổi; đã áp `0002_social_commerce_saas.sql`, `0003_facebook_oauth.sql` và `0004_public_signup.sql`.
- Control D1 và KV đều có route thuận `chotdon.kairo.vn` và route ngược `__tenant__:chotdon`; JSON đã đọc lại hợp lệ.
- Tenant có `SESSION_SECRET` riêng và `SOCIAL_CREDENTIAL_KEK` riêng. Giá trị chỉ nằm trong Cloudflare secret storage.
- Ba khóa dùng chung `INTERNAL_AUTH_SECRET`, `INTERNAL_SERVICE_TOKEN`, `CONTROL_TOKEN` đã được re-key đồng bộ trên Gateway, Jobs, Control, Social Ingress và bốn tenant `demo`, `edu`, `hrm`, `chotdon`.
- Đã tạo và xác minh quản trị viên đăng nhập `admin`; mật khẩu do chủ hệ thống chọn không ghi vào repo/log, chỉ lưu ở Windows User environment `FORGE_CHOTDON_ADMIN_PASSWORD`.
- Gói `social-commerce@0.1.0` đã cài trên tenant; manifest mở được tại `/x/social-commerce%3Adashboard`.
- Landing Kairo Social Commerce đã live tại `/`; đăng nhập mở bằng modal thay vì chuyển trang. Route `/signup` mở trực tiếp modal đăng ký shop; các route public còn lại được Gateway phục vụ bằng SPA shell.
- API public `POST /api/v1/public/signup` chỉ được Gateway chuyển tiếp trên đúng host `chotdon.kairo.vn`. Dữ liệu đăng ký chờ xác thực được mã hóa; email và IP chỉ lưu dưới dạng HMAC để tra cứu/chống lạm dụng.

## Smoke test

- `GET https://chotdon.kairo.vn/health` → `200`.
- `HEAD https://chotdon.kairo.vn/` → `200`, runtime assets có chunk Social Commerce.
- `GET /login`, `/signup`, `/privacy`, `/facebook/data-deletion` → `200`.
- QA trực tiếp: modal đăng ký chuyển sang modal đăng nhập trên cùng URL, không có lỗi console; giao diện desktop/mobile không tràn ngang.
- `POST /api/v1/public/signup` với payload rỗng → `422`, xác nhận binding Gateway → Control Plane hoạt động mà không tạo bản ghi đăng ký rác.
- `social-ingress.kairo.vn` nhận request nhưng trả `503 Facebook integration is not configured` đúng fail-closed khi chưa có Meta secrets.

## Trạng thái đăng nhập và Facebook

Đăng nhập tenant và giao tiếp nội bộ đã được khôi phục sau re-key. Các khóa dùng chung mới có bản sao vận hành ở Windows User environment và bản bí mật tương ứng trong Cloudflare; không có giá trị nào được commit.

Blocker còn lại chỉ thuộc tích hợp Facebook production: cần `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` do nhà vận hành tạo trong Meta for Developers. Không gửi các giá trị này qua chat hoặc commit Git.

## Trạng thái đăng ký khách hàng

Màn đăng ký và lớp tiếp nhận an toàn đã live. Sau khi gửi form hợp lệ, hệ thống tạo yêu cầu `pending_verification` có hạn 30 phút; mật khẩu được băm trước khi payload được mã hóa.

Email xác thực và tự động provision tenant chưa bật trong slice này. Không tuyên bố tài khoản/tenant đã được tạo cho đến khi email delivery, endpoint xác minh một lần và workflow provision được triển khai.
