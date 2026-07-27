# BRD 360° — Forge Social Commerce SaaS

Trạng thái: **Pha 2 — chờ duyệt Cổng 2**  
Ngày: 2026-07-27  
Phạm vi: Facebook Page trước; SaaS self-service nhiều khách; có vận chuyển và COD.

## 0. Nhật ký đọc contract

| Contract/nguồn | Quy tắc áp dụng cụ thể |
|---|---|
| ADR-001 multi-tenant | Control DB tách riêng; dữ liệu shop nằm trong D1 vật lý riêng từng khách; resolve sai/thiếu phải fail-closed. |
| SaaS Platform Operations | Tenant lifecycle, entitlement/license server-side, webhook idempotent, provisioning có desired state và audit. |
| Provisioning executor | Plan/apply/verify/reconcile; step idempotent; lease job; không nuốt lỗi; không xóa tài nguyên không chứng minh ownership. |
| Frontend 360 | Desktop/mobile là hai cây render; lỗi tiếng Việt; đủ loading/empty/filter/permission/offline/success. |
| Data table | Checkbox + STT + avatar; search/filter/bulk/inline action; mobile card; bấm dòng mở 3 cột desktop. |
| Form/workflow | FormDrawer desktop/full-screen mobile; Zod hai phía; link field tìm kiếm; nút bước tiếp theo theo trạng thái. |
| Mobile/PWA | BottomNav + FAB 56px, PWA install/update/offline, không bảng cuộn ngang. |
| Screen catalog | Login, dashboard, CRUD, settings, order/payment/inventory đúng pattern; lịch sử trên detail. |
| Master data | Chi nhánh, kho, hãng vận chuyển, nguồn đơn, lý do hủy là danh mục quản trị được, không hardcode select trong UI. |
| Notify | In-app nền; thay đổi đơn gửi theo cấu hình; opt-out; message log; adapter không nối không làm app hỏng. |
| Backend | Auth→permission→Zod→transaction→audit; error envelope thống nhất; webhook signature + unique claim trước side effect. |
| Polish | Autosave draft, optimistic lock, wizard onboarding, dữ liệu demo, KPI drill-down, session security. |

## 1. Assumptions và câu hỏi mở

### Assumptions đã dùng để tiếp tục

| Mã | Giả định |
|---|---|
| A01 | Sản phẩm là SaaS public cho SME bán qua livestream, tier shared; mỗi khách một D1 vật lý. |
| A02 | Kênh đầu tiên là Facebook Page; TikTok Shop dùng chung provider contract ở giai đoạn sau. |
| A03 | Khách không nhập app secret/token. Forge vận hành Meta App; khách chỉ OAuth và chọn Page. |
| A04 | MVP có giao hàng và COD; tích hợp hãng vận chuyển theo adapter, bắt đầu bằng adapter mock/manual để chứng minh flow, sau đó nối nhà cung cấp thật. |
| A05 | Benchmark shop: 100–300 đơn/ngày, 3–7 live/tuần; cần chịu burst tối thiểu 20 comment/giây/page. |
| A06 | Benchmark pain: sót 2% đơn × 200 đơn/ngày × 180.000đ = 720.000đ doanh thu cơ hội/ngày; trùng 1% = 2 ca xử lý/ngày; oversell 0,5% = 1 ca hoàn/đền/ngày. Telemetry thực tế sẽ thay benchmark. |
| A07 | Self-signup tạo trial 14 ngày. Thanh toán thuê bao tự động không nằm trong slice đầu; control plane vẫn có Plan/Subscription/Entitlement để nối cổng thanh toán sau. |
| A08 | Commit được phép vào `main`, nhưng commit chỉ stage file thuộc feature; không gom thay đổi có sẵn của người dùng. |

### Câu hỏi mở không chặn BRD

- Hãng vận chuyển đầu tiên: GHN, GHTK, Viettel Post hay manual CSV.
- Chính sách phí COD/đối soát cụ thể của provider đầu tiên.
- Tên thương mại cuối; BRD dùng tên tạm **Forge Social**.

