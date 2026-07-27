# Field Ledger — Forge Social Commerce SaaS

Phạm vi: **29 bảng mới / 29 ledger**. Bảng kernel hiện có (`users`, `master_records`, `documents`, `stock_ledger_entries`, Sales Order/Payment Entry metadata) được tái sử dụng nguyên trạng, không khai lại ở đây.

Quy ước hệ thống cho mọi bảng: `id TEXT UUID PK`, `created_at TEXT ISO NOT NULL`, `updated_at TEXT ISO NOT NULL` (optimistic lock), `created_by TEXT`; bảng tenant giữ `tenant_id TEXT NOT NULL` để tương thích Forge nhưng binding D1/`resolveTenant` là hàng rào cross-customer. UI `—` nghĩa là field hệ thống/ẩn.

## A. CONTROL_DB — 9 bảng

### 1. `saas_tenants`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| slug | TEXT | UNIQUE NOT NULL | `z.string().regex(slug)` | text `*` | slug + “Tên miền shop chưa hợp lệ” | từ shop_name, check trùng | platform all thấy; owner tạo | Khóa route public |
| shop_name | TEXT | NOT NULL | `z.string().min(2).max(120)` | text `*` | normalize tên | signup | platform all; owner sửa | Tên tenant |
| owner_email | TEXT | NOT NULL | `z.string().email()` | text `*` | email lowercase | signup | masked support; owner sửa | Chủ tài khoản |
| status | TEXT | CHECK enum NOT NULL | `z.enum(tenantStates)` | select-enum readonly | state machine | provisioning/billing | all thấy; action-only | Vòng đời tenant |
| plan_id | TEXT | FK→saas_plans.id | `z.string().uuid()` | link-field→plans | FK active | signup selection | billing+ sửa | Gói hiện tại |
| trial_ends_at | TEXT | NOT NULL | `z.string().datetime()` | datetime readonly | sau created_at | +14 ngày | all thấy; server sửa | Hết trial |
| customer_db_uuid | TEXT | UNIQUE | `z.string().uuid().nullable()` | text readonly | UUID | executor | operator thấy; không UI sửa | D1 vật lý |
| worker_name | TEXT | UNIQUE | `z.string().max(128).nullable()` | text readonly | identifier | executor | operator | Dispatch script |
| pre_hold_status | TEXT | — | `z.string().nullable()` | — | tenantStates | khi hold | admin | Khôi phục đúng trạng thái |

### 2. `saas_plans`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| plan_key | TEXT | UNIQUE NOT NULL | `z.string().regex(slug)` | text `*` | slug | — | all thấy; billing sửa | Định danh ổn định |
| name | TEXT | NOT NULL | `z.string().min(1).max(80)` | text `*` | normalize | — | public thấy nếu published | Tên gói |
| price_minor | INTEGER | CHECK >=0 | `z.number().int().nonnegative()` | money `*` | tiền nguyên | — | billing sửa | Giá VND |
| billing_period | TEXT | CHECK month/year | `z.enum(['month','year'])` | select-enum | — | month | billing | Chu kỳ |
| limits_json | TEXT | json_valid | `planLimitsSchema` | textarea | JSON schema | preset | billing | Page/user/order/storage |
| is_published | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox | — | false | billing | Hiện trang giá |
| is_active | INTEGER | DEFAULT 1 | `z.boolean()` | checkbox | — | true | billing | Cho mua mới |

### 3. `saas_subscriptions`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | FK→saas_tenants.id NOT NULL | `z.string().uuid()` | link-field→tenants `*` | FK | current tenant | platform/owner own | Thuê bao |
| plan_id | TEXT | FK→saas_plans.id NOT NULL | `z.string().uuid()` | link-field→plans `*` | active plan | signup | billing; owner request | Gói |
| status | TEXT | CHECK enum | `z.enum(subscriptionStates)` | select-enum readonly | state machine | trialing | all read; server action | Trạng thái |
| period_start | TEXT | NOT NULL | `z.string().datetime()` | datetime readonly | <=end | verified/signup | all read | Đầu kỳ |
| period_end | TEXT | NOT NULL | `z.string().datetime()` | datetime readonly | >start | plan | all read | Cuối kỳ |
| cancel_at_period_end | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox | — | false | owner/billing | Hủy cuối kỳ |

