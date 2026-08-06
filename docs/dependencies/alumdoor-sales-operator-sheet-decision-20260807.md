# Alumdoor Sales — operator sheet decision 2026-08-07

Status: APPROVED BY OWNER

## Operator UI

- Sales is an operator sheet, not an accounting form.
- Remove `Phụ thu`, `Tài khoản VAT`, `Tài khoản phụ thu`, and the heading `Các dòng hàng`.
- VAT is edited only in the totals block: Tạm tính → Chiết khấu → Sau chiết khấu → VAT (%) → Tiền VAT → Tổng thanh toán.
- Commercial Sales Order VAT may be stored without Chart of Accounts. Accounting remains a later optional concern; Sales Invoice / ledger posting still requires accounting master data.

## Price-list projection

The Sales Sheet recognizes three operator customer types independently:

- `Đại lý` → matching Đại lý Price List.
- `Bán lẻ` → matching Bán lẻ Price List.
- `Nhà thầu` → matching Nhà thầu Price List.

There is no silent fallback to `Giá niêm yết`. Missing list or item price fails visibly instead of substituting another commercial segment.

`Nhà thầu` is not collapsed into `Bán lẻ` for pricing. Until Cutting Policy owns a third measurement-policy segment, Nhà thầu uses the retail (`Lẻ`) geometry policy only for formula resolution; the commercial customer group remains `Nhà thầu`.

## Measurement columns

The sheet declares explicit semantic columns and projects only those needed by at least one current order line:

- LOẠI RAY
- CAO LỌT LÒNG
- CAO PB
- CAO LƯỚI
- RỘNG LỌT LÒNG
- RỘNG PB RAY
- RỘNG PB NHỰA
- RỘNG CẮT LÁ
- DT
- SỐ LÁ

Mixed-door orders may therefore show several width/height columns at once. A row that does not use a visible column stays blank. Customer-input basis cells are editable; derived production outputs are read-only.

`Hàng thường` is quantity-only before any catalogue-name heuristic. Quantity accessories such as bình lưu điện, motor, bộ tự dừng, con lăn and puly do not require color or geometry unless a future domain declaration explicitly says otherwise.

## Authority

- Cutting Policy / Alumdoor worker remains geometry authority.
- Item Price / selected Price List remains price authority.
- UI never reimplements door formulas.
- Sales Order persists commercial totals and existing formula snapshots.
- Accounting documents remain responsible for ledger-account validation.
