# Bằng chứng kiểm chứng

Mọi dòng dưới đây là **lệnh đã chạy thật** trên máy phát triển (Windows 11, Node
v24.17.0, Python 3.14.6, pnpm 9.15.0), không phải tự khai. Chỗ nào chưa chạy thì
ghi rõ là chưa.

Cập nhật: 2026-07-26.

## Đã chạy — xanh

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Cài đặt workspace | `pnpm install` | 399 gói, symlink `@metaforge/*` đúng workspace |
| Build TS strict (server) | `pnpm --filter cloudforge run build` | exit 0 |
| Typecheck worker (server) | `pnpm --filter cloudforge run typecheck:workers` | exit 0 |
| Test Node/domain | `node --test tests/*.test.mjs` | **248/248 PASS** |
| Gate SQL | `pnpm --filter cloudforge run test:sql` | **6/6 PASS** |
| **Workerd tenant-worker** | `vitest run --config apps/tenant-worker/vitest.config.mts` | **23/23 PASS** |
| **Workerd query-worker** | `vitest run --config apps/query-worker/vitest.config.mts` | **3/3 PASS** |
| **Web typecheck** | `pnpm --filter @cloudforge/web run typecheck` | exit 0 |
| **Web Vite production build** | `pnpm --filter @cloudforge/web run build` | exit 0 — 55 module, 238 kB js |
| Typecheck client (`tsc -b`) | `pnpm --filter metaforge run typecheck` | exit 0 |
| **Build client production** | `pnpm --filter metaforge run build` | exit 0 — 7 package + demo + kho-vn |
| Selfcheck client | `pnpm --filter metaforge run test` | **74 nhóm assert xanh** |

Ba dòng in đậm là những hạng mục bản CloudForge gốc ghi
`NOT VERIFIED IN THIS ENVIRONMENT` / `NOT RUN`. Nay đã chạy.

### Chi tiết gate SQL

```
FRAPPE_PLATFORM_AND_ERP_CORE_SCHEMA_PASS
SQLITE_SCHEMA_TRIGGER_FIXED_POINT_AND_REFERENCE_GUARDS_PASS
COMMERCIAL_ACCOUNTING_MIGRATION_DRY_RUN_PASS
BUSINESS_SUITE_MIGRATION_0009_DRY_RUN_PASS
FRAPPE_COMPAT_MIGRATION_0010_0011_DRY_RUN_PASS
SQLITE_100_WAY_AND_CROSS_AGGREGATE_RACES_PASS
```

Migration 0001–0013 chạy tuần tự trên database trắng, kèm diễn tập các guard chỉ
tồn tại ở tầng SQL (chuỗi amend, cấp role, hình dạng property setter, index tìm
kiếm theo document, hạn mức đồng thời 100 luồng).

## Chưa chạy — và vì sao

| Hạng mục | Trạng thái | Cần gì |
|---|---|---|
| Deploy Cloudflare, smoke staging | ☐ chưa | **API token + account Cloudflare của bạn** |
| Sức khoẻ queue/outbox trên môi trường thật | ☐ chưa | môi trường đã deploy |
| Test đa tenant, tải, bảo mật end-to-end | ☐ chưa | môi trường đã deploy |
| Diễn tập rollback + khôi phục tenant | ☐ chưa | môi trường đã deploy |
| E2E thật FE ⇄ lớp vỏ Frappe | ☐ chưa | cần chạy `wrangler dev` + client trỏ vào |
| `npm ci` sạch trên Linux | ☐ chưa | repo dùng pnpm; cần CI Linux |
| Đối chiếu ERPNext oracle v0.8–v1.0 | ☐ chưa | `pnpm run source:fetch` — cần clone Frappe/ERPNext v16 đã khoá SHA |
| Review pháp lý hoá đơn điện tử / lương | ☐ chưa | không phải việc kỹ thuật |

## Ranh giới — không tuyên bố quá

- **Chưa có gì chạy end-to-end.** Test chứng minh từng tầng đúng theo hợp đồng của
  nó; chưa có lần nào FE MetaForge thật gọi vào lớp vỏ Frappe thật.
- Lớp vỏ Frappe hiện thực **Tier 1 + Tier 2 + builder (Tier 3)**. Tier 4 (kanban,
  treeview, data import, print HTML, query report, notification, dashboard chart,
  number card, business context) **chưa làm** — xem [API_SURFACE.md](API_SURFACE.md).
- `is_single`, `track_seen` vẫn là metadata chưa có consumer.
- Hooks app là **phản ứng sau commit**, không phải validator trước commit. Việc
  kiểm tra cần chặn lệnh ghi phải khai báo bằng metadata.
- Đây vẫn **không phải** ERPNext. Không có tương thích app Python, không có HR
  lifecycle đầy đủ, không có chứng nhận pháp lý ở bất kỳ nước nào.
