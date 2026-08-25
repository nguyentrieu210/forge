# API Contract v1 — Alumdoor

> Thiết kế, chưa triển khai. Prefix Python: `alumdoor.api.v1`. Tất cả method yêu cầu Frappe session + CSRF, trừ endpoint login có sẵn của Frappe.

## 1. Quy ước chung

### 1.1 Envelope

Thành công:

```json
{"ok":true,"data":{},"meta":{"request_id":"A1B2C3","server_time":"2026-08-25T08:00:00+07:00"}}
```

Lỗi:

```json
{"ok":false,"error":{"code":"PRICE_NOT_FOUND","message":"Chưa có giá phù hợp.","field":"items.0.item","details":{}},"meta":{"request_id":"A1B2C3"}}
```

### 1.2 Quy tắc ghi

- Mọi create/submit/action nhận `idempotency_key` UUID do client tạo.
- Mọi update/action trên document nhận `expected_modified` ISO datetime; lệch trả `CONFLICT_MODIFIED`.
- Client không gửi authority cho `rate`, `amount`, discount amount, surcharge amount, VAT amount, totals, component snapshot, status hay approval.
- `name` là Frappe document name; ngày `YYYY-MM-DD`; tiền là chuỗi decimal hoặc integer VND, server normalize; kích thước mm.
- Danh sách có `page`, `page_size ≤ 100`, `sort`, filter allowlist; server luôn thêm permission scope.

## 2. Role

Ký hiệu: `O` = Alumdoor Owner; `A` = Alumdoor Accountant; `S` = Alumdoor Sales.

| Nhóm | O | A | S |
|---|---:|---:|---:|
| Đọc danh mục/chứng từ | ✓ | ✓ | ✓ |
| Tạo/sửa đơn trước khóa | ✓ | ✓ | ✓ |
| Duyệt ngoại lệ | ✓ | — | — |
| Sản xuất | ✓ | ✓ | xem |
| Nhập/xuất kho | ✓ | ✓ | xem |
| Mua hàng | ✓ | xem | — |
| Giao/thu chi | ✓ | ✓ | xem |
| Master/rule/import | ✓ | — | — |

## 3. Schema dùng chung

### 3.1 `OrderHeaderInput`

```json
{
  "customer":"PARTNER-0001",
  "order_date":"2026-08-25",
  "delivery_date":"2026-08-28",
  "responsible_employee":"EMP-001",
  "price_list":"BG_DAI_LY",
  "payment_method":"Bank Transfer",
  "money_account":"BANK-VCB",
  "deposit_amount":"2000000",
  "vat_percent":"8",
  "notes":""
}
```

Server snapshot `customer_group`, address/tax/contact/bank label từ master. `delivery_date >= order_date`; deposit không âm.

### 3.2 `OrderItemInput`

```json
{
  "client_row_id":"uuid",
  "item":"CUA-UC-MTN-46D",
  "qty":"1",
  "uom":"Bộ",
  "sales_package":"GOI-CUA-UC-MTN",
  "color":"XANH-DUONG",
  "rail_type":"RAY-HOP-TD-U76",
  "rail_color":"XANH-DUONG",
  "measurements":{"clear_width_mm":3500,"clear_height_mm":2800},
  "discount_percent":"15"
}
```

Chỉ keys có trong Measurement Profile/Item options được chấp nhận. Motor/variant suy từ metadata item, không phải dropdown tự do.

### 3.3 `CalculatedOrder`

Trả header snapshot, từng item với dimensions chuẩn hóa, `qty/uom`, `measure_qty/measure_uom`, rate/amount, discount, adjustments, component snapshots, warning/error/explain; totals gồm goods, discount, line adjustment, order adjustment, before VAT, VAT, grand total, deposit, paid, outstanding; `calculation_revision` tăng đơn điệu theo request client.

## 4. Bootstrap, calculate và preview

| Method | Input | Output | Role/ghi chú |
|---|---|---|---|
| `sales_order.bootstrap` | `customer?`, `order_date?` | defaults, permission actions, customer/item search configs, settings version | O/A/S; không dump toàn master |
| `sales_order.calculate` | `header`, `items`, `calculation_revision` | `CalculatedOrder` | O/A/S; read-only; debounce 250–400ms |
| `sales_order.preview_print` | payload draft hoặc `name` | sanitized HTML + page metadata | O/A/S; draft dùng cùng calculate |
| `master.link_search` | `doctype`, `text`, `filters`, `page` | `[{value,label,description,meta}]` | O/A/S; doctype/filter allowlist |
| `master.item_options` | `item`, `customer`, `order_date` | profile, allowed colors/rails, fixed variant, package | O/A/S |

`calculate` không cấp số đơn, không lưu draft và không ghi audit nghiệp vụ.

