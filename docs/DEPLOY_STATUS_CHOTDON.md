# Deploy status — chotdon.kairo.vn

Ngày: 2026-07-27.

## Đã triển khai

- Custom Domain `chotdon.kairo.vn` → `cloudforge-gateway`.
- Custom Domain `social-ingress.kairo.vn` → `cloudforge-social-ingress`.
- Social Ingress version `80065363-2838-4658-b4f4-1bf6ce10baec` với Queue `cloudforge-social-events` và DLQ.
- Gateway version `7afa63c6-77ec-45aa-8b6a-6565c28f30dc`, giữ nguyên `edu.kairo.vn` và `hrm.kairo.vn`, thêm route mới theo kiểu additive.
- Tenant Worker `cloudforge-tenant-chotdon` trong dispatch namespace `cloudforge-production`, version `428ba9f4-f985-494b-8f1e-b20413b6baee`.
- D1 `cloudforge-chotdon`, id `1b08b4bc-a1fa-4789-9d92-c43d61588712`, region APAC; đã áp đủ migration `0001`–`0020`.
- Control D1 đã backup trước thay đổi; đã áp `0002_social_commerce_saas.sql` và `0003_facebook_oauth.sql`.
- Control D1 và KV đều có route thuận `chotdon.kairo.vn` và route ngược `__tenant__:chotdon`; JSON đã đọc lại hợp lệ.
- Tenant có `SESSION_SECRET` riêng và `SOCIAL_CREDENTIAL_KEK` riêng. Giá trị chỉ nằm trong Cloudflare secret storage.

## Smoke test

- `GET https://chotdon.kairo.vn/health` → `200`.
- `HEAD https://chotdon.kairo.vn/` → `200`, runtime assets có chunk Social Commerce.
- `social-ingress.kairo.vn` nhận request nhưng trả `503 Facebook integration is not configured` đúng fail-closed khi chưa có Meta secrets.

## Blocker để đăng nhập và dùng Facebook

Ba secret dùng chung của Forge không còn bản sao cục bộ: `INTERNAL_AUTH_SECRET`, `INTERNAL_SERVICE_TOKEN`, `CONTROL_TOKEN`. Cloudflare không cho đọc lại secret đã ghi. Không tự tạo giá trị khác cho tenant mới vì Gateway/Jobs/Control sẽ không xác thực được.

Hai cách xử lý:

1. Khôi phục ba giá trị gốc từ kho mật khẩu vận hành và gắn vào tenant/Social Ingress.
2. Re-key toàn bộ Forge Gateway, Jobs, Control và mọi tenant hiện có trong một maintenance window. Cách này làm đăng xuất phiên hiện tại và có rủi ro ảnh hưởng `demo`, `edu`, `hrm`, nên cần phê duyệt riêng.

Meta production vẫn cần `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` do nhà vận hành tạo trong Meta for Developers; không gửi qua chat hoặc commit Git.
