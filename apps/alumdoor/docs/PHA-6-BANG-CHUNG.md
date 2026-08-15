# PHA 6 — bằng chứng verify (tenant CỤC BỘ)

Chạy 2026-08-15 trên `wrangler dev --local`, tenant `demo`, cổng 8811.
Không có lệnh nào chạm Cloudflare, D1 remote, secret hay DNS.

Chạy lại:

```bash
cd server
npx wrangler dev --config apps/tenant-worker/wrangler.jsonc --port 8811 --local   # cửa sổ 1
FORGE_ADMIN_PASSWORD='local-dev-password-1' \
  node scripts/forge-app.mjs briefs/alumdoor.json --origin http://localhost:8811 --admin dev@example.com
node scripts/qa-alumdoor.mjs --origin http://localhost:8811
```

## Đạt

| Bằng chứng | Kết quả |
|---|---|
| `pnpm run smoke:http` | `HTTP_SMOKE_PASS checks=26 failures=0` |
| Cài app | `installed (24 doctypes, 1 workflows, 34 fixtures)` |
| **Bước kiểm 4** — home tới được | `ok (34 nav entries, home /x/approval%3ADon%20Hang)` |
| **Bước kiểm 5** — hợp đồng form/link | `ok (form Kho, User Link Nhan Vien.user)` |
| Nâng cấp lặp lại | `upgraded` **bốn lần liên tiếp** — lỗi cũ *"nâng cấp app chỉ được đúng một lần"* không tái diễn |
| Test đơn vị | `58/58` · typecheck sạch |
| QA quyền + tranh chấp | `QA_PARTIAL checks=8 failures=0 skipped=1` |

### Quyền — chặn ở SERVER, không phải ẩn nút

Ba tài khoản mang **đúng một** vai trò Alumdoor (đã gỡ `System Manager` để phép thử có nghĩa):

- Sale đọc được `Quy Cach Cua` ✓
- **Sale KHÔNG đọc được `Tai Khoan`** ✓ — xác nhận lựa chọn §6.1: bỏ vai trò ra khỏi
  `permissions` là không thấy gì cả, chặt hơn mọi cách ẩn nút
- Giám đốc đọc được `Tai Khoan` ✓
- Sale gọi `alumdoor.bao_cao.lai_lo` bị chặn ✓

### Tranh chấp — hai người cắt cùng một cây (§7.3)

- bản ghi trả về có `modified` ✓
- hai lệnh ghi song song mang **cùng** `modified` ⇒ **đúng một** thành công, một bị từ chối ✓
- `so_la` trừ **đúng một lần** ✓
- ghi lại bằng `modified` cũ vẫn bị từ chối ✓ — lock thật, không phải trúng đua

## CHƯA có bằng chứng — 4 bài app method

`SKIP`, không phải `ok`. Nguyên nhân là **môi trường**, không phải app:

```
App validators are declared but this deployment cannot reach app Workers
Method is not implemented on this platform: alumdoor.tinh.so_la
```

`server/apps/tenant-worker/wrangler.jsonc` **không có `dispatch_namespaces`**, nên:

- `alumdoor.*` không dispatch được ⇒ 404;
- mọi DocType có validator bị **từ chối ghi** ⇒ 500. Đây là fail-closed và **đúng** — âm thầm
  bỏ qua kiểm tra mới là sai.

⇒ **Runbook cục bộ verify được DocType, quyền và khoá lạc quan; KHÔNG verify được app method
và validator.** Muốn có bằng chứng phải chạy trên môi trường có Workers for Platforms.

Bằng chứng khoá lạc quan ở trên lấy qua một **biến thể brief tạm** đã gỡ
`worker`/`validators`/`actions` (khoá lạc quan là cơ chế của LÕI nên vẫn kiểm được). Biến thể
đó đã xoá; tenant hiện chạy đúng brief bản giao.

## Hai lỗi thật mà bước cài bắt được

Cả hai đều **xanh ở `--dry-run`** và chỉ lộ khi cài thật rồi thao tác:

| Lỗi | Hậu quả nếu không bắt |
|---|---|
| **15/24 DocType thiếu `naming`** | Fixture cài được (có `name` tường minh) nhưng người dùng **không tạo nổi bản ghi mới**: `Cay Nhom Ton requires a name`. Đã thêm `field:ma` cho 10 danh mục và counter cho 5 bảng còn lại |
| **`so_la_ban_dau` khai `!~`** (bắt buộc **và** chỉ đọc, không mặc định) | `Field is read-only: so_la_ban_dau` — form không có đường nào nộp. Bất biến "không đổi sau khi tạo" phải do validator giữ, không phải cờ chỉ-đọc |

## Cổng CRITICAL — chạy thật, và nó ĐỎ

`validation/alumdoor-v1.json` · `node scripts/run-validation-gate.mjs --profile validation/alumdoor-v1.json`

```
PLAN_READY   — cả 10 cổng CRITICAL đều có lệnh THẬT, không cổng nào để trống
  typecheck            PASS
  build                PASS
  unit                 PASS
  targeted_integration FAIL
result=GATE_FAIL
```

**Đây là kết quả đúng, không phải sự cố cần vá.** `targeted_integration` chạy QA trên brief
**bản giao** — bản có `worker` + 9 validator — và môi trường cục bộ không với tới app Worker
nên mọi lệnh ghi bị từ chối. Bằng chứng tranh chấp ở mục trên lấy trên **biến thể đã gỡ
validator**, nên nó chứng minh cơ chế khoá lạc quan của LÕI, **không** chứng minh bản giao.

Không sửa script cho xanh. `VALIDATION_GATES.md` §4 nói thẳng: thiếu lệnh đích danh là lỗi cấu
hình chứ không được mượn suite rộng; và một cổng xanh nhờ `SKIP` thì đúng bằng không chạy nó.

Cổng này chỉ xanh được trên môi trường có **dispatch namespace**. Đó cũng chính là điều kiện của
4 bài app method và 3 ca `allow_self_approval`.

### `tenant_isolation` — bất biến lát cắt này sở hữu

Ban đầu cổng này `MISSING` ⇒ `CONFIG_FAIL`. Đã viết test thật thay vì trỏ vào suite rộng:
app worker **không** tự khoanh tenant (nền tảng bơm `tenant_id` từ danh tính đã ký), nên câu hỏi
đúng là *app có chỗ nào để người gọi TỰ KHAI tenant không*. `alumdoor-tenant-isolation.test.mjs`
canh bốn điều: không file nào đọc `args.tenant`; mọi lời gọi ngược lấy tenant từ `context`;
thiếu header tenant thì từ chối **sớm** và nêu đích danh; args thù địch không ghi đè được header.
**6/6 PASS.**

## Còn lại trước khi gọi là xong

- [ ] 4 bài app method trên môi trường có dispatch namespace
- [ ] Ba ca `allow_self_approval` (Sale→QLBH ok · QLBH tự duyệt 403 · **GĐ tự duyệt ok**) — cần
      workflow chạy được, tức cần validator, tức cần dispatch
- [ ] Browser E2E desktop + mobile
- [ ] `npm run verify` gốc repo đang ĐỎ vì `app:check` gọi 8 app đã bị xoá ở `741caeb7` —
      inherited debt, phải phân loại theo `VALIDATION_GATES.md` §9 hoặc cắt khỏi script