## 5. Đơn hàng

| Method | Input bắt buộc | Output | Role/state |
|---|---|---|---|
| `sales_order.list` | page/filter/sort | rows + total + facets | O/A/S |
| `sales_order.get` | `name` | document + snapshots + actions + revisions | O/A/S |
| `sales_order.create` | header, items, `submit`, idempotency | order; calculate result; approval result | O/A/S; Draft mới |
| `sales_order.update` | name, changed header/items, reason?, expected_modified, idempotency | order + diff + approval result | O/A/S; chưa stock lock |
| `sales_order.submit` | name, expected_modified, idempotency | Approved hoặc Pending Owner Approval | O/A/S; Draft/Rejected |
| `sales_order.approve` | name, decision note?, expected_modified, idempotency | Approved + Production Request | O; Pending |
| `sales_order.reject` | name, reason, expected_modified, idempotency | Rejected | O; Pending |
| `sales_order.cancel` | name, reason, expected_modified, idempotency | Cancelled | O/A; S chỉ creator; chưa lock |
| `sales_order.revisions` | name | before/after diff + actor/time/reason | O/A/S |
| `sales_order.print` | name, format `A4|A5`, mode `preview|pdf` | HTML hoặc private File | O/A/S |

Create với `submit=true`: không có ngoại lệ thì tự Approved; chỉ sinh đúng một Production Request khi có ít nhất một dòng `is_manufactured_item=1`. Đơn toàn hàng bán rời vào hàng đợi xuất trực tiếp. Nếu cọc > 0 phải có Money Account và service tạo đúng một Receipt Submitted trong cùng transaction/idempotency. Có ngoại lệ thì Pending và chưa ghi nhận cọc. Update Approved bắt buộc `reason`, lưu Revision và invalidated approval dù chỉ đổi kích thước. VAT đổi không tự là approval reason nhưng vẫn là post-approval edit.

## 6. Sản xuất

| Method | Input | Output | Role/state |
|---|---|---|---|
| `production.queue` | filters/page | requests/orders cần xử lý | O/A; S xem |
| `production.request.get` | name | request + order snapshot | O/A/S |
| `production.order.create` | request, schedule, idempotency | Production Order | O/A; Approved request |
| `production.order.get` | name | order, units, components, revision diff | O/A/S |
| `production.order.release` | name, expected_modified, idempotency | Released | O/A |
| `production.order.start` | name, expected_modified, idempotency | In Progress | O/A |
| `production.order.complete` | name, output units, note, expected_modified, idempotency | Awaiting Acceptance | O/A |
| `production.unit.accept` | production_order, unit, result=`Passed|Rework`, note?, expected_modified, idempotency | unit state + aggregate order state | O only |
| `production.order.ack_change` | name, order_revision, note, expected_modified, idempotency | diff acknowledged | O/A |
| `production.order.cancel` | name, reason, expected_modified, idempotency | Cancelled | O/A; chưa stock lock |

Nếu đơn nguồn có revision chưa ack, `release/start/complete` trả `ORDER_CHANGE_NOT_ACKNOWLEDGED`.

## 7. Kho

| Method | Input | Output | Role/state |
|---|---|---|---|
| `stock.balance` | warehouse/item filters | qty theo item/UOM/bin | O/A; S xem |
| `stock.entry.preview_from_production` | production_order, type | suggested items + current/projected qty | O/A |
| `stock.entry.create` | type, warehouse(s), reference, items, idempotency | Draft | O/A |
| `stock.entry.get` | name | entry + submit eligibility | O/A; S xem |
| `stock.entry.update` | name, items, expected_modified, idempotency | Draft | O/A; Draft |
| `stock.entry.submit` | name, expected_modified, idempotency | Submitted + ledger + order lock if issue | O/A |
| `stock.entry.cancel` | name, reason, expected_modified, idempotency | Cancelled + reversal ledger | O/A |
| `stock.entry.return` | against_entry, items, reason, idempotency | Submitted Return + ledger | O/A |
| `stock.entry.adjust` | warehouse, items, reason, attachment?, idempotency | Submitted Adjustment | O/A |
| `stock.ledger` | item/warehouse/date/page | immutable movements | O/A; S xem |

Types: `Material Receipt`, `Material Issue`, `Transfer`, `Return`, `Adjustment`. Dòng Issue cuối hợp nhất cấu kiện của dòng manufactured và item bán rời; đơn không sản xuất có thể tạo từ Sales Order. Submit khóa stock rows theo thứ tự ổn định, cấm âm; failure rollback entry, ledger và order lock. Cancel/reversal không mở lại order lock.

## 8. Mua hàng

