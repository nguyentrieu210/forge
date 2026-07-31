# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-gateway-ci-cd-20260731`.
- Draft PR: `#66` — `ci: reduce duplicate and irrelevant workflow runs`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## CI architecture trong PR #66

### Validation

1. `PR Validation`
   - docs-only router;
   - full test/typecheck/build cho code;
   - result job luôn xuất hiện;
   - không deploy.

2. `Business Domain CI`
   - router Sales/Purchase/Inventory-Manufacturing;
   - focused tests theo domain;
   - không lặp full repository gate.

3. `UI Pull Request Validation`
   - scope UI/auth/browser;
   - frontend lint/test/typecheck/build;
   - Playwright và local cookie-auth smoke;
   - không nằm trong deploy.

### Shared setup

- `.github/actions/setup-forge/action.yml` chuẩn hóa pnpm `9.15.0`, Node `22`, cache và frozen dependency install.
- PR, domain, UI, Gateway candidate/release và Tenant release dùng action chung sau checkout.

### Gateway immutable release

1. `Gateway Release Candidate`
   - manual-only;
   - exact SHA + confirmation `BUILD_GATEWAY_CANDIDATE`;
   - build/stage frontend một lần;
   - `wrangler versions upload`;
   - sinh `release.json` với target SHA và immutable version ID;
   - không chuyển production traffic.

2. `Gateway Production Release`
   - manual-only;
   - exact SHA + version ID + confirmation `RELEASE_GATEWAY`;
   - kiểm version bằng `wrangler versions view`;
   - promote exact version bằng `wrangler versions deploy <id>@100% -y`;
   - không build frontend;
   - smoke `/health`, `/`, guest boot;
   - upload provider evidence.

### Tenant release

- `Tenant Production Release` là manual-only.
- `environment: production` đã được chuyển về đúng cấp job.
- Exact SHA + confirmation `RELEASE_TENANT`.
- Backup → migration → deploy → smoke → provider evidence.

## Workflow đã xóa

- `.github/workflows/ci.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/manual-release-alu.yml`.
- `.github/workflows/cloudflare-preview-qa.yml`.

## Workflow tạm

- `.github/workflows/purchase-completion-apply.yml` còn phục vụ draft PR #63.
- Phải xóa khi PR #63 kết thúc hoặc gate được chuyển vào workflow chuẩn.

## Runbook

- `docs/runbooks/AI_CI_CD_RUNBOOK.md` quy định CI/CD chung.
- `docs/runbooks/AI_RELEASE.md` quy định candidate, production promotion, evidence và release authorization.

## Production

- Cloudflare Git Build đã được người dùng tắt.
- FIFO rollout: **disabled**.
- Không có Cloudflare deployment, D1 migration, production secret change hoặc rollout activation trong PR #66.

## Verification còn chờ

- Exact final HEAD phải có required CI chạy thật và PASS.
- Chưa chạy Gateway candidate workflow.
- Chưa chạy Gateway/Tenant production release.
- Phải kiểm branch protection required check names trước merge.
