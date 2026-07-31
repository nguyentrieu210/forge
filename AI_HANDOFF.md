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

- Inventory Slice B PR `#49`: head `423af47b7e2bfb31c160934aa241716511449107`, required CI xanh, ready for review, chưa merge.
- Manufacturing Slice C PR `#50`: head `df708fb13ae1a1e0538e8260a24a0251b0dff347`, required CI xanh, ready for review, chưa merge.
- Inventory Slice D PR `#82`: draft, mergeable trên stack Slice C; exact final head phải lấy lại sau các commit tài liệu này.

## Slice D đã triển khai

### Authoritative read model

- `server/packages/clouderp-erpnext/src/physical-stock-read-model.ts`.
- Tổng hợp từ append-only stock ledger, không tạo stock book thứ hai.
- Nhóm theo tenant, company, Item, warehouse, physical identity, batch và serial.
- Filters cho warehouse role, inventory mode/profile, màu, tình trạng, đời, kích thước, batch và serial.
- Deterministic pagination, reconciliation quantity/value/physical count và lineage tới voucher/revision/row/reversal.

### Authenticated report boundary

- `server/packages/clouderp-erpnext/src/physical-stock-report-service.ts`.
- Tenant do server inject; company/warehouse/warehouse-role scope bắt buộc.
- Lineage redaction, row cap, export permission và CSV formula-injection protection.

### D1 ledger reader

- `server/packages/clouderp-erpnext/src/d1-physical-stock-ledger-reader.ts`.
- Bind tenant/company bằng SQL parameters.
- Đọc `stock_ledger_entries`, ghép document/child-row physical snapshots và nhận diện source/target/finished/reversal rows.
- Phân bổ physical count theo tỷ lệ qua split batch lines, giữ residual ở dòng cuối để bảo toàn tổng.
- Fail closed khi vượt source cap, sai tenant/company, JSON lỗi hoặc integer không an toàn.

### Regression

- `server/tests/physical-stock-read-model.test.mjs`.
- `server/tests/physical-stock-report-service.test.mjs`.
- `server/tests/d1-physical-stock-ledger-reader.test.mjs`.
- Test modules đọc đúng output của root server build tại `server/dist/packages/...`.

## CI gần nhất trước commit tài liệu

Code head `3dad8df70124b6b7e7e3c3bdd4aa4703c7148860`:

- PR Validation `30648351132`: PASS.
- CI `30648351212`: PASS.
- Inventory and Manufacturing CI `30648351150`: PASS.
- UI Pull Request Validation `30648351176`: đang chạy tại thời điểm cập nhật.

Các commit tài liệu tạo head mới; chỉ exact-head CI sau cùng được dùng làm merge evidence.

## Việc tiếp theo

1. Gắn D1 reader + access policy vào tenant report endpoint.
2. Thêm endpoint/list contract cho physical stock explorer và CSV export.
3. Xây physical stock explorer, lineage drill-down, quarantine/release và Work Order progress UI.
4. Thêm WIP, shortage, variance, scrap/offcut, ageing và condition reports.
5. Thêm runtime harness và Playwright desktop/mobile.
6. Không merge/deploy nếu chưa có yêu cầu rõ ràng.

## Safety

- Không deploy Cloudflare.
- Không migration hoặc mutate tenant.
- Không sửa production secrets/DNS.
- FIFO vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