### 4. `saas_entitlements`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | FK→saas_tenants.id, UNIQUE pair | `z.string().uuid()` | link-field | FK | subscription | platform read | Tenant |
| feature_key | TEXT | UNIQUE(tenant,key) | `z.string().regex(featureKey)` | text `*` | allowlist | plan | billing/server | Quyền tính năng |
| value_json | TEXT | json_valid | `z.record(z.unknown())` | textarea | feature schema | plan limit | billing/server | Quota/value |
| expires_at | TEXT | — | `z.string().datetime().nullable()` | datetime | — | period_end | server | Hết hiệu lực |
| license_signature | TEXT | NOT NULL | `z.string().min(64)` | — | Ed25519 verify | signer | không ai sửa tay | License bất đối xứng |

### 5. `signup_verifications`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| email_hash | TEXT | INDEX NOT NULL | `z.string().length(64)` | — | SHA-256 | signup | server-only | Không lưu lookup plaintext ngoài tenant |
| token_hash | TEXT | UNIQUE NOT NULL | `z.string().length(64)` | — | SHA-256 | crypto random | server-only | Link một lần |
| signup_payload_ciphertext | TEXT | NOT NULL | `z.string()` | — | AES envelope | signup | server-only | Payload chờ verify |
| expires_at | TEXT | NOT NULL | `z.string().datetime()` | — | >now | +30 phút | server | TTL |
| used_at | TEXT | — | `z.string().datetime().nullable()` | — | atomic once | verify | server | Chống replay |
| attempts | INTEGER | DEFAULT 0 CHECK >=0 | `z.number().int()` | — | rate limit | 0 | server | Chống brute force |

### 6. `provision_jobs`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| tenant_id | TEXT | FK→saas_tenants.id | `z.string().uuid()` | link-field | FK | verify signup | operator | Đối tượng |
| desired_revision | INTEGER | UNIQUE(tenant,revision) | `z.number().int().positive()` | number readonly | monotonic | last+1 | executor | Desired state |
| status | TEXT | CHECK enum | `z.enum(jobStates)` | select-enum readonly | state machine | pending | operator actions | Job lifecycle |
| lease_owner | TEXT | — | `z.string().nullable()` | — | identifier | claim | executor | Chống 2 runner |
| lease_until | TEXT | — | `z.string().datetime().nullable()` | — | future | claim | executor | Lease TTL |
| current_step | TEXT | — | `z.string().max(80).nullable()` | text readonly | step allowlist | runner | operator read | Tiến độ |
| error_code | TEXT | — | `z.string().max(80).nullable()` | text readonly | safe code | runner | operator read | Không lộ secret |

### 7. `provision_steps`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| job_id | TEXT | FK→provision_jobs.id | `z.string().uuid()` | link-field | FK | runner | operator | Job |
| step_key | TEXT | UNIQUE(job,key) | `z.string().max(80)` | text readonly | allowlist | plan | executor | Bước |
| idempotency_key | TEXT | UNIQUE NOT NULL | `z.string().max(160)` | — | deterministic | job+step+revision | executor | Retry safe |
| status | TEXT | CHECK enum | `z.enum(stepStates)` | select-enum readonly | state machine | pending | executor | Kết quả |
| attempts | INTEGER | DEFAULT 0 | `z.number().int().nonnegative()` | number readonly | max policy | runner | operator | Retry count |
| evidence_json | TEXT | json_valid | `z.record(z.unknown())` | textarea readonly | redaction schema | verify | operator | Bằng chứng không secret |

### 8. `channel_routes`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider | TEXT | CHECK facebook | `z.literal('facebook')` | — | allowlist | connect | internal-only | Provider |
| page_key_hmac | TEXT | UNIQUE NOT NULL | `z.string().length(64)` | — | HMAC hex | page_id | internal-only | Lookup không lộ page id |
| tenant_id | TEXT | FK→saas_tenants.id | `z.string().uuid()` | — | active/provisioned | connection | internal-only | Target |
| worker_name | TEXT | NOT NULL | `z.string().max(128)` | — | identifier | tenant route | internal-only | Dispatch target |
| status | TEXT | CHECK active/revoked | `z.enum(['active','revoked'])` | — | state machine | active | internal-only | Ngắt route |

