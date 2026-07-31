# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-gateway-ci-cd-20260731`.
- Draft PR: `#66` — `ci: reduce duplicate and irrelevant workflow runs`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.

## CI/CD cleanup trong PR #66

### Mục tiêu

- Giảm số workflow trùng.
- Không chạy full test/typecheck/build cho mọi domain cùng lúc.
- Không để validation chứa production release.
- Giữ check kết quả rõ ràng khi job nặng được skip theo scope.

### Workflow chuẩn sau cleanup

1. `PR Validation`
   - Router docs-only.
   - Full test, typecheck và build cho code/config changes.
   - Result job luôn xuất hiện.
   - Không deploy.

2. `Business Domain CI`
   - Router Sales, Purchase, Inventory/Manufacturing và shared changes.
   - Cài dependency một lần.
   - Chạy focused tests theo domain.
   - Result job luôn xuất hiện.

3. `UI Pull Request Validation`
   - Chỉ chạy cho client, Gateway/Tenant browser/auth code, migration/seed và dependency changes.
   - Chạy frontend lint/test/typecheck/build, Playwright browser QA và local cookie-auth smoke.
   - Không lặp full server repository test.

4. `Gateway Production Release`
   - Release Gateway riêng.
   - Chưa đổi sang immutable-version promotion trong checkpoint này.

5. `Tenant Production Release`
   - Manual-only.
   - Bắt buộc tenant, exact 40-character SHA và confirmation phrase.
   - Backup → migration → deploy → smoke → provider version evidence.

### Workflow đã xóa

- `.github/workflows/ci.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/manual-release-alu.yml` vì đã được thay bằng `tenant-production-release.yml` manual-only có exact SHA và confirmation.
- `.github/workflows/cloudflare-preview-qa.yml` vì workflow cũ vừa quan sát production vừa mang Cloudflare token vào PR workflow, trùng UI QA và không phù hợp boundary validation/release.

### Sidebar Actions và workflow lịch sử

- GitHub có thể tiếp tục hiện tên workflow cũ trong sidebar do còn historical runs, ngay cả khi file workflow đã bị xóa.
- Ví dụ `inventory-remote-*` đã được xóa từ commit lịch sử `88885b0f03cc00754da771b10a6f85f71db5fce6` nhưng vẫn có thể xuất hiện trong danh sách.
- Không được tạo lại hoặc sửa code chỉ để làm biến mất tên lịch sử.
- Sau khi PR #66 merge, workflow không còn file trên default sẽ không được kích hoạt bởi event mới.
- Nếu cần làm sạch giao diện hoàn toàn, phải xóa historical workflow runs hoặc disable workflow trong GitHub Actions UI/API như một thao tác quản trị riêng; việc này không thay đổi code và không nằm trong PR #66.

### Workflow tạm còn giữ

- `.github/workflows/purchase-completion-apply.yml` còn phục vụ draft PR #63.
- Phải xóa sau khi PR #63 hoàn tất hoặc gate được chuyển vào workflow chuẩn.

## Runbook

- `docs/runbooks/AI_CI_CD_RUNBOOK.md` là quy trình bắt buộc cho AI/kỹ sư làm CI/CD và release.
- Runbook quy định source of truth, exact-head validation, workflow ownership, scope routing, failure classification, release authorization, artifact/secret safety và checklist handoff.

## Production hiện hành

- Gateway production version đã ghi nhận gần nhất: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Tenant `cloudforge-tenant-alu` version đã ghi nhận gần nhất: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- FIFO rollout: **disabled**.
- Cloudflare Git Build đã được người dùng tắt trong dashboard để tránh build/deploy song song.

## Safety checkpoint

- Không deploy Cloudflare trong PR #66.
- Không migrate/mutate D1.
- Không sửa production secrets.
- Không bật FIFO.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Verification còn chờ

- Exact final HEAD CI của PR #66 phải chạy thật và PASS.
- Nếu Actions không tạo run hoặc job không có steps/log, phân loại là pre-run/infrastructure; không sửa code vô nghĩa.
- Phải kiểm branch protection required check names trước merge.
