# MetaForge Bulk View — kiến trúc và phân loại DocType

Ngày: 2026-08-02

## Quyết định

MetaForge có thêm **Bulk View** như một renderer chuẩn bên cạnh List/Form/Kanban/Calendar/Gantt/Tree/Report/Dashboard/Print.

Bulk View không phải một page riêng cho từng nghiệp vụ. Một renderer đọc metadata để quyết định:

- cột hiển thị;
- field được sửa;
- paste vùng ô từ Excel/Google Sheets;
- fill-down;
- page size;
- commit strategy.

Phiên bản đầu chỉ hỗ trợ `commitStrategy=document_update` và **fail closed** với transaction, DocType submittable, child table, tree/single và field `internal/read-only/server-owned`. Save dùng `modified` để giữ optimistic concurrency; lỗi được báo theo từng dòng.

## Tại sao không cho mọi DocType dùng cùng một bulk editor

Có ba loại dữ liệu khác bản chất:

1. **Master record độc lập** — có thể cập nhật từng record qua Document API.
2. **Cấu hình dạng quan hệ/child table** — cần Matrix hoặc parent-aware editor, vì row con không có vòng đời độc lập.
3. **Transaction/ledger** — phải đi qua controller/action nghiệp vụ. Không được cập nhật stock, công nợ, trạng thái submit hay snapshot bằng mass document update.

Bulk View chỉ giải quyết nhóm 1. Nhóm 2 và 3 dùng cùng UX grid nhưng commit adapter khác, không dùng đường update trực tiếp.

## ALUM — Bulk View bật ngay

Nguồn cấu hình: `server/briefs/alumdoor-v2.views.json`.

| DocType | Mục đích bulk | Strategy |
| --- | --- | --- |
| UOM | cờ số nguyên / trạng thái | document_update |
| Brand | quốc gia, website, trạng thái | document_update |
| Manufacturer | quốc gia, website, trạng thái | document_update |
| Item Color | tên màu, bề mặt, mã NCC | document_update |
| Material Grade | tên, họ vật liệu, tỷ trọng | document_update |
| Material Specification | quy cách, kg/m, dài, rộng, dày, phế | document_update |
| Item Attribute | dải giá trị số / trạng thái | document_update |
| Supplier Item | mã NCC, ưu tiên, MOQ, lead time | document_update |
| Measurement Profile | cờ đo lường, kg/m, kerf, tolerance | document_update |
| Item | phân loại, mua/bán, profile, UOM, brand/spec, giá định mức | document_update |
| Customer | nhóm giá, liên hệ, hạn mức, điều khoản | document_update |
| Supplier | nhóm NCC, liên hệ, điều khoản, dung sai | document_update |
| Price List | ghi chú / trạng thái | document_update |
| Item Price | **đơn giá hàng loạt** | document_update |
| Pricing Rule | khoảng SL/ngày, giá/chiết khấu, ưu tiên | document_update |

Các field cấu thành `name` được hiển thị để nhận diện nhưng không mở sửa hàng loạt trong v1.

## ALUM — không dùng generic document_update

### Child / quan hệ nhiều-nhiều → Matrix View hoặc parent-aware bulk

- Item Allowed Color
- Item Attribute Value
- Item Variant Attribute
- Item Barcode
- Item Default
- Item Reorder
- UOM Conversion
- BOM Item
- các child item của Quotation/Sales/Purchase/Stock/Production

Các cấu hình như `Item × Color`, `User × Role`, `User × Warehouse`, `Supplier × Item` phù hợp với **Matrix View**, không nên giả thành danh sách row thông thường.

### Tree → Tree View + batch action

- Item Group
- Warehouse

Đổi cha hàng loạt phải có kiểm tra cycle/descendant; không dùng generic cell update.

### Transaction / ledger → Bulk Transaction Workspace

- Material Request / RFQ / Supplier Quotation
- Purchase Order / Purchase Receipt / Purchase Invoice
- Stock Entry / Stock Reconciliation / Stock Return / Debit Note
- Quotation / Sales Order / Delivery Note / Sales Invoice / Payment Entry
- Stock Reservation
- BOM (parent + child/version)
- Production Request / Work Order / Cut Order / Paint Job
- Warranty Claim

UX có thể vẫn là grid, paste, multi-select và preview, nhưng `Save` phải gọi method/controller đúng nghiệp vụ để tạo draft, validate, submit, reserve/release hoặc ghi ledger. Không mass-update document đã ghi sổ.

## Các primitive MetaForge còn thiếu sau Bulk View

### 1. Matrix View — nên làm tiếp

**Cần trở thành renderer chuẩn.** Dùng cho quan hệ hai chiều có nhiều ô giao nhau:

- User × Role;
- User × Warehouse / Department / Company;
- Item × Color;
- Item × UOM conversion;
- Item × Reorder warehouse;
- Supplier × Item;
- Item/Item Group × Account mapping.

Matrix giải quyết một lớp bài toán mà List/Bulk không biểu diễn tự nhiên.

### 2. Batch Print / Print Queue — cần, nhưng là action/workspace

Không cần tạo ViewKind mới. Bulk selection gọi một print queue chung để:

- in nhiều chứng từ;
- in tem Item/Batch/QR;
- in phiếu cắt/lệnh sản xuất/phiếu giao.

### 3. Resource Scheduler — chỉ dựng khi làm capacity

Calendar + Gantt hiện đã có. Khi P2 capacity bắt đầu, nếu cần kéo/thả `Work Order × workstation × ca`, dựng Resource Scheduler chuyên dụng trên các primitive hiện có; chưa cần đưa thành generic renderer ngay.

### 4. Queue / Inbox — chưa cần renderer mới

Workflow inbox + Kanban đã phủ phần lớn nhu cầu hàng chờ. Chỉ thêm queue chuyên biệt nếu có SLA/priority/assignment mà hai view hiện tại không biểu diễn được.

### 5. Pivot/Analysis — giữ trong Report

Pivot, grouping, aggregation, chart và export là năng lực của Report/Analysis, không tạo thêm một loại DocType view chỉ vì hình bảng khác.

## Thứ tự tiếp theo

1. Bulk View document-update v1 + ALUM master reference.
2. Matrix View canonical contract + renderer.
3. Bulk Transaction strategy cho Stock Reconciliation và BOM làm hai reference đầu tiên.
4. Nhập nhôm nhiều mã / Purchase Receipt transaction grid.
5. Batch Print / QR label queue.
6. Resource Scheduler khi capacity/overtime đi vào runtime.

## Release boundary

Đợt này chỉ source + test + CI. Không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.