### 9. `platform_audit_logs`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| actor_id | TEXT | NOT NULL | `z.string().min(1)` | — | trusted actor | session | platform roles read scoped | Ai |
| actor_role | TEXT | NOT NULL | `z.string().max(40)` | — | RBAC enum | session | all platform read | Vai trò |
| action | TEXT | NOT NULL | `z.string().max(80)` | — | action allowlist | handler | all platform read | Hành động |
| tenant_id | TEXT | FK nullable | `z.string().uuid().nullable()` | link-field | FK | target | scoped | Tenant |
| target | TEXT | NOT NULL | `z.string().max(160)` | text readonly | safe identifier | handler | scoped | Đối tượng |
| reason | TEXT | NOT NULL | `z.string().min(3).max(500)` | textarea `*` | required dangerous | user | scoped | Lý do |
| ip | TEXT | — | `z.string().max(64)` | — | trusted proxy | request | super/operator | Điều tra |
| user_agent | TEXT | — | `z.string().max(500)` | — | truncate | request | super/operator | Thiết bị |
| correlation_id | TEXT | INDEX NOT NULL | `z.string().max(80)` | text readonly | trace format | request | scoped | Tra log |
| meta_json | TEXT | json_valid | `auditMetaSchema` | textarea readonly | secret redaction | handler | scoped | Không token/password |

## B. TENANT D1 — 20 bảng

### 10. `social_channel_connections`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider | TEXT | NOT NULL CHECK facebook | `z.literal('facebook')` | select-enum readonly | — | OAuth | all read; owner action | Kênh |
| page_id | TEXT | UNIQUE(provider,page_id) | `z.string().min(1).max(120)` | text readonly | provider ID | Graph | owner/manager read | Page |
| page_name | TEXT | NOT NULL | `z.string().max(160)` | text readonly | — | Graph | all read | Hiển thị |
| status | TEXT | CHECK enum | `z.enum(connectionStates)` | select-enum readonly | state machine | connected | all read; owner action | Health |
| granted_scopes_json | TEXT | json_valid | `z.array(z.string())` | textarea readonly | min scopes | OAuth | owner | Consent |
| credential_ciphertext | TEXT | NOT NULL | `credentialEnvelope` | — | AES-GCM | token exchange | server-only | Token mã hóa |
| key_version | INTEGER | NOT NULL | `z.number().int().positive()` | — | known KEK | encrypt | server-only | Rotation |
| expires_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | token | owner read | Hạn |
| last_sync_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | reconcile | all read | Sync |

### 11. `social_oauth_states`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| state_hash | TEXT | UNIQUE NOT NULL | `z.string().length(64)` | — | SHA-256 | random state | server-only | CSRF OAuth |
| actor_id | TEXT | NOT NULL | `z.string().min(1)` | — | current owner | session | server-only | Bind user |
| provider | TEXT | CHECK facebook | `z.literal('facebook')` | — | — | connect | server-only | Provider |
| redirect_path | TEXT | NOT NULL | `z.string().startsWith('/')` | — | allowlist | request | server-only | Safe return |
| expires_at | TEXT | NOT NULL | `z.string().datetime()` | — | TTL ≤10m | now+10m | server-only | Expire |
| consumed_at | TEXT | — | `z.string().datetime().nullable()` | — | atomic once | callback | server-only | Replay guard |

### 12. `social_webhook_events`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider | TEXT | UNIQUE(provider,event_id) | `z.literal('facebook')` | — | verified ingress | envelope | system/auditor read metadata | Source |
| event_id | TEXT | NOT NULL | `z.string().max(200)` | text readonly | stable/derived v1 | payload | metadata only | Dedupe |
| connection_id | TEXT | FK→connections.id | `z.string().uuid()` | link-field | FK | page route | metadata | Page |
| event_type | TEXT | NOT NULL | `z.string().max(80)` | select-enum readonly | allowlist | payload | metadata | Loại |
| payload_ciphertext | TEXT | NOT NULL | `z.string()` | — | AES + size | ingress | server-only | Raw evidence retention |
| status | TEXT | CHECK enum | `z.enum(webhookStates)` | select-enum readonly | state machine | received | owner/manager metadata | Xử lý |
| attempts | INTEGER | DEFAULT 0 | `z.number().int().nonnegative()` | number readonly | max retry | queue | metadata | Retry |
| error_code | TEXT | — | `z.string().max(80).nullable()` | text readonly | safe code | processor | metadata | Điều tra |
| processed_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | processor | metadata | Hoàn tất |

