# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

Mọi agent phải đọc `EPIC_STATUS.md`, `CURRENT_STATUS.md`, `DELIVERY_POLICY.md` và `AI_HANDOFF.md` trước khi tiếp tục.

## P0 — Hoàn tất Sales-to-Production PR #131

### Trạng thái hiện tại

- PR: #131 — `feat(sales): rebuild order to production flow`.
- Branch: `feat/sales-order-production-flow-clean-20260801`.
- Default head: `5252b196b8cef5b1710c69d8bde04136741d0cc9`.
- Exact code head sau review: `4d60d26e8791c87cd9fa359d0310ef026f428c59`.
- PR mergeable; 19 commit mới trên default không chồng lên file source/test nghiệp vụ của PR.
- Finding partial Paint Job retry đã sửa và có regression.
- PR vẫn draft; chưa merge và chưa release.

### Việc tiếp theo

1. Lấy exact final head sau hai cập nhật handoff.
2. Chờ các workflow trên exact final head chạy terminal:
   - CI;
   - PR Validation;
   - Sales Feature CI;
   - Purchase Feature CI;
   - Inventory and Manufacturing CI;
   - UI Pull Request Validation.
3. Nếu fail, chỉ sửa direct cause từ log trên cùng branch; không mở PR thay thế.
4. Review final diff, tập trung vào:
   - Production Request theo từng bộ;
   - Work Order draft idempotent;
   - Paint Job theo từng `batch_no`, partial retry và batch aggregation;
   - delivery lineage bằng `sales_order_row_id`;
   - bảng Sales mở rộng và `depends_on`;
   - fail-closed khi duplicate-list lỗi trước hoặc sau preflight.
5. Khi exact-head checks xanh và không còn finding Critical/High, chuyển PR khỏi draft và merge bằng expected head SHA theo delivery policy.
6. Không deploy Cloudflare trong đợt này nếu chưa có yêu cầu rõ.
7. Sau merge, chạy authenticated operator journey tối thiểu:
   - tạo Sales Order có nhiều bộ;
   - sinh Production Request/Work Order đúng số bộ;
   - lặp lại thao tác không tạo trùng;
   - Cut/Paint theo Batch `THÔ`, retry tạo đúng batch còn thiếu;
   - Delivery giữ đúng lineage dòng bán.

### Done condition

- Code có trên default.
- Exact merged SHA có CI xanh.
- Authenticated operator journey PASS.
- Không có workflow tạm hoặc generated artifact trong diff.
- Có release evidence nếu sau này được yêu cầu deploy production.

## P1 — Purchase authenticated QA clean rebuild

Bắt đầu ngay sau khi Sales-to-Production merge ổn định:

- tạo branch mới từ exact current default;
- không reopen PR #103;
- chỉ mang source/test QA đã review;
- chạy focused Purchase tests trước push;
- Desktop Chrome và Pixel 7 lifecycle phải PASS;
- FIFO vẫn disabled.

## P2 — Finance

- PR #15 chỉ dùng tham khảo.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill append-only, có checksum, dry-run, rollback và production-shaped evidence.

## P3 — Daily ledger

- Immutable daily snapshot theo ngày/company/warehouse/customer/order.
- Chỉ kế toán tổng hợp, kế toán trưởng và Giám đốc được sửa sau cập nhật.
- Khóa sửa sau đóng ngày.
- Adjustment document có reason, actor và audit.
- Reconciliation Sales/Purchase/Inventory/Manufacturing/Finance.
- Có thao tác cập nhật dữ liệu từ theo dõi chung vào sổ chi tiết hàng ngày.

## P4 — Warranty / Capacity

- Bốn nguyên nhân lỗi/bảo hành và accounting effect:
  - motor/bình lưu điện theo thời hạn bảo hành;
  - lỗi sản xuất và người chịu trách nhiệm;
  - lỗi nhà cung cấp và công nợ hàng đổi trả;
  - lỗi khách hàng và chi phí theo công đoạn.
- Truy vết lỗi về số chứng từ và ngày giao hàng.
- Capacity theo workstation, thời gian định mức, tổng phút/ngày, 8 giờ hành chính, overtime, WIP và overload policy.

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
