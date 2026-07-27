# Audit nền Forge cho SaaS bán hàng đa kênh

Ngày audit: 2026-07-27  
Phạm vi: chỉ đọc mã/tài liệu và nghiên cứu web; chưa sửa mã nguồn, chưa chạy build/migration.

## 1. Kết luận nhanh

Forge đã là một nền SaaS ERP đa khách có giá trị tái sử dụng cao: gateway định tuyến tenant theo hostname, D1 vật lý riêng từng tenant, Durable Object điều phối ghi, Queue/R2, cookie session + CSRF, permission server-side, audit/lifecycle, kernel Sales Order/Delivery/Invoice/Payment và stock ledger. Không nên “clone chotdon.vn” thành codebase khác; nên bổ sung một bounded context **Social Commerce** vào nền này.

Khoảng trống chính là lớp tích hợp kênh: chưa có OAuth Facebook/TikTok, quản lý token/consent, webhook receiver idempotent, inbox/comment hợp nhất, channel identity, SKU mapping, quy tắc chốt đơn từ comment, inventory reservation và reconciliation job.

Slice đầu tiên đề xuất: **kết nối một kênh bằng OAuth chính thức → nhận webhook đã xác thực và chống trùng → đưa comment/message vào Inbox → nhân viên xác nhận thành đơn nháp → giữ tồn nguyên tử → xem audit trail**. Mặc định ưu tiên Facebook Page vì sát hành vi chốt đơn từ bình luận; nếu ưu tiên TikTok Shop thì thay adapter, giữ nguyên domain contract.

## 2. Stack và cấu trúc đã xác minh

| Lớp | Hiện trạng | Bằng chứng |
|---|---|---|
| Monorepo | pnpm workspace, Node >=22 | `package.json`, `pnpm-workspace.yaml` |
| Frontend | React 18, TypeScript, Vite, shadcn-style UI, TanStack, RHF/Zod, Recharts | `client/package.json`, `client/packages/*` |
| Backend | Cloudflare Workers, TypeScript, Frappe-shaped REST/RPC facade | `server/apps/*`, `server/packages/frappe-api` |
| Multi-tenant | gateway hostname routing; mỗi tenant một Worker/D1; fail-closed theo cấu hình tenant | `gateway-worker`, `tenant-worker/wrangler.jsonc` |
| Consistency | Durable Object cho aggregate writes; outbox + Queue | `document-kernel`, `outbox`, tenant worker |
| ERP core | Sales Order, Delivery Note, Sales Invoice, Payment Entry, stock ledger/valuation | `clouderp-selling`, `clouderp-stock`, migrations 0001–0018 |
| App model | app metadata có DocType/workflow/role/fixture; hook riêng qua Workers for Platforms | `docs/APP_FACTORY.md`, `app-registry` |
| UI runtime | một generic bundle dựng màn từ metadata, list/form/kanban/calendar/dashboard/3-column detail | `client/apps/runtime`, `client/packages/views` |
| Gates | root `verify`, server business-suite gates, worker tests, client typecheck/build | root/server/client `package.json` |

## 3. Module sẵn có có thể tái sử dụng

- Tenant isolation vật lý và routing theo hostname.
- Phiên đăng nhập, CSRF, role/permission server-side, field redaction.
- Document lifecycle, workflow, optimistic locking và deterministic command id.
- Customer/Item/Warehouse/Sales Order/Delivery/Invoice/Payment và stock ledger.
- Outbox/Queue cho xử lý bất đồng bộ.
- App registry + metadata-driven UI; list, form, split-detail 3 cột, timeline, kanban, dashboard.
- Backup/provision/deploy scripts và test harness tương đối đầy đủ.

## 4. Khoảng trống so với SaaS chốt đơn đa kênh

| Năng lực | Hiện trạng | Cần bổ sung |
|---|---|---|
| Kết nối Facebook/TikTok | Không tìm thấy connector/OAuth | Authorization Code, `state`, PKCE khi nền tảng yêu cầu, callback server-side, scope review |
| Bí mật/tokens | Chưa có vault/domain model cho connector | app secret là secret của nhà vận hành; token/refresh token mã hóa server-side; rotation/revoke |
| Webhooks | Có outbox nội bộ, chưa có inbound social webhook | signature verification, raw-event log, unique provider event ID, ACK nhanh, queue xử lý |
| Inbox đa kênh | Chưa có | conversation/contact/message/comment normalized model, assignment, unread/SLA |
| Chốt đơn từ comment | Chưa có | keyword parser, duplicate-window, staff confirmation, audit and reason |
| Ánh xạ catalog | Item có sẵn nhưng chưa map kênh | channel shop/product/variant ↔ Item/SKU, sync state/error |
| Giữ tồn | Stock ledger có, chưa có reservation lifecycle | atomic reserve/release/commit, TTL, oversell guard |
| Đồng bộ trạng thái | Chưa có reconciliation kênh | webhook-first + scheduled reconciliation, cursor/checkpoint |
| Consent/privacy | Chưa có consent ledger cho social data | granted scopes, purpose, retention, deletion/export request |
| Quan sát tích hợp | Chưa có dashboard connector | health, token expiry, webhook lag, retries, dead letters |