### 13. `social_identities`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider | TEXT | UNIQUE(provider,external_user_id) | `z.literal('facebook')` | — | — | event | staff read | Nguồn |
| external_user_id | TEXT | NOT NULL | `z.string().max(160)` | text readonly | provider ID | event | masked staff | Stable identity |
| customer_name | TEXT | — | `z.string().max(160).nullable()` | text | normalize | profile | staff | Tên |
| customer_phone | TEXT | INDEX | `vnPhone.optional()` | phone | VN phone | AI/comment confirmed | sensitive role | Khóa gợi ý merge |
| avatar_url | TEXT | — | `z.string().url().nullable()` | image | provider URL | profile | all read | Avatar |
| customer_docname | TEXT | — | `z.string().nullable()` | link-field→Customer | FK logical | verified match | staff edit | Link CRM kernel |
| labels_json | TEXT | json_valid | `z.array(z.string())` | link-field→labels | labels exist | rules | staff edit | Phân nhóm |
| opt_out | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox | — | false | owner/manager edit | Không marketing |
| last_seen_at | TEXT | NOT NULL | `z.string().datetime()` | datetime readonly | — | event | all read | Hoạt động |

### 14. `social_conversations`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| connection_id | TEXT | FK→connections.id | `z.string().uuid()` | link-field→Page | scope | event | scoped agents | Page |
| external_thread_id | TEXT | UNIQUE(connection,thread) | `z.string().max(200)` | text readonly | provider ID | event | scoped | Thread |
| identity_id | TEXT | FK→social_identities.id | `z.string().uuid()` | link-field | FK | event | scoped | Khách |
| assignee_id | TEXT | — | `z.string().nullable()` | link-field→users | user + scope | routing rule | manager/all own | Phụ trách |
| status | TEXT | CHECK enum | `z.enum(conversationStates)` | select-enum action | state machine | open | scoped | Open/pending/done |
| unread_count | INTEGER | DEFAULT 0 CHECK>=0 | `z.number().int()` | number readonly | — | messages | scoped | Badge |
| last_message_at | TEXT | NOT NULL | `z.string().datetime()` | datetime readonly | monotonic | event | scoped | Sort |

### 15. `social_messages`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| conversation_id | TEXT | FK→conversations.id | `z.string().uuid()` | link-field | FK/scope | event | scoped | Thread |
| external_message_id | TEXT | UNIQUE(provider ID) | `z.string().max(200)` | text readonly | ID | event | scoped | Dedupe |
| direction | TEXT | CHECK inbound/outbound | `z.enum(['inbound','outbound'])` | select-enum readonly | — | event/action | scoped | Chiều |
| kind | TEXT | CHECK comment/message/reply | `z.enum(messageKinds)` | select-enum readonly | — | payload | scoped | Loại |
| body_ciphertext | TEXT | NOT NULL | `z.string()` | textarea | decrypt permission | event/user | scoped sensitive | Nội dung |
| parent_external_id | TEXT | — | `z.string().nullable()` | text readonly | — | event | scoped | Reply lineage |
| occurred_at | TEXT | INDEX NOT NULL | `z.string().datetime()` | datetime readonly | provider time | event | scoped | Timeline |
| delivery_state | TEXT | CHECK enum | `z.enum(deliveryStates)` | select-enum readonly | state machine | received/pending | scoped | Gửi/nhận |

### 16. `social_live_sessions`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| connection_id | TEXT | FK→connections.id | `z.string().uuid()` | link-field→Page `*` | scope | post selection | staff | Page |
| external_video_id | TEXT | UNIQUE(connection,video) | `z.string().max(200)` | text readonly | provider ID | Graph | staff | Live |
| title | TEXT | — | `z.string().max(240)` | text | normalize | Graph | manager edit | Tên phiên |
| status | TEXT | CHECK enum | `z.enum(liveStates)` | select-enum action | state machine | detected | staff action | detected/live/paused/ended |
| ruleset_version | INTEGER | NOT NULL | `z.number().int().positive()` | number readonly | published exists | start | manager | Pin luật |
| started_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | Graph/start | staff | KPI |
| ended_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | >=start | Graph/end | staff | Kết phiên |
| assigned_team_json | TEXT | json_valid | `z.array(z.string())` | link-field→users | users scoped | manager | manager | Team |

