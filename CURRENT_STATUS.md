# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-ui-reports-slice-d-20260731`.
- Stacked PR: `#82` — `feat(inventory): add physical stock read model and Slice D foundation`.
- Base branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp`, backup SQL hoặc generated evidence.

## Inventory Slice B

- PR `#49` exact head `423af47b7e2bfb31c160934aa241716511449107`.
- `mergeable=true`, unresolved review threads `0`.
- Review score **97/100**, Critical **0**, High **0**.
- Required CI đều PASS.
- PR đã ready for review nhưng chưa merge.

## Manufacturing Slice C

- PR `#50` exact head `df708fb13ae1a1e0538e8260a24a0251b0dff347`.
- Versioned BOM, immutable Work Order snapshot, partial production, scrap/offcut, concurrency và exact reversal đã triển khai.
- Review score **97/100**, Critical **0**, High **0**.
- PR mergeable, giữ draft trong lúc final-head CI chạy.

## Inventory Slice D

### First checkpoint

- Read model: `server/packages/clouderp-erpnext/src/physical-stock-read-model.ts`.
- Export qua `server/packages/clouderp-erpnext/src/index.ts`.
- Regression: `server/tests/physical-stock-read-model.test.mjs`.
- Kickoff: `server/docs/ALUMDOOR-INVENTORY-SLICE-D-KICKOFF.md`.

### Contract

- Chỉ đọc từ authoritative append-only ledger.
- Không tạo parallel stock book.
- Bắt buộc tenant/company scope.
- Nhóm theo Item, warehouse, canonical physical identity, batch và serial.
- Filters cho warehouse role, inventory mode/profile, màu, tình trạng, đời, batch và serial.
- Lineage tới voucher, revision, row và reversal source.
- Deterministic pagination, tối đa 500 dòng.
- Reconciliation quantity/value/physical count.

### CI

Trên head trước handoff docs `cd1659a7b2ba176e81b3070e9f5614ae49391156`:

- PR Validation `30646225458`: queued.
- Inventory and Manufacturing CI `30646225377`: queued.
- CI `30646225433`: queued.
- UI Pull Request Validation `30646225452`: queued.

Final head thay đổi sau khi cập nhật tài liệu; chỉ CI của exact final head được dùng làm evidence.

## Phần còn lại

1. Sửa compile/test failures nếu CI phát hiện.
2. Tenant/report adapter, permission và data scope.
3. Physical stock explorer và lineage drill-down.
4. Quarantine/release view.
5. Work Order progress view.
6. WIP, shortage, variance, scrap/offcut, ageing và condition reports.
7. Runtime harness và Playwright desktop/mobile.
8. Read-only live audit, staging acceptance và load benchmark.
9. Merge/deploy chỉ theo approval riêng.

## Production và safety

- Không deploy Cloudflare.
- Không migration hoặc mutate tenant.
- Không sửa production secrets hoặc DNS.
- FIFO rollout vẫn disabled.
- Tenant Worker production hiện hành: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Gateway production hiện hành: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
