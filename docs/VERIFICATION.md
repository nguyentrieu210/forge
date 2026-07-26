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
| Test Node/domain | `node --test tests/*.test.mjs` | **249/249 PASS** |
| Gate SQL (migration 0001–0015) | `pnpm --filter cloudforge run test:sql` | **6/6 PASS** |
| **Workerd tenant-worker** | `vitest run --config apps/tenant-worker/vitest.config.mts` | **70/70 PASS** (23 gốc + 47 E2E lớp vỏ) |
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
FRAPPE_COMPAT_MIGRATION_0010_0015_DRY_RUN_PASS
SQLITE_100_WAY_AND_CROSS_AGGREGATE_RACES_PASS
```

Migration 0001–0015 chạy tuần tự trên database trắng, kèm diễn tập các guard chỉ
tồn tại ở tầng SQL (chuỗi amend, cấp role, hình dạng property setter, index tìm
kiếm theo document, hạn mức đồng thời 100 luồng).

## Chạy thật qua HTTP với wrangler dev

Bổ sung cho suite Workerd chứ không lặp lại nó: suite kia gọi worker qua dispatch
nội bộ của workerd, còn đây đi qua **HTTP thật với cookie jar thật** — cách duy nhất
kiểm được phần thuộc về transport: parse `Set-Cookie`, gửi lại cookie ở request sau,
chữ hoa/thường của header, URL-encode tên doctype có dấu cách, và status code như
client thật quan sát được.

```
npx wrangler d1 migrations apply cloudforge-demo --local --config apps/tenant-worker/wrangler.jsonc
npm run dev:seed
npx wrangler dev --config apps/tenant-worker/wrangler.jsonc --port 8799 --local
npm run smoke:http
```

| Kiểm tra | Kết quả |
|---|---|
| Migration 0001–0015 lên D1 cục bộ qua **wrangler thật** | 15/15 ✅ (không phải dry-run Python) |
| `npm run smoke:http` | **HTTP_SMOKE_PASS checks=24 failures=0** |
| Lặp lại từ D1 trắng (xoá `.wrangler/state` → migrate → seed → smoke) | PASS |

24 kiểm tra: guest bị chặn đúng cách · sai mật khẩu không set cookie · cookie
HttpOnly+Secure trên dây · cookie gửi lại được ở request sau · boot khớp csrf ·
ghi thiếu header CSRF bị chặn dù có cookie · tạo cấp tên từ server · **token
`modified` mang version** (`...830001` cho version 1) · token cũ và token thiếu đều
417 TimestampMismatchError · lưu đúng token thì token tiến lên · submit · chứng từ
đã submit không xoá được · metadata đúng tên Frappe · list trả tên field Frappe ·
CSV có BOM và content-disposition · method chưa làm là 404 · API native không bị che ·
logout xoá cookie và phiên hết tác dụng ngay.

### LỖI THẬT tìm ra ở đây

`wrangler@4.0.0` được pin **không chạy nổi chính code nó phải deploy**. workerd đi
kèm nó là `1.20250310.0`, nên nó âm thầm hạ compat date từ `2026-07-23` xuống
`2025-03-10` và `env.AGGREGATES.getByName` biến thành `is not a function` — mọi lệnh
ghi 417. Suite Workerd không thấy vì `@cloudflare/vitest-pool-workers` kéo một
workerd khác, mới hơn (`1.20260710.1`).

Nghĩa là **không có bước này thì Pha 7 sẽ deploy bằng một runtime cũ 16 tháng**. Đã
nâng lên `wrangler@4.114.0`; cảnh báo hạ compat date biến mất, và toàn bộ gate chạy
lại xanh sau khi nâng.

## Đóng gói app — CLI chạy thật

`node scripts/pack-app.mjs <dir> [--out x.json] [--check]`, và app mẫu thật ở
[server/apps-src/visits/](../server/apps-src/visits/).

| Kiểm tra | Kết quả |
|---|---|
| Pack app mẫu | `PACK_CHECK_PASS app=visits@1.0.0 doctypes=1 roles=2 fixtures=2 nav=1` |
| Hai lần pack cùng nguồn | **byte giống hệt** — content hash không đổi nên cài lại là no-op thật |
| Pack app có `Link` thiếu `options` | `PACK_FAILED: Link field ref requires options`, exit 1 |

Validate bằng **chính parser của server**, không phải bản sao luật: hai bản hiện thực
rồi sẽ lệch nhau, và chỗ lệch sẽ hiện ra thành cài thất bại trên tenant của khách chứ
không phải ở đây. `npm run app:check` nằm trong gate `check:business-suite` nên app mẫu
không thể mục đi mà không ai biết.

## Chưa chạy — và vì sao

| Hạng mục | Trạng thái | Cần gì |
|---|---|---|
| Deploy Cloudflare, smoke staging **trên hạ tầng thật** | ☐ chưa | **API token + account Cloudflare của bạn** |
| Sức khoẻ queue/outbox trên môi trường thật | ☐ chưa | môi trường đã deploy |
| Test tải, đa tenant trên hạ tầng thật | ☐ chưa | môi trường đã deploy |
| Diễn tập rollback + khôi phục tenant | ☐ chưa | môi trường đã deploy |
| E2E với **trình duyệt** thật (MetaForge Desk vẽ màn hình) | ☐ chưa | trình duyệt + client trỏ vào `wrangler dev` |
| `npm ci` sạch trên Linux | ☐ chưa | repo dùng pnpm; cần CI Linux |
| Đối chiếu ERPNext oracle v0.8–v1.0 | ☐ chưa | `pnpm run source:fetch` — cần clone Frappe/ERPNext v16 đã khoá SHA |
| Review pháp lý hoá đơn điện tử / lương | ☐ chưa | không phải việc kỹ thuật |

## E2E lớp vỏ Frappe — đã chạy trên workerd thật

`apps/tenant-worker/test/frappe-facade.integration.test.mts` — 47 kịch bản đi hết
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
- `get_workflow_transitions` trả `has_workflow` riêng biệt với danh sách transition
- Tree view: đi cây, field cha suy theo quy ước `parent_<snake>`; lá không báo
  expandable; doctype không phải cây thì TỪ CHỐI chứ không trả cây rỗng
- Query report: chạy đúng cột đã khai; report không tồn tại và filter ngoài
  whitelist đều bị TỪ CHỐI, không âm thầm bỏ qua
- Data import: từng dòng một command nên dòng lỗi chết một mình, kết quả báo theo
  dòng; cột không thuộc doctype bị từ chối chứ không bị bỏ
- Kanban: **đổi cột thì GHI document** (thay đổi nghiệp vụ, qua command path, có
  kiểm tra xung đột), **sắp lại thứ tự thì KHÔNG** — kéo thẻ không được bump version
  hay tạo revision mới trong lịch sử. Cột không thuộc options của field bị từ chối.
- Notification: chỉ thấy inbox của chính mình; mark đọc của người khác là no-op
  chứ không lỗi
- Business context: dimension lấy từ master data, cái nào không có dữ liệu báo
  disabled thay vì dropdown rỗng; selection chỉ áp lên dimension mà doctype thật
  sự có field
- Export CSV: BOM UTF-8 kiểm ở tầng BYTE (Response.text() strip nó khi decode), và
  giá trị mở đầu `=` bị vô hiệu hoá — mở file trong spreadsheet là nó CHẠY, tức
  "tải dữ liệu về" biến thành thực thi mã trên máy người phân tích
- **Single DocType**: chưa lưu thì trả FORM RỖNG chứ không 404 — trang Settings
  chưa từng lưu phải vẽ được form để người dùng điền, không phải báo lỗi "không tồn
  tại". Lưu dưới đúng tên doctype, vẫn kiểm xung đột (hai admin trên một trang
  Settings không được ghi đè nhau âm thầm), và KHÔNG cho xoá — xoá đi thì lần đọc
  sau âm thầm về mặc định, mất cấu hình mà không nói gì
- **Cài app**: cài xong doctype dùng được ngay qua cùng REST; cài lại đúng gói cũ là
  no-op; gỡ app còn dữ liệu bị TỪ CHỐI; xoá dữ liệu rồi gỡ thì doctype đi theo
- API native vẫn chạy song song, không bị lớp vỏ che

## Ranh giới — không tuyên bố quá

- **Chưa render trên trình duyệt thật.** Lớp vỏ đã chứng minh trả đúng hợp đồng FE
  mong đợi, nhưng chưa có lần nào MetaForge Desk thật vẽ màn hình từ nó.
- Lớp vỏ Frappe hiện thực **Tier 1 + Tier 2 + builder (Tier 3)** và phần Tier 4 mà
  Desk cần để dùng được (print, xoá hàng loạt, workspace, open count).
  và phần lớn Tier 4: print, xoá hàng loạt, workspace, open count, **tree view**,
  **query report**, **data import**.
  cộng **kanban (3)**, **notification log (4)**, **business context (3)**,
  **export CSV**.
  **Cố ý không làm** (mỗi cái trả 404 `DoesNotExistError`, không "thành công rỗng"):
  dashboard chart, number card, `get_overview`/`get_processes` — đó là **nội dung
  nghiệp vụ của APP**, nền tảng dựng ra là bịa số liệu; email — chưa cấu hình mail
  transport, báo "đã gửi" là nói dối về việc người dùng tin đã xảy ra; backups — của
  D1 là Time Travel phía Cloudflare, trả đường dẫn giả khiến người ta tin có bản sao
  lưu mà không có. Lý do từng cái ở
  xem [API_SURFACE.md](API_SURFACE.md). Mỗi cái gọi vào trả 404 `DoesNotExistError`
  chứ không trả rỗng, nên màn hình không render như thể có dữ liệu.
- Không còn metadata nào ở trạng thái "khai báo mà không ai đọc": `is_single` và
  `track_seen` đều đã hiện thực.
- Hooks app là **phản ứng sau commit**, không phải validator trước commit. Việc
  kiểm tra cần chặn lệnh ghi phải khai báo bằng metadata.
- Đây vẫn **không phải** ERPNext. Không có tương thích app Python, không có HR
  lifecycle đầy đủ, không có chứng nhận pháp lý ở bất kỳ nước nào.
