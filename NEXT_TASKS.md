# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## VN Accounting 100/100 technical closure

- Working branch: `feat/accounting-100-hardening-20260803`.
- Period baseline `0042` đã merge qua PR #266. Branch hiện thêm migrations `0043-0047` cho legal-entity ledger scope, Payment Allocation period lock, policy/legal/tax immutability, TT99 mapping, reconciliation, one-source period control, stock/GL parity và company/base-currency guards.
- Chạy exact acceptance `test-vn-accounting-period-hardening.py` + `test-vn-accounting-integrity-closure.py`, accounting unit/query regressions, relevant typecheck/build trên exact final head. DNS của shell hiện chưa resolve GitHub nên chưa có execution evidence; không tự ghi PASS.
- Kiểm final runtime registration: Material Receipt/Issue phải đi qua `AccountingStockEntryController` từ final `RolloutManufacturingStockEntryController`; Purchase Receipt/Journal/Delivery Note dùng accounting-aware controller tương ứng.
- `Accounting Integrity Exceptions` phải trả 0 CRITICAL trên staging/live read-only audit trước production migration.
- Statutory go-live là gate riêng: policy/regime, VAT/CIT/PIT/insurance ruleset, TT99 mapping, official-source hashes/test vectors, e-invoice provider, chữ ký số và người phê duyệt thực tế.
- Chỉ merge/deploy/migrate production sau lệnh riêng và CRITICAL evidence đầy đủ.

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
