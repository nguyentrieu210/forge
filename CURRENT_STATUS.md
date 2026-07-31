# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi đồng bộ branch sửa CI: `04c33c0193815196bd6f10492be77fe64d175bbe`.
- Working branch: `ci/stop-duplicate-builds-20260801`.
- Canonical queue: `EPIC_STATUS.md`.

## Trạng thái tổng thể

- Toàn hệ thống chưa đạt end-to-end acceptance.
- Nghiệp vụ đang tạm dừng để sửa đường CI bị chạy lặp.
- PR #103, #107 và #119 đã đóng; không dùng làm nguồn merge.
- PR #122 docs cũ bị supersede bởi đợt sửa CI này.

## Root cause CI

- `CI` chạy trên mọi push và pull request, tạo hai lượt cho cùng một commit feature.
- `PR Validation` lặp toàn bộ `pnpm test`, `pnpm typecheck`, `pnpm build`.
- Sales/Purchase/Inventory dùng `server/**` và `client/**`, nên hầu hết code PR kích cả ba workflow.
- UI validation cũng dùng `server/**`, vì vậy nhiều thay đổi backend vẫn cài Chromium và chạy browser QA.
- Production observation trigger trên mọi PR rồi tự skip.
- One-shot workflow tự cherry-pick, amend và force-push làm head đổi giữa lúc CI chạy.

## Thay đổi trên branch hiện tại

| File | Thay đổi |
|---|---|
| `.github/workflows/ci.yml` | Chỉ push default + PR vào default; docs-only fast path; bỏ release job cũ khỏi CI |
| `.github/workflows/pr-validation.yml` | Policy gate nhẹ; bỏ duplicate build/test và bỏ deploy khỏi PR validation |
| `.github/workflows/sales-feature-ci.yml` | Focused Sales scope và ba regression chính |
| `.github/workflows/purchase-feature-ci.yml` | Focused Purchase scope, Purchase tests và SQL safeguards |
| `.github/workflows/inventory-feature-ci.yml` | Focused Inventory/Manufacturing scope, catalog/item regression và brief audit |
| `.github/workflows/ui-pr-validation.yml` | UI/browser/auth chỉ chạy khi đúng phạm vi |
| `.github/workflows/cloudflare-production-observation.yml` | Không còn tạo run trên mọi PR |
| `.github/workflows/sync-sales-production-clean-once.yml` | Đã xóa |
| `server/scripts/.sync-sales-production-trigger` | Đã xóa |

## Mô hình CI sau khi merge

### Docs-only PR

- `CI`: fast path, không cài dependency.
- `PR Validation`: policy check nhẹ.
- Feature/UI check: fast path nếu branch protection yêu cầu tên check.
- Không build, không browser QA, không production observation.

### Code PR

- Một `CI` duy nhất chạy full test + typecheck + build.
- Chỉ feature workflow liên quan chạy focused regression.
- UI workflow chỉ chạy browser/auth khi thay đổi liên quan.
- Push mới cùng PR hủy run cũ bằng `cancel-in-progress`.

### Sau merge

- Dedicated release workflow quyết định release theo path/exact SHA.
- CI và PR validation không deploy production.

## Hàng đợi nghiệp vụ

1. Sales-to-Production — `BLOCKED / CLEAN REBUILD`.
2. Purchase authenticated QA — `QUEUED / CLEAN REBUILD`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

## Gate merge cho CI cleanup

- Branch phải ahead current default và behind 0.
- Workflow YAML phải được GitHub nhận và exact-head checks phải kết thúc.
- Final diff chỉ gồm workflow + handoff docs + xóa transport files.
- Không có application source, production secret, DNS, migration hoặc customer data change.

## Safety

- Không deploy Cloudflare trong đợt này.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không mutate tenant data.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
