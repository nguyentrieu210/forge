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

- PR `#49`, head `423af47b7e2bfb31c160934aa241716511449107`.
- `mergeable=true`, unresolved review threads `0`.
- Review score **97/100**, Critical **0**, High **0**.
- Required CI đều PASS.
- Ready for review, chưa merge.

## Manufacturing Slice C

- PR `#50`, head `df708fb13ae1a1e0538e8260a24a0251b0dff347`.
- Versioned BOM, immutable Work Order snapshot, partial production, scrap/offcut, concurrency và exact reversal đã triển khai.
- Review score **97/100**, Critical **0**, High **0**.
- Required CI đều PASS.
- Ready for review, chưa merge.

## Inventory Slice D

### Read model

- `server/packages/clouderp-erpnext/src/physical-stock-read-model.ts`.
- Đọc append-only ledger, không tạo parallel stock book.
- Tenant/company scope bắt buộc.
- Nhóm theo Item, warehouse, canonical physical identity, batch và serial.
- Filters cho warehouse role, inventory mode/profile, màu, tình trạng, đời, kích thước, batch và serial.
- Lineage tới voucher, revision, row và reversal source.
- Deterministic pagination, tối đa 500 output rows.
- Reconciliation quantity/value/physical count.

### Report service

- `server/packages/clouderp-erpnext/src/physical-stock-report-service.ts`.
- Server inject tenant; client không thể đổi tenant scope.
- Company, warehouse và warehouse-role scope.
- Lineage redaction, maximum row limit, export permission.
- CSV có UTF-8 BOM và chống spreadsheet formula injection.

### D1 ledger reader

- `server/packages/clouderp-erpnext/src/d1-physical-stock-ledger-reader.ts`.
- Parameterized tenant/company SQL trên `stock_ledger_entries` và authoritative documents.
- Ghép child-row/finished-good physical identity snapshots.
- Map source, target, finished và reversal ledger rows.
- Phân bổ physical count theo tỷ lệ qua split batch lines và bảo toàn tổng.
- Source scan bounded; malformed/scope-leaking data fail closed.

### Tests

- `server/tests/physical-stock-read-model.test.mjs`.
- `server/tests/physical-stock-report-service.test.mjs`.
- `server/tests/d1-physical-stock-ledger-reader.test.mjs`.
- Đã sửa module resolution theo root server build output `server/dist/packages/...`.

### CI gần nhất trước commit tài liệu

Code head `3dad8df70124b6b7e7e3c3bdd4aa4703c7148860`:

- PR Validation `30648351132`: PASS.
- CI `30648351212`: PASS.
- Inventory and Manufacturing CI `30648351150`: PASS.
- UI Pull Request Validation `30648351176`: đang chạy tại thời điểm cập nhật.

Final docs head cần chạy exact-head CI lại trước khi dùng làm merge evidence.

## Phần còn lại

1. Wire D1 reader + permission policy vào tenant report endpoint.
2. Physical stock explorer và lineage drill-down.
3. Quarantine/release view.
4. Work Order progress view.
5. WIP, shortage, variance, scrap/offcut, ageing và condition reports.
6. Runtime harness và Playwright desktop/mobile.
7. Read-only live audit, staging acceptance và load benchmark.
8. Merge/deploy chỉ theo approval riêng.

## Production và safety

- Không deploy Cloudflare.
- Không migration hoặc mutate tenant.
- Không sửa production secrets hoặc DNS.
- FIFO rollout vẫn disabled.
- Tenant Worker production hiện hành: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Gateway production hiện hành: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
