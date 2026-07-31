# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Verify PR #66 exact final HEAD

1. Lấy exact final HEAD của `chore/optimize-gateway-ci-cd-20260731`.
2. Kiểm các workflow PR:
   - `PR Validation`;
   - `Business Domain CI`;
   - `UI Pull Request Validation` khi scope phù hợp.
3. Xác minh local composite action `.github/actions/setup-forge/action.yml` được resolve sau checkout.
4. Xác minh router/result jobs trả kết quả rõ ràng khi focused/heavy job bị skip.
5. Đọc đúng failed step và log; không sửa code nghiệp vụ nếu workflow chưa parse hoặc job chưa checkout.
6. Kiểm branch protection required check names.
7. Giữ PR draft và không merge cho tới khi exact-head checks cần thiết PASS.

## P0 — Static review release workflows

Không chạy release trong bước này.

Review bắt buộc:

1. `gateway-release-candidate.yml`
   - exact SHA validation;
   - build/stage một lần;
   - Wrangler output type `version-upload`;
   - `release.json` có target SHA/version ID.
2. `gateway-production-release.yml`
   - manual-only;
   - production environment;
   - không có build command;
   - `versions view` trước promote;
   - `versions deploy <id>@100% -y`;
   - smoke và provider evidence.
3. `tenant-production-release.yml`
   - `environment: production` nằm đúng cấp job;
   - backup/migration/deploy/smoke không đổi thứ tự.
4. Không chạy candidate hoặc production release khi chưa có yêu cầu phát hành rõ ràng.

## P0 — Workflow inventory mục tiêu

Workflow lâu dài:

- `pr-validation.yml`;
- `business-domain-ci.yml`;
- `ui-pr-validation.yml`;
- `gateway-release-candidate.yml`;
- `gateway-production-release.yml`;
- `tenant-production-release.yml`.

Workflow tạm:

- `purchase-completion-apply.yml` cho PR #63.

Sau khi PR #63 kết thúc:

1. Xác nhận không còn gate phụ thuộc workflow tạm.
2. Xóa workflow.
3. Cập nhật runbook/status.

## P1 — Release manifest validation

Sau khi PR #66 merge và CI xanh:

1. Thêm script schema validation cho `release.json` nếu cần automation mạnh hơn.
2. Candidate và production release phải dùng cùng target SHA/version ID.
3. Không tự chọn version gần nhất từ Cloudflare.
4. Không commit release artifact vào repository.

## P1 — Rollback workflow

Chỉ thiết kế sau khi immutable promotion được xác minh:

1. Manual-only.
2. Exact known-good version ID.
3. Confirmation phrase riêng.
4. Provider verification trước promote.
5. Smoke và evidence sau rollback.
6. Không tạo rollback workflow trước khi có yêu cầu và review rõ ràng.

## P1 — Routing calibration

- Theo dõi false positive/false negative của Business Domain router.
- Không mở rộng trở lại toàn bộ `server/**` hoặc `client/**` nếu chưa có bằng chứng.
- Theo dõi backend-only PR để bảo đảm Playwright không chạy.

## Runbook bắt buộc

Mọi AI tiếp tục công việc phải đọc:

- `AI_HANDOFF.md`;
- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `docs/runbooks/AI_CI_CD_RUNBOOK.md`;
- `docs/runbooks/AI_RELEASE.md`.

## Production safety

- Không deploy Cloudflare hoặc migrate D1 trong PR #66.
- Không sửa production secrets.
- FIFO rollout giữ **disabled**.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
