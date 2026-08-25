# Thiết kế kỹ thuật — Alumdoor Frappe Pure

> Phiên bản 1.0 — 2026-08-25  
> Căn cứ: [BRD.md](BRD.md) đã duyệt.  
> Trạng thái: **ĐÃ DUYỆT Cổng 3 ngày 2026-08-25**; được phép sang Pha 4/5. Phần này vẫn mô tả thiết kế, không phải bằng chứng migration đã thực thi.

## 1. Quyết định kiến trúc

### ADR-001 — Frappe là backend authoritative

- Frappe v16 + MariaDB lưu toàn bộ master, chứng từ, snapshot và audit.
- Forge React là frontend riêng, dùng session/CSRF Frappe qua same-origin proxy.
- Generic Frappe REST chỉ dùng cho đọc metadata/danh mục ít rủi ro.
- Chứng từ và action workflow chỉ đi qua whitelisted service method; cấm frontend ghi thẳng tổng tiền, trạng thái, tồn hoặc approval.
- Mọi service ghi dữ liệu chạy trong một transaction và để exception rollback toàn bộ.

### ADR-002 — DocType nghiệp vụ có namespace Alumdoor

Site không cài ERPNext. Các tên `Sales Order`, `Work Order`, `Stock Entry` thuộc ERPNext và có nguy cơ xung đột nếu cài sau này. Mô hình đích dùng:

- `Alumdoor Sales Order`
- `Alumdoor Production Request`
- `Alumdoor Production Order`
- `Alumdoor Stock Entry`
- `Alumdoor Purchase Order`
- `Alumdoor Purchase Receipt`
- `Alumdoor Delivery Note`
- `Alumdoor Payment Entry`

Nhãn UI vẫn là “Đơn hàng”, “Lệnh sản xuất”, “Phiếu xuất kho”…; người vận hành không thấy tên kỹ thuật.

### ADR-003 — Một máy tính duy nhất

`order_calculation_service` là orchestration duy nhất:

```text
normalize payload
→ resolve item/profile/SKU/color
→ calculate dimensions
→ resolve package components
→ resolve item price
→ apply line discount
→ apply line/unit adjustments
→ deduplicate order/trip adjustments
→ calculate VAT and outstanding
→ return explain + snapshots + HTML preview input
```

Preview, create và update gọi cùng hàm. Khi create/update, service tính lại trong transaction; không nhận các trường tiền/read-only do client gửi làm authority.

### ADR-004 — Snapshot bất biến theo chứng từ

Đơn lưu snapshot khách, bảng giá, rule, cấu kiện và kết quả tính. Production Order lại snapshot từ đơn đã duyệt. Master đổi sau đó:

- Draft: cảnh báo và tính lại theo ngày đơn khi người dùng mở/lưu.
- Đơn đã duyệt: không đổi ngầm.
- Sửa đơn đã duyệt: tạo Order Revision, tính snapshot mới và yêu cầu duyệt lại.

### ADR-005 — Kho số lượng bằng sổ phát sinh

- `Alumdoor Stock Entry` là chứng từ đầu vào.
- `Alumdoor Stock Ledger Entry` là dòng phát sinh bất biến sinh khi submit/cancel đảo.
- Tồn = tổng `actual_qty` theo item/UOM chuẩn/kho/vị trí; không có trường balance cho người dùng sửa.
- Không valuation rate, FIFO hay giá vốn.
- Check không âm và ghi ledger nằm cùng transaction.

### ADR-006 — Khóa đơn tại xác nhận xuất kho

- Phiếu xuất `Draft` không khóa.
- Submit phiếu xuất tham chiếu Production Order: kiểm tồn → ghi ledger → đặt `sales_order.is_stock_locked = 1` trong cùng transaction.
- Đơn chỉ có hàng bán rời không tạo Production Request; phiếu xuất tham chiếu trực tiếp Sales Order.
- Đơn hỗn hợp có một Production Order chỉ chứa dòng `is_manufactured_item=1`; phiếu xuất cuối hợp nhất cấu kiện sản xuất và hàng bán rời.
- Không action mở khóa. Sau đó chỉ Return/Adjustment + đơn thay thế.

### ADR-007 — Không AI/Zalo ở bản đầu

