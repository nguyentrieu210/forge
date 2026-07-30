# Runbook: Cloudflare Preview QA

## Mục tiêu

Tự động kiểm tra mỗi Pull Request hoàn toàn trên cloud:

1. GitHub Actions build toàn bộ Forge.
2. Upload một version preview của `cloudforge-gateway` lên Cloudflare.
3. Gán preview alias theo số PR.
4. Deploy `cloudforge-preview-qa` có Browser Run binding.
5. Mở preview bằng Playwright trên Cloudflare ở desktop và mobile.
6. Thu HTTP status, console errors, page errors, request failures và screenshot.
7. Lưu bằng chứng thành GitHub Actions Artifact.
8. Cập nhật báo cáo trực tiếp vào Pull Request.

Luồng chuẩn:

```text
ChatGPT/GitHub PR
  -> GitHub Actions build
  -> Cloudflare gateway preview
  -> Cloudflare Browser Run + Playwright
  -> screenshots/report artifact
  -> PR comment/check
```

## Trạng thái xác nhận

- Repository: `nguyentrieu210/forge`
- Pull Request triển khai ban đầu: `#7`
- Workflow: `.github/workflows/cloudflare-preview-qa.yml`
- Gateway config: `server/apps/gateway-worker/wrangler.jsonc`
- QA Worker: `qa/browser-worker/`
- Kết quả xác nhận đầu tiên: toàn bộ workflow PASS ngày `2026-07-30 UTC` (`2026-07-31 ICT`).

## Tài nguyên Cloudflare

### Gateway preview

- Worker: `cloudforge-gateway`
- Workers subdomain: được truy vấn động từ Cloudflare API.
- Preview alias:

```text
pr-<PR_NUMBER>-cloudforge-gateway.<workers-subdomain>.workers.dev
```

Ví dụ:

```text
pr-7-cloudforge-gateway.trieu-nt93.workers.dev
```

Preview version không nhận production traffic cho tới khi có lệnh deploy production riêng.

### Browser QA Worker

- Worker: `cloudforge-preview-qa`
- Binding:

```text
BROWSER -> Cloudflare Browser Run
```

- Endpoint:

```text
GET  /health
POST /run
```

- `/run` yêu cầu header:

```text
Authorization: Bearer <QA_TOKEN>
```

`QA_TOKEN` được sinh mới trong workflow, upload thành Worker secret và chỉ lưu tạm trong runner. Không ghi token vào source, artifact hoặc PR comment.

## GitHub Secrets và Environment

Workflow dùng GitHub Environment:

```text
production
```

Secret bắt buộc:

```text
CLOUDFLARE_API_TOKEN
```

Account ID hiện được cấu hình trong workflow:

```text
d4d5a24d4e56f28f27fe58b64ef149a5
```

## Phạm vi quyền token

Token hiện là token quyền cao và có cả quyền DNS. Giá trị token tuyệt đối không được ghi vào repo, log, issue, PR comment hoặc tài liệu.

Phạm vi hiện có/được phép dùng gồm các nhóm sau:

```text
Account -> Workers Scripts -> Edit
Zone    -> Workers Routes  -> Edit
Zone    -> DNS             -> Edit
```

Có thể token còn quyền cao hơn các mục trên. Trước khi thêm bước tự động mới, phải xác minh workflow thật sự cần quyền nào.

### Quy tắc an toàn

- Chỉ lưu token trong GitHub Actions Secret hoặc Environment Secret.
- Không dùng token trong frontend, Worker vars hoặc file `.env` commit vào Git.
- Không in token ra log, kể cả dạng debug.
- Không dùng token quyền cao cho workflow chạy từ fork.
- Workflow chỉ chạy với PR có head repository trùng repository chính.
- Giữ `production` environment có protection rule nếu bắt đầu cho phép thao tác DNS/production.
- Nếu token từng xuất hiện trong log, ảnh hoặc chat công khai, phải rotate ngay.
- Khi hệ thống ổn định, nên tách token thành:
  - Token deploy Worker.
  - Token DNS/provision tenant.
  - Token production release.

Token DNS hiện chưa cần cho Browser QA, nhưng có thể dùng sau cho provisioning tenant, custom domain hoặc route tự động.

## Cách workflow hoạt động

### 1. Build

```bash
pnpm install --frozen-lockfile
pnpm build
node server/scripts/stage-client-bundle.mjs
```

### 2. Xác minh Cloudflare credential

Workflow dừng ngay nếu không có token.

### 3. Lấy Workers subdomain

```text
GET /accounts/<ACCOUNT_ID>/workers/subdomain
```

### 4. Bật preview URL cho gateway

```text
POST /accounts/<ACCOUNT_ID>/workers/scripts/cloudforge-gateway/subdomain
```

Payload:

```json
{
  "enabled": true,
  "previews_enabled": true
}
```

### 5. Upload gateway preview version

