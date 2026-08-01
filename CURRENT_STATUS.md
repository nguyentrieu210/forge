# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch hiện tại: `hotfix/alumdoor-print-list-delete`.
- Current default head khi đồng bộ nhánh in ấn: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

## Nhánh thiết kế in ấn — PR OPEN

- Branch: `feat/print-design-sales-documents-20260801`.
- PR: `#141` — `feat(print): add Alumdoor sales order print workspace`.
- Base ban đầu: `4d86c1fd8c191f26f3961762b281fca1ad765855`.
- Base mới đã đồng bộ: `f6420c70823b969a28b43e3f93004ebd52546adc`.
- Implementation head trước khi base đổi đã kiểm chứng: `7cb4607cf856fcef0093d2ed3a62ae449d1b2bb5`.
- Mẫu đầu tiên: `Đơn bán hàng ALUMDOOR` cho `Sales Order`, A4 portrait, 13 cột, có kích thước cửa, số bộ, số lượng, đơn giá, mô tơ/phụ kiện và ghi chú lắp đặt.
- Print format mới được tách vào `server/briefs/alumdoor-v2.prints.json`; `forge-app` ghép sidecar trước schema validation và compile.
- Loader hỗ trợ cả đường dẫn chuỗi và `file:` URL; regression khóa call site dùng `import.meta.url`.
- Có unit test cho cơ chế sidecar và regression test qua renderer thật cho Sales Order.
- Roadmap tiếp theo: Delivery Note/giao lắp → Production Request → Cut Order → thu/chi, nghiệm thu, tem QR và bảo hành.
- Kiểm tra cục bộ: Node syntax PASS, sidecar loader `4/4` PASS, JSON parse PASS, 13 độ rộng cột có tổng `100%`.

Exact implementation-head evidence trước khi đồng bộ base:

- CI `30676094630`: SUCCESS — full tests, typecheck, build.
- PR Validation `30676094648`: SUCCESS.
- Purchase Feature CI `30676094623`: SUCCESS.
- UI Pull Request Validation `30676094598`: SUCCESS.
- Sales Feature CI `30676094634`: SUCCESS — build server, focused regressions, Alumdoor brief validation.
- Inventory and Manufacturing CI `30676094629`: SUCCESS — build server, focused regressions, authoritative brief validation, catalog audit.

Final exact-head evidence sau khi đồng bộ base được ghi trong PR `#141`. Còn lại trước merge: review trực quan HTML preview/PDF với dữ liệu dài để xác nhận không tràn cột. Không deploy Cloudflare, không sửa production secrets và không mutate dữ liệu tenant.

## PR tồn đọng cũ — CLOSED

Đã đóng: `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Không merge nguyên trạng các branch stale/conflicted. Branch vẫn được giữ làm nguồn tham khảo từng file.

## Đã hoàn tất trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Sales Order → Production Request → Work Order → Paint Job → Delivery lineage đã có trên default.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO theo ngày đơn, lịch sử nhận, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.
- Regression khóa ví dụ `200 + 100`, nhận `230`, phân bổ `200 + 30`, nợ danh nghĩa `70` cây / `504 m`, khoảng giao thêm `55–85` cây.

### Purchase authenticated QA — DONE / MERGED

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- CI, PR Validation, Purchase, Sales, Inventory và UI authenticated gates: SUCCESS.
- Desktop Chrome + Pixel 7 lifecycle PASS.

## MetaForge MISA-style UI — IMPLEMENTED / CI PENDING

- Branch: `feat/metaforge-misa-workspace-ui-clean`.
- Base exact default head: `4d86c1fd8c191f26f3961762b281fca1ad765855`.
- Implementation head trước status docs: `054b7e23b8e18d74ec378316de2b132fd44aa0f7`.

Đã làm:

- Đưa `Tổng quan` thành mục độc lập ở sidebar; không còn lặp trong dải tab nghiệp vụ.
- Dải tab nghiệp vụ và Meta chia đều chiều ngang, chữ nhỏ hơn và truncate nhãn dài; không dùng cuộn ngang.
- Gom `Danh mục` về một màn tập trung theo nhóm như MISA.
- Thay màn quy trình cũ bằng luồng gọn và các lối tắt nghiệp vụ.
- Bổ sung workspace Meta gồm DocType, Workflow, Mẫu in và Thiết kế báo cáo.
- Thiết kế báo cáo có ba vùng: nguồn dữ liệu/widget bên trái, canvas kéo-resize ở giữa, bố cục/thuộc tính bên phải và chế độ xem trước.
- Khóa đúng `13` bảng màu toàn hệ thống, có light/dark; tên màu hiển thị bằng tiếng Việt.
- Thêm Playwright coverage cho sidebar Tổng quan, tab không overflow, Danh mục, report builder và số lượng 13 theme.

Chưa được xác nhận:

- Typecheck/build/e2e trên exact head mới.
- Desktop/mobile authenticated journey.
- PR canonical và exact-head CI.

Closed PR `#81/#109` chỉ được dùng để tham khảo từng file; không merge nguyên branch cũ. Login/landing không trộn vào branch này.

## Chưa được phép gọi là hoàn tất toàn quy trình

Tài liệu `25.7 QUY TRÌNH.docx` còn yêu cầu sổ chi tiết khóa theo ngày, công nợ tổng hợp, lỗi/bảo hành, năng lực sản xuất và kiểm nhận xuyên suốt. Current default chưa đủ các phần dưới đây:

1. Finance hoàn chỉnh: AR/AP aging, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
2. Daily detailed ledger snapshot, freeze và adjustment theo vai trò.
3. Warranty/defect bốn nguyên nhân, supplier debt hold/offset và capacity/overtime.
4. End-to-end acceptance từ Sales Order đến production, inventory, delivery, debt, daily ledger, adjustment và warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Generic FIFO production vẫn disabled.

## Hàng đợi canonical

1. MetaForge MISA-style UI — `IMPLEMENTED / CI PENDING`.
2. Print design — `PR OPEN / EXACT-HEAD VALIDATION`.
3. Finance clean rebuild — `NEXT BUSINESS EPIC`.
4. Daily detailed ledger — `QUEUED`.
5. Warranty / defects / capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.
7. Login/landing — `SEPARATE UI BACKLOG`.

## Safety

- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
- Không merge branch stale/conflicted chỉ để làm sạch danh sách PR.
