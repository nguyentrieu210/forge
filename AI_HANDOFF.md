# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/optimize-gateway-ci-cd-20260731`.
- Draft PR: `#66` — `ci: reduce duplicate and irrelevant workflow runs`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Đọc bắt buộc: `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `docs/runbooks/AI_CI_CD_RUNBOOK.md`.

## Mục tiêu nhánh

1. Giảm workflow trùng và run đỏ không liên quan.
2. Giữ `PR Validation` là check tổng quát ổn định.
3. Gom Sales/Purchase/Inventory thành `Business Domain CI` focused.
4. Giới hạn UI browser QA vào UI/auth/browser scope.
5. Tách production release khỏi validation.
6. Viết runbook để AI sau không tạo workflow hoặc deploy tùy tiện.

## Kiến trúc workflow trên nhánh

- `.github/workflows/pr-validation.yml`: test, typecheck, build; docs-only dùng router/result nhẹ; không deploy.
- `.github/workflows/business-domain-ci.yml`: router Sales/Purchase/Inventory và focused server tests; không lặp full repository gate.
- `.github/workflows/ui-pr-validation.yml`: frontend gate, Playwright browser QA và local auth smoke; scope hẹp.
- `.github/workflows/gateway-production-release.yml`: Gateway production release riêng; chưa tối ưu immutable version trong checkpoint này.
- `.github/workflows/tenant-production-release.yml`: manual-only, exact SHA, confirmation phrase, backup → migrate → deploy → smoke → provider evidence.
- `.github/workflows/purchase-completion-apply.yml`: workflow tạm của PR #63; giữ cho tới khi PR #63 kết thúc rồi xóa.

## Workflow đã xóa trong PR #66

- `.github/workflows/ci.yml`.
- `.github/workflows/purchase-feature-ci.yml`.
- `.github/workflows/sales-feature-ci.yml`.
- `.github/workflows/inventory-feature-ci.yml`.
- `.github/workflows/cloudflare-production-observation.yml`.
- `.github/workflows/manual-release-alu.yml`.
- `.github/workflows/cloudflare-preview-qa.yml`.

Lý do: trùng full test/typecheck/build, trộn validation với release, lặp smoke đã có trong release workflow hoặc mang Cloudflare deployment/token vào PR validation.

## GitHub Actions sidebar

- Sidebar có thể vẫn hiển thị workflow đã bị xóa vì historical runs còn tồn tại.
- Không suy ra file còn tồn tại chỉ từ sidebar.
- `inventory-remote-*` đã được xóa từ commit `88885b0f03cc00754da771b10a6f85f71db5fce6` nhưng vẫn có thể hiện trong lịch sử.
- Chỉ xóa historical runs hoặc disable workflow bằng GitHub UI/API khi người dùng yêu cầu thao tác quản trị riêng.

## Safety

- Không deploy Cloudflare trong PR #66.
- Không migrate/mutate D1.
- Không sửa production secrets.
- Không bật FIFO.
- Không commit `.env`, `.dev.vars`, `server/work/`, `tmp/`, backup hoặc generated artifacts.
- Cloudflare Git Build đã được người dùng tắt trong dashboard.

## Việc tiếp theo

1. Kiểm CI trên exact final HEAD của PR #66.
2. Đọc log thật nếu workflow fail; không sửa code cho lỗi pre-run.
3. Xác minh branch protection dùng check name phù hợp, ưu tiên `PR Validation Result` hoặc giữ compatibility theo cấu hình thực tế.
4. Khi CI xanh, cập nhật PR body và báo sẵn sàng review; không merge khi chưa có yêu cầu rõ.
5. Sau PR #63, xóa `purchase-completion-apply.yml` nếu không còn gate sử dụng.
6. Checkpoint sau có thể tối ưu Gateway thành build/upload immutable Worker version rồi release chỉ promote version.
