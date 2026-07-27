# Runbook — Facebook OAuth và API vận hành

Ngày: 2026-07-27.

## Luồng OAuth

1. System Manager gọi `POST /api/v1/social/facebook/oauth/start` trong tenant.
2. Tenant gọi Social Ingress bằng service binding và internal token.
3. Ingress kiểm tra hostname trả về có đúng route active của tenant, tạo state ngẫu nhiên dùng một lần và hết hạn sau 10 phút.
4. Người dùng cấp quyền trên Facebook. Callback server đổi code, lấy các Page được cấp quyền và chuyển token trực tiếp tới tenant Worker qua Dispatch Namespace.
5. Tenant mã hóa Page ID/token bằng AES-256-GCM với AAD gồm tenant + connection + provider.
6. Chỉ sau khi tenant trả thành công, Control D1 mới kích hoạt HMAC Page directory.

Khách không nhìn thấy và không nhập App Secret/token dài hạn. Control D1 không lưu token hoặc nội dung khách mua.

## Secrets và biến vận hành

Social Ingress Worker Secrets: `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `PAGE_DIRECTORY_HMAC_SECRET`, `INTERNAL_SERVICE_TOKEN`.

Tenant dispatch secret: `SOCIAL_CREDENTIAL_KEK` là 32 byte ngẫu nhiên mã hóa base64; mỗi tenant dùng key riêng. Tenant Worker cần service binding `SOCIAL_INGRESS`.

Biến `PUBLIC_ORIGIN` của Social Ingress phải là HTTPS origin đã khai báo làm OAuth redirect URI trong Meta App. `META_GRAPH_VERSION` được pin và nâng cấp có kiểm thử.

## API Wave 1 hiện có

- `GET /api/v1/social/summary`
- `GET /api/v1/social/pages`
- `GET /api/v1/social/events`
- `GET /api/v1/social/carts`
- `POST /api/v1/social/rules`
- `POST /api/v1/social/carts/:id/convert`
- `POST /api/v1/social/orders/:id/shipments`
- `POST /api/v1/social/shipments/:id/cod-reconcile`

Mọi API ghi yêu cầu role quản lý/bán hàng ở server. COD chỉ được đối soát một lần.