### 17. `social_order_rules`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| name | TEXT | NOT NULL | `z.string().min(1).max(120)` | text `*` | normalize | — | manager edit | Tên luật |
| version | INTEGER | UNIQUE(rule logical,version) | `z.number().int().positive()` | number readonly | monotonic | publish | server | Immutable publish |
| match_type | TEXT | CHECK enum | `z.enum(['exact','prefix','tokens'])` | select-enum `*` | safe types | exact | manager | Không regex tùy ý |
| pattern | TEXT | NOT NULL | `z.string().min(1).max(120)` | text `*` | normalize/conflict | — | manager | Cú pháp |
| item_code | TEXT | NOT NULL | `z.string().min(1)` | link-field→Item `*` | Item active | mapping | manager | SKU |
| variant_key | TEXT | — | `z.string().max(120).nullable()` | link-field→variant | exists | item | manager | Màu/size |
| default_qty_micros | INTEGER | CHECK >0 | `z.number().int().positive()` | number `*` | qty scale | 1000000 | manager | SL mặc định |
| duplicate_window_sec | INTEGER | CHECK 0..86400 | `z.number().int().min(0).max(86400)` | number | range | 300 | manager | Chống spam |
| auto_reply_template | TEXT | — | `z.string().max(500).nullable()` | textarea | approved variables | template | manager | Reply |
| auto_draft | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox | policy | false | owner/manager | Chỉ draft, không order |
| status | TEXT | CHECK draft/published/paused/expired | `z.enum(ruleStates)` | select-enum action | state machine | draft | manager action | Vòng đời |

### 18. `social_carts`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| code | TEXT | UNIQUE NOT NULL | `z.string()` | code-auto | counter | GIO | all read | Mã giỏ |
| identity_id | TEXT | FK→identities.id | `z.string().uuid()` | link-field | FK | conversation | staff | Khách |
| live_session_id | TEXT | FK→sessions.id | `z.string().uuid()` | link-field | FK | message | staff | Phiên |
| status | TEXT | CHECK enum | `z.enum(cartStates)` | select-enum action | state machine | collecting | staff | collecting/ready/converted... |
| assignee_id | TEXT | — | `z.string().nullable()` | link-field→users | scope | conversation | manager/own | Phụ trách |
| reservation_expires_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | reserve | staff | Countdown |
| source_count | INTEGER | DEFAULT 0 | `z.number().int()` | number readonly | derived | messages | staff | Số comment |
| version | INTEGER | DEFAULT 1 | `z.number().int()` | — | optimistic | store | server | Chống sửa đè |

### 19. `social_cart_items`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| cart_id | TEXT | FK→carts.id | `z.string().uuid()` | link-field | FK | current cart | staff | Parent |
| line_no | INTEGER | UNIQUE(cart,line) | `z.number().int().positive()` | number readonly | sequence | next | staff | Thứ tự |
| source_message_id | TEXT | FK→messages.id UNIQUE | `z.string().uuid()` | link-field readonly | not reused | action | staff | Một comment một line source |
| item_code | TEXT | NOT NULL | `z.string().min(1)` | link-field→Item `*` | active item | rule | staff edit | SKU |
| variant_key | TEXT | — | `z.string().nullable()` | link-field→variant | exists | rule | staff | Biến thể |
| qty_micros | INTEGER | CHECK >0 | `z.number().int().positive()` | number `*` | tồn | rule | staff | SL |
| unit_price_minor | INTEGER | CHECK >=0 | `z.number().int().nonnegative()` | money `*` | price | price list | manager override | Đơn giá |
| reservation_id | TEXT | FK→reservations.id | `z.string().uuid().nullable()` | link-field readonly | FK | reserve | staff read | Giữ tồn |

### 20. `social_inventory_reservations`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| item_code | TEXT | NOT NULL INDEX | `z.string().min(1)` | link-field→Item | exists | cart | staff read | SKU |
| warehouse | TEXT | NOT NULL INDEX | `z.string().min(1)` | link-field→Warehouse | scope | default warehouse | staff read | Kho |
| qty_micros | INTEGER | CHECK >0 | `z.number().int().positive()` | number readonly | available | cart | staff read | Lượng giữ |
| status | TEXT | CHECK enum | `z.enum(reservationStates)` | select-enum readonly | state machine | reserved | manager release action | reserved/committed/released/expired |
| expires_at | TEXT | INDEX NOT NULL | `z.string().datetime()` | datetime readonly | future | policy | staff read | TTL |
| source_type | TEXT | CHECK cart/order | `z.enum(['cart','order'])` | — | — | handler | staff read | Nguồn |
| source_id | TEXT | NOT NULL | `z.string().uuid()` | link-field readonly | exists | handler | staff read | Nguồn ID |
| idempotency_key | TEXT | UNIQUE NOT NULL | `z.string().max(160)` | — | deterministic | operation | server-only | Retry guard |

