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
| **Workerd tenant-worker** | `vitest run --config apps/tenant-worker/vitest.config.mts` | **52/52 PASS** (23 gốc + 29 E2E lớp vỏ) |
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
| Test tải, đa tenant trên hạ tầng thật | ☐ chưa | môi trường đã deploy |
| Diễn tập rollback + khôi phục tenant | ☐ chưa | môi trường đã deploy |
| E2E với **trình duyệt** thật (FE render) | ☐ chưa | `wrangler dev` + client trỏ vào |
| `npm ci` sạch trên Linux | ☐ chưa | repo dùng pnpm; cần CI Linux |
| Đối chiếu ERPNext oracle v0.8–v1.0 | ☐ chưa | `pnpm run source:fetch` — cần clone Frappe/ERPNext v16 đã khoá SHA |
| Review pháp lý hoá đơn điện tử / lương | ☐ chưa | không phải việc kỹ thuật |

## E2E lớp vỏ Frappe — đã chạy trên workerd thật

`apps/tenant-worker/test/frappe-facade.integration.test.mts` — 29 kịch bản đi hết
đường thật của một request Desk: phiên → dịch hình dạng → tầng quyền → aggregate
Durable Object → D1. Không mock gì.

Đã chứng minh chạy thật:

- Guest gọi method cần đăng nhập → `PermissionError`/403 kèm "Login to access"
- Đăng nhập bằng hash mật khẩu thật → cookie HttpOnly + CSRF token
- Sai mật khẩu và user không tồn tại báo GIỐNG HỆT nhau, không set cookie
- Boot trả `site_name` = tenant (chìa khoá cache đa khách), `lang`, `sysdefaults`
- Ghi mà thiếu header CSRF → 403 dù cookie hợp lệ
- Metadata đúng hình dạng Frappe: `reqd`/`issingle`, cờ số 0/1, `mandatory_depends_on`
- Tạo qua REST, server cấp tên từ series → `FV-2026-0001` (không lẫn dấu chấm)
- `mandatory_depends_on` cưỡng chế ở SERVER, `_server_messages` mang đúng `fieldname`
- `getdoc` trả docinfo + quyền hiệu dụng
- Ghi với token `modified` cũ → **417 TimestampMismatchError**; thiếu token cũng bị
  từ chối, không coi là force-write
- list/count có filter, search_link, resolve_display_values
- submit → capabilities đổi theo; chứng từ đã submit KHÔNG xoá được
- cancel → amend: tên `FV-2026-0001-1`, `amended_from` đúng, field `no_copy` bị
  loại; amend lần hai bị chặn
- **save_customization**: Custom Field vào đúng vị trí `insert_after`, Property
  Setter đổi label, và field vừa tuỳ biến ghi được ngay qua cùng REST đó
- global search tìm thấy, và chứng từ đã huỷ KHÔNG còn trong index
- dịch thuật trả bản dịch, thiếu thì fallback về chuỗi gốc
- share + đọc lại danh sách share, tag + xoá tag
- method chưa làm → 404 `DoesNotExistError`, không phải "thành công rỗng"
- In: render print format với nội dung đã redact; giá trị document bị escape nên
  không chèn được markup vào trang in
- Xoá hàng loạt: báo kết quả TỪNG item (1 xoá được, 1 đã huỷ nên không, 1 không
  tồn tại) chứ không gộp thành pass/fail
- Workspace suy từ app đã cài; đếm chứng từ mở trong phạm vi đọc của actor
- API native vẫn chạy song song, không bị lớp vỏ che

## Ranh giới — không tuyên bố quá

- **Chưa render trên trình duyệt thật.** Lớp vỏ đã chứng minh trả đúng hợp đồng FE
  mong đợi, nhưng chưa có lần nào MetaForge Desk thật vẽ màn hình từ nó.
- Lớp vỏ Frappe hiện thực **Tier 1 + Tier 2 + builder (Tier 3)** và phần Tier 4 mà
  Desk cần để dùng được (print, xoá hàng loạt, workspace, open count).
  **Chưa làm**: kanban, treeview, data import qua giao thức Frappe, query report,
  notification log, dashboard chart, number card, business context (4 endpoint đặc
  thù MetaForge) — xem [API_SURFACE.md](API_SURFACE.md). Mỗi cái gọi vào sẽ trả 404
  `DoesNotExistError` chứ không trả rỗng.
- `is_single`, `track_seen` vẫn là metadata chưa có consumer.
- Hooks app là **phản ứng sau commit**, không phải validator trước commit. Việc
  kiểm tra cần chặn lệnh ghi phải khai báo bằng metadata.
- Đây vẫn **không phải** ERPNext. Không có tương thích app Python, không có HR
  lifecycle đầy đủ, không có chứng nhận pháp lý ở bất kỳ nước nào.
