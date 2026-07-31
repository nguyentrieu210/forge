# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head trước closeout docs: `76b71aab3c2eacf816986c247b25f564fc808a96`.
- Đọc theo thứ tự: `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, merge và release evidence.

## PR cleanup

Toàn bộ PR còn mở đã được đóng:

`#15`, `#35`, `#36`, `#40`, `#73`, `#74`, `#79`, `#81`, `#103`, `#106`, `#109`.

Lý do chung:

- tất cả `mergeable=false`;
- diverged từ `116` đến `351` commit so với current default;
- nhiều PR là backup/tmp/duplicate hoặc workflow cũ;
- branch vẫn được giữ nguyên làm nguồn tham khảo, không mất code.

Không reopen và không merge nguyên branch cũ. Mọi epic phải dựng lại từ exact current default và chỉ mang từng file đã review.

## Đã merge trên default

### Sales-to-Production

- PR `#131` merge SHA: `e315007db174d70d6f73c68f2115e7956b09bf1d`.

### Tiến Đạt purchase FIFO

- PR `#134` merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Form đặt nhôm, FIFO đơn cũ trước, lịch sử nhập, công nợ cây/mét và dung sai Tiến Đạt `5%` đã có.
- Regression: `200 + 100`, nhận `230` → `200 + 30`, nợ `70` cây / `504 m`, khoảng thêm `55–85`.

## Trạng thái thật

Không được tuyên bố toàn bộ quy trình `25.7 QUY TRÌNH.docx` đã hoàn tất.

Còn thiếu hoặc chưa chứng minh:

1. Purchase authenticated QA clean rebuild.
2. Finance full scope.
3. Daily detailed ledger snapshot/freeze/adjustment.
4. Warranty/defects và capacity/overtime.
5. Authenticated end-to-end acceptance.
6. UI MetaForge MISA-style và login/landing cần rebuild riêng nếu vẫn còn yêu cầu.

## Việc tiếp theo

Bắt đầu `P0 — Purchase authenticated QA clean rebuild` từ exact current default mới nhất.

- Không reopen PR `#103`.
- Chỉ mang từng file QA cần thiết.
- Bổ sung authenticated Tiến Đạt FIFO journey.
- Desktop Chrome + Pixel 7.
- Merge chỉ khi full CI, Purchase gate và UI authenticated gate xanh trên exact head.

Sau Purchase QA: Finance → Daily ledger → Warranty/Capacity → end-to-end acceptance.

## Release boundary

- Không deploy Cloudflare trong đợt closeout PR.
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
