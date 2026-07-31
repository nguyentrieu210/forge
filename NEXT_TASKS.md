# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md`, `CURRENT_STATUS.md`, `DELIVERY_POLICY.md` và `AI_HANDOFF.md` trước khi tiếp tục.

## P0 — Hoàn tất Tiến Đạt purchase FIFO

### Trạng thái hiện tại

- Branch: `feat/tien-dat-purchase-fifo-20260801`.
- Base exact: `e315007db174d70d6f73c68f2115e7956b09bf1d`.
- Code head trước handoff: `13d49cf4587f30c77837cbed9ac8d58add9296f2`.
- Form đặt nhôm, FIFO theo ngày đơn, lịch sử nhận, công nợ cây/mét và dung sai Tiến Đạt 5% đã có code + regression.
- Chưa merge, chưa deploy Cloudflare, chưa bật generic FIFO production rollout.

### Việc tiếp theo

1. Mở một PR canonical từ branch hiện tại.
2. Khóa exact final head trong lúc CI chạy.
3. Chạy và kiểm terminal:
   - CI: test, typecheck, build;
   - PR Validation;
   - Purchase Feature CI;
   - UI Pull Request Validation;
   - Sales/Inventory focused gate nếu workflow kích hoạt.
4. Nếu fail, sửa direct cause trên cùng branch, không mở PR thay thế.
5. Review exact diff:
   - entrypoint chỉ intercept hai method FIFO;
   - route khác tiếp tục delegate sang worker cũ;
   - Tiến Đạt mặc định 5% nhưng Supplier config được ưu tiên;
   - phân bổ 230 cây đúng `200 + 30`;
   - nợ danh nghĩa `70`, khoảng giao thêm `55–85`;
   - lịch sử chỉ đọc phiếu nhập đã ghi sổ;
   - draft receipt giữ `purchase_order` trên từng dòng;
   - final diff không có workflow tạm, secret, backup hoặc generated artifact.
6. Merge bằng expected exact head khi required checks xanh và không còn finding Critical/High.
7. Sau merge, bắt đầu Purchase authenticated QA clean rebuild từ exact default mới.
8. Không deploy Cloudflare hoặc bật rollout FIFO production nếu chưa có yêu cầu riêng.

### Authenticated acceptance sau merge

- Tạo hai Purchase Order Tiến Đạt cùng mã/quy cách, ngày khác nhau, `200` và `100` cây.
- Mở `Nhập nhôm FIFO theo đơn cũ`, nhập `230` cây và `644.184 kg`.
- Preview phải hiện `PO ngày 1: 200`, `PO ngày 2: 30`.
- Phiếu nhập nháp có hai dòng trỏ đúng hai đơn.
- Sau khi ghi sổ, preview lần sau phải hiện lịch sử nhận và nợ danh nghĩa `70` cây / `504 m`.
- Khoảng giao thêm hợp lệ phải là `55–85` cây với dung sai 5%.
- Thử `86` cây phải bị từ chối; `85` cây phải được phép.

### Done condition

- Exact merged SHA có CI xanh.
- Authenticated desktop flow PASS.
- Lịch sử và số dư đọc lại đúng sau submit.
- Không thay đổi rollout/production state ngoài phạm vi code.

## P1 — Purchase authenticated QA clean rebuild

- Tạo branch mới từ exact default sau FIFO merge.
- Không reopen PR #103.
- Chỉ mang source/test QA đã review.
- Desktop Chrome và Pixel 7 lifecycle phải PASS.
- FIFO generic rollout vẫn disabled cho tới khi có lệnh riêng.

## P2 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và production-shaped evidence.

## P3 — Daily ledger

- Immutable daily snapshot theo ngày/company/warehouse/customer/order.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.

## P4 — Warranty / Capacity

- Bốn nguyên nhân lỗi/bảo hành và accounting effect.
- Capacity theo workstation, thời gian định mức, overtime, WIP và overload policy.

## P5 — End-to-end acceptance

Sales Order → production → inventory → delivery → debt → daily ledger → adjustment → warranty.

## Quy tắc bắt buộc

- Một epic, một branch, một PR.
- Không thay head khi exact-head CI đang chạy.
- Không workflow dùng một lần, transport/sync workflow hoặc hidden trigger.
- Full CI chịu trách nhiệm test/typecheck/build.
- Feature/UI workflow chỉ chạy đúng scope.
- Release chỉ từ exact merged SHA qua dedicated production workflow.
- Không sửa production secret/DNS, xóa Cloudflare resource, bật FIFO hoặc mutate dữ liệu thật nếu chưa có lệnh riêng.

## File cấm commit

- `.env`;
- `server/work/`;
- `tmp/`;
- backup;
- generated evidence;
- cookie hoặc token.
