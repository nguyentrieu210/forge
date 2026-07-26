# Bằng chứng kiểm chứng

Mọi dòng dưới đây là **lệnh đã chạy thật** trên máy phát triển (Windows 11, Node
v24.17.0, Python 3.14.6, pnpm 9.15.0), không phải tự khai. Chỗ nào chưa chạy thì
ghi rõ là chưa.

Cập nhật: 2026-07-27 (sau 7 commit của lộ trình 100% hợp đồng client).

## Đã chạy — xanh

| Hạng mục | Lệnh | Kết quả |
|---|---|---|
| Cài đặt workspace | `pnpm install` | 399 gói, symlink `@metaforge/*` đúng workspace |
| Build TS strict (server) | `pnpm --filter cloudforge run build` | exit 0 |
| Typecheck worker (server) | `pnpm --filter cloudforge run typecheck:workers` | exit 0 |
| Test Node/domain | `node --test tests/*.test.mjs` | **336/336 PASS** |
| **Cổng phát hành tổng hợp** | `pnpm --filter cloudforge run check:business-suite` | **ok:true missing:[] exit 0** |
| Gate SQL (migration 0001–0017) | `pnpm --filter cloudforge run test:sql` | **6/6 PASS** |
| **Workerd tenant-worker** | `vitest run --config apps/tenant-worker/vitest.config.mts` | **79/79 PASS** |
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

## Cổng phát hành tổng hợp — PASS lần đầu

`npm run check:business-suite` là cổng promotion mà bản gốc khai. **Chưa từng chạy
trọn** trước đây, và nó vỡ ở hai chỗ khi chạy thật:

| Lỗi | Bản chất |
|---|---|
| `generate-verification.py` UnicodeDecodeError | `read_text()` không chỉ định encoding → dùng locale, trên Windows là cp1252 và chết ở byte UTF-8. Cổng chỉ chạy được trên máy locale UTF-8. |
| `verify-secrets.mjs` chặn `.dev.vars` | Thông điệp nói "must not be **committed**" nhưng chỉ kiểm sự tồn tại trên đĩa. `.dev.vars` là chỗ wrangler quy định cho secret CỤC BỘ và `wrangler dev` không chạy được nếu thiếu — nên cổng xanh và môi trường local chạy được loại trừ nhau, đúng thứ đẩy người ta đi tắt vô hiệu hoá cổng. Nay hỏi git đúng câu cần hỏi: bị track → FAIL; không track mà cũng không ignore → FAIL (lần `git add .` sau là commit); chỉ untracked-VÀ-ignored mới chấp nhận, và vẫn được **công bố** ra output. |

Kết quả: `ok: true`, `missing: []`, exit 0 — 15 check con đều xanh.

## Đối chiếu ERPNext oracle — đã chạy thật

```
npm run source:fetch    # tải zipball từ GitHub API, bắt buộc khớp SHA 40 ký tự đã khoá
npm run source:verify
npm run oracle:o2c
```

| Kiểm tra | Kết quả |
|---|---|
| Fetch + content-verify Frappe v16.19.0 / ERPNext v16.20.0 | `failures: []` |
| Scan source-exact | 1.872 file parsed, 706 parsed_static, 637 text, 87 binary |
| `oracle:o2c` | **ORACLE_OK runtime=CAPTURED_MATRIX claim=DIFFERENTIAL_PASS** |

**Phạm vi chính xác — không tuyên bố quá:** 115 fixture O2C, trong đó **48
DIFFERENTIAL_PASS** (khớp CloudForge trên mọi chiều áp dụng được) và **67
ORACLE_CAPTURED** (phân kỳ đã phân loại, 27 trong số đó là `CLOUDFORGE_MISSING`).
Trạng thái đối chiếu: 72 implemented · 17 partial · 26 missing.
Không có tuyên bố `parity: true` nào; mỗi fixture mang claim riêng của nó.

Phủ **chỉ O2C** (SO/DN/SI/PE, vòng đời, báo cáo, số học, đồng thời, thuế nâng cao,
đa tiền tệ, giá vốn, repost, batch/serial).

