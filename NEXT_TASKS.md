# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `DELIVERY_POLICY.md` trước khi tiếp tục.

## Nhánh chuyên biệt — Print design

Branch: `feat/print-design-sales-documents-20260801`  
PR: `#141`  
Base mới đã đồng bộ: `f6420c70823b969a28b43e3f93004ebd52546adc`  
Implementation head trước khi base đổi đã kiểm chứng: `7cb4607cf856fcef0093d2ed3a62ae449d1b2bb5`

### Đã làm trong đợt này

- Thêm cơ chế `<brief>.prints.json` và ghép trước schema validation/compile.
- Thêm `Đơn bán hàng ALUMDOOR` cho Sales Order.
- Khóa bố cục A4: 13 cột, tổng độ rộng `100%`, lặp header, không cắt dòng.
- Thêm fixture renderer cho một dòng cửa cuốn và một dòng phụ kiện thường.
- Hỗ trợ brief source dạng đường dẫn chuỗi và `file:` URL; có regression cho `import.meta.url`.
- Thêm `docs/PRINT_DESIGN_ROADMAP.md`.
- Hợp nhất base mới chứa MetaForge MISA-style UI mà không ghi đè công việc UI.

Exact implementation-head evidence trước khi đồng bộ base:

- CI `30676094630`: SUCCESS — full tests, typecheck, build.
- PR Validation `30676094648`: SUCCESS.
- Purchase Feature CI `30676094623`: SUCCESS.
- UI Pull Request Validation `30676094598`: SUCCESS.
- Sales Feature CI `30676094634`: SUCCESS.
- Inventory and Manufacturing CI `30676094629`: SUCCESS.

### Việc kế tiếp trên cùng epic

1. Khóa exact PR head sau merge base và xác nhận 6 workflow xanh; ghi run IDs trong PR `#141`.
2. Review trực quan `Đơn bán hàng ALUMDOOR` bằng HTML preview và PDF với dữ liệu dài; sửa tràn cột nếu có.
3. `Phiếu giao hàng / lắp đặt` từ Delivery Note, có đơn nguồn, địa chỉ, đội giao/lắp, tài xế và biển số.
4. `Phiếu yêu cầu sản xuất`, một dòng theo từng bộ cửa và ngày phải hoàn tất.
5. `Phiếu cắt nhôm`, có lô mẹ, số lá, chiều rộng cắt, kerf, đầu thừa và QR nội bộ.
6. `Biên bản bàn giao / nghiệm thu`, liên kết Sales Order và Delivery Note.
7. Tem QR mặt hàng/lô/đầu thừa; không nhúng token hoặc URL nhạy cảm.
8. Chuẩn hóa lại Sales Invoice, Purchase Receipt và Payment Entry theo cùng hợp đồng A4.

### Gate trước merge

- `npm run brief:check`: PASS trên implementation head trước base sync; phải PASS lại trên final exact head.
- Focused print tests: PASS trên implementation head trước base sync; phải PASS lại trên final exact head.
- Full tests, typecheck và build: PASS trên `7cb4607cf856fcef0093d2ed3a62ae449d1b2bb5`; phải PASS lại sau merge base.
- Preview/PDF dữ liệu dài: PENDING manual visual review.
- Không deploy Cloudflare, không đổi secrets/DNS và không mutate production.

## Hoàn tất — Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- Full CI, PR Validation, Purchase, Sales, Inventory và UI authenticated gates: SUCCESS.
- Không deploy Cloudflare, không thay rollout state và không mutate dữ liệu production.

## UI MetaForge MISA-style — IMPLEMENTED / VALIDATE NEXT

### Branch

- Branch: `feat/metaforge-misa-workspace-ui-clean`.
- Base exact default head: `4d86c1fd8c191f26f3961762b281fca1ad765855`.
- Implementation head trước docs: `054b7e23b8e18d74ec378316de2b132fd44aa0f7`.
- Closed PR `#81/#109` chỉ dùng tham khảo từng file; không reopen hoặc merge nguyên branch cũ.
- Login/landing từ closed PR `#36` giữ ở backlog riêng.

