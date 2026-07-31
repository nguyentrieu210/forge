# Forge CI/CD Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## 1. Bắt đầu bắt buộc

Trước mọi thay đổi:

1. Kết nối GitHub repository `nguyentrieu210/forge`.
2. Đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và runbook này.
3. Lấy default HEAD, working branch HEAD, PR base/head SHA và trạng thái CI hiện tại.
4. GitHub là nguồn sự thật; không dùng trạng thái chat cũ thay cho exact HEAD.
5. Không sửa default trực tiếp. Dùng branch và draft PR.

## 2. Kiến trúc workflow chuẩn

### PR Validation

- Check tổng quát cho pull request.
- Docs/release-only change dùng router nhẹ nhưng vẫn phải có result job.
- Code/config chạy test, typecheck và build.
- Không deploy, migrate, backup hoặc đọc production secrets.

### Business Domain CI

- Router Sales, Purchase, Inventory/Manufacturing và shared core.
- Chỉ chạy focused tests của domain bị ảnh hưởng.
- Không lặp full repository test/typecheck/build của PR Validation.

### UI Pull Request Validation

- Chỉ chạy khi thay đổi UI, auth/session hoặc browser fixtures.
- Playwright/Chromium không được đưa vào deploy workflow hoặc backend-only CI.

### Gateway Release Candidate

- Manual-only.
- Bắt buộc exact 40-character SHA và câu `BUILD_GATEWAY_CANDIDATE`.
- Build/stage frontend đúng một lần.
- Dùng `wrangler versions upload` để tạo immutable Worker version.
- Sinh `release.json` chứa target SHA, version ID, run ID và timestamp.
- Candidate upload không được chuyển production traffic.

### Gateway Production Release

- Manual-only và dùng GitHub environment `production`.
- Bắt buộc exact SHA, immutable version ID và câu `RELEASE_GATEWAY`.
- Verify version trước khi promote.
- Dùng `wrangler versions deploy <version_id>@100% -y`.
- Không build lại frontend.
- Smoke `/health`, `/`, unauthenticated boot và lưu provider evidence.

### Tenant Production Release

- Manual-only và dùng environment `production`.
- Bắt buộc tenant `alu`, exact SHA và câu `RELEASE_TENANT`.
- Trình tự: validate → checkout → backup dry/live → upload backup → migration dry/live → deploy dry/live → smoke → version evidence.
- FIFO giữ disabled trừ khi có approval kích hoạt riêng.

## 3. Quy tắc chống workflow thừa

Không tạo workflow mới nếu chưa trả lời được:

1. Workflow hiện có không thể đáp ứng điều gì?
2. Có lặp install/test/typecheck/build không?
3. Check name mới có ảnh hưởng branch protection không?
4. Điều kiện xóa workflow là gì?

Không được:

- tạo workflow riêng cho từng feature chỉ để chạy full repository gate;
- trộn validation với production release;
- dùng cả `ci.yml` và `pr-validation.yml` cho cùng bộ lệnh;
- dùng Playwright trong deploy;
- hard-code SHA hoặc PR number trong workflow release lâu dài;
- để workflow PR dùng Cloudflare token để deploy/quan sát production.

Workflow tạm phải ghi rõ PR/scope và điều kiện xóa trong `NEXT_TASKS.md`.

## 4. Phân loại trạng thái đỏ

### Code failure

Checkout và command thật đã chạy; test/typecheck/build trả lỗi. Sửa code hoặc test tương ứng.

### Workflow configuration failure

YAML/expression/action input/permission/job dependency sai. Sửa workflow, không đổ lỗi cho code nghiệp vụ.

### Pre-run hoặc infrastructure failure

Không có job, steps rỗng, không checkout hoặc không có log. Kiểm Actions settings, billing, policy và runner availability. Không tạo commit code vô nghĩa.

### Cancelled/superseded

Run cũ bị commit mới hủy bởi concurrency. Không coi là lỗi; chỉ exact final HEAD cần PASS.

### Scope-skipped

Focused job bị skip vì không liên quan. Result job phải PASS.

## 5. Quy trình sửa CI

1. Tạo draft PR riêng.
2. Giữ tên required check ổn định.
3. Validation dùng concurrency theo PR và `cancel-in-progress: true`.
4. Release dùng concurrency riêng và `cancel-in-progress: false`.
5. Sau mỗi thay đổi, đọc lại file từ GitHub và kiểm exact HEAD.
6. Đọc đúng failed step/log trước khi sửa tiếp.
7. Không merge khi required checks chưa PASS hoặc branch protection còn trỏ check đã xóa.

## 6. Safety

Không commit:

- `.env`, `.dev.vars`, token, key, cookie, session secret;
- `server/work/`, `tmp/`;
- backup SQL;
- generated reports/build output/browser evidence thô.

Không deploy Cloudflare, migrate D1, sửa production secrets hoặc bật rollout nếu người dùng chưa yêu cầu rõ.

## 7. Kết thúc đợt làm việc

Báo cáo bắt buộc:

- branch, PR và exact final HEAD;
- file thêm/sửa/xóa và lý do;
- workflow/run/job đã chạy và kết quả;
- test/typecheck/build thực sự đã chạy hay chưa;
- deploy/migration/secret/rollout có xảy ra hay không;
- lỗi còn lại và gate tiếp theo.

Cập nhật `AI_HANDOFF.md`, `CURRENT_STATUS.md` và `NEXT_TASKS.md` sau mỗi checkpoint.