App-factory có khuyến nghị AI và cổng Zalo. Chủ xưởng đã chốt AI/Zalo ngoài phạm vi. Thiết kế không thêm bảng/route giả. Chỉ giữ điểm mở rộng: notification event bus và context panel không phụ thuộc AI.

## 2. Nguồn code canonical và Git

Hiện backend chạy tại thư mục bench nhưng bị repo cha bỏ qua; frontend mới còn untracked. Trước build phải chuyển về một nguồn Git duy nhất:

```text
work/forge-frappe-runtime/
├─ apps/alumdoor/
│  ├─ docs/                 # BRD + Pha 3
│  └─ frappe/               # root app Frappe được Git track
├─ client/packages/vertical-alumdoor/
└─ work/frappe_docker/      # chỉ runtime/mount, không phải nguồn chỉnh tay
```

Docker development mount `apps/alumdoor/frappe` vào `frappe-bench/apps/alumdoor`. Không copy hai chiều thủ công. Việc di chuyển/mount chỉ thực hiện sau Cổng 3 và phải backup site trước.

## 3. Module server đích

```text
alumdoor/
├─ api/v1/
│  ├─ sales_order.py
│  ├─ production.py
│  ├─ stock.py
│  ├─ purchase.py
│  ├─ delivery.py
│  ├─ payment.py
│  ├─ import_job.py
│  └─ master.py
├─ services/
│  ├─ order_calculation_service.py
│  ├─ dimension_service.py
│  ├─ component_service.py
│  ├─ pricing_service.py
│  ├─ approval_service.py
│  ├─ production_service.py
│  ├─ stock_service.py
│  ├─ print_service.py
│  └─ import_service.py
├─ doctype/<doctype>/
├─ permissions.py
├─ errors.py
└─ patches/
```

Không dùng `eval` cho expression. Công thức được parse bằng AST allowlist hiện có, giới hạn biến/hàm và lưu source/version.

## 4. Middleware và pattern Frappe

Frappe không dùng Hono middleware chain; pattern tương đương bắt buộc cho mọi whitelisted method:

1. Xác thực session + CSRF do Frappe.
2. `require_roles(...)` kiểm role server.
3. Parse JSON và validate schema/kiểu/range.
4. `check_doc_permission` + `scope_filter` nếu action trên bản ghi.
5. Kiểm `expected_modified` để optimistic lock; lệch trả `CONFLICT_MODIFIED`.
6. Chạy service trong transaction.
7. Ghi Frappe Version + `Alumdoor Audit Event` cùng transaction cho event nghiệp vụ.
8. Trả envelope chuẩn hoặc throw lỗi chuẩn; không lộ traceback/SQL.

Envelope thành công:

```json
{"ok": true, "data": {}, "meta": {"request_id": "A1B2C3"}}
```

Envelope lỗi:

```json
{
  "ok": false,
  "error": {
    "code": "PRICE_NOT_FOUND",
    "message": "Chưa có giá phù hợp cho mã TP-... vào ngày 25/08/2026.",
    "field": "items.0.item",
    "details": {}
  },
  "meta": {"request_id": "A1B2C3"}
}
```

## 5. Ranh giới transaction

| Action | Trong cùng transaction |
|---|---|
| Create order | cấp số → tính lại → lưu header/items/snapshots → approval mặc định hoặc request → audit |
| Update approved order | lock row → kiểm modified → tạo revision before/after → cập nhật → reset approval/production ack → audit |
| Approve | kiểm revision hiện tại → snapshot approval → tạo Production Request idempotent → notification → audit |
| Submit stock issue | lock stock keys → kiểm tồn → submit entry → ledger → khóa order → audit |
| Submit purchase receipt | kiểm PO/UOM → submit receipt → ledger nhập → cập nhật received qty → audit |
| Cancel order | kiểm chưa stock lock → cancel request/order mở → giữ tiền → cancel order → audit |
| Import | validate toàn file trước → transaction duy nhất ghi tất cả master → attach/log → audit |

## 6. Concurrency và idempotency