## 5. Kiến trúc OAuth an toàn đề xuất

1. Nhà vận hành SaaS đăng ký một Meta App và một TikTok Shop App; app key/secret nằm trong Cloudflare Secrets, không nằm trong D1 công khai và không do từng khách nhập.
2. Người quản trị shop bấm “Kết nối”, backend tạo `state` ngẫu nhiên một lần, ràng tenant + user + redirect intent, TTL ngắn.
3. Provider hiển thị consent; callback chỉ nhận authorization code và `state`.
4. Backend xác minh `state`, đổi code lấy token ở server, kiểm granted scopes/shop identity rồi mã hóa credential trước khi lưu.
5. Webhook xác minh signature trên raw body, ghi event bằng unique key `(provider, app, event_id)`, trả 2xx nhanh và xử lý qua Queue.
6. Refresh/revoke do scheduler và disconnect flow quản lý; mọi lần dùng token có audit và không log plaintext.

## 6. Slice end-to-end đề xuất

### Luồng người dùng

`Quản trị shop → Kết nối Facebook Page → chọn Page → webhook comment tới → Inbox hiện comment → nhân viên chọn sản phẩm/SL → hệ thống kiểm và giữ tồn → tạo Social Order Draft → quản lý xem lịch sử`.

### Bảng/domain tối thiểu

- `channel_connections`, `oauth_states`, `channel_scopes`
- `channel_identities`, `channel_catalog_mappings`
- `inbound_webhook_events`, `channel_messages`
- `social_order_drafts`, `social_order_items`
- `inventory_reservations`, `integration_sync_checkpoints`

### API tối thiểu

- `POST /api/integrations/:provider/connect`
- `GET /api/integrations/:provider/callback`
- `POST /api/webhooks/:provider`
- `GET /api/social-inbox`
- `POST /api/social-inbox/:messageId/create-draft`
- `POST /api/social-orders/:id/confirm`
- `POST /api/integrations/:id/disconnect`

### Tiêu chí chạy được

- OAuth thật hoặc provider sandbox; không có form nhập app secret/token.
- Webhook replay cùng event ID không tạo message/đơn/giữ tồn lần hai.
- Tenant A không đọc/ghi connection, message hay reservation của tenant B.
- Tài khoản chỉ có `Social Agent` không cấu hình connector; `Social Manager` mới được kết nối/ngắt.
- Hết tồn trả lỗi tiếng Việt và không tạo đơn dở dang.
- Ngắt kết nối revoke token (nếu API hỗ trợ), ngừng sync nhưng giữ audit theo retention policy.

## 7. Rủi ro hiện trạng repo

- Worktree đang rất bẩn: nhiều file tracked đã sửa và nhiều file mới chưa commit, trên nhánh `master`. Không được tạo nhánh/commit hay format diện rộng trước khi xác định thay đổi nào thuộc công việc đang dang dở của người dùng.
- Tài liệu trạng thái có dấu hiệu lệch thời điểm: README nói số test/gates khác `server/STATUS.md`; cần chạy gate ở Pha 4/6 để lấy bằng chứng hiện hành.
- `wrangler.jsonc` chứa resource IDs công khai (không phải secret) và cấu hình production; mọi thay đổi deploy cần tách khỏi slice local.
- Kernel có stock ledger nhưng chưa có reservation. Dùng trực tiếp submit Sales Order để “giữ hàng” sẽ trộn cam kết bán với bút toán nghiệp vụ và khó timeout/release.

## 8. Kế hoạch sau khi qua các cổng

1. BRD: actors, consent/privacy, workflow inbox→draft→confirm/cancel, ma trận quyền, màn và trạng thái lỗi.
2. Thiết kế: schema/Field Ledger, provider adapter interface, credential envelope, webhook state machine, reservation transaction.
3. Chuẩn bị nhánh an toàn từ worktree hiện tại sau khi người dùng xác nhận cách xử lý thay đổi đang dở.
4. Build theo chiều dọc: migration → service/adapter → webhook queue → API → UI → tests.
5. Verify: replay, signature failure, expired OAuth state, revoked scope, cross-tenant, oversell race, browser desktop/mobile.

## 9. Nhật ký nghiên cứu web — 5 lớp

