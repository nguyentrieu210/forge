# NEXT TASKS

## P0 — Bán hàng multi-UOM và tồn khả dụng

1. Chạy full CI: test, typecheck, build và brief check.
2. Smoke Báo giá/Đơn hàng: chọn Item, đổi ĐVT, đổi Bảng giá, đổi Kho, kiểm trạng thái tồn và giá.
3. Nạp ít nhất hai Item Price khác ĐVT cho cùng một Item trên staging.
4. Xác minh Item Price legacy chỉ dùng khi UOM khớp.
5. Thiết kế bước tiếp theo: reservation/ATP theo Sales Order; chưa bật trong đợt này.
6. Không deploy production nếu chưa có explicit approval.


Ngày cập nhật: **2026-07-31**.

## P0 — Xác minh release sidebar gọn trên production

**Mục tiêu:** xác nhận Cloudflare đã đưa bản sidebar desktop gọn lên Gateway production mà không ảnh hưởng route hoặc permission.

Hiện trạng:

- Code sidebar: `87cd45aa9272f5600ff3d5914f697ce9a26994b6`.
- Release target: `da04f7fcfdc4c8e4ddf7ff70c79e3a10458ce412`.
- Production trigger: `9a7bbc14b8e7f3e556404cce19914da1e21e5e10`.
- Trigger file: `.github/release/gateway-production.trigger`.
- File giao diện sửa: `client/apps/runtime/src/styles.css`.
- Sidebar mở rộng còn `15.75rem`; group header, menu row, icon và search được thu gọn.
- Không ẩn mục menu và không thay đổi quyền.
- Chưa có Cloudflare deployment/version ID hoặc smoke evidence sau trigger.

Việc cần làm:

1. Xác nhận Cloudflare build mới nhất lấy commit có chứa trigger `9a7bbc14...` hoặc HEAD kế tiếp chỉ cập nhật tài liệu.
2. Xác nhận Gateway build dùng:

```bash
pnpm --filter metaforge run build && node server/scripts/stage-client-bundle.mjs
```

3. Xác nhận deploy command:

```bash
pnpm --dir server exec wrangler deploy --config apps/gateway-worker/wrangler.jsonc
```

4. Smoke desktop/mobile tại `alu.kairo.vn`:
   - sidebar không tràn ngang;
   - nhãn dài vẫn đọc được bằng tooltip/ellipsis hợp lý;
   - group đóng/mở bình thường;
   - pin, tìm menu và thu gọn sidebar vẫn hoạt động;
   - không có console error mới.
5. Ghi Gateway deployment/version ID và ảnh smoke vào bằng chứng release.
6. Kiểm tra CI/check của HEAD mới; hiện GitHub connector chưa trả workflow run hoặc status.

Hoàn thành khi Cloudflare build/deploy xanh, production hiển thị sidebar mới và smoke không có regression.

## P0 — Xác minh production tenant `alu`

- Xác nhận Gateway version và production traffic.
- Smoke `alu.kairo.vn`: health, login, list, form, create/update/delete chứng từ thử, Purchase Order preview và tải PDF.
- Ghi deployment/version ID, thời điểm và kết quả từng bước; không ghi secret hoặc dữ liệu khách hàng.
- Rollback trigger: login/API 5xx, sai tenant/database, mất dữ liệu CRUD, permission regression hoặc print/PDF lỗi nghiêm trọng.

## P0 — Hoàn thiện FIFO Purchase Receipt

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Hoàn thành — M1: Schema, contracts và atomic persistence

- Migration `0027`, `0028`, `0029`.
- Queue, windows, obligations, allocations, unapplied, settlement entries, revision claims, views và triggers.
- Allocation được ghi cùng D1 batch với document, stock, procurement compatibility projection và mutation receipt.
- Revision conflict abort toàn batch và được phân loại retryable.
- SQL tests cover stale revision, row guards, reversal cap, PO cancel, settlement boundary và rollout activation constraints.

### Hoàn thành — M2: Canonical material key

- Server hash schema v1 từ item, chiều dài, barem kg/m, màu, dập, measurement profile và stock UOM.
- Fixed-point micros, canonical JSON và null/empty normalization.
- Khác quy cách không được bù lẫn.

### Hoàn thành — M3: Supplier coordinator

- PO/Receipt submit/cancel serialize theo `purchase:<tenant>:<company>:<supplier>`.
- Revision conflict retry tối đa ba lần với cùng command ID.
- Không nuốt business/version conflict khác.