### Đã triển khai

- `Tổng quan` là mục sidebar độc lập và bị loại khỏi dải tab nghiệp vụ.
- Tab nghiệp vụ/Meta chia đều chiều ngang, kích thước nhỏ, nhãn dài truncate, không cuộn ngang.
- `Danh mục` được gom về một trang tập trung theo nhóm.
- Quy trình nghiệp vụ và quy trình Meta được thiết kế lại.
- Report builder có nguồn dữ liệu, widget, canvas kéo-resize, panel bố cục/thuộc tính và preview.
- 13 bảng màu theme light/dark với tên tiếng Việt.
- Playwright coverage cho navigation, tab overflow, catalog, report builder và theme count.

### Việc tiếp theo bắt buộc

1. Mở một PR canonical từ branch này vào `hotfix/alumdoor-print-list-delete`.
2. Khóa exact PR head, không push thêm khi CI đang chạy.
3. Chạy full CI, typecheck, build và UI PR validation.
4. Chạy Playwright desktop và mobile; xác nhận không overflow và không mất route/active state.
5. Sửa lỗi từ CI nếu có, sau đó cập nhật exact head evidence.
6. Merge chỉ khi full CI và UI-specific gates xanh.
7. Không deploy Cloudflare nếu chưa có lệnh riêng.

### Done condition

- Tổng quan chỉ nằm ở sidebar.
- Danh mục tập trung hoạt động.
- Tab nghiệp vụ/Meta không cần cuộn ngang ở desktop và mobile.
- Report builder hoạt động với add/edit/delete card/chart, kéo-resize và preview.
- 13 theme chọn được và lưu preference.
- Full CI, typecheck, build và authenticated UI journey PASS trên exact head.

## P1 — Finance clean rebuild

### Phạm vi bắt buộc

- Due date và AR/AP aging theo ngày đến hạn.
- Payment Entry hỗ trợ partial payment và unallocated amount.
- Payment Allocation ràng buộc cùng company, party, account và currency.
- Party Statement có opening, invoice, payment, allocation và running balance.
- Debt Summary theo customer/supplier, aging bucket và overdue.
- Advance Balance theo party/currency/account.
- UI/report navigation, permission và export boundary.
- Migration append-only, có dry-run, checksum, rollback và production-shaped evidence.
- Không dùng floating point cho bút toán tiền; tiếp tục dùng minor/micros theo kernel.

Finance phải làm ở branch riêng, không trộn vào MetaForge UI hoặc Print design.

## P2 — Daily detailed ledger

- Immutable snapshot theo ngày/company/warehouse/customer/order.
- Lệnh cập nhật có idempotency.
- Chỉ kế toán tổng hợp, kế toán trưởng và giám đốc được tạo adjustment sau khi khóa.
- Không sửa trực tiếp số liệu snapshot; mọi thay đổi phải tạo adjustment có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P3 — Warranty / defects / capacity

- Bốn nguyên nhân lỗi theo tài liệu `25.7 QUY TRÌNH.docx`.
- Bảo hành motor/bình lưu điện trong một năm tính từ ngày giao.
- Lỗi sản xuất có người chịu trách nhiệm và xác nhận kế toán tổng hợp.
- Lỗi nhà cung cấp dùng provisional AP hold, chỉ offset khi supplier acceptance hoặc policy được duyệt.
- Lỗi khách hàng ghi nhận chi phí theo công đoạn.
- Capacity theo department/workstation calendar `8 giờ/ngày`, tính overtime và overload.

## P4 — End-to-end acceptance

Sales Order → production request → Work Order → material issue/consume → paint → delivery → invoice/debt → daily ledger → adjustment → warranty.

Bắt buộc có desktop và mobile authenticated journey trên một exact head SHA.

## UI backlog riêng

- Login/landing từ closed PR `#36`.
- Không trộn login/landing vào MetaForge workspace UI, Finance hoặc nghiệp vụ ledger.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Không deploy Cloudflare, sửa secret/DNS, bật generic FIFO rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