### Capture nay đã TỰ TÁI LẬP trên bench thật — 2026-07-27

Trước đây capture là **thừa hưởng**: một artifact đã commit sẵn từ bản CloudForge gốc,
không ai trong dự án này từng chạy lại. Nay đã dựng bench và chạy lại từ đầu.

| | |
|---|---|
| Bench | `frappe/erpnext:v16.20.0` (Docker Hub) — chứa **đúng** frappe 16.19.0 + erpnext 16.20.0 |
| Xác minh | **nội dung**, không phải commit id: 5 file controller O2C băm **trùng từng byte** với cây nguồn đã ghim |
| Runner | cả **năm** — matrix 71 · advanced 15 · valuation 11 · repost 6 · batch/serial 12 |
| Kết quả | **115/115 captured, 0 handler failure** |
| Đối chiếu với bản thừa hưởng | **112/115 trùng từng byte** |

Ba cái lệch **chỉ lệch ở dấu thời gian** mà chính fixture nhúng vào (ngày chạy capture, và
thông điệp `TimestampMismatchError` có ngày trong đó). Giá trị nghiệp vụ — SLE, giá vốn,
loại lỗi — giống hệt. **Capture thừa hưởng là thật.**

Hai điều học được, đã ghi vào [oracle-bench/README.md](../server/docs/spec/tools/oracle-bench/README.md):
image chính thức bỏ được bước build nặng nhưng **không có `.git`** nên phép kiểm fail-closed
phải đổi sang so nội dung; và builder gấp **năm** file raw — chạy mỗi matrix runner cho ra
một capture **trông như đủ** (vẫn `ORACLE_OK`, vẫn cùng claim) trong khi **âm thầm mất 44
fixture thật**. Tôi đã mắc đúng lỗi đó ở lần chạy đầu.

Bench là **dùng một lần**: dựng không publish cổng nào (máy đó chạy production), chạy xong
xoá cả volume; 9 container production giữ nguyên uptime.

### Bề rộng v0.8–v1.0 — nay KHÔNG còn bị chặn bởi hạ tầng

Ngân hàng, lương, subscription, hoá đơn điện tử, sản xuất, tài sản vẫn **chưa có oracle**.
Nhưng lý do đã đổi: trước là *"không có bench"*, nay là **chưa ai viết fixture runner cho
các phân hệ đó**. Bench dựng lại được bằng một quy trình đã ghi và đã chạy. Đó là việc
viết code, không phải việc chờ hạ tầng.

## Lộ trình "100% hợp đồng client" — bảy commit, mỗi pha deploy + smoke live

Mục tiêu đã chốt: làm đủ mọi cơ chế một client Frappe quan sát được. **Không** chạy app
Python — điều đó bất khả trên Workers và đã ghi rõ trong [ARCHITECTURE.md](ARCHITECTURE.md).

| Pha | Nội dung | Kiểm chứng |
|---|---|---|
| 0 | App Worker không còn nhận `INTERNAL_SERVICE_TOKEN` của nền. Khoá dẫn xuất riêng từng cặp (tenant, app) | test chốt đúng header |
| 1a | App phơi API method riêng — `<app_id>.*` dispatch đồng bộ **trong** request | 11 test |
| 1b | App gọi ngược qua `/_app/` với **quyền của chính người dùng đã gọi nó** | 8 test, gồm các ca leo thang |
| 2 | App **chặn được lệnh ghi** — hook trước commit, nối ở `runCommand` (một điểm nghẽn, phủ 9 chỗ ghi) | 11 test |
| 3 | **43/43 fieldtype**, mỗi loại có hành vi server thật | 4 + 3 test workerd |
| 4 | Thuộc tính DocField: giữ tầng trình bày, cưỡng chế 4 thuộc tính có hành vi | 4 + 2 test workerd |
| 5 | Notification rules · Auto Repeat · Web Form · PDF (từ chối có lý do) | 16 + 11 test, migration 0016–0017 |

### Ba lỗ bảo mật tìm ra trong lúc làm

