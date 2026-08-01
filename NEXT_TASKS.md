# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Nhánh chuyên biệt — Print design

Branch: `feat/print-design-sales-documents-20260801`  
PR: `#141`  
Base đã đồng bộ: `f6420c70823b969a28b43e3f93004ebd52546adc`  
Exact head xanh trước Delivery Note: `c7955c345a3c497565a1f3eb7dfc6e97434ad50d`

### Đã làm

- Thêm cơ chế `<brief>.prints.json` và ghép trước schema validation/compile.
- Thêm `Đơn bán hàng ALUMDOOR` cho Sales Order.
- Thêm `Phiếu giao hàng / lắp đặt ALUMDOOR` cho Delivery Note.
- Delivery Note in đúng trường nghiệp vụ: khách hàng, mục đích xuất, đơn nguồn, ngày xuất/ngày lắp, địa chỉ, đội lắp, lái xe, biển số, kho xuất và khối lượng.
- Delivery Note không in đơn giá; có checklist bàn giao và ba khu vực ký.
- Thêm regression renderer với tên khách, địa chỉ, đội lắp, tên hàng và kho xuất dài.
- Sidecar version nâng lên `2.0.37`.
- Giữ nguyên MetaForge UI khi đồng bộ base.

### Việc tiếp theo trên cùng epic

1. Chạy và khóa 6 workflow trên exact head có Delivery Note; ghi run IDs vào PR `#141`.
2. Review trực quan HTML preview/PDF của Sales Order và Delivery Note bằng dữ liệu dài; sửa tràn cột nếu có.
3. Thêm `Phiếu yêu cầu sản xuất` từ Production Request, một dòng theo từng bộ cửa và ngày phải hoàn tất.
4. Thêm `Phiếu cắt nhôm` từ Cut Order, có lô mẹ, số lá, chiều rộng cắt, kerf, đầu thừa và QR nội bộ.
5. Thêm `Biên bản bàn giao / nghiệm thu`, liên kết Sales Order và Delivery Note.
6. Thêm tem QR mặt hàng/lô/đầu thừa; không nhúng token hoặc URL nhạy cảm.
7. Chuẩn hóa Sales Invoice, Purchase Receipt và Payment Entry theo cùng hợp đồng A4.

### Gate trước merge

- `npm run brief:check`: phải PASS trên exact head mới.
- Focused Sales/print tests: phải PASS.
- Full tests, typecheck và build: phải PASS.
- Preview/PDF dữ liệu dài: PENDING visual review.
- PR phải mergeable với current default.
- Không deploy Cloudflare, đổi secrets/DNS hoặc mutate production.

## Hoàn tất — Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- Full CI, Purchase, Sales, Inventory, UI và authenticated journey: SUCCESS.

## P1 — Finance clean rebuild

- Due date và AR/AP aging.
- Payment Entry partial payment và unallocated amount.
- Payment Allocation cùng company, party, account và currency.
- Party Statement, Debt Summary và Advance Balance.
- UI/report navigation, permission và export boundary.
- Migration append-only, dry-run, checksum và rollback.
- Finance phải ở branch riêng, không trộn vào Print design.

## P2 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Idempotency, freeze và adjustment có actor/reason/audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P3 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo tài liệu `25.7 QUY TRÌNH.docx`.
- Bảo hành motor/bình lưu điện một năm từ ngày giao.
- Supplier AP hold/offset có phê duyệt.
- Capacity `8 giờ/ngày`, overtime và overload.

## P4 — End-to-end acceptance

Sales Order → Production Request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

## UI backlog riêng

- Login/landing từ closed PR `#36`.
- Không trộn UI backlog vào Print design, Finance hoặc ledger.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần hoặc hidden trigger.
- Không deploy Cloudflare, sửa secret/DNS, bật generic FIFO rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