### 21. `social_shipments`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| code | TEXT | UNIQUE NOT NULL | `z.string()` | code-auto | counter | VC | all read | Mã nội bộ |
| sales_order | TEXT | UNIQUE NOT NULL | `z.string().min(1)` | link-field→Sales Order | confirmed | cart convert | staff | Đơn |
| provider_id | TEXT | FK→shipping_providers.id | `z.string().uuid()` | link-field `*` | active | settings | warehouse/manager | Hãng |
| service_id | TEXT | FK→shipping_services.id | `z.string().uuid()` | link-field `*` | belongs provider | address/weight suggestion | warehouse | Dịch vụ |
| tracking_code | TEXT | UNIQUE | `z.string().max(120).nullable()` | barcode readonly | provider | create response | all read | Tracking |
| cod_minor | INTEGER | CHECK >=0 | `z.number().int().nonnegative()` | money `*` | <=order due | order outstanding | manager/COD edit pre-create | Thu hộ |
| shipping_fee_minor | INTEGER | CHECK >=0 | `z.number().int().nonnegative()` | money | quote | provider | staff read | Phí |
| status | TEXT | CHECK enum | `z.enum(shipmentStates)` | select-enum action | state machine | draft | provider/warehouse | Vòng đời |
| label_file_key | TEXT | — | `z.string().nullable()` | text readonly | R2 exists | provider | warehouse read | Nhãn private |
| provider_occurred_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | monotonic | webhook | all read | Out-of-order guard |

### 22. `social_shipment_events`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| shipment_id | TEXT | FK→shipments.id | `z.string().uuid()` | link-field | FK | tracking | staff read | Shipment |
| provider_event_id | TEXT | UNIQUE(provider,event) | `z.string().max(200)` | text readonly | ID | webhook | metadata | Dedupe |
| status | TEXT | NOT NULL | `z.string().max(80)` | select-enum readonly | mapped state | provider | staff | Mốc |
| occurred_at | TEXT | INDEX NOT NULL | `z.string().datetime()` | datetime readonly | — | provider | staff | Timeline |
| payload_ref | TEXT | — | `z.string().nullable()` | text readonly | encrypted ref | webhook | auditor | Bằng chứng |

### 23. `social_provider_operations`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider | TEXT | NOT NULL | `z.string().max(40)` | — | adapter exists | request | metadata | Provider |
| operation | TEXT | NOT NULL | `z.string().max(80)` | — | allowlist | handler | metadata | create/cancel/etc |
| idempotency_key | TEXT | UNIQUE NOT NULL | `z.string().max(160)` | — | deterministic | action | server-only | Retry guard |
| status | TEXT | CHECK pending/succeeded/failed | `z.enum(operationStates)` | select-enum readonly | state machine | pending | staff metadata | Call state |
| external_ref | TEXT | — | `z.string().max(200).nullable()` | text readonly | provider | response | staff | Ref |
| response_ciphertext | TEXT | — | `z.string().nullable()` | — | AES/size | response | server/auditor | Debug bounded |
| attempts | INTEGER | DEFAULT 0 | `z.number().int()` | number readonly | max | retry | metadata | Retry |

### 24. `social_cod_reconciliations`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| code | TEXT | UNIQUE NOT NULL | `z.string()` | code-auto | counter | DS | all read | Kỳ |
| provider_id | TEXT | FK→providers.id | `z.string().uuid()` | link-field `*` | FK | import/source | COD | Hãng |
| cycle_ref | TEXT | UNIQUE(provider,cycle) | `z.string().min(1).max(120)` | text `*` | natural key | file/provider | COD | Kỳ ngoài |
| expected_minor | INTEGER | CHECK >=0 | `z.number().int()` | money readonly | derived | lines | all read | Phải nhận |
| received_minor | INTEGER | CHECK >=0 | `z.number().int()` | money readonly | derived | lines | all read | Đã nhận |
| variance_minor | INTEGER | NOT NULL | `z.number().int()` | money readonly | received-expected | derive | all read | Lệch |
| status | TEXT | CHECK enum | `z.enum(codReconStates)` | select-enum action | state machine | imported | COD action | imported/matching/review/posted |
| reconciled_by | TEXT | — | `z.string().nullable()` | link-field→users | COD role | action | all read | Người chốt |
| reconciled_at | TEXT | — | `z.string().datetime().nullable()` | datetime readonly | — | action | all read | Thời điểm |

