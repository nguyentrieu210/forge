# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## UI deploy

- Xác nhận một UI push thực tế đi hết build -> stage -> Wrangler deploy -> `/health` -> `/release.json` đúng SHA/hash.
- Ghi duration thực tế của fast path và nguyên nhân nếu còn fail.

## HRM statutory payroll rule evaluator

- `VN Payroll Rule.formula_json` hiện là versioned/audited evidence, chưa execute PIT/BHXH hoặc công thức pháp lý Việt Nam.
- Nếu triển khai statutory automation cần formula schema explicit, fixed-point/rounding semantics, effective-date/version selection, official legal source, approval lifecycle và regression theo từng version pháp lý.

## Bulk Transaction

1. Stock Reconciliation Bulk Transaction.
2. BOM parent + child/version Bulk Transaction.
3. First-class AppAction input-table contract.
4. Batch Print / QR label queue.

## Other active priorities

- P1 Daily Detailed Ledger exact-state review.
- Plastic ERP waves sau P0-A.
- End-to-end closure Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty.