```bash
pnpm --dir server exec wrangler versions upload \
  --config apps/gateway-worker/wrangler.jsonc \
  --preview-alias "pr-<PR_NUMBER>" \
  --keep-vars
```

### 6. Deploy QA Worker

```bash
npm install --prefix qa/browser-worker --no-audit --no-fund
cd qa/browser-worker
npx wrangler deploy
```

Sau đó workflow sinh `QA_TOKEN`, đặt thành Worker secret và lưu bản tạm tại runner để bước Browser Run dùng đúng cùng một giá trị.

### 7. Chạy Browser Run

QA Worker mở preview bằng `@cloudflare/playwright` với hai viewport:

```text
desktop: 1440 x 1000
mobile:   390 x 844
```

Kết quả gồm:

- HTTP status.
- Page title.
- Console errors.
- Page errors.
- Request failures.
- Screenshot PNG.
- PASS/FAIL cho từng viewport.

### 8. Lưu bằng chứng

Artifact name:

```text
cloudflare-preview-qa-<PR_NUMBER>
```

Nội dung:

```text
qa-results/
  report.json
  summary.md
  screenshots/
    desktop-*.png
    mobile-*.png
```

Artifact giữ 14 ngày theo workflow hiện tại.

## Cách chạy lại

Từ GitHub:

```text
Repository
-> Actions
-> Cloudflare Preview QA
-> chọn workflow run
-> Re-run failed jobs
```

Một commit mới vào branch PR cũng tự kích hoạt workflow.

## Cách đọc kết quả

### PASS

- Workflow `Cloudflare Preview QA` màu xanh.
- PR comment hiển thị `Overall: PASS`.
- Artifact chứa screenshot desktop/mobile.

### FAIL trước Browser Run

Kiểm tra lần lượt:

1. Build Forge.
2. Secret `CLOUDFLARE_API_TOKEN`.
3. Account ID.
4. Quyền `Workers Scripts: Edit`.
5. Preview URLs có được bật cho gateway không.
6. Compatibility date có nằm trong tương lai theo UTC không.
7. QA Worker deploy thành công không.

### FAIL trong Browser Run

Đọc:

```text
qa-results/report.json
qa-results/summary.md
qa-results/screenshots/*.png
```

Phân biệt:

- `HTTP >= 400`: preview hoặc route lỗi.
- `consoleErrors > 0`: frontend/runtime lỗi hoặc tài nguyên phụ lỗi.
- `pageErrors > 0`: JavaScript exception.
- `requestFailures > 0`: network/resource failure.
- Screenshot: lỗi bố cục, màn trắng, responsive hoặc nội dung sai.

## Các lỗi đã gặp và cách xử lý

### GitHub Actions không thấy token

Nguyên nhân: Cloudflare Git Integration có quyền đọc GitHub nhưng không cấp credential ngược lại cho GitHub Actions.

Cách xử lý: thêm `CLOUDFLARE_API_TOKEN` vào GitHub Actions/Environment Secret.

### Wrangler upload thành công nhưng workflow không tìm thấy URL

Nguyên nhân: preview URL chưa bật ở cấp Worker.

Cách xử lý: bật `previews_enabled` qua Cloudflare API trước khi upload version.

### Cloudflare báo compatibility date trong tương lai

Nguyên nhân: GitHub runner dùng UTC, trong khi ngày địa phương đã sang ngày mới.

Cách xử lý: dùng compatibility date không lớn hơn ngày UTC hiện tại.

### Browser QA trả 401

Nguyên nhân: token sinh động bị truyền lệch giữa các step.

Cách xử lý: lưu token tạm trên runner và dùng đúng cùng giá trị để đặt Worker secret và gọi `/run`.

### Desktop có console error do favicon 404

Nguyên nhân: Chrome tự yêu cầu `/favicon.ico` trên trang health.

Cách xử lý: QA harness bỏ qua request favicon trong bài smoke test, nhưng vẫn giữ kiểm tra console error thật cho ứng dụng.

## Mở rộng tiếp theo

Sau smoke test `/health`, mở rộng `paths` hoặc scenario để kiểm tra:

```text
/
/login
/app/*
/workspace/*
/report/*
/shop/*
```

Giai đoạn tiếp theo nên thêm:

- Login bằng tenant QA riêng.
- Kiểm tra navigation và form.
- Accessibility snapshot.
- Trace Playwright.
- Visual regression theo baseline.
- Test metadata-driven sinh từ app definition.
- Dùng quyền DNS để tự tạo subdomain tenant chỉ trong workflow provisioning riêng, không gộp bừa vào preview QA.

## Quy tắc production

Workflow này tạo preview và bằng chứng QA. Nó không phải workflow release production.

Không thêm các lệnh sau vào workflow này nếu chưa có approval riêng:

```text
wrangler versions deploy
DNS record create/update/delete
custom domain production mutation
tenant production migration
```

Preview QA, provisioning tenant và production release phải là ba workflow tách biệt.