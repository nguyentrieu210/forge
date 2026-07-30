# NEXT TASKS

## P0 — Xác minh production tenant `alu` hiện hành

**Mục tiêu:** chứng minh deployment đang live hoạt động đúng, thay vì coi exit code là nghi thức ban phước cho hạ tầng.

- Người vận hành đã xác nhận backup, tenant preflight và live deploy phiên bản trước FIFO ngày 2026-07-30.
- Còn lại: xác nhận Gateway version/traffic; smoke `alu.kairo.vn` cho login, list, form, create/update/delete chứng từ thử, Purchase Order preview và tải PDF.
- Ghi deployment/version ID, thời điểm, kết quả từng bước và vị trí backup mã hóa; không ghi secret hoặc dữ liệu khách hàng.
- Rollback trigger: login/API 5xx, sai tenant/database, mất dữ liệu CRUD, permission regression hoặc print/PDF lỗi nghiêm trọng.

## P0 — Hoàn thiện và rollout hàng đợi nhập nhôm FIFO

**Mục tiêu:** đưa contract tại `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md` từ backend core đã xanh CI thành workflow production đầy đủ, có backfill và UI vận hành được.

- HEAD implementation đã qua CI run `30567772883`: test, typecheck và build **PASS**.
- Feature rollout mặc định **tắt**. Không có rollout row hoặc `enabled=0` thì PO/Receipt tiếp tục dùng controller legacy.
- Không bật rollout cho `alu` trước backfill/checksum, M5–M7 và staging smoke.

### Hoàn thành — M1: Schema, contract và atomic persistence

- Migration:
  - `0027_purchase_receipt_allocation.sql`
  - `0028_purchase_allocation_cancel_guard.sql`
  - `0029_purchase_allocation_rollout.sql`
- Có queue, windows, obligations, allocations, unapplied, settlement entries, revision claims, views và triggers.
- Allocation rows được ghi cùng D1 batch với document, stock, procurement compatibility projection và mutation receipt.
- Revision conflict abort toàn batch và được phân loại retryable.
- SQL tests cover stale revision rollback, row guards, reversal cap, PO cancel, settlement boundaries và rollout activation constraints.

### Hoàn thành — M2: Canonical material key

- Server hash schema v1 từ item, chiều dài, barem kg/m, màu, dập, measurement profile và stock UOM.
- Fixed-point micros, null/empty normalization và canonical JSON ổn định.
- Test khóa việc khác quy cách không được bù lẫn.

### Hoàn thành — M3: Supplier coordinator

- PO/Receipt submit/cancel được serialize theo `purchase:<tenant>:<company>:<supplier>` trong namespace `AGGREGATES` hiện có.
- Không lock riêng từng vật tư nên không tạo multi-lock/deadlock trong một xe nhiều mặt hàng.
- Retry revision conflict tối đa ba lần với cùng command id; lỗi nghiệp vụ và version conflict khác không bị nuốt.

### Đang làm — M4: FIFO planner và application lifecycle

Đã xong:

- PO submit mở obligation theo row.
- Receipt submit tự FIFO qua nhiều PO.
- Một Receipt nhiều dòng được xử lý tuần tự theo queue để các dòng cùng xe không tranh nhau.
- Receipt vượt nominal nhưng trong tolerance tạo unapplied quantity.
- Receipt cancel tạo allocation/procurement reversal theo nguồn.
- Nhôm cây/lá lấy `qty_bar` làm nghĩa vụ/tồn; kg barem và actual weight giữ riêng.
- Integration test 200 + 100 / nhận 230 => 200 + 30, còn 70.
- Stress planner 250 obligation rows.

Còn lại:

- Khi PO mới gia nhập window đang có unapplied quantity, tự tạo `apply_unapplied` allocation event và giảm unapplied source trong cùng batch.
- Bổ sung production-shaped integration test cho cancel Receipt và nhiều Receipt lines trên cùng queue.
- Test đồng thời ở worker/DO level, không chỉ revision/SQL và planner unit.

### P0 tiếp theo — M5: Settlement và edge cases

- Tạo server action/API cho `Đối soát giao cuối / Đóng trong dung sai`.
- Permission server-side và reason bắt buộc.
- Integer min/max, shortage/overage variance và settlement event append-only.
- Reverse settlement chỉ khi window kế tiếp chưa có activity.
- Manual FIFO override cùng supplier/material/window, permission + reason.
- Cảnh báo backdated Receipt; allocation vẫn theo commit sequence.
- Khóa PO amend/cancel và Receipt cancel với settlement lifecycle đúng contract.

### P0 tiếp theo — M6: Backfill và cutover

- Viết `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Đọc voucher revision, line key, `versions.snapshot_json`, PO/Receipt child rows và legacy progress.
- Exact unique => resolved; mơ hồ => `legacy_unresolved`; tuyệt đối không đoán row id.
- Xuất resolved/unresolved counts, PO-level quantity checksum và file review.
- Không cho activation nếu checksum lệch hoặc unresolved > 0.
- Activation ghi `purchase_allocation_rollout_state` với checksum, actor và timestamp.
- Sau cutover, allocation ledger là nguồn sự thật; progress table cũ chỉ là compatibility projection sinh từ cùng plan.

### P1 — M7: UI và báo cáo

- Preview allocation trước submit Receipt.
- Timeline PO/Receipt: Receipt nào trừ PO row nào, số cây, barem, cân thực và reversal.
- Hiển thị nominal remaining, actual received, unapplied, settlement range và variance.
- Settlement/manual override action có permission, reason và confirmation rõ.
- Báo cáo NCC: tổng đặt, tổng về, nợ danh nghĩa, window, dải giao cuối và tuổi PO cũ nhất.

### P0 rollout — M8: Gate và deployment

Đã xong:

- CI test/typecheck/build xanh trên run `30567772883`.
- Rollout gate mặc định tắt và database chặn bật nếu thiếu checksum/unresolved còn tồn.
- Draft PR CI tạm #6 đã đóng, không merge và không deploy.

Còn lại:

- Đo D1 batch size/latency với hàng trăm allocation rows và supplier contention.
- Backup production mới.
- Apply migrations trên staging.
- Dry-run backfill staging/backup, review unresolved/checksum.
- Staging smoke toàn luồng PO→Receipt→cancel→settlement→report.
- Chỉ sau explicit production approval mới migrate/deploy/activate `alu`.

## P1 — Kiểm thử ổn định bản in Purchase Order Alumdoor

- Fixture production renderer đã khóa A4 portrait, 13 cột, Dập trước Ghi chú, không Số bó, căn giữa, logo/header, thứ tự row, format số và không placeholder.
- Còn lại: browser smoke production, tải PDF thật, kiểm font/tràn nội dung/trang trắng và cân nhắc visual regression Chromium.
- Phụ thuộc: xác minh production tenant/Gateway.

## Hoàn thành — Khôi phục test/lint gate

- Test contract Alumdoor v2.0.34 đã phản ánh layout hiện hành.
- Frontend lint: 0 native UI violations, 0 hook-order violations.
- Root test/typecheck/build đã pass ở audit trước; CI FIFO mới cũng pass test/typecheck/build.

## P1 — Bổ sung test lưu partial Frappe document

**Mục tiêu:** khóa bug PUT partial vào submitted document phải merge stored document trước controller normalization.

- Cover normal doc, submitted doc, child table và concurrency/timestamp.
- Targeted facade/integration test + root gate.

## P2 — Hoàn thiện page/dashboard/process renderers

- Thay fallback bằng renderer/API contract đầy đủ.
- Test route metadata, unsupported route và permission.

## P2 — Hoàn thiện collaboration UI

- Assign picker, upload/delete attachment và add/remove tag từ form context.
- Test optimistic update, permission và refetch.

## P2 — Đồng bộ tài liệu trạng thái legacy

- Đối chiếu `server/STATUS.md`, `client/docs/KNOWN_GAPS.md` và traceability với code/migrations hiện tại.
- Mỗi tuyên bố phải có commit/file/lệnh/ngày chứng minh.

## P3 — Tối ưu bundle frontend

- Đo và giảm chunk lớn, không tăng tổng payload đáng kể.
- Build stats, browser smoke và Core Web Vitals.

## P3 — Chuẩn hóa local onboarding

- Có một đường chạy local Gateway + Tenant + D1 từ config mẫu, không phụ thuộc thông tin truyền miệng hoặc production secret.
- Kiểm tra clean-room setup.
