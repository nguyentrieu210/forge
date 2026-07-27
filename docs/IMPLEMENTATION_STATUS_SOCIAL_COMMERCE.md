# Tiến độ triển khai Social Commerce

Ngày cập nhật: 2026-07-27.

- Cổng 1–3: đã duyệt.
- Pha 4: build TypeScript và migration validator đã chạy đạt.
- Pha 5, slice 01: Social Ingress, xác thực chữ ký raw body, HMAC Page directory, Queue + DLQ, Dispatch Namespace, tenant ingest idempotent và keyword → cart đã hoàn tất ở mức mã nguồn.
- Đã có schema nền cho kết nối kênh, Page, sự kiện, rule, giỏ, đơn, shipment và COD.
- Chưa deploy production trong bước này.
- Việc kế tiếp: OAuth authorization-code Facebook, Inbox UI, xác nhận giỏ → Sales Order, reservation, vận chuyển thủ công và đối soát COD.

Nguyên tắc chuyển tiếp: không tạo form yêu cầu khách nhập App Secret hoặc token dài hạn. Trước khi OAuth hoàn tất, chỉ nhà vận hành được đăng ký Page sandbox bằng HMAC directory.

## Cập nhật Wave 1

- OAuth authorization-code Facebook đã có: state một lần/10 phút, kiểm tra hostname tenant, server-side code exchange, AES-256-GCM tenant-bound và chỉ publish Page route sau durable commit.
- API vận hành đã có: summary, Pages, Inbox events, carts, keyword rule, cart conversion, shipment thủ công và COD reconcile một lần.
- Runtime đã có experience `social-commerce:dashboard`, lazy-loaded, responsive desktop/mobile.
- App package `server/apps-src/social-commerce` pack-check đạt.
- Kiểm thử server 377/377 và SQL suite đạt tại thời điểm hoàn tất backend; runtime production build đạt.
- Chưa mở production: còn cần Meta App thật/App Review, Worker Secrets và quyền gắn custom domain `chotdon.kairo.vn`.