### 25. `social_cod_lines`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| reconciliation_id | TEXT | FK→reconciliations.id | `z.string().uuid()` | link-field | FK | import | COD | Parent |
| shipment_id | TEXT | FK→shipments.id, UNIQUE(parent,shipment) | `z.string().uuid()` | link-field→shipment | tracking match | auto-match | COD | Shipment |
| expected_minor | INTEGER | CHECK >=0 | `z.number().int()` | money readonly | shipment | auto | all read | COD dự kiến |
| received_minor | INTEGER | CHECK >=0 | `z.number().int()` | money `*` | file/provider | import | COD | Thực nhận |
| fee_minor | INTEGER | CHECK >=0 | `z.number().int()` | money | — | import | COD | Phí |
| match_status | TEXT | CHECK enum | `z.enum(codLineStates)` | select-enum action | state machine | unmatched | COD action | Match/review/posted |
| reason | TEXT | — | `z.string().max(500).nullable()` | textarea | required variance accept | user | COD | Giải trình |
| payment_entry | TEXT | UNIQUE | `z.string().nullable()` | link-field→Payment Entry readonly | exists | post | all read | Chống credit hai lần |

### 26. `social_shipping_providers`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| name | TEXT | UNIQUE NOT NULL | `z.string().min(1).max(120)` | text `*` | normalize | preset | all read; owner edit | Danh mục hãng |
| adapter_key | TEXT | NOT NULL | `z.string().regex(adapterKey)` | select-enum `*` | installed adapter | manual | owner | Adapter |
| merchant_credential_ciphertext | TEXT | — | `credentialEnvelope.optional()` | — | AES | connect | server-only | Key tenant |
| status | TEXT | CHECK enum | `z.enum(providerStates)` | select-enum action | state machine | disconnected | owner action | Health |
| is_demo | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox readonly | — | seed | owner | Demo cleanup |

### 27. `social_shipping_services`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| provider_id | TEXT | FK→providers.id | `z.string().uuid()` | link-field→provider `*` | FK | selected provider | all read; owner edit | Hãng |
| service_code | TEXT | UNIQUE(provider,code) | `z.string().min(1).max(80)` | text `*` | provider code | sync | owner | Mã |
| name | TEXT | NOT NULL | `z.string().max(120)` | text `*` | normalize | sync | owner | Tên |
| is_cod_supported | INTEGER | DEFAULT 1 | `z.boolean()` | checkbox | — | provider | owner | COD |
| is_active | INTEGER | DEFAULT 1 | `z.boolean()` | checkbox | — | provider | owner | Chọn được |
| is_demo | INTEGER | DEFAULT 0 | `z.boolean()` | checkbox readonly | — | seed | owner | Demo |

### 28. `social_minigames`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| code | TEXT | UNIQUE NOT NULL | `z.string()` | code-auto | counter | MG | all read | Mã |
| live_session_id | TEXT | FK→sessions.id | `z.string().uuid()` | link-field `*` | session | current | manager | Phiên |
| game_type | TEXT | CHECK enum | `z.enum(gameTypes)` | select-enum `*` | supported | random_comment | manager | Kiểu |
| rules_json | TEXT | json_valid | `minigameRuleSchema` | textarea | schema | template | manager | Điều kiện |
| prize | TEXT | NOT NULL | `z.string().max(240)` | text `*` | — | — | manager | Giải |
| status | TEXT | CHECK enum | `z.enum(minigameStates)` | select-enum action | state machine | draft | manager | Vòng đời |
| seed_commitment | TEXT | — | `z.string().length(64).nullable()` | text readonly | SHA-256 | before close | all read | Công bằng |
| revealed_seed | TEXT | — | `z.string().nullable()` | text readonly | hash matches | draw | all after publish | Xác minh |
| winner_identity_id | TEXT | FK→identities.id | `z.string().uuid().nullable()` | link-field readonly | eligible | draw | all read | Người thắng |

### 29. `social_import_jobs`

