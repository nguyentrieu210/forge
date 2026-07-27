# Runbook — Facebook webhook → giỏ hàng theo từ khóa

Trạng thái: slice backend đầu tiên, ngày 2026-07-27.

## Phạm vi chạy được

1. Meta gọi `GET /webhooks/facebook` để xác minh callback.
2. Meta gửi webhook Page có `X-Hub-Signature-256`.
3. Social Ingress xác thực chữ ký trên raw body, băm Page ID bằng HMAC và tra route trong Control D1.
4. Payload hợp lệ được đưa vào `cloudforge-social-events`; Worker trả ACK ngay.
5. Consumer kiểm tra lại tenant route rồi chuyển vào đúng tenant Worker qua Dispatch Namespace.
6. Tenant Worker ghi sự kiện idempotent. Bình luận khớp một keyword active sẽ tạo/cập nhật giỏ mở của khách.
7. Schema đã có nền cho xác nhận đơn, vận chuyển thủ công và đối soát COD.

Khách SaaS không được nhập `META_APP_SECRET`, verify token hay access token. Các secret này do nhà vận hành đặt bằng Worker Secrets. `social_page_routes` chỉ giữ HMAC của Page ID; nội dung và định danh khách mua chỉ nằm trong D1 riêng của tenant.

## Tài nguyên

- Worker: `cloudforge-social-ingress`
- Queue: `cloudforge-social-events`
- DLQ: `cloudforge-social-events-dlq`
- Control migration: `0002_social_commerce_saas.sql`
- Tenant migration: `0019_social_commerce.sql`
- Secrets bắt buộc: `META_APP_SECRET`, `META_VERIFY_TOKEN`, `PAGE_DIRECTORY_HMAC_SECRET`, `INTERNAL_SERVICE_TOKEN`

## Chuẩn bị sandbox

1. Áp migration Control D1 và migration D1 của tenant thử nghiệm.
2. Đặt bốn Worker Secrets; `INTERNAL_SERVICE_TOKEN` phải giống token tenant Worker đang dùng.
3. Tạo Page route bằng cách tính `HMAC-SHA256(PAGE_DIRECTORY_HMAC_SECRET, "facebook:<PAGE_ID>")`, rồi ghi HMAC, tenant, worker và trạng thái `active` vào `social_page_routes`.
4. Tạo một `social_keyword_rules` active, ví dụ keyword `RED-M`, SKU `RED-M`, quantity `1`.
5. Deploy tenant Worker trước, sau đó deploy Social Ingress.
6. Cấu hình callback Meta tới `/webhooks/facebook` và subscribe Page sandbox.

Bước 3 hiện là thao tác nội bộ của nền tảng, không phải form dành cho khách. Nó sẽ được thay bằng OAuth authorization-code ở slice kế tiếp; tuyệt đối không đưa access token vào bảng route hoặc client.

## Tiêu chí smoke

- Challenge đúng trả nguyên challenge; verify token sai trả `403`.
- Chữ ký sai trả `401`, không enqueue.
- Page chưa đăng ký vẫn ACK nhưng không enqueue, tránh lộ trạng thái tenant.
- Gửi lại cùng raw body không nhân đôi `social_events` hoặc giỏ.
- Bình luận `RED-M` hai webhook khác nhau tăng quantity thành `2`.
- Route tenant bị suspend/đổi worker khiến consumer retry rồi vào DLQ, không chuyển sang tenant khác.

## Rollback

Rollback code: deploy lại phiên bản Worker trước. Migration là additive, không xóa bảng trong rollback. Có thể đặt `social_page_routes.status='paused'` để dừng ingest từng Page; dữ liệu tenant đã nhận được giữ nguyên phục vụ audit.