### Đang làm — M4: FIFO lifecycle

Đã xong:

- PO submit mở obligation theo row.
- Receipt submit tự FIFO qua nhiều PO.
- Một Receipt nhiều dòng xử lý tuần tự theo queue.
- Vượt nominal nhưng trong tolerance tạo unapplied quantity.
- Receipt cancel tạo reversal theo nguồn.
- Nhôm cây/lá lấy `qty_bar` làm nghĩa vụ/tồn; barem và actual weight giữ riêng.
- Integration test 200 + 100, nhận 230 => 200 + 30, còn 70.
- Stress planner 250 obligation rows.

Còn lại:

1. Khi PO mới gia nhập window có unapplied quantity, tạo `apply_unapplied` allocation event và giảm source trong cùng batch.
2. Production-shaped integration test cho Receipt cancel.
3. Test nhiều Receipt lines cùng queue.
4. Worker/DO concurrency test, không chỉ planner/SQL.

### P0 — M5: Settlement và edge cases

- Server action `Đối soát giao cuối / Đóng trong dung sai`.
- Server-side permission và reason bắt buộc.
- Integer min/max, shortage/overage variance và append-only settlement event.
- Reverse settlement chỉ khi window kế tiếp chưa có activity.
- Manual FIFO override trong cùng supplier/material/window, có permission + reason.
- Backdated Receipt warning nhưng allocation theo commit sequence.
- PO amend/cancel và Receipt cancel theo settlement lifecycle.

### P0 — M6: Backfill và cutover

- Viết `server/scripts/backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Đọc voucher revision, line key, `versions.snapshot_json`, child rows và legacy progress.
- Exact unique => resolved; mơ hồ => `legacy_unresolved`; không đoán row ID.
- Xuất resolved/unresolved count và PO-level checksum.
- Không activation nếu checksum lệch hoặc unresolved > 0.
- Activation ghi checksum, actor và timestamp vào rollout state.
- Sau activation, allocation ledger là nguồn sự thật; progress table cũ chỉ là compatibility projection.

### P1 — M7: UI và báo cáo

- Preview allocation trước submit Receipt.
- PO/Receipt timeline và drill-down.
- Hiển thị nominal remaining, actual received, unapplied, settlement range và variance.
- Settlement/manual override action có confirmation, permission và reason.
- Báo cáo NCC: tổng đặt, tổng về, nợ danh nghĩa, window, dải giao cuối và tuổi PO cũ nhất.

### P0 — M8: Gate và rollout

Đã xong:

- Exact code SHA `591ca359...` PASS install/test/typecheck/build trên run `30570000862`.
- Rollout gate mặc định tắt; database chặn activation thiếu checksum hoặc còn unresolved.
- Tenant-safe migration wrapper có dry-run, explicit confirmation, clean-worktree guard và generated config cleanup.

Còn lại:

1. D1 batch size/latency với hàng trăm allocations.
2. Supplier contention load test.
3. Backup production mới.
4. Staging migrations.
5. Backfill dry-run trên staging/production backup.
6. Review unresolved/checksum.
7. Staging smoke PO → Receipt → cancel → settlement → report.
8. Explicit production approval trước activation.

## P1 — Purchase Order print/PDF verification

- Fixture production renderer đã khóa A4 portrait, 13 cột, Dập trước Ghi chú, không Số bó, căn giữa, logo/header, row order, number format và không placeholder.
- Còn lại: browser smoke production, tải PDF thật, kiểm font, tràn nội dung, trang trắng và visual regression Chromium.

## P1 — Partial submitted-document save test

- Cover PUT partial merge cho normal doc, submitted doc, child table và concurrency/timestamp.
- Targeted facade/integration test và root gate.

## P2 — Runtime completeness

- Hoàn thiện page/dashboard/process renderers.
- Hoàn thiện assign picker, attachment upload/delete và tag UI.
- Đồng bộ `server/STATUS.md`, known gaps và traceability với code/migrations.

## P3 — Engineering hygiene

- Giảm frontend chunk lớn có đo lường.
- Chuẩn hóa local onboarding Gateway + Tenant + D1 từ config mẫu, không dùng production secret.
- Cài Forge project pack (`FORGE.md`, `.forge/manifest.json`) qua một PR riêng sau khi review nội dung ZIP; không chạy installer mù quáng.