## 2. Problem

Shop livestream phải đọc comment nhanh, nhận diện khách/SKU, kiểm tồn, gom địa chỉ, tạo vận đơn, theo dõi COD và đối soát. Khi làm bằng Facebook + Excel + trang hãng vận chuyển, dữ liệu bị chia cắt: comment dễ sót/trùng, một khách bình luận nhiều lần tạo nhiều đơn, tồn chưa được giữ trong lúc xác nhận, COD giao xong nhưng chưa chắc tiền đã về.

Nỗi đau xếp hạng theo benchmark:

1. **Sót đơn/comment** — xảy ra hằng ngày, giá trị cơ hội khoảng 720.000đ/ngày; quyết định màn chính là Inbox Live.
2. **Bán vượt tồn hoặc giữ hàng không rõ** — khoảng một ca/ngày; gây hủy đơn, giảm uy tín.
3. **Đơn trùng/khách trùng** — khoảng hai ca/ngày; tốn gọi lại, đóng gói và phí hoàn.
4. **COD chưa đối soát** — xảy ra theo chu kỳ giao nhận; khó biết doanh thu thật và tiền đang nằm ở hãng vận chuyển.

## 3. Goal

| Mục tiêu | Chỉ số nghiệm thu MVP |
|---|---|
| Không bỏ sót event đã được Facebook giao | 100% webhook hợp lệ được ghi raw-event trước xử lý; có reconciliation/cảnh báo lag. |
| Không tạo trùng | Replay cùng provider event ID tạo đúng một message; cùng comment tạo tối đa một draft theo rule. |
| Không oversell do đua đồng thời | Reservation nguyên tử; hai yêu cầu tranh đơn vị cuối chỉ một thành công. |
| Khách tự bắt đầu | Đăng ký → xác minh email → tạo shop trial → onboarding → kết nối Page, không cần operator nhập secret. |
| Vận hành đơn trọn vòng | Comment → draft → xác nhận → đóng gói → giao → COD chờ đối soát → đã đối soát/hoàn. |
| Cách ly khách | Mọi cross-tenant test fail-closed; Control DB không chứa nội dung comment/đơn/SĐT. |
| Truy vết | Mọi kết nối, đổi trạng thái, giữ/release tồn và đối soát đều có actor, reason, before/after, correlation ID. |

## 4. Actors

### Trong shop tenant

| Actor | Việc chính | Không được làm |
|---|---|---|
| Chủ shop | Kết nối Page, cấu hình, xem doanh thu/COD, quản người dùng | Không xem shop khác; không đọc plaintext token. |
| Quản lý bán hàng | Điều phối inbox, duyệt/hủy đơn, gán nhân viên, xử lý ngoại lệ | Không đổi gói SaaS hoặc secret nền tảng. |
| Nhân viên chốt đơn | Đọc/nhắn, ghép khách, tạo draft, xác nhận theo quyền | Không kết nối/ngắt Page; không đối soát COD. |
| Kho/đóng gói | Pick-pack, in phiếu, bàn giao vận chuyển | Không xem token, giá vốn hoặc cấu hình SaaS. |
| Kế toán/COD | Xem phí, tiền thu hộ, đối soát, xuất báo cáo | Không sửa comment/gắn Page. |
| Kiểm toán viên | Chỉ đọc đơn, COD và audit | Không mutate bất kỳ nghiệp vụ nào. |

### Control plane

| Actor | Việc chính |
|---|---|
| Customer Owner | Đăng ký, chọn plan, xem trial/subscription, quản thành viên và dữ liệu xuất khẩu. |
| Super Admin | Toàn quyền tenant/lifecycle/plan; terminate cần backup + reason. |
| Operator | Provision/reconcile/suspend có reason theo quyền cấp. |
| Billing Admin | Plan/subscription/invoice/payment khi module billing bật. |
| Support | Ticket, gửi reset-link owner; không đọc dữ liệu đơn/comment tenant. |
| Viewer | Chỉ xem health/usage/audit platform đã lọc. |