- Mọi create/action nhận `idempotency_key`; lưu trong `Alumdoor Request Key` với unique `(user, action, key)` và response name.
- Update nhận `expected_modified`; nếu DB khác trả HTTP 409-equivalent qua Frappe exception mapping.
- Submit stock lock các khóa `(warehouse,item,stock_uom,bin_location)` theo thứ tự ổn định để giảm deadlock.
- Naming dùng Frappe Naming Series/counter atomic theo năm; preview chỉ là mã dự kiến.
- Client hủy request Calculate cũ và chỉ áp response có `calculation_revision` mới nhất.

## 7. State machines

### 7.1 Đơn hàng

```text
Draft
├─ submit mặc định → Approved
└─ submit ngoại lệ → Pending Owner Approval

Pending Owner Approval → Approved | Rejected | Cancelled
Rejected → Draft
Approved → Production Requested
Production Requested → In Production
In Production → Ready to Deliver
Ready to Deliver → Delivered

Draft/Pending/Approved/Production Requested/In Production/Ready to Deliver
→ Cancelled, chỉ khi is_stock_locked=0 và có lý do
```

Trạng thái sản xuất và giao được suy ra từ chứng từ liên quan, nhưng lưu status tổng hợp để lọc nhanh; service là nơi duy nhất cập nhật.

### 7.2 Approval

`Not Required | Pending | Approved | Rejected | Invalidated`.

Approval requirement reasons:

- `PRICE_LIST_OVERRIDE`
- `DISCOUNT_OVERRIDE`
- `POST_APPROVAL_EDIT`

VAT thay đổi không tạo approval reason nhưng vẫn ghi revision nếu đơn đã duyệt; vì mọi sửa sau duyệt đều invalidated.

### 7.3 Production Order

`Draft → Released → In Progress → Awaiting Acceptance → Accepted → Ready to Deliver`, hoặc `Cancelled` trước stock lock. Revision mới đặt `change_ack_status = Pending`; không cho tiếp tục action sản xuất tới khi Kế toán/Chủ xưởng xác nhận diff.

### 7.4 Stock Entry

`Draft → Submitted → Cancelled`. Cancel sau khi order đã khóa không mở khóa đơn; Stock Return/Adjustment giải quyết số lượng.

### 7.5 Purchase/Delivery/Payment

- Purchase Order: `Draft → Submitted → Partly Received → Received | Cancelled`.
- Purchase Receipt: `Draft → Submitted → Cancelled`.
- Delivery Note: `Draft → Submitted → Cancelled`; v1 phải giao toàn bộ.
- Payment Entry: `Draft → Submitted → Cancelled`; cancel không xóa số/historical link.
- Cọc trên Draft chỉ là dự kiến. Khi Gửi đơn với cọc > 0, service bắt buộc Money Account và tạo Payment Entry Receipt Submitted cùng transaction.
- Hủy đơn đã cọc sinh `refund_due`; hoàn/giữ tiền qua Payment Entry riêng, không sửa lịch sử thu.

## 8. Role và scope server

| Role kỹ thuật | Nhãn | Scope |
|---|---|---|
| `Alumdoor Owner` | Chủ xưởng | toàn bộ, duyệt ngoại lệ, master/rule/import/export |
| `Alumdoor Accountant` | Kế toán | toàn bộ chứng từ vận hành; không sửa master giá/rule |
| `Alumdoor Sales` | Sale | toàn bộ khách/đơn để xưởng ít người thay nhau xử lý; hủy đơn mình tạo, không duyệt |

Không tạo role kho/sản xuất riêng. Các field tiền không che với ba role này theo quyết định vận hành; quyền action vẫn tách.

## 9. Dùng lại hạ tầng Frappe

| Nhu cầu | Dùng |
|---|---|
| User/session/role/permission | `User`, Role Permission Manager, controller checks |
| File/attachment | `File` private + permission theo attached doctype/name |
| Audit field/version | system fields + `Version`; event nghiệp vụ thêm `Alumdoor Audit Event` |
| Notification | `Notification Log` + event service; không Zalo/Web Push v1 |
| Comment/note | `Comment` |
| Print | server Jinja/HTML + PDF |
| Background job | `frappe.enqueue` cho import lớn, export, backup; transaction import vẫn nguyên tử |

## 10. Job định kỳ

