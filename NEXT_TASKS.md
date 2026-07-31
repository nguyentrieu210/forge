# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Verify PR #66 exact final HEAD

1. Lấy exact final HEAD của `chore/optimize-gateway-ci-cd-20260731`.
2. Kiểm các workflow mới:
   - `PR Validation`;
   - `Business Domain CI`;
   - `UI Pull Request Validation` nếu scope phù hợp.
3. Xác minh router/result jobs luôn trả kết quả rõ ràng khi focused/heavy job bị skip.
4. Đọc đúng failed step và log; không sửa code nếu job chưa checkout hoặc không có steps.
5. Kiểm branch protection required check names. Không merge nếu required check cũ bị mất hoặc treo Pending.
6. Giữ PR draft cho tới khi exact-head checks cần thiết PASS.

## P0 — Review workflow inventory

Workflow mục tiêu còn lại:

- `pr-validation.yml`.
- `business-domain-ci.yml`.
- `ui-pr-validation.yml`.
- `gateway-production-release.yml`.
- `tenant-production-release.yml`.
- `purchase-completion-apply.yml` tạm thời cho PR #63.

Đã xóa thêm trong checkpoint workflow-history cleanup:

- `manual-release-alu.yml` vì trùng đường Tenant release mới.
- `cloudflare-preview-qa.yml` vì workflow cũ mang Cloudflare token vào PR, deploy QA worker và trùng UI/browser QA.

Lưu ý sidebar Actions:

1. Tên workflow cũ có thể vẫn hiện vì historical runs dù file đã bị xóa.
2. `inventory-remote-*` là ví dụ đã được xóa từ commit `88885b0f03cc00754da771b10a6f85f71db5fce6`.
3. Không tạo lại workflow hoặc sửa code để xử lý tên lịch sử.
4. Chỉ xóa historical runs/disable workflow bằng GitHub UI/API khi người dùng yêu cầu thao tác quản trị riêng.

Sau khi PR #63 kết thúc:

1. Xác nhận không còn gate nào phụ thuộc `purchase-completion-apply.yml`.
2. Xóa workflow tạm.
3. Cập nhật runbook và status.

## P1 — Gateway immutable-version release

Checkpoint riêng sau cleanup:

1. CI build/stage Gateway frontend một lần.
2. Upload immutable Worker version và lưu target SHA + version ID.
3. Gateway production release chỉ promote exact version đã xác minh.
4. Không build frontend lần nữa trong release job.
5. Giữ smoke `/health`, `/`, guest boot và provider version evidence.
6. Không triển khai production nếu chưa có yêu cầu release rõ ràng.

## P1 — Tighten Business Domain routing

Sau một số PR thực tế:

1. Review file patterns bị false positive/false negative.
2. Thêm mapping có bằng chứng, không mở rộng thành toàn bộ `server/**` hoặc `client/**`.
3. Nếu focused test file naming không ổn định, tạo manifest/script test-domain trong repository thay vì thêm workflow mới.

## P1 — UI browser QA scope

- Theo dõi các PR backend không liên quan để đảm bảo Playwright không chạy.
- Theo dõi UI/auth PR để đảm bảo browser QA vẫn xuất hiện.
- Không đưa Chromium trở lại workflow deploy hoặc domain CI.

## Runbook bắt buộc

Mọi AI tiếp tục công việc phải đọc và làm theo:

- `AI_HANDOFF.md`.
- `CURRENT_STATUS.md`.
- `NEXT_TASKS.md`.
- `docs/runbooks/AI_CI_CD_RUNBOOK.md`.

Không tạo workflow mới nếu chưa chứng minh workflow hiện có không đáp ứng được và chưa ghi điều kiện xóa.

## Production safety

- Không deploy Cloudflare hoặc migrate D1 trong PR #66.
- Không sửa production secrets.
- FIFO rollout giữ **disabled**.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
