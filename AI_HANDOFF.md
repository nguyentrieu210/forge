# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-ci-cd-stable-20260731`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Cloudflare Git Build đã được người dùng tắt.

## Đọc bắt buộc

1. `AI_HANDOFF.md`.
2. `CURRENT_STATUS.md`.
3. `NEXT_TASKS.md`.
4. `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
5. `docs/runbooks/AI_RELEASE.md`.

## Kiến trúc CI/CD trên nhánh

- `pr-validation.yml`: PR-only; docs-only router; code chạy test/typecheck/build; không deploy.
- `business-domain-ci.yml`: focused Sales/Purchase/Inventory-Manufacturing tests.
- `ui-pr-validation.yml`: UI/auth/browser QA; Playwright không nằm trong deploy.
- `.github/actions/setup-forge/action.yml`: setup pnpm/Node/cache/install dùng chung.
- `gateway-release-candidate.yml`: manual build/stage một lần, upload immutable Worker version, sinh `release.json`, không chuyển traffic.
- `gateway-production-release.yml`: manual verify/promote exact version, không build lại, smoke và provider evidence.
- `tenant-production-release.yml`: manual backup → migrate → deploy → smoke → version evidence.

## Workflow đã xóa

- `ci.yml`.
- `manual-release-alu.yml`.
- `purchase-feature-ci.yml`.
- `sales-feature-ci.yml`.
- `inventory-feature-ci.yml`.
- `cloudflare-production-observation.yml`.
- `cloudflare-preview-qa.yml`.

PR #63 đã merge; `purchase-completion-apply.yml` không còn tồn tại trên default.

## Safety

- Không deploy Cloudflare trong nhánh CI/CD này.
- Không chạy release candidate khi chưa có yêu cầu rõ.
- Không migrate/mutate D1.
- Không sửa production secrets.
- FIFO giữ **disabled**.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.

## Việc tiếp theo

1. Mở draft PR từ working branch vào default.
2. Kiểm branch behind `0`, mergeable và exact final HEAD.
3. Xác minh `PR Validation`, `Business Domain CI`, UI workflow phù hợp chạy thật.
4. Đọc đúng failed step/log; không sửa code khi job chưa chạy.
5. Kiểm branch protection không còn yêu cầu check đã xóa.
6. Không merge hoặc deploy khi người dùng chưa yêu cầu rõ.
