# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-ci-cd-v2-20260731`.
- Draft PR: `#69` — `ci: finalize streamlined immutable release workflow`.
- PR #66 đã đóng không merge vì diverged/conflict; #69 được tạo từ default HEAD mới nhất.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

## Production hiện hành

- Tenant Worker `cloudforge-tenant-alu`: version `7542bba4-dc20-4794-8c92-9d26af349531`.
- Gateway `cloudforge-gateway`: version `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- FIFO rollout: **disabled**.
- Cloudflare Git Build đã được người dùng tắt để tránh build/deploy song song.
- PR #69 không deploy Gateway/Tenant, không migrate D1 và không sửa production secrets.

## CI/CD cleanup trong PR #69

### Workflow chuẩn

1. `PR Validation`
   - PR-only.
   - Docs/release-only change dùng scope/result nhẹ.
   - Code/config chạy `pnpm test`, `pnpm typecheck`, `pnpm build`.
   - Không deploy.

2. `Business Domain CI`
   - Router Sales/Purchase/Inventory-Manufacturing.
   - Focused server tests theo domain.
   - Không lặp full repository gate.

3. `UI Pull Request Validation`
   - Giữ browser/UI/auth QA hiện hành.
   - Playwright không nằm trong deploy workflow.

4. `Gateway Release Candidate`
   - Manual-only.
   - Exact SHA + `BUILD_GATEWAY_CANDIDATE`.
   - Build/stage một lần.
   - `wrangler versions upload` tạo immutable version và `release.json`.
   - Không chuyển traffic production.

5. `Gateway Production Release`
   - Manual-only, environment `production`.
   - Exact SHA + version ID + `RELEASE_GATEWAY`.
   - Verify version rồi promote 100%.
   - Không build lại.
   - Smoke `/health`, `/`, guest boot và lưu provider evidence.

6. `Tenant Production Release`
   - Manual-only, environment `production`.
   - Tenant `alu`, exact SHA + `RELEASE_TENANT`.
   - Backup → migration dry/live → deploy dry/live → smoke → version evidence.

7. `purchase-completion-apply.yml`
   - Workflow tạm còn phục vụ PR #63.
   - Xóa sau khi PR #63 kết thúc.

### Setup dùng chung

- `.github/actions/setup-forge/action.yml` chuẩn hóa pnpm 9.15.0, Node 22, cache và frozen install.

### Workflow đã xóa

- `.github/workflows/ci.yml`.
- `.github/workflows/manual-release-alu.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/cloudflare-preview-qa.yml`.

Lý do: chạy trùng full gate, hard-code SHA, trộn validation với release hoặc mang production observation/token vào PR workflow.

## Runbook

- `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
- `docs/runbooks/AI_RELEASE.md`.

Các runbook quy định exact-head verification, workflow ownership, failure classification, candidate/promote boundary, explicit release authorization, evidence và safety.

## CI verification

- PR #69 đang open, draft và mergeable.
- Exact final HEAD phải lấy lại sau commit tài liệu cuối.
- GitHub connector chưa trả workflow run/status cho các head đã kiểm tra.
- Chưa được coi test/typecheck/build PASS.
- Nếu Actions không tạo run hoặc job không có steps/log, phân loại là pre-run/configuration/infrastructure blocker; không sửa code nghiệp vụ vô nghĩa.
- Phải kiểm branch protection required check names trước merge, đặc biệt các check cũ từ workflow đã xóa.

## Functional production verification còn lại

- Sales price autofill: cần smoke có đăng nhập bằng dữ liệu thử an toàn.
- Dialog child-table dropdown wheel: cần smoke production sau hard refresh.
- Purchase/FIFO UI: chưa có browser evidence production đầy đủ; FIFO vẫn disabled.

## Safety

- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không thay DNS, sửa production secrets hoặc bật FIFO trong PR #69.
