# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-gateway-ci-cd-20260731`.
- Draft PR: `#66` — `ci: reduce duplicate and irrelevant workflow runs`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

Đọc bắt buộc:

- `CURRENT_STATUS.md`;
- `NEXT_TASKS.md`;
- `docs/runbooks/AI_CI_CD_RUNBOOK.md`;
- `docs/runbooks/AI_RELEASE.md`.

## Mục tiêu nhánh

1. Giảm workflow trùng và run đỏ không liên quan.
2. Giữ validation tách biệt production release.
3. Gom domain CI và thu hẹp browser QA.
4. Dùng setup action chung thay cho lặp pnpm/Node/install.
5. Gateway build đúng một lần thành immutable Worker version.
6. Production Gateway release chỉ promote exact version đã xác minh.
7. Viết runbook để AI sau không tạo workflow hoặc deploy tùy tiện.

## Kiến trúc workflow trên nhánh

- `.github/workflows/pr-validation.yml`: router docs-only, test/typecheck/build, result job ổn định, không deploy.
- `.github/workflows/business-domain-ci.yml`: router Sales/Purchase/Inventory và focused tests.
- `.github/workflows/ui-pr-validation.yml`: frontend gate, Playwright và local auth smoke trong scope hẹp.
- `.github/workflows/gateway-release-candidate.yml`: manual-only, build/stage một lần, `wrangler versions upload`, sinh `release.json`, không chuyển traffic.
- `.github/workflows/gateway-production-release.yml`: manual-only, verify version, promote exact `version_id` lên 100%, smoke production, không build lại.
- `.github/workflows/tenant-production-release.yml`: manual-only, exact SHA, production environment, backup → migrate → deploy → smoke.
- `.github/workflows/purchase-completion-apply.yml`: workflow tạm của PR #63, phải xóa sau khi PR đó kết thúc.
- `.github/actions/setup-forge/action.yml`: setup pnpm 9.15, Node 22, cache và frozen install dùng chung.

## Workflow đã xóa trong PR #66

- `.github/workflows/ci.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/manual-release-alu.yml`.
- `.github/workflows/cloudflare-preview-qa.yml`.

## Release boundary

- Candidate upload không phải production deployment.
- Production Gateway deploy cần `target_sha`, `version_id` từ cùng `release.json` và confirmation `RELEASE_GATEWAY`.
- Tenant deploy cần confirmation `RELEASE_TENANT`.
- Không chạy bất kỳ release workflow nào nếu người dùng chưa yêu cầu deploy production rõ ràng.

## Safety

- Không deploy Cloudflare trong PR #66.
- Không migrate/mutate D1.
- Không sửa production secrets.
- Không bật FIFO.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
- Cloudflare Git Build đã được người dùng tắt.

## Verification còn chờ

1. Kiểm exact final HEAD của PR #66.
2. Xác minh GitHub tạo run cho `PR Validation`, `Business Domain CI` và UI QA theo scope.
3. Nếu workflow không parse hoặc không tạo run, kiểm YAML/config trước, không sửa code nghiệp vụ.
4. Xác minh branch protection required check names.
5. Giữ PR draft và không merge cho tới khi exact-head required checks PASS.
6. Không chạy Gateway candidate hoặc production release trong quá trình xác minh PR này.