| Lỗ | Bản chất |
|---|---|
| App Worker cầm credential nội bộ của nền | `INTERNAL_SERVICE_TOKEN` xác thực `/internal/*` trên **mọi** tenant và dùng chung toàn nền. Gửi nó cho app là đảo chiều tin cậy: chứng minh "nền đang gọi bạn" đồng thời cấp "bạn gọi được vào nội bộ nền, mọi tenant, với tư cách nền" |
| `Password` trả về khi đọc | Nay không bao giờ trả, và **không truy vấn được** — `like` trên bí mật moi ra từng ký tự, cùng mức lộ như đọc thẳng |
| Web Form có thể thành đường vòng quyền | Nay **không có** đường vòng: submission chạy dưới role mà tenant phải cấp bằng DocPerm thường |

### Ranh giới cố ý — không làm, có lý do

- **PDF**: Workers không có trình render PDF. Trả một file *gọi là* PDF mà không phải PDF
  thì tệ hơn không có — nó đi vào hợp đồng, email, lưu trữ, rồi hỏng ở nơi không ai còn
  nhớ nó từ đâu ra. `get_html_and_style` trả HTML+CSS để **client** in.
- **Email**: không có mail transport. Notification rule khai `channel: Email` được nhận và
  **ghi nhận là đã bỏ qua kèm lý do**, không bao giờ báo đã gửi.
- **`is_virtual`, `link_filters`, `fetch_if_empty`, `ignore_user_permissions`**: chuyển
  tiếp tới client, chưa có cơ chế server. Chúng cần máy móc mới chứ không phải một
  trường — tách ra thay vì làm nửa vời.

### Smoke chạy được trên **cả hai** tenant

`http-smoke.mjs` từng đóng cứng payload theo hình dạng `Field Visit`, nên trỏ vào tenant
khác cho ra sáu lỗi dây chuyền **trông như lỗi sản phẩm** mà thực ra là một document không
hợp lệ bị từ chối đúng. Nay nhận `--payload`, `--edit-field`, `--skip-submit`.

`--skip-submit` tồn tại vì một lý do cụ thể: doctype **có workflow không submit thẳng
được**, và đó là ĐÚNG — server trả `"Workflow action is required to submit from <state>"`,
state machine là đường duy nhất. Bỏ qua tường minh thay vì nới lỏng cho qua, vì một check
đã được nới đến mức đâu cũng pass là check không chứng minh gì.

| Tenant | Kết quả |
|---|---|
| `demo` (Field Visit) | **HTTP_SMOKE_PASS 26/26** |
| `hrm` (Leave Application, có workflow) | **HTTP_SMOKE_PASS 24/24** |

## Trình duyệt thật — MetaForge Desk vẽ trên lớp vỏ

`client/e2e-forge/` — Playwright + Chromium thật, cookie thật, proxy same-origin
**không tiêm token**. Đây là điều duy nhất mà không test phía server nào chứng minh
được: rằng **client ĐỒNG Ý với hợp đồng**. Một response có thể đúng từng byte mà vẫn
để lại màn hình trắng, nếu một cờ về dạng boolean ở chỗ client mong 0/1.

```
server/  npx wrangler dev --config apps/tenant-worker/wrangler.jsonc --port 8801 --local
client/apps/demo/  VITE_LIVE=1 vite build --outDir dist-live
client/e2e-forge/  npx playwright test
```

**5 passed · 0 skipped** — chạy trên chính bản deploy Cloudflare live.

Đã chứng minh chạy thật trong trình duyệt:

- Guest bị đẩy về màn đăng nhập **do chính 403 `PermissionError` + "Login to access"
  của lớp vỏ**, không phải do mặc định phía client
- Đăng nhập bằng hash mật khẩu thật → cookie HttpOnly → boot thành công
- Sai mật khẩu bị từ chối, vẫn ở màn đăng nhập (401 được hiện ra, không bị nuốt)
- Đăng xuất → server xoá cookie → client nhận ra và về màn đăng nhập
- **Toàn bộ shell Desk render**: sidebar, user "Dev User", selector business-context
  điền từ master data của tenant này (Demo / Stores), badge thông báo, capabilities

### Hai lỗ hợp đồng lớp vỏ tìm ra trong lúc này

