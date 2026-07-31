# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-ci-cd-v2-20260731`.
- Draft PR: `#69` — `ci: finalize streamlined immutable release workflow`.
- PR #66 đã đóng, không merge; #69 là nhánh thay thế được tạo từ default HEAD mới nhất.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

## Đọc bắt buộc trước khi tiếp tục

1. `AI_HANDOFF.md`.
2. `CURRENT_STATUS.md`.
3. `NEXT_TASKS.md`.
4. `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
5. `docs/runbooks/AI_RELEASE.md`.

## Kiến trúc CI/CD trên PR #69

- `.github/workflows/pr-validation.yml`
  - PR-only validation;
  - docs/release-only change dùng router nhẹ;
  - code/config chạy `pnpm test`, `pnpm typecheck`, `pnpm build`;
  - không deploy.
- `.github/workflows/business-domain-ci.yml`
  - router Sales/Purchase/Inventory-Manufacturing;
  - chạy focused server tests;
  - không lặp full repository gate.
- `.github/actions/setup-forge/action.yml`
  - pnpm 9.15.0, Node 22, cache và frozen install dùng chung.
- `.github/workflows/gateway-release-candidate.yml`
  - manual-only;
  - exact SHA + `BUILD_GATEWAY_CANDIDATE`;
  - build/stage một lần;
  - `wrangler versions upload`;
  - sinh `release.json` có immutable version ID;
  - không chuyển production traffic.
- `.github/workflows/gateway-production-release.yml`
  - manual-only;
  - exact SHA + version ID + `RELEASE_GATEWAY`;
  - verify version rồi promote 100%;
  - không build lại;
  - smoke `/health`, `/`, guest boot và lưu provider evidence.
- `.github/workflows/tenant-production-release.yml`
  - manual-only;
  - tenant `alu`, exact SHA + `RELEASE_TENANT`;
  - backup → migration dry/live → deploy dry/live → smoke → version evidence.
- `.github/workflows/ui-pr-validation.yml`
  - browser/UI/auth QA hiện hành;
  - không đưa Playwright vào deploy workflow.
- `.github/workflows/purchase-completion-apply.yml`
  - workflow tạm cho PR #63;
  - xóa sau khi PR #63 kết thúc.

## Workflow đã xóa trong PR #69

- `.github/workflows/ci.yml`.
- `.github/workflows/manual-release-alu.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/cloudflare-preview-qa.yml`.

## Trạng thái kiểm tra

- PR #69 đang open, draft và mergeable.
- Exact head gần nhất phải lấy lại từ GitHub trước khi kết luận.
- Connector chưa trả workflow run/status cho các head đã kiểm tra; không được coi CI PASS.
- Nếu job không xuất hiện hoặc không có steps/log, phân loại là Actions pre-run/configuration/infrastructure blocker; không sửa code nghiệp vụ vô nghĩa.

## Safety

- Không deploy Cloudflare trong PR #69.
- Không chạy Gateway Release Candidate nếu chưa có yêu cầu rõ.
- Không migrate/mutate D1.
- Không sửa production secrets.
- FIFO rollout giữ **disabled**.
- Cloudflare Git Build đã được người dùng tắt.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.

## Việc tiếp theo

1. Hoàn thiện runbook/status/tasks.
2. Kiểm exact final HEAD và merge commit SHA của PR #69.
3. Xác minh Actions tạo `PR Validation`; đọc đúng job/log.
4. Xác minh branch protection required check names.
5. Chỉ chuyển PR khỏi draft khi required checks PASS trên exact final HEAD.
6. Không merge hoặc deploy nếu người dùng chưa yêu cầu rõ hành động đó.