| Method | Input | Output | Role/state |
|---|---|---|---|
| `purchase.order.list/get` | filters hoặc name | PO | O; A xem |
| `purchase.order.create/update` | supplier, dates, items, expected_modified?, idempotency | Draft | O |
| `purchase.order.submit/cancel` | name, reason?, expected_modified, idempotency | state mới | O |
| `purchase.receipt.preview` | purchase_order | outstanding items | O/A |
| `purchase.receipt.create/update` | PO, warehouse, items, expected_modified?, idempotency | Draft | O/A |
| `purchase.receipt.submit/cancel` | name, reason?, expected_modified, idempotency | receipt + stock ledger/reversal | O/A |

Không có Purchase Request. Receipt submit cập nhật nhận PO và ledger trong một transaction.

## 9. Giao hàng và thu chi

| Method | Input | Output | Role/state |
|---|---|---|---|
| `delivery.preview` | sales_order | full outstanding delivery | O/A |
| `delivery.create` | order, delivery date/address/items full, idempotency | Draft | O/A |
| `delivery.submit` | name, expected_modified, idempotency | Submitted, order Delivered | O/A; chỉ full delivery |
| `delivery.cancel` | name, reason, expected_modified, idempotency | Cancelled | O/A |
| `payment.list/get` | order/filter | entries | O/A; S xem |
| `payment.create` | order, type Receipt/Payment, amount, date, account, note, idempotency | Draft | O/A |
| `payment.submit/cancel` | name, reason?, expected_modified, idempotency | state + recomputed outstanding | O/A |

Tiền cọc header là lần đầu/snapshot. Payment Entry là luồng riêng; không cho tổng thu submitted vượt grand total nếu type Receipt.

## 10. Import, master, export và notification

| Method | Input | Output | Role |
|---|---|---|---|
| `import_job.template` | dataset | XLSX template + mapping version | O |
| `import_job.validate` | private file, dataset, mapping | job + row errors/warnings + checksum | O |
| `import_job.commit` | job, checksum, idempotency | committed count | O; toàn file một transaction |
| `import_job.get` | name | status/result/errors | O |
| `master.get/list` | allowlisted doctype/filter | docs | O/A/S tùy doctype |
| `master.save` | doctype, doc, expected_modified?, idempotency | saved doc | O only |
| `master.disable` | doctype, name, reason, expected_modified, idempotency | disabled | O only; không xóa có tham chiếu |
| `export.dataset` | dataset/filter/format | background job/File | O |
| `notification.list/mark_read` | page hoặc names | notification state | user hiện tại |

Import validation không ghi master. Commit kiểm lại checksum, mapping version và toàn bộ validation; một lỗi mới phát sinh làm rollback toàn file.

## 11. Mã lỗi chuẩn

| HTTP tương đương | Code | Ý nghĩa |
|---:|---|---|
| 400 | `VALIDATION_ERROR`, `FIELD_NOT_ALLOWED`, `INVALID_TRANSITION` | Payload/rule/state sai |
| 401 | `AUTH_REQUIRED`, `CSRF_FAILED` | Chưa đăng nhập/session sai |
| 403 | `FORBIDDEN`, `APPROVAL_REQUIRED` | Không có quyền/action cần Owner |
| 404 | `NOT_FOUND` | Không thấy hoặc ngoài scope |
| 409 | `CONFLICT_MODIFIED`, `IDEMPOTENCY_CONFLICT`, `ORDER_STOCK_LOCKED` | Xung đột |
| 422 | `PRICE_NOT_FOUND`, `RULE_AMBIGUOUS`, `COLOR_NOT_ALLOWED`, `MAX_WIDTH_EXCEEDED`, `COMPONENT_RULE_MISSING`, `INSUFFICIENT_STOCK`, `PARTIAL_DELIVERY_NOT_ALLOWED` | Nghiệp vụ không thỏa |
| 500 | `INTERNAL_ERROR` | Thông báo có request_id, không lộ stack |

## 12. Permission bắt buộc ở server

- Mỗi method vừa kiểm role vừa kiểm quyền document; không dựa vào nút ẩn trên UI.
- Sale cancel chỉ khi `owner == frappe.session.user` và chưa lock.
- Owner approval kiểm revision/hash hiện hành; không duyệt payload cũ.
- File private chỉ tải khi user có quyền document attached.
- Generic `/api/resource` chỉ đọc các master allowlist; server hooks chặn write operational DocTypes ngoài service.
- Child snapshot, ledger, audit và request key không có endpoint CRUD công khai.

## 13. Cổng API

- [x] Đủ calculate/create/update/workflow/print.
- [x] Đủ production/stock/purchase/delivery/payment/import.
- [x] Mỗi action có role, state, idempotency/concurrency.
- [x] Quyền server và lỗi chuẩn đã định nghĩa.
