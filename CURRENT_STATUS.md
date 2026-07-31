# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.
- Stacked PR: `#50` — `feat(manufacturing): versioned BOM and immutable Work Order snapshot`.
- Base branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated evidence.

## Inventory Slice B

- PR `#49` exact head: `423af47b7e2bfb31c160934aa241716511449107`.
- GitHub reports `mergeable=true`.
- Review score: **97/100**; Critical **0**; High **0**.
- PR Validation, CI, Inventory and Manufacturing CI, Purchase Feature CI, Sales Feature CI và UI Pull Request Validation đều **PASS** trên exact head.
- PR `#49` đã chuyển khỏi draft và đang ready for review.
- Chưa merge vào default; merge và deployment vẫn cần yêu cầu rõ ràng.

## Manufacturing Slice C

### Phạm vi đã hoàn thành

- Versioned BOM revision/effective interval và Draft/Active/Retired lifecycle.
- Output/row UOM conversion và quantity-basis semantics.
- Deterministic BOM snapshot/checksum; overlap, circular và self-consumption guards.
- Immutable Work Order snapshot tại release.
- Append-only issue, consumption, production, scrap và offcut progress theo BOM row.
- Partial production và aggregate over-consumption/over-production guards.
- Company-wide inventory coordination kế thừa Slice B.
- Exact cancellation reversal và legacy Work Order compatibility.
- Không thêm migration; canonical document JSON và append-only projections vẫn là source of truth.

### Focused tests

- `server/tests/alumdoor-manufacturing-lifecycle.test.mjs`.
- `server/tests/manufacturing-issue-line-key.test.mjs`.
- `server/tests/manufacturing-legacy-rollout.test.mjs`.
- `server/tests/manufacturing-output-uom.test.mjs`.

### Review và đồng bộ

- Review: `server/docs/ALUMDOOR-MANUFACTURING-SLICE-C-REVIEW.md`.
- Score: **97/100**; Critical **0**; High **0**.
- Branch cũ diverged khỏi Slice B: ahead `34`, behind `22`.
- Đã dựng lại trên current Slice B bằng merge commit `41f0f88fad378eabdd3fb40ff54bb02643aabb84`.
- PR `#50` hiện `mergeable=true`, diff hiệu dụng 12 file.
- Exact-head CI đang chạy trên `41f0f88fad378eabdd3fb40ff54bb02643aabb84`.

## Phần còn lại

1. Chờ exact-head CI của PR #50 PASS và chuyển PR khỏi draft.
2. Sau khi Slice B merge, retarget/rebase Slice C lên default và chạy lại CI.
3. Slice D: physical-stock read model, operator UI và WIP/shortage/variance/offcut reports.
4. Read-only live Item/BOM audit và remediation plan.
5. Staging journey đầy đủ cho kho và sản xuất.
6. Benchmark contention/retry/latency của company-wide inventory coordination.
7. Merge/deploy production chỉ theo approval riêng.

## Production và safety

- Không deploy Cloudflare trong đợt này.
- Không migration hoặc mutate tenant.
- Không sửa production secrets hoặc DNS.
- FIFO rollout vẫn **disabled**.
- Tenant Worker production hiện hành: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Gateway production hiện hành: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