## 5. Entities

### Control DB — không chứa dữ liệu nghiệp vụ khách

| Entity | Field chính và ràng buộc |
|---|---|
| Tenant | id UUID PK; slug UNIQUE; name; owner_email; status; plan_id; trial_ends_at; customer_db_uuid UNIQUE; worker_name; created/updated. |
| Plan | id; key UNIQUE; name; price_minor; currency=VND; limits_json; active. |
| Subscription | id; tenant_id; plan_id; status; period_start/end; cancel_at_period_end; UNIQUE active per tenant. |
| Entitlement | tenant_id + feature_key UNIQUE; value_json; source; expires_at. |
| ProvisionJob | id; tenant_id; desired_revision UNIQUE; status; lease_owner/until; current_step; error_code; timestamps. |
| ProvisionStep | job_id + step_key UNIQUE; idempotency_key UNIQUE; status; attempts; evidence_json. |
| PlatformAudit | id; actor; role; action; tenant_id; target; reason; ip; user_agent; correlation_id; created_at; immutable. |
| SignupVerification | email_hash; token_hash UNIQUE; expires_at; used_at; attempts. Plain token không lưu. |

### D1 của từng khách

| Entity | Field chính và ràng buộc |
|---|---|
| ChannelConnection | id; provider; page_id; page_name; status; granted_scopes_json; credential_ciphertext; key_version; expires_at; last_sync_at; UNIQUE(provider,page_id). |
| OAuthState | state_hash PK; actor_id; provider; redirect_path; expires_at; consumed_at; one-time atomic consume. |
| WebhookEvent | provider + event_id UNIQUE; connection_id; event_type; raw_payload_ciphertext/key; received_at; status; attempts; error_code; processed_at. |
| ChannelIdentity | provider + external_user_id UNIQUE; customer_id nullable; display_name; avatar_url; phone_masked; last_seen_at. |
| Conversation | provider + page_id + external_thread_id UNIQUE; identity_id; assignee_id; state; unread_count; last_message_at. |
| ChannelMessage | provider + external_message_id UNIQUE; conversation_id; direction; kind; body_ciphertext; parent_external_id; occurred_at; delivery_state. |
| CatalogMapping | connection_id + external_variant_id UNIQUE; item_code; external_sku; keyword; sync_status; last_error. |
| SocialOrderDraft | id; code UNIQUE; source_message_id UNIQUE nullable; customer_id; status; subtotal/discount/shipping/total minor integers; address; assignee; expires_at; version. |
| SocialOrderItem | draft_id + line_no UNIQUE; item_code; variant; qty_micros; unit_price_minor; reservation_id. |
| InventoryReservation | id; item_code; warehouse; qty_micros; status(reserved/committed/released/expired); expires_at; source_type/id; idempotency_key UNIQUE. |
| Shipment | id; order_name UNIQUE; provider; service_code; tracking_code UNIQUE nullable; COD_minor; shipping_fee_minor; status; label_file_key. |
| ShipmentEvent | provider + external_event_id UNIQUE; shipment_id; status; occurred_at; payload_ref. |
| CODReconciliation | id; provider; cycle_ref; expected_minor; received_minor; variance_minor; status; reconciled_by/at. |
| CODLine | reconciliation_id + shipment_id UNIQUE; expected/received/fee minor; match_status; reason. |
| Master data | Branch, Warehouse, ShippingProvider, ShippingService, OrderSource, CancelReason — admin-configurable, link fields dùng lookup. |

Mọi số tiền lưu integer minor; số lượng dùng micros theo kernel hiện có. Token/message/address là dữ liệu cá nhân, mã hóa hoặc giới hạn quyền theo mục đích.

## 6. Business flows

### F1 — Self-signup và provisioning

