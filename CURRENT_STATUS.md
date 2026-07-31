# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-ci-cd-stable-20260731`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

## Production hiện hành

- Gateway `cloudforge-gateway`: version đã ghi nhận gần nhất `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Tenant `cloudforge-tenant-alu`: phiên bản cần đọc lại từ release Purchase vừa hoàn tất trước khi báo production version mới nhất.
- Purchase lifecycle correction PR #63 đã merge thành `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Release preparation PR #70 merge thành `160ac81f28da3de6d96fc64741d257eccb0903a9`.
- Execution PR #72 đã đóng không merge sau controlled release.
- FIFO rollout vẫn **disabled**.
- Cloudflare Git Build đã được tắt.

## CI/CD cleanup

### Workflow chuẩn

1. `PR Validation`
   - PR-only.
   - Docs/release-only dùng router nhẹ.
   - Code/config chạy `pnpm test`, `pnpm typecheck`, `pnpm build`.
   - Không deploy.

2. `Business Domain CI`
   - Router Sales/Purchase/Inventory-Manufacturing.
   - Chạy focused tests theo domain.

3. `UI Pull Request Validation`
   - Giữ UI/auth/browser QA hiện hành.
   - Playwright không nằm trong deploy workflow.

4. `Gateway Release Candidate`
   - Manual-only.
   - Exact SHA + `BUILD_GATEWAY_CANDIDATE`.
   - Build/stage một lần, upload immutable version, sinh `release.json`.
   - Không chuyển production traffic.

5. `Gateway Production Release`
   - Manual-only, environment `production`.
   - Exact SHA + version ID + `RELEASE_GATEWAY`.
   - Verify/promote version, không build lại, smoke và provider evidence.

6. `Tenant Production Release`
   - Manual-only, environment `production`.
   - Tenant `alu`, exact SHA + `RELEASE_TENANT`.
   - Backup → migration dry/live → deploy dry/live → smoke → version evidence.

### Workflow đã xóa

- `ci.yml`.
- `manual-release-alu.yml`.
- `purchase-feature-ci.yml`.
- `sales-feature-ci.yml`.
- `inventory-feature-ci.yml`.
- `cloudflare-production-observation.yml`.
- `cloudflare-preview-qa.yml`.

### Runbook

- `docs/runbooks/AI_CI_CD_RUNBOOK.md`.
- `docs/runbooks/AI_RELEASE.md`.

## Verification

- Nhánh được tạo từ default `160ac81f28da3de6d96fc64741d257eccb0903a9` sau khi release execution PR #72 đóng.
- Cần mở draft PR, kiểm exact final HEAD, behind `0`, mergeability và Actions runs.
- Chưa được coi test/typecheck/build PASS cho nhánh này cho tới khi GitHub Actions chạy thật.
- Nếu không có steps/log, phân loại pre-run/configuration/infrastructure; không sửa code nghiệp vụ vô nghĩa.

## Functional smoke còn lại

- Sales price autofill bằng dữ liệu thử an toàn.
- Dialog child-table dropdown wheel sau hard refresh.
- Purchase/FIFO business smoke; FIFO activation vẫn cần staging backfill/checksum, `unresolved_count=0`, backup mới và explicit approval.

## Safety

- Không deploy Cloudflare trong nhánh CI/CD này.
- Không migrate/mutate D1.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