| Lớp | Nguồn | Sự thật rút được |
|---|---|---|
| Nghiệp vụ VN | Chotdon.vn (kết quả tìm kiếm sản phẩm) | Định vị cốt lõi là chốt đơn/social commerce, không phải ERP tổng quát. |
| Nghiệp vụ VN | TikTok Shop Seller University — LIVE Manager | Live có vai trò chủ phòng/trợ lý và KPI GMV, mặt hàng, người mua/follower. |
| Nghiệp vụ VN | Sapo Support — quản lý livestream Facebook | Kịch bản keyword comment → tạo đơn → phản hồi; sản phẩm phụ thuộc đồng bộ tồn. |
| Nghiệp vụ VN | BigSeller Help — Facebook livestream orders | Cần exact keyword, chống đơn trùng và liên kết phiên live gần nhất để trừ tồn. |
| Đối thủ | KiotViet — bán hàng đa kênh | Chuẩn thị trường: gom đơn/tồn/giá, comment/message template, lọc cú pháp chốt đơn. |
| Đối thủ | Bado — bán hàng livestream | Multi-page/channel, tự động chốt, tồn và vận chuyển là baseline cạnh tranh. |
| Pháp lý | Luật BV dữ liệu cá nhân 91/2025/QH15 | Có hiệu lực 01/01/2026; phải thiết kế purpose/consent/quyền chủ thể và trách nhiệm xử lý. |
| Pháp lý | Luật TMĐT 122/2025/QH15 | Có hiệu lực 01/07/2026; phạm vi mới bao gồm hoạt động TMĐT hiện hành. |
| Pháp lý | Nghị định 248/2026/NĐ-CP / Cổng Pháp luật | Livestream commerce cần quy chế, cảnh báo hàng rủi ro, cơ chế phản ánh/xử lý vi phạm. |
| OAuth chính thức | TikTok Login Kit | OAuth 2.0 authorization code; `state`; token/refresh token và secret chỉ ở server. |
| OAuth chính thức | TikTok Shop — Create OAuth client | Seller cấp consent cho app rồi app đổi code lấy access/refresh token; public app cần review. |
| Webhook chính thức | TikTok Shop — Webhook Configuration | HTTPS/TLS, verify signature, ACK trong 3 giây, provider retry nhiều lần. |
| Best practice EN | Shopify — About webhooks | Verify HMAC, deduplicate, không dựa độc quyền vào webhook; cần reconciliation job. |
| Best practice EN | Shopify — Idempotency | Request riêng có UUID riêng; retry dùng lại key; chặn concurrent duplicate. |
| Best practice EN | Salesforce Omnichannel Inventory | Order routing cần inventory reservation lifecycle, không chỉ đọc tồn tức thời. |
| Tiếng người dùng | Kết quả cộng đồng/review seller | Khi volume tăng, nỗi đau nổi bật là sót comment, đơn trùng, oversell và khối lượng vận hành kho/COD. Cần số liệu thật từ khách để xếp hạng. |

## 10. Scorecard Cổng 1

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| Audit codebase + inventory | ✅ | Mục 2–4; đọc cấu trúc, manifests, migrations, packages, docs |
| 5 lớp, >=10 nguồn | ✅ | Mục 9, 16 dòng nguồn |
| Thuật ngữ/nghiệp vụ ngành | ✅ | inbox, comment, keyword, draft, reservation, fulfillment |
| Tier đa khách | ✅ | giữ D1 vật lý riêng từng tenant đang có |
| 3 nỗi đau có tần suất × chi phí | ❌ | chưa có số vận hành thực tế của nhóm khách đầu tiên |
| Kênh/scope slice đầu được chốt | ❌ | cần người dùng chọn Facebook Page hay TikTok Shop và phạm vi vận chuyển |
| Worktree an toàn để tạo nhánh | ❌ | repo đang có nhiều thay đổi dở dang chưa xác định chủ sở hữu |

Kết luận: audit và research đã đủ chiều rộng, nhưng **chưa qua Cổng 1** cho đến khi ba dòng ❌ được chốt cùng người dùng.

## Nguồn web

- https://seller-vn.tiktok.com/university/essay?knowledge_id=113561775900417&lang=vi-VN
- https://support.sapo.vn/quan-ly-ban-hang-livestream-kenh-facebook
- https://help.bigseller.com/vi/detailPage/3/1/9227/content
- https://www.kiotviet.vn/giai-phap-ban-hang-da-kenh
- https://bado.vn/tinh-nang/ban-hang-livestream
- https://developers.tiktok.com/doc/login-kit-overview
- https://partner.tiktokshop.com/docv2/page/create-tts-app-oauth-client
- https://partner.tiktokshop.com/docv2/page/configuration-guide
- https://shopify.dev/docs/apps/build/webhooks
- https://shopify.dev/docs/api/usage/implementing-idempotency
- https://trailhead.salesforce.com/content/learn/modules/omnichannel-inventory/integrate-omnichannel-inventory-with-salesforce-order-management
- https://sav.gov.vn/vi/bai-viet/tai-lieu-gioi-thieu-luat-bao-ve-du-lieu-ca-nhan
- https://chinhphu.vn/?classid=1&docid=216503&orggroupid=1&pageid=27160
- https://phapluat.gov.vn/tin-tuc/phai-cong-khai-quy-che-livestream-ban-hang-tren-nen-tang-thuong-mai-dien-tu