1. Customer Owner nhập tên shop, email, mật khẩu và đồng ý điều khoản/privacy.
2. Hệ thống gửi link xác minh một lần; dùng token sai/hết hạn → lỗi rõ và nút gửi lại có rate limit.
3. Sau xác minh, Control DB tạo Tenant `provisioning`, Subscription `trialing`, ProvisionJob desired revision 1.
4. Executor claim lease, create-or-find D1 khách, áp migrations, seed owner/reset link, gán entitlement, verify health + isolation.
5. Healthy → Tenant `trial`, route active, gửi link onboarding. Bước lỗi → job failed có thể resume; không tạo tài nguyên trùng.

### F2 — Kết nối Facebook Page bằng OAuth

1. Chủ shop mở Cài đặt/Kênh bán, bấm `Kết nối Facebook`.
2. Server kiểm role, tạo state ngẫu nhiên/TTL, lưu hash và redirect sang Meta OAuth.
3. Meta callback trả code/state; server atomic consume state, đổi code lấy token server-side, đọc Pages/scopes.
4. Chủ shop chọn Page; server lưu credential ciphertext và đăng ký webhook.
5. Thành công hiện Page + scopes + hạn token; thiếu scope báo cụ thể và không đánh dấu connected.
6. Disconnect yêu cầu confirm + reason, unsubscribe/revoke nếu provider hỗ trợ, xóa/khóa credential và giữ audit.

### F3 — Webhook đến Inbox

1. Endpoint đọc raw body, verify challenge/signature trước parse.
2. Claim `UNIQUE(provider,event_id)`; trùng trả 200 no-op.
3. Ghi event received, ACK nhanh, đẩy Queue.
4. Consumer normalize identity/conversation/message bằng unique external IDs; cập nhật unread và audit kỹ thuật.
5. Xử lý lỗi retry giới hạn; quá ngưỡng sang dead-letter UI/cảnh báo; reconciliation fetch phần bị lỡ.

### F4 — Comment thành đơn nháp và giữ tồn

1. Nhân viên mở comment trong Inbox 3 cột; hệ thống gợi ý mapping keyword→SKU, không tự tạo đơn chính thức.
2. Nhân viên chọn/ghép khách, sản phẩm, số lượng, địa chỉ, kho; form autosave.
3. Server transaction kiểm available = stock − active reservations; tạo draft + reservation idempotent.
4. Hết tồn → rollback toàn bộ, báo số còn lại và cho chọn SKU/kho khác.
5. Draft hết TTL hoặc bị hủy → release reservation bằng job idempotent.
6. Xác nhận → tạo Sales Order bằng kernel hiện có, commit reservation; source message được khóa chống tạo lần hai.

### F5 — Giao hàng và COD

1. Kho xác nhận đóng gói, chọn ShippingService, COD mặc định bằng số còn phải thu.
2. Adapter tạo vận đơn với idempotency key; lỗi mạng retry không tạo hai tracking code.
3. Nhãn được lưu R2 private và in; bàn giao chuyển trạng thái.
4. Webhook/polling cập nhật đang giao/giao thành công/hoàn/hủy.
5. Giao thành công COD → `COD chờ đối soát`, chưa coi là tiền đã thu.
6. Kế toán import/fetch bảng đối soát, hệ thống auto-match tracking+amount; lệch vào queue 3 cột, xác nhận có reason/audit.
7. Match xong mới tạo Payment Entry/allocation theo kernel; duplicate cycle/line không credit lần hai.

### F6 — Trial/lifecycle

1. T-7/T-3/T-1 hệ thống nhắc owner; hết trial → `limited` chỉ đọc, owner vẫn vào trang gói/xuất dữ liệu.
2. Support/Operator suspend cần reason; tenant app enforce server-side.
3. Reactivate khôi phục entitlement; manual hold không tự gỡ bởi payment.
4. Terminate chỉ Super Admin, cần backup verified; dữ liệu giữ theo retention policy rồi mới purge có phê duyệt.

## 7. Permission matrix theo endpoint

