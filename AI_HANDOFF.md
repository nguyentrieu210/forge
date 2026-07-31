# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-ui-reports-slice-d-20260731`.
- Stacked PR: `#82` — `feat(inventory): add physical stock read model and Slice D foundation`.
- Base branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.
- GitHub là nguồn sự thật cho code, CI và trạng thái dự án.

## Stack hiện tại

- Inventory Slice B PR `#49`: exact head `423af47b7e2bfb31c160934aa241716511449107`, CI xanh, ready for review, chưa merge.
- Manufacturing Slice C PR `#50`: exact head `df708fb13ae1a1e0538e8260a24a0251b0dff347`, mergeable, draft, final-head CI đang chạy.
- Inventory Slice D PR `#82`: exact head trước handoff docs `cd1659a7b2ba176e81b3070e9f5614ae49391156`, draft.

## Slice D đã triển khai

- `server/packages/clouderp-erpnext/src/physical-stock-read-model.ts`.
- Read projection từ append-only ledger; không tạo stock book thứ hai.
- Nhóm theo tenant, company, Item, warehouse, canonical physical identity, batch và serial.
- Filters cho warehouse role, inventory mode/profile, màu, tình trạng, đời, batch và serial.
- Lineage tới voucher, revision, row và reversal source.
- Deterministic pagination, giới hạn tối đa 500 dòng.
- Reconciliation cho quantity, value và physical count.
- Focused tests: `server/tests/physical-stock-read-model.test.mjs`.
- Kickoff: `server/docs/ALUMDOOR-INVENTORY-SLICE-D-KICKOFF.md`.

## CI

Trên head `cd1659a7b2ba176e81b3070e9f5614ae49391156` đã xếp hàng:

- PR Validation `30646225458`.
- Inventory and Manufacturing CI `30646225377`.
- CI `30646225433`.
- UI Pull Request Validation `30646225452`.

Commit handoff này tạo final head mới; phải kiểm CI lại trên exact final head.

## Việc tiếp theo

1. Sửa mọi compile/test failure của read model trên exact head.
2. Wire read model vào tenant/report adapter với permission và data scope.
3. Thêm physical stock explorer và lineage drill-down.
4. Thêm quarantine/release và Work Order progress views.
5. Thêm WIP, shortage, variance, scrap/offcut, ageing và condition reports.
6. Thêm runtime harness và Playwright desktop/mobile.
7. Không merge/deploy nếu chưa có yêu cầu rõ ràng.

## Safety

- Không deploy Cloudflare.
- Không migration hoặc mutate tenant.
- Không sửa production secrets/DNS.
- FIFO vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
