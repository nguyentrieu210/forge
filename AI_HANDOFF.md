# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current default head trước docs handoff: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Đọc theo thứ tự: `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, merge và release evidence.

## PR cleanup

Toàn bộ PR stale trước đây đã đóng: `#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Không reopen và không merge nguyên branch cũ. Branch cũ chỉ làm nguồn tham khảo từng file cho nhánh sạch từ current default.

## Đã merge trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO đơn cũ trước, lịch sử nhập, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.
- Regression: `200 + 100`, nhận `230` → `200 + 30`, nợ `70` cây / `504 m`, khoảng thêm `55–85`.

### Purchase authenticated QA

- PR `#137` merge SHA: `29fee0200d8118eef2d0ae9e524a3a00acfab00f`.
- Exact PR head: `fd03d22872c2234d50f616a5d8956c8b62f26b40`.
- CI `30670524038`: SUCCESS.
- PR Validation `30670524052`: SUCCESS.
- Purchase Feature CI `30670524133`: SUCCESS.
- UI Pull Request Validation `30670524072`: SUCCESS.
- Sales `30670524058` và Inventory `30670523976`: SUCCESS.

Authenticated evidence đã khóa:

- cookie + CSRF thật;
- authoritative Alumdoor app cài vào D1 local;
- Item/UOM search;
- Purchase Order create/save/submit/reopen;
- Purchase Receipt create/save/preview/submit/cancel/reopen;
- Desktop Chrome và Pixel 7;
- Tiến Đạt `200 + 100`, nhận `230` ra `200 + 30`, lưu đúng hai `purchase_order`, đọc lại lịch sử, `85` được phép và `86` bị từ chối.

QA chỉ dùng local/ephemeral. Không deploy Cloudflare, không mutate production, không bật generic FIFO rollout.

## Trạng thái thật

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Còn thiếu hoặc chưa chứng minh:

1. Finance full scope.
2. Daily detailed ledger snapshot/freeze/adjustment.
3. Warranty/defects và capacity/overtime.
4. Authenticated end-to-end acceptance.
5. UI MetaForge MISA-style và login/landing cần rebuild riêng nếu vẫn còn yêu cầu.

## Việc tiếp theo

Bắt đầu `P1 — Finance clean rebuild` từ exact current default mới nhất.

- Dùng closed PR `#15` và backup `#40` chỉ để tham khảo từng file.
- Phạm vi bắt buộc: due date, AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance, UI/report navigation và permission.
- Migration append-only, dry-run, checksum, rollback và production-shaped evidence.
- Merge chỉ khi full CI và Finance-specific gates xanh trên exact head.

Sau Finance: Daily ledger → Warranty/Capacity → end-to-end acceptance.

## Release boundary

- Không deploy Cloudflare nếu chưa có lệnh riêng.
- Không sửa production secret hoặc DNS.
- Không thay rollout state.
- Không mutate dữ liệu khách hàng.
- Generic FIFO production vẫn disabled.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- cookie/token;
- generated evidence.