| Endpoint/action | Owner | Sales Mgr | Agent | Warehouse | COD Acct | Auditor |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Connect/disconnect Facebook | ✓ | — | — | — | — | — |
| Read inbox/messages | ✓ | ✓ | ✓ | — | — | r |
| Assign conversation | ✓ | ✓ | own | — | — | r |
| Create/edit draft | ✓ | ✓ | ✓ | r | r | r |
| Confirm/cancel order | ✓ | ✓ | conditional | — | — | r |
| Reserve/release stock | server flow | server flow | server flow | r | — | r |
| Pack/create shipment/print | ✓ | ✓ | — | ✓ | r | r |
| Reconcile COD/post payment | ✓ | r | — | — | ✓ | r |
| Change master/settings/users | ✓ | conditional | — | — | — | r |
| Export audit/data | ✓ | conditional | — | — | conditional | r |

Control-plane endpoints dùng 5 role chuẩn; Support không có endpoint đọc comment/order. Mọi permission enforce server-side; UI chỉ phản ánh kết quả.

## 8. MVP screens — Screen Spec Cards

### S01 — Đăng ký & xác minh

- **Route/actor:** `/signup`, `/verify-email`; public/Customer Owner.
- **Desktop/mobile:** card trung tâm desktop; form full-width mobile, touch target 44px.
- **Components:** tên shop, email, mật khẩu, checkbox điều khoản/privacy, strength hint, submit loading, resend verification.
- **Actions/API:** signup → rate-limit + normalize email; verify → atomic consume; lỗi trùng email/hết token inline.
- **Autofill:** slug gợi ý từ tên shop, cho sửa và kiểm trùng on-blur.
- **7 states:** skeleton tối thiểu, mới, đã gửi mail, token hết hạn, email trùng, offline giữ input, thành công chuyển provisioning.

### S02 — Provisioning/Onboarding

- **Route/actor:** `/getting-started`; owner.
- **Layout:** desktop timeline trái + checklist; mobile stepper stack.
- **Components:** trạng thái tạo dữ liệu, thử lại an toàn, 5 bước setup: shop→kho→sản phẩm→Facebook→vận chuyển.
- **Actions:** poll job; retry chỉ khi job failed; skip bước không bắt buộc.
- **Autofill:** timezone Asia/Ho_Chi_Minh, currency VND.
- **States:** provisioning, delayed, failed có mã tra cứu, ready, offline, permission, trial expired.

### S03 — Dashboard

- **Route/actor:** `/app`; mọi role theo quyền.
- **Layout:** 4 KPI + cảnh báo + funnel; mobile card stack.
- **KPI:** Comment chưa xử lý, Đơn hôm nay, Đang giao/COD chờ, Giá trị COD chưa đối soát; so kỳ và drill-down 100%.
- **Actions:** mở Inbox, đơn, COD; filter Page/kho/ngày.
- **States:** skeleton, demo, empty-new có onboarding, filtered empty, error, permission, offline cached.

### S04 — Kết nối Facebook

- **Route/actor:** `/settings/channels`; owner.
- **Layout:** connection cards; drawer chi tiết scopes/webhook health.
- **Components:** Kết nối, Page picker, scope badges, token expiry, sync health, disconnect reason dialog.
- **Actions/API:** connect/callback/select-page/disconnect/resync; app secret/token không bao giờ là input.
- **States:** disconnected, connecting, connected, scope missing, expiring, revoked, webhook degraded.

### S05 — Inbox Live 3 cột

- **Route/actor:** `/social/inbox`; owner/manager/agent/auditor-read.
- **Desktop:** cột conversation 320px; message thread; context khách + draft/order + action. **Mobile:** danh sách → thread → context/draft là ba màn stack.
- **Components:** Page/date/status/assignee filter, unread, avatar, message/comment, reply draft, SKU suggestion, `Tạo đơn nháp`, assign, mark done.
- **Actions/API:** list/thread/assign/reply/create-draft; reply cần scope và idempotency.
- **Autofill:** identity→customer bằng external ID/phone; keyword→SKU; last shipping address chỉ gợi ý, phải xác nhận.
- **States:** loading skeleton, chưa có message, lọc rỗng, permission, Facebook revoked, offline read-cache, success highlight.

### S06 — Đơn hàng