| Lỗi | Bản chất |
|---|---|
| `getdoctype` trả `permissions: []` rỗng | `filterMetaForActor` cố ý xoá DocPerm — đúng cho API native (nó không bao giờ tiết lộ ma trận quyền), nhưng hợp đồng Frappe **có** mang DocPerm và client suy cột list + quyền sửa field từ đó. Nay trả lại, **lọc theo role actor đang có**: actor biết mình làm được gì (điều họ có thể tự thử ra), không biết role khác làm được gì. |
| `sort_field` bị bỏ khi kernel metadata không có | Frappe **luôn** gửi cả `sort_field` và `sort_order` (mặc định `modified desc`), và client ghép `order_by` trực tiếp từ đó. Thiếu nó cho ra `"undefined desc"` hoặc TypeError. |

### Hợp đồng metadata — nạp thẳng vào normaliser THẬT của client

`server/tests/client-contract.test.mjs` nạp output `getdoctype` của lớp vỏ vào
**`normalizeMeta` và `deriveColumns` thật** import từ `client/packages/*/dist` — không
phải bản sao luật. Đây là chỗ bịt khe mà mọi test phía server khác để hở: chúng khẳng
định lớp vỏ **phát ra** gì, không chứng minh client **dùng được** hay không.

9 assertion PASS, gồm: normaliser không ném lỗi · `title_field` sống sót (thiếu nó là
list bị đặt tiêu đề bằng `ID` trần) · DocPerm tới được client · `sort_field`/`sort_order`
luôn có · **`deriveColumns` cho ra đúng cột đã khai (Subject + Customer), không phải
fallback ID** · field bị mask thì cột bị bỏ · cờ vẫn là số nguyên qua vòng round-trip ·
child doctype trong bundle tìm được theo TÊN.

Một giả thuyết đã bị BÁC BỎ và ghi lại để không ai truy lại lần hai: `permissions: []`
rỗng **không** làm list co về một cột ID. Client coi permlevel 0 là đọc được bất kể;
DocPerm quyết định quyền **GHI**.

### Known gap list view — ĐÃ ĐÓNG (2026-07-27)

`5 passed`, không còn skip, **chạy trên bản deploy Cloudflare live**. Màn hình vẽ đúng
cột đã khai (**Chủ đề**, Customer) và một dòng dữ liệu thật `FV-2026-0001`.

Nguyên nhân là **hai lỗi trong lớp vỏ**, không phải ở client — và mỗi cái là một **lớp
lỗi**, không phải ca lẻ:

**1. Phong bì.** `getdoctype` và `getdoc` **không `return`** payload. Chính handler của
Frappe làm `frappe.response.docs.extend(docs)` và `frappe.response["docinfo"] = docinfo`
(`frappe/desk/form/load.py`, đã tra trong source v16.19.0 tải về), nên các khoá đó nằm ở
**cấp cao nhất, không có bọc `message`**. Lớp vỏ đã bọc chúng.

Hậu quả **im lặng**: Desk đọc thẳng `r.docs` khỏi body → `undefined` → adapter ném
`DoesNotExistError` **trên một HTTP 200**, không log ở đâu cả. Và vì list query bị gate
bởi `ready = Boolean(metaQ.data)`, **không request list nào được gửi** — đúng cái triệu
chứng từng khiến tôi kết luận nhầm là "client chủ động không query".

**2. Projection.** Desk xin `modified` ở **mọi** list; cột kernel là `modified_at`.
Filter và sort đã được dịch, riêng projection thì không → server trả
`Field is not allowed: modified` cho mọi doctype. **Bốn** call site cùng dính: list,
contextual list, `get_value`, export. `modified` còn không phải cột — nó được đóng gói từ
`modified_at` **và** `version`, nên xin nó phải kéo theo cả hai; thiếu `version` thì dòng
trả về không có `modified`, và sửa nhanh trên list sẽ gửi token rỗng khiến **mọi lần lưu
bị từ chối là xung đột**.