| Lịch | Job | Phạm vi v1 |
|---|---|---|
| 07:00 hằng ngày | `due_date_alerts` | đơn sắp trễ, đơn sẵn sàng giao, còn phải thu |
| 18:00 hằng ngày | `owner_daily_digest` | notification trong app cho Chủ xưởng |
| 02:00 hằng ngày | backup site | database + private/public files; giữ theo chính sách vận hành |

Không tự gửi khách. Notification chỉ nội bộ.

## 11. Component architecture frontend

```text
AlumdoorApp
├─ DesktopShell / MobileShell
├─ OrderListDesktop / OrderListMobile
├─ SalesOrderCreateDesktop / SalesOrderCreateMobile
│  ├─ useSalesOrderDraft
│  ├─ useOrderCalculation
│  ├─ HeaderSnapshotFields
│  ├─ DynamicOrderLineGridDesktop / DynamicOrderLineCardsMobile
│  ├─ LineExplanationPanel
│  ├─ ComponentSnapshotPanel
│  └─ OrderTotalsAndPayment
├─ ProductionQueueDesktop / ProductionQueueMobile
├─ ProductionOrderDetail
├─ StockWorkbenches
├─ PurchaseWorkbenches
├─ DeliveryAndPaymentWorkbenches
└─ MasterDataViews
```

Logic/hooks/schema dùng chung; cây render desktop/mobile tách biệt ở breakpoint 768px.

### 11.1 Token/brand

- Brand khách thắng preset: dùng logo Alumdoor hiện có và lấy cam logo làm `primary` sau khi đo tương phản ở Pha 5.
- Nền trung tính lạnh/slate; sidebar tối.
- `warning/danger/success` dùng token chuẩn, không dùng cam brand thay cảnh báo.
- Nếu màu cam logo không đạt AA với chữ trắng, dùng shade đậm cho nút/sidebar-accent và giữ cam gốc cho logo/accent.

## 12. Quan sát và lỗi

- Mỗi request có `request_id` ngắn; log server chứa user/action/doctype/name/duration/error code.
- Calculation response có `explain` theo dòng/rule để UI hiển thị và test đối chiếu.
- Không log token, session, file private hay toàn bộ snapshot khách.
- Báo cáo lỗi 500 cho người dùng bằng mã tra cứu; exception đầy đủ ở server log.

## 13. Migration matrix tổng quát

| Hiện tại | Đích | Xử lý |
|---|---|---|
| 14+ master Alumdoor đã migrate | Giữ | rà field/quyền/index, không nhập lại mù |
| `Alumdoor Quotation` | `Alumdoor Sales Order` | migration có mapping; route/UI cũ bỏ sau parity |
| `Alumdoor Quotation Item` | `Alumdoor Sales Order Item` | đổi tên semantic; bỏ set_count/qty_bar khỏi UI, giữ mapping lịch sử |
| `Configured Product*` | snapshot/order calculation | ngừng tạo mới; dữ liệu demo backup rồi archive |
| `quotation_service.py` | `order_calculation_service.py` + `sales_order_service.py` | tái dùng engine nhỏ đã đúng; không giữ API quotation |
| `AlumdoorQuotationWorkbench.tsx` | xóa | không alias tên báo giá |
| `sales-order-v2/*` | tái cấu trúc | giữ preview coordinator/field adapter hữu ích; thay toàn bộ contract màn theo Pha 3 |
| Forge generic transaction DocTypes | namespaced Frappe DocTypes | migration có đối chiếu, sau đó route chỉ về Frappe |
| Master ngoài phạm vi (Warranty/Shift/Fault…) | giữ ẩn | không xóa dữ liệu, không đưa menu v1 |

Chi tiết từng artifact và thứ tự rollback nằm trong `MIGRATION_PLAN.md`.

## 14. Cổng kỹ thuật trước build

- [x] Field Ledger đủ mọi DocType đích.
- [x] Rule Matrix có nguồn, biên và test.
- [x] API Contract có payload, quyền, lỗi, idempotency.
- [x] Screen Catalog có desktop/mobile/7 trạng thái.
- [x] Migration Plan có backup, mapping, rollback và xóa Quotation.
- [x] Chủ xưởng duyệt Cổng 3 ngày 2026-08-25.