- **Route:** `/selling/social-orders`; shop roles.
- **Desktop:** DataTable checkbox, STT, avatar, mã/khách, nguồn Page, tổng, reservation, giao/COD, actions; bấm dòng mở 3 cột detail/history. Mobile card riêng.
- **Toolbar:** search mã/SĐT/tên, Page, trạng thái, ngày, kho; import/export; Hỏi AI.
- **Actions:** confirm, cancel reason, pack, create shipment, print, clone; hành động theo state/permission.
- **Form:** FormDrawer sản phẩm/SL/giá/address/service/COD; Zod; link fields; autosave; next action.
- **States:** đủ 7 trạng thái; conflict 409 hiện diff; hết tồn giữ form.

### S07 — Kho và Reservation

- **Route:** `/stock/availability`; owner/manager/warehouse/auditor.
- **Layout:** bảng item-kho: on-hand/reserved/available; detail reservations/history; mobile cards.
- **Actions:** release manual chỉ manager + reason; adjustment đi qua Stock Entry hiện có, không sửa số trực tiếp.
- **States:** low stock warning, expired queue, reconciliation mismatch, offline read-only.

### S08 — Vận chuyển

- **Route:** `/fulfillment/shipments`; manager/warehouse/COD/auditor.
- **Layout:** DataTable/mobile card; 3 cột detail gồm timeline provider + label + order.
- **Actions:** create/retry/cancel label, print, mark handover, refresh provider; idempotent.
- **Filters:** provider/service/status/date/warehouse; search tracking/order/SĐT.
- **States:** adapter not configured, provider timeout, pending, in transit, delivered, returned, cancelled.

### S09 — Đối soát COD

- **Route:** `/finance/cod`; owner/COD/auditor.
- **Layout:** summary expected/received/variance; queue 3 cột cycle→lines→evidence/history; mobile stack.
- **Actions:** import wizard 5 bước, fetch provider, auto-match, accept variance/reject with reason, post payment once.
- **Validation:** tracking unique, amount integer ≥0, cycle unique/provider; line cannot post twice.
- **States:** chưa có kỳ, processing, matched, mismatched, provider error, permission, posted immutable.

### S10 — Cài đặt danh mục & thông báo

- **Route:** `/settings`; owner/limited manager.
- **Components:** Branch/Warehouse/Shipping Provider/Service/Order Source/Cancel Reason CRUD; templates, opt-out, Page connection, sessions/security.
- **Forms:** link-field, nested create, check duplicate, soft-delete blocked when referenced.
- **States:** configured/unconfigured/test-connection/scope missing/error/permission/offline.

### S11 — Customer Portal thuê bao

- **Route:** `/account/subscription`; owner.
- **Components:** trial countdown, plan/features/usage, status banner, export-all, support contact; future invoice/payment block.
- **Actions:** select plan/request activation/cancel at period end/reactivate/export; owner always reachable when limited/suspended.
- **States:** trial, active, past_due, limited, suspended, manual_hold, terminated-read/export window.

### S12 — Platform Admin

- **Route:** admin origin riêng; 5 platform roles.
- **Layout:** tenant DataTable + detail 3 cột health/subscription/jobs/audit; mobile read/urgent actions only.
- **Actions:** provision/reconcile/suspend/unsuspend/manual hold/reset link/terminate; dangerous actions require confirm + reason, terminate requires backup evidence.
- **States:** healthy, drift, job running/failed, degraded, suspended, permission denied, stale health.

## 9. Danh sách nghiệp vụ bắt buộc — quyết định