**Vì sao không bộ test nào bắt được.** Lỗi 1 nằm ở **phong bì**, mà
`client-contract.test.mjs` nạp `toFrappeMetaBundle` trực tiếp nên đi vòng qua nó; còn
smoke test thì dùng `unwrap()` đọc `message` — tức **nó khẳng định đúng con bug**. Lỗi 2
chỉ nổ với tên field mà chưa test phía server nào tình cờ xin tới.

Nay đã chốt: smoke kiểm `docs` ở cấp cao nhất **và** không có khoá `message`
(24 → **26 check**), Workerd có test riêng cho cả hai (70 → **72**).

Một giả thuyết bị BÁC BỎ dọc đường, ghi lại để không ai truy lại lần hai:
`permissions: []` rỗng **không** làm list co về một cột ID. Client coi permlevel 0 là đọc
được bất kể; DocPerm quyết định quyền **GHI**.

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
| `npm run smoke:http` | **HTTP_SMOKE_PASS checks=26 failures=0** |
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

## Deploy Cloudflare thật — 2026-07-26

Account `d4d5a24d…`, subdomain `trieu-nt93.workers.dev`, wrangler 4.114.0. 5 worker,
3 database D1, 3 queue, 1 dispatch namespace, 8 secret.

```
node scripts/d1-migrate-remote.mjs --config apps/tenant-worker/wrangler.jsonc
node scripts/bootstrap-remote-secrets.mjs --account <id>
npx wrangler deploy --config apps/tenant-worker/wrangler.jsonc \
  --name cloudforge-tenant-demo --dispatch-namespace cloudforge-production
node scripts/seed-remote-admin.mjs --config apps/tenant-worker/wrangler.jsonc
node scripts/http-smoke.mjs --base https://cloudforge-gateway.trieu-nt93.workers.dev ...
```

| Kiểm tra | Kết quả |
|---|---|
| Migration D1 remote (tenant / control / jobs) | **15/15 · 1/1 · 1/1** — `migrations list --remote` báo "No migrations to apply!"; tenant 17 → **53 bảng** |
| Route tenant qua chính Control Plane (`PUT /v1/routes/…`) | `routing_version: 2`, ghi cả khoá thuận và khoá đảo `__tenant__:` |
| **Smoke HTTP qua Internet công cộng** | **HTTP_SMOKE_PASS checks=26 failures=0** |
| **Đường bất đồng bộ, từ backlog nguội** | outbox **30 pending → 0 pending / 30 published**; jobs `processed_events` **30/30**; tenant `inbound_events` **30/30**; DLQ trống |
| Cron thật sự chạy (qua `wrangler tail`) | `"*/1 * * * *" - Ok` → `POST /internal/maintenance - Ok` → `Queue cloudforge-outbox (18 messages) - Ok` |

### HAI LỖI CHẶN PHÁT HÀNH mà chỉ deploy thật mới lộ

**1. Không ai đăng nhập được — Workers từ chối PBKDF2 trên 100.000 vòng.**

`PASSWORD_ITERATIONS` là 210.000. Production Workers từ chối một lệnh
`crypto.subtle.deriveBits` PBKDF2 vượt 100.000 vòng, và cú throw xảy ra **trước** khi so
mật khẩu — nên mọi login trả HTTP 500 bị che, **kể cả mật khẩu sai**, vì vậy nó còn
không trông giống lỗi xác thực.

Đo thật, không suy diễn: account hash ở 100.000 vòng → login **200**; cùng account ở
210.000 vòng → **500**.

workerd local **không** áp giới hạn này. 258 test Node, 70 test Workerd và một smoke
HTTP **local** 24/24 đều xanh trên một bản build mà login không thể chạy sau khi deploy.
Suite còn hash ở 1.000 vòng cho nhanh, nên **work factor production chưa từng được thực
thi ở đâu cả**.

Đã sửa: dẫn xuất theo nhiều vòng nối chuỗi, mỗi vòng tối đa 100.000, output vòng trước
làm input vòng sau. Kẻ tấn công vẫn phải trả đủ 210.000 vòng HMAC-SHA256. Số vòng ở dưới
ngưỡng thì dẫn xuất đúng một vòng và **giống hệt từng bit** dạng cũ, nên hash lưu trước
khi sửa vẫn xác thực được — có test chốt.

