# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch hiện tại: `hotfix/alumdoor-print-list-delete`.
- Current default head khi mở nhánh in ấn: `4d86c1fd8c191f26f3961762b281fca1ad765855`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

## Nhánh thiết kế in ấn — IN PROGRESS

- Branch: `feat/print-design-sales-documents-20260801`.
- Base exact SHA: `4d86c1fd8c191f26f3961762b281fca1ad765855`.
- Mẫu đầu tiên: `Đơn bán hàng ALUMDOOR` cho `Sales Order`, A4 portrait, 13 cột, có kích thước cửa, số bộ, số lượng, đơn giá, mô tơ/phụ kiện và ghi chú lắp đặt.
- Print format mới được tách vào `server/briefs/alumdoor-v2.prints.json`; `forge-app` ghép sidecar trước schema validation và compile.
- Có unit test cho cơ chế sidecar và regression test qua renderer thật cho Sales Order.
- Roadmap tiếp theo: Delivery Note/giao lắp → Production Request → Cut Order → thu/chi, nghiệm thu, tem QR và bảo hành.
- Kiểm tra cục bộ đã chạy: Node syntax PASS, sidecar loader `3/3` PASS, JSON parse PASS, 13 độ rộng cột có tổng `100%`.
- Full repo build/typecheck/renderer test phải lấy bằng chứng từ PR CI vì môi trường hiện tại không clone được repository qua DNS.
- Không deploy Cloudflare, không sửa production secrets và không mutate dữ liệu tenant.

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

Exact-head evidence:

- CI `30670524038`: SUCCESS — tests, typecheck, build.
- PR Validation `30670524052`: SUCCESS.
- Purchase Feature CI `30670524133`: SUCCESS.
- UI Pull Request Validation `30670524072`: SUCCESS.
- Sales Feature CI `30670524058`: SUCCESS.
- Inventory and Manufacturing CI `30670523976`: SUCCESS.

Authenticated scope đã PASS:

- login/boot bằng cookie + CSRF thật;
- authoritative Alumdoor app cài vào D1 local;
- Item/UOM search;
- Purchase Order create/save/submit/reopen;
- Purchase Receipt create/save/preview/submit/cancel/reopen;
- Desktop Chrome và Pixel 7;
- Tiến Đạt FIFO `200 + 100`, nhận `230` phân bổ `200 + 30`, draft giữ đúng hai đơn, đọc lại lịch sử và công nợ; `85` được phép, `86` bị từ chối.

## Chưa được phép gọi là hoàn tất toàn quy trình

Tài liệu `25.7 QUY TRÌNH.docx` còn yêu cầu sổ chi tiết khóa theo ngày, công nợ tổng hợp, lỗi/bảo hành, năng lực sản xuất và kiểm nhận xuyên suốt. Current default chưa đủ các phần dưới đây:

1. Finance hoàn chỉnh: AR/AP aging, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
2. Daily detailed ledger snapshot, freeze và adjustment theo vai trò.
3. Warranty/defect bốn nguyên nhân, supplier debt hold/offset và capacity/overtime.
4. End-to-end acceptance từ Sales Order đến production, inventory, delivery, debt, daily ledger, adjustment và warranty.

## Release boundary

- Không deploy Cloudflare nếu chưa có yêu cầu riêng.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Generic FIFO production vẫn disabled.

## Hàng đợi canonical

1. Finance clean rebuild — `NEXT`.
2. Daily detailed ledger — `QUEUED`.
3. Warranty / defects / capacity — `QUEUED`.
4. End-to-end acceptance — `QUEUED`.
5. UI MetaForge MISA-style và login/landing — `SEPARATE UI BACKLOG`.
6. Print design — `SEPARATE SPECIALIST BRANCH`, không trộn vào Finance.

## Safety

- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
- Không merge branch stale/conflicted chỉ để làm sạch danh sách PR.
