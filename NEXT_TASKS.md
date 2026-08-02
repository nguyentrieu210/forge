# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## VN Accounting Period Integrity Hardening

- Canonical branch: `fix/vn-accounting-period-integrity-20260803-r8`, clean-based on current `main@560c7cfc140f04e5ca555c87dfa31541c8867ec1`.
- Migration mới: `0042_vn_accounting_period_hardening.sql`; không dùng lại số `0039-0041` đã thuộc HRM.
- Regression riêng: `server/scripts/test-vn-accounting-period-hardening.py`, replay `0035+0039+0040+0041+0042` và kiểm tra Hard/Soft lock, cancel, scope move, tenant isolation, period overlap/range và expanded posting doctypes.
- Targeted SQLite regression của logic `0042` đã PASS trong session; còn cần chạy exact regression script trên full checkout cùng Python syntax và relevant backend/typecheck/lint/build theo blast radius trước PR/merge.
- Không production migration/deploy khi chưa có verification đầy đủ.

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