**2. Outbox chưa bao giờ được rút — worker trong dispatch namespace không chạy cron.**

Tenant worker khai `triggers.crons`, và `scheduled()` rút outbox vào queue rồi quét lại
các app hook thất bại. Worker nạp vào dispatch namespace **chỉ** được gọi qua dispatcher;
cron của nó được nhận lúc deploy rồi **âm thầm không bao giờ chạy**.

Không có lỗi ở đâu. Sự kiện chỉ đơn giản dồn lại ở `pending`. Phát hiện trên môi trường
live đang giữ **27 sự kiện hai ngày tuổi**, `processed_events` trống rỗng — **toàn bộ nửa
bất đồng bộ của hệ thống chưa từng chạy**.

Đã sửa: chuyển lịch sang jobs worker — worker thường, cron có chạy, và sẵn có đúng hai
binding cần để tới mọi tenant (KV route index + dispatcher). Nó gọi endpoint mới
`POST /internal/maintenance` có gác token trên từng tenant đang hoạt động. Cả endpoint đó
và `scheduled()` đều gọi **cùng một** `runMaintenance` nên không thể lệch nhau. Tenant bị
treo thì bỏ qua, KV list phân trang, và một tenant không tới được không làm chết các
tenant khác.

`/internal/*` **không lộ ra Internet**: gateway từ chối header `Authorization` không phải
JWT trên đường non-Frappe, nên các endpoint này chỉ tới được qua dispatcher.

### Giới hạn của bản deploy này

- **Một hostname, nên một tenant.** Gateway suy tenant từ host, mà workers.dev chỉ cấp
  một hostname cho mỗi worker. Định tuyến vhost đa tenant cần custom domain wildcard;
  credential đang dùng chỉ có `zone (read)`, không tạo được DNS record. `PLATFORM_SUFFIX`
  giữ giá trị mẫu và route key là **cả hostname** của gateway.
- **Không bind R2**, nên upload file trả "File storage is not configured" (có gác, không
  crash). Credential không có quyền R2.
- **`wrangler d1 migrations apply --remote` KHÔNG dùng được cho dự án này** — không phải
  do thích hay không. Lệnh đó gửi cả file migration làm một chuỗi `sql` để **server D1 tự
  tách**, và bộ tách phía server đóng block khi gặp `CASE … END;` lồng trong thân trigger,
  làm `CREATE TRIGGER` bị cắt cụt → `incomplete input: SQLITE_ERROR [7500]`. **Mười trong
  mười lăm** migration tenant dùng đúng dạng đó (là cách duy nhất trong SQLite để raise
  lỗi riêng cho từng điều kiện), nên lệnh chuẩn chết ở 0005 và không bao giờ tới 0006.
  `d1 execute --remote --file` không bị, vì nó tách ở phía client. Thay thế:
  [server/scripts/d1-migrate-remote.mjs](../server/scripts/d1-migrate-remote.mjs), có
  giữ luôn bookkeeping `d1_migrations` nên `migrations list` vẫn đúng sự thật.

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
| Test tải, đa tenant trên hạ tầng thật | ☐ chưa | tenant thứ hai; workers.dev chỉ cho một hostname |
| Diễn tập rollback + khôi phục tenant | ☐ chưa | chưa chạy |
| `npm ci` sạch trên Linux | ☐ chưa | repo dùng pnpm; cần CI Linux |
| Oracle cho bề rộng v0.8–v1.0 (ngân hàng, lương, subscription, sản xuất) | ☐ chưa | bench ERPNext thật để capture fixture mới (cần MariaDB + Redis + bench) |
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

- **Đã render trên trình duyệt thật, trên hạ tầng thật**: đăng nhập, shell Desk và
  **list view có dữ liệu** đều chạy trong Chromium trên bản deploy Cloudflare (5/5,
  không skip). Vẫn chưa chứng minh: một quy trình nghiệp vụ đầu-cuối qua UI (tạo →
  submit → chứng từ liên quan), và mọi màn hình ngoài list/form của một doctype.
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
