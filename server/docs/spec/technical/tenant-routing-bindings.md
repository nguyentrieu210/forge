# Tenant Routing & Resource Bindings

## 1. Vấn đề phải giải quyết

D1 hỗ trợ số lượng database lớn nhưng một Worker script chỉ chứa khoảng 5.000 bindings. Vì vậy **không** bind hàng chục nghìn tenant D1 vào một runtime Worker.

## 2. Kiến trúc đã chọn

```text
Custom Hostname / tenant slug
→ Edge Gateway Worker
→ Control-plane route lookup
→ Workers for Platforms dynamic dispatch
→ Tenant User Worker
   ├── PRIMARY_DB (D1)
   ├── LEDGER_DB_CURRENT (D1, khi tenant lớn)
   ├── ARCHIVE_DB_* (D1, read-only)
   ├── FILES (R2 scoped prefix/bucket)
   ├── REALTIME (DO namespace)
   └── platform service bindings
```

Workers for Platforms cho phép số lượng user script rất lớn; mỗi user Worker chỉ nhận binding được cấp cho tenant đó. Dynamic dispatch Worker chọn user Worker theo hostname/tenant key.

## 3. Route registry

Control Plane lưu:

```text
tenant_id
hostname
worker_name
release_channel
region_hint
status
resource_generation
routing_version
```

- Gateway cache route trong KV với short TTL.
- D1 Control Plane là nguồn chuẩn.
- Route update dùng monotonic `routing_version`.
- Tenant suspend được chặn ở gateway trước dispatch.

## 4. Provisioning workflow

1. Reserve tenant slug/domain.
2. Create D1/R2 resources.
3. Apply schema migrations.
4. Deploy tenant user Worker với explicit bindings.
5. Seed apps and policy.
6. Health + reconciliation test.
7. Publish route mapping.
8. Emit `tenant.provisioned`.

Mọi bước idempotent; rollback xóa route trước, resource cleanup theo retention policy.

## 5. Workflow bridge

Cloudflare Workflows không chạy trong Workers for Platforms namespace. Tenant script cần tiến trình dài phải gọi capability-scoped Platform Workflow Bridge:

```text
Tenant User Worker
→ signed StartWorkflowCommand
→ Platform Workflow Service
→ callbacks/events through tenant command endpoint
```

Bridge bắt buộc tenant ID, actor, capability, idempotency key, quota class, workflow type và callback allowlist.

## 6. Isolation

- Tenant Worker không có binding của tenant khác.
- Không truyền raw platform secret vào user Worker.
- Cross-tenant admin operation chỉ chạy Control Plane service và audit bắt buộc.
- R2 object key luôn có tenant prefix và binding policy.
- Cache key bắt buộc gồm tenant + release + policy version.

## 7. Acceptance

- 10.000 synthetic tenants route đúng mà gateway không redeploy mỗi tenant.
- Đổi mapping không gây cross-tenant cache bleed.
- User Worker bị compromise không truy cập D1/R2 tenant khác.
- Rollout canary và rollback không đổi hostname.
