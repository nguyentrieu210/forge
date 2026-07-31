# Forge CI/CD Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## Bắt đầu bắt buộc

1. Kết nối GitHub repository `nguyentrieu210/forge`.
2. Đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và runbook này.
3. Lấy default HEAD, working branch HEAD, PR base/head SHA và CI trên exact HEAD.
4. GitHub là nguồn sự thật; không dùng trạng thái chat cũ thay cho dữ liệu hiện tại.
5. Không sửa default trực tiếp. Dùng branch và draft PR.

## Kiến trúc workflow chuẩn

### PR Validation

- Check tổng quát cho pull request.
- Docs/release-only dùng router nhẹ nhưng vẫn có result job.
- Code/config chạy test, typecheck và build.
- Không deploy, migrate, backup hoặc đọc production secrets.

### Business Domain CI

- Router Sales, Purchase, Inventory/Manufacturing và shared core.
- Chỉ chạy focused tests của domain bị ảnh hưởng.
- Không lặp full repository gate của PR Validation.

### UI Pull Request Validation

- Chỉ chạy cho UI, auth/session hoặc browser fixtures.
- Playwright/Chromium không nằm trong deploy workflow.

### Gateway Release Candidate

- Manual-only.
- Exact SHA + `BUILD_GATEWAY_CANDIDATE`.
- Build/stage frontend đúng một lần.
- `wrangler versions upload` tạo immutable version và `release.json`.
- Không chuyển production traffic.

### Gateway Production Release

- Manual-only, environment `production`.
- Exact SHA + version ID + `RELEASE_GATEWAY`.
- Verify rồi promote đúng immutable version.
- Không build lại frontend.
- Smoke `/health`, `/`, unauthenticated boot và lưu provider evidence.

### Tenant Production Release

- Manual-only, environment `production`.
- Tenant `alu`, exact SHA + `RELEASE_TENANT`.
- Backup dry/live → upload backup → migration dry/live → deploy dry/live → smoke → version evidence.
- FIFO giữ disabled trừ khi có approval riêng.

## Chống workflow thừa

Trước khi thêm workflow mới phải chứng minh:

1. Workflow hiện có không thể đáp ứng việc gì.
2. Job mới không lặp install/test/typecheck/build vô ích.
3. Check name mới không phá branch protection.
4. Có điều kiện xóa rõ ràng.

Không được trộn validation với production release, hard-code SHA lâu dài, dùng Playwright trong deploy hoặc dùng Cloudflare token trong PR workflow để deploy/quan sát production.

## Phân loại lỗi

- **Code failure:** checkout và command thật đã chạy; sửa code/test.
- **Workflow failure:** YAML, expression, permission hoặc action input sai; sửa workflow.
- **Pre-run/infrastructure:** không có step/log/checkout; kiểm Actions settings, billing, policy, runner. Không sửa code nghiệp vụ.
- **Cancelled:** run cũ bị commit mới thay thế; chỉ exact final HEAD cần PASS.
- **Scope-skipped:** focused job bị skip hợp lệ; result job phải PASS.

## Safety

Không commit `.env`, `.dev.vars`, token, key, cookie, `server/work/`, `tmp/`, backup SQL, build output hoặc evidence thô.

Không deploy Cloudflare, migrate D1, sửa production secrets hoặc bật rollout nếu người dùng chưa yêu cầu rõ.

## Handoff cuối đợt

Báo branch, PR, exact HEAD, file thay đổi, test/typecheck/build đã thực chạy, run/job ID, deploy/migration/secret/rollout và blocker còn lại. Cập nhật `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`.
