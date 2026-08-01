# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch hiện tại: `hotfix/alumdoor-print-list-delete`.
- Current default head khi tiếp tục nhánh in ấn: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

## Nhánh thiết kế in ấn — PR OPEN / IN PROGRESS

- Branch: `feat/print-design-sales-documents-20260801`.
- PR: `#141` — `feat(print): add Alumdoor sales order print workspace`.
- Base mới đã đồng bộ: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Exact head xanh trước đợt Delivery Note: `c7955c345a3c497565a1f3eb7dfc6e97434ad50d`.
- Sidecar `server/briefs/alumdoor-v2.prints.json` được ghép trước schema validation và compile.
- Loader hỗ trợ đường dẫn chuỗi và `file:` URL; có regression cho `import.meta.url`.

### Mẫu đã có

1. `Đơn bán hàng ALUMDOOR` — `Sales Order`
   - A4 portrait, 13 cột, tổng độ rộng `100%`.
   - Giữ kích thước cửa, số bộ, số lượng, đơn giá, mô tơ/phụ kiện và ghi chú lắp đặt.
   - Có fixture renderer cho dòng cửa và hàng thường.

2. `Phiếu giao hàng / lắp đặt ALUMDOOR` — `Delivery Note`
   - A4 portrait, 11 cột, tổng độ rộng `100%`.
   - In khách hàng, mục đích xuất, đơn bán nguồn, ngày xuất/ngày lắp, địa chỉ, đội lắp, lái xe và biển số.
   - Dòng hàng giữ màu, kích thước, số bộ, số lượng giao, kho xuất và khối lượng.
   - Không in đơn giá; có checklist bàn giao/lắp đặt và ba khu vực ký.
   - Có fixture dữ liệu dài qua renderer thật.

### Exact-head evidence trước đợt Delivery Note

- CI `30676447154`: SUCCESS — full tests, typecheck, build.
- PR Validation `30676447140`: SUCCESS.
- Purchase Feature CI `30676447126`: SUCCESS.
- UI Pull Request Validation `30676447124`: SUCCESS.
- Sales Feature CI `30676447116`: SUCCESS.
- Inventory and Manufacturing CI `30676447112`: SUCCESS.

Exact-head evidence mới phải được ghi lại sau commit Delivery Note. Review trực quan HTML preview/PDF bằng dữ liệu dài vẫn là gate trước merge.

## PR tồn đọng cũ — CLOSED

Đã đóng: `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Không merge nguyên trạng branch stale/conflicted. Chỉ tham khảo từng file khi cần.

## Đã hoàn tất trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Sales Order → Production Request → Work Order → Paint Job → Delivery lineage đã có.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- FIFO, lịch sử nhập, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.
- Regression: `200 + 100`, nhận `230` → `200 + 30`, nợ `70` cây / `504 m`, khoảng thêm `55–85`.

### Purchase authenticated QA — DONE / MERGED

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- CI, PR Validation, Purchase, Sales, Inventory và UI authenticated gates: SUCCESS.
- Desktop Chrome + Pixel 7 lifecycle PASS.

## MetaForge MISA-style UI

- Công việc UI đã vào default trước khi nhánh in ấn đồng bộ base.
- Nhánh in ấn giữ nguyên toàn bộ thay đổi MetaForge khi merge base.
- Login/landing vẫn là backlog riêng.

## Chưa được phép gọi là hoàn tất toàn quy trình

Tài liệu `25.7 QUY TRÌNH.docx` còn thiếu hoặc chưa chứng minh:

1. Finance hoàn chỉnh: AR/AP aging, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
2. Daily detailed ledger snapshot, freeze và adjustment theo vai trò.
3. Warranty/defect bốn nguyên nhân, supplier debt hold/offset và capacity/overtime.
4. End-to-end acceptance từ Sales Order đến production, inventory, delivery, debt, daily ledger, adjustment và warranty.

## Hàng đợi canonical

1. Print design — `PR OPEN / DELIVERY NOTE VALIDATION`.
2. Finance clean rebuild — `NEXT BUSINESS EPIC`.
3. Daily detailed ledger — `QUEUED`.
4. Warranty / defects / capacity — `QUEUED`.
5. End-to-end acceptance — `QUEUED`.
6. Login/landing — `SEPARATE UI BACKLOG`.

## Release boundary và safety

- Không deploy Cloudflare nếu chưa có yêu cầu riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Generic FIFO production vẫn disabled.
- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