| Nghiệp vụ | Áp dụng |
|---|---|
| Phân quyền/row scope | Có; role + Page/kho/assignee; server enforce. |
| Thùng rác/bất biến tài chính | Draft có soft delete; Sales Order/COD/payment/audit không hard delete. |
| Audit/lịch sử | Có trên connection, order, shipment, COD, tenant lifecycle. |
| Báo cáo | Dashboard + funnel + COD aging + delivery return rate; drill-down. |
| Thông báo/cron | In-app; token expiry, webhook lag, shipment/COD; opt-in external channels. |
| Barcode/QR | Barcode pick-pack; QR/tracking label khi provider hỗ trợ. |
| Kanban | Đơn theo workflow; chuyển lùi/hủy cần chip lý do. |
| AI | Hỏi AI bảng; gợi ý SKU/duplicate/customer; không tự gửi/tạo đơn chính thức. |
| 3 cột | Inbox, order detail, shipment, COD, PlatformAdmin. |
| Media/in | Avatar/product; nhãn vận đơn/PDF; bucket private. |
| Mã tự sinh | Social draft/order/shipment/reconciliation dùng counter atomic. |
| Calendar | Lịch live/shipping pickup là sau MVP; không bắt buộc slice đầu. |
| Tiện VN | VND, SĐT/địa chỉ, COD, timezone VN, normalize +84. |
| Autofill | Identity→customer, keyword→SKU, order→shipment/COD; luôn cho xác nhận. |
| Offline | Inbox đọc cache; draft queue; confirm order/reservation cần online để tránh oversell. |
| Danh mục | Branch/Warehouse/ShippingService/Source/CancelReason có bảng riêng. |
| Onboarding/demo | Wizard + demo Page/events không gọi Meta thật; xóa demo một nút. |
| Export/import | Đơn/COD có Excel đúng contract; export-all owner. |

## 10. Out of Scope của slice đầu

- TikTok Shop/Shopee/Zalo OA connector thực tế; kiến trúc adapter phải sẵn sàng.
- Facebook Ads/CAPI, livestream video hosting hoặc tải video.
- Tự động gửi comment/message marketing hàng loạt.
- Cổng thanh toán thuê bao tự động; slice đầu dùng trial + entitlement/manual activation.
- Tối ưu tuyến giao, multi-package/split shipment phức tạp.
- Kế toán Việt Nam đầy đủ ngoài Payment Entry/COD allocation đã có trong kernel.

## 11. Decided và định danh sản phẩm

| Quyết định | Giá trị |
|---|---|
| Tên tạm | Forge Social |
| Slug/app key | `social-commerce` |
| Icon | `messages-square` trong khối vuông bo; palette chung hiện có của Forge, không nhái Chotdon. |
| Kênh đầu | Facebook Page OAuth chính thức |
| Tier | Shared SaaS; D1 vật lý riêng từng khách |
| Trial | 14 ngày |
| Reservation TTL | 30 phút, cấu hình tenant 10–120 phút |
| Webhook ACK | mục tiêu <3 giây; xử lý nặng qua Queue |
| Token boundary | app secret Cloudflare Secret; credentials mã hóa server-side; không log plaintext |
| COD | Delivered ≠ Paid; chỉ post tiền sau reconciliation |
| Commit | User cho phép main; stage chọn lọc file feature, không lấy thay đổi khác |

## Scorecard Cổng 2

| Yêu cầu | Trạng thái | Bằng chứng |
|---|---|---|
| 11 mục BRD đúng thứ tự | ✅ | Mục 1–11 |
| Actors tenant + platform | ✅ | Mục 4 |
| Entities/constraints/idempotency | ✅ | Mục 5 |
| Per-actor flows + nhánh lỗi | ✅ | Mục 6 |
| Permission theo endpoint | ✅ | Mục 7 |
| Screen cards desktop/mobile/actions/states | ✅ | Mục 8, S01–S12 |
| OAuth không bắt khách nhập secret/token | ✅ | A03, F2, S04 |
| Multi-tenant/control DB boundary | ✅ | Mục 5 |
| Shipping + COD end-to-end | ✅ | F5, S08–S09 |
| Nghiệp vụ bắt buộc rà từng mục | ✅ | Mục 9 |
| HMAC/license/provisioning được định hướng | ✅ | Control-plane boundary; chi tiết canonical ở Pha 3 |
| Out of scope rõ | ✅ | Mục 10 |

**Kết luận:** BRD đạt điều kiện trình duyệt Cổng 2. Chưa viết code/migration trong Pha 2.
