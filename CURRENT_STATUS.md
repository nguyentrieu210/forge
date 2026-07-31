# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch hiện tại: `hotfix/alumdoor-print-list-delete`.
- Current default head trước docs handoff: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- GitHub là nguồn sự thật cho code, CI, PR và release evidence.

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

- Không deploy Cloudflare trong đợt Purchase QA.
- Không sửa production secret, DNS hoặc rollout state.
- Không migrate hoặc mutate dữ liệu tenant production.
- Generic FIFO production vẫn disabled.

## Hàng đợi canonical

1. Finance clean rebuild — `NEXT`.
2. Daily detailed ledger — `QUEUED`.
3. Warranty / defects / capacity — `QUEUED`.
4. End-to-end acceptance — `QUEUED`.
5. UI MetaForge MISA-style và login/landing — `SEPARATE UI BACKLOG`.

## Safety

- Không commit `.env`, `server/work/`, `tmp`, backup, cookie, token hoặc generated evidence.
- Không merge branch stale/conflicted chỉ để làm sạch danh sách PR.
