# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md`, `CURRENT_STATUS.md`, `DELIVERY_POLICY.md` và `AI_HANDOFF.md` trước khi tiếp tục.

## Hoàn tất — Tiến Đạt purchase FIFO

- PR #134 merge SHA: `1d05ed97836aa7bb753f8aa50a56991201a8d10a`.
- Exact PR head: `39eb6f25b337dd3fc973bf2b7a9d6b0e7204a420`.
- Full CI, PR Validation, Purchase, Sales, Inventory và UI/browser/auth gates: SUCCESS.
- Form đặt nhôm, FIFO theo ngày đơn, lịch sử nhận, công nợ cây/mét và dung sai Tiến Đạt 5% đã có trên default.
- Không deploy Cloudflare, không thay rollout state và không mutate dữ liệu production.

## P0 — Purchase authenticated QA clean rebuild

### Nguồn

- Tạo một branch mới từ exact current default sau docs merge.
- Không reopen PR #103.
- Chỉ mang từng file QA đã review từ branch cũ; không mang workflow vận chuyển hoặc trạng thái stale.

### Phạm vi bắt buộc

- Login và boot tenant local bằng cookie + CSRF thật.
- Cài app Alumdoor authoritative vào D1 local.
- Item/UOM dropdown search.
- Purchase Order create/save/submit và mở lại form thật.
- Purchase Receipt create/save/preview/submit/cancel và mở lại form thật.
- Desktop Chrome và Pixel 7.
- Bổ sung authenticated journey cho Tiến Đạt FIFO:
  - tạo hai đơn `200` và `100` cây cùng mã/quy cách, ngày khác nhau;
  - preview nhận `230` cây phải ra `200 + 30`;
  - draft receipt giữ đúng hai `purchase_order`;
  - sau submit, preview lần sau hiện lịch sử và nợ `70` cây / `504 m`;
  - khoảng giao thêm `55–85` cây;
  - `86` cây bị từ chối, `85` cây được phép.
- Generic FIFO rollout vẫn disabled; QA chỉ dùng dữ liệu local/ephemeral.

### Trình tự

1. Đọc exact default head và CI hiện tại từ GitHub.
2. Tạo một branch canonical.
3. Mang source/test QA cần thiết từ PR #103 theo từng file.
4. Chạy focused Purchase tests và browser QA trước push.
5. Mở một PR canonical, khóa exact head khi CI chạy.
6. Sửa direct cause trên cùng branch.
7. Merge khi full CI, Purchase gate và UI authenticated gates đều xanh.
8. Không deploy Cloudflare nếu chưa có yêu cầu rõ.

### Done condition

- Authenticated Purchase lifecycle PASS trên desktop và Pixel 7.
- Authenticated Tiến Đạt FIFO journey PASS.
- Exact merged SHA có CI xanh.
- Không có workflow tạm, secret hoặc generated artifact.

## P1 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và production-shaped evidence.

## P2 — Daily ledger

- Immutable daily snapshot theo ngày/company/warehouse/customer/order.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P3 — Warranty / Capacity

- Bốn nguyên nhân lỗi/bảo hành và accounting effect.
- Capacity theo workstation, thời gian định mức, overtime, WIP và overload policy.

## P4 — End-to-end acceptance

Sales Order → production → inventory → delivery → debt → daily ledger → adjustment → warranty.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Full CI chịu trách nhiệm test/typecheck/build.
- Feature/UI workflow chỉ chạy đúng scope.
- Release chỉ từ exact merged SHA qua dedicated production workflow.
- Không sửa production secret/DNS, xóa Cloudflare resource, bật generic FIFO rollout hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- cookie hoặc token.