| Field | D1 | Ràng buộc | Zod | UI | Validate | Autofill | Quyền | Nghiệp vụ |
|---|---|---|---|---|---|---|---|---|
| entity | TEXT | NOT NULL | `z.enum(importEntities)` | select-enum readonly | allowlist | route | importer | Loại |
| file_key | TEXT | NOT NULL | `z.string()` | text readonly | R2 private | upload | importer | File |
| mapping_json | TEXT | json_valid | `mappingSchema` | textarea | required fields mapped | wizard | importer | Map cột |
| status | TEXT | CHECK enum | `z.enum(importStates)` | select-enum readonly | state machine | uploaded | importer | Wizard/job |
| total_rows | INTEGER | DEFAULT 0 | `z.number().int()` | number readonly | >=0 | parse | importer | Tổng |
| success_rows | INTEGER | DEFAULT 0 | `z.number().int()` | number readonly | <=total | run | importer | Thành công |
| error_rows | INTEGER | DEFAULT 0 | `z.number().int()` | number readonly | <=total | run | importer | Lỗi |
| error_file_key | TEXT | — | `z.string().nullable()` | text readonly | R2 | result | importer | File sửa lại |

## C. State machines

| Bảng | Chuyển trạng thái hợp lệ |
|---|---|
| `saas_tenants` | pending_verification→provisioning→trial→active; trial/active→past_due→limited→suspended; any active-state→manual_hold; cancelled→terminated chỉ backup verified; manual_hold ra theo review. |
| `saas_subscriptions` | trialing→active→past_due→cancel_at_period_end→cancelled; payment valid có thể past_due→active; không tự gỡ manual hold tenant. |
| `provision_jobs` | pending→claimed→running→verifying→healthy; failure→failed→rolling_back→rolled_back/rollback_failed. |
| `provision_steps` | pending→running→succeeded/failed; failed→running khi lease/idempotency hợp lệ. |
| `channel_routes` | active→revoked; reconnect tạo/update route sau tenant credential thành công. |
| `social_channel_connections` | connecting→connected→degraded/expiring/revoked; revoked→connecting qua OAuth mới. |
| `social_webhook_events` | received→processing→processed; processing→retrying→processing; max→dead_letter; dead_letter→processing manual replay. |
| `social_conversations` | open↔pending→done; inbound mới có thể done→open. |
| `social_messages` | outbound pending→sent/failed; failed→pending retry; inbound=received bất biến. |
| `social_live_sessions` | detected→live↔paused→ended; ended bất biến, replay chỉ đọc. |
| `social_order_rules` | draft→published→paused→published/expired; publish tạo version mới, không sửa version published. |
| `social_carts` | collecting→needs_info/ready→reserved→converted; non-converted→expired/cancelled; merge/split giữ lineage. |
| `social_inventory_reservations` | reserved→committed/released/expired; terminal không quay lại. |
| `social_shipments` | draft→created→packed→handed_over→in_transit→delivered/returned; pre-handover→cancelled; bước lùi chỉ provider event hợp lệ + reason. |
| `social_provider_operations` | pending→succeeded/failed; failed→pending retry cùng idempotency key. |
| `social_cod_reconciliations` | imported→matching→review/ready→posted; posted bất biến; void qua adjustment mới. |
| `social_cod_lines` | unmatched→matched/variance_review→accepted/rejected→posted; posted bất biến. |
| `social_shipping_providers` | disconnected→testing→connected→degraded/revoked; reconnect qua test. |
| `social_minigames` | draft→scheduled/live→closed→drawing→published; pre-published→cancelled; redraw cần reason/audit. |
| `social_import_jobs` | uploaded→mapping→validated→running→completed/completed_with_errors/failed. |

## D. Kiểm tra ledger

| Tiêu chí | Đạt | Bằng chứng |
|---|:-:|---|
| Mọi bảng mới có ledger 9 cột | ✅ | 29/29 headings |
| Mọi bảng status có state machine | ✅ | Mục C, 20 máy trạng thái |
| Cột hệ thống | ✅ | Quy ước đầu file; code/code-auto ở chứng từ |
| FK không mồ côi | ✅ | FK mới trỏ 29 bảng hoặc entity kernel nêu rõ logical link |
| Danh mục tách bảng | ✅ | providers/services; Page/warehouse/user dùng entity thật |
| Tiền/qty đúng kiểu | ✅ | money INTEGER minor; qty INTEGER micros |

Ghi chú: `Customer`, `Item`, `Warehouse`, `Sales Order`, `Payment Entry` là entity kernel hiện hữu, nên link tới chúng được adapter/repository kiểm tra thay vì FK SQLite xuyên bảng metadata/document store.
