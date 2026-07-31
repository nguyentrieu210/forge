# NEXT TASKS

## P0 — Bán hàng multi-UOM và tồn khả dụng

Đã xong:

- Exact Item Price theo `Bảng giá + Mặt hàng + ĐVT`.
- Tương thích an toàn với Item Price legacy.
- Picker ĐVT theo Item/UOM Conversion.
- Nạp giá và tồn theo Item + Kho + ĐVT trên Báo giá/Đơn hàng.
- Preview từ chối giá thiếu/sai tiền tệ, âm/sai định dạng hoặc đã ngừng áp dụng.
- Test tích hợp trực tiếp `alumdoor.sales.item_context` cho exact UOM price, tồn quy đổi, currency mismatch, disabled/malformed price, legacy UOM và undeclared UOM.
- Test quyền metadata thật: `Kinh doanh` chỉ đọc `Price List`/`Item Price`, bị từ chối create/save; `Kế toán` vẫn create/save được cả hai.
- Exact head `22b13a8aa597855792848dd085af741f467efaf7` đã qua Sales Feature CI run `30620312791` và PR Validation run `30620312786`.

Blocker hiện tại:

- Exact head có test quyền `9bcb36f4f068e662cfad2e1f64591390808cbe8f` chưa đạt G4 vì GitHub Actions thất bại trước khi job bắt đầu, `steps=null` và không có log.
- Runs gần nhất: Sales Feature CI `30620681609`, PR Validation `30620681661`, Cloudflare observation `30620681614`.
- Phân loại: **infrastructure**. Không sửa code theo các run này và không coi chúng là test failure.

Còn lại trước khi đề nghị merge/deploy:

1. Khôi phục GitHub Actions runner/quota/billing hoặc nguyên nhân hạ tầng tương ứng, rồi chạy lại Sales Feature CI và PR Validation trên exact head hiện hành; mọi step phải xanh.
2. Smoke Báo giá/Đơn hàng trên staging: chọn Item, đổi ĐVT, đổi Bảng giá, đổi Kho, kiểm trạng thái tồn và giá.
3. Nạp ít nhất hai Item Price khác ĐVT cho cùng một Item trên staging và xác minh giá không bị quy đổi chéo.
4. Xác minh Item Price legacy không UOM vẫn chạy; legacy có UOM chỉ chạy khi dòng khớp.
5. Smoke các lỗi giá mới: thiếu currency, currency khác chứng từ, rate âm/sai định dạng và giá disabled không được điền vào dòng.
6. Smoke quyền bằng tài khoản thật: `Kinh doanh` đọc được Bảng giá/Đơn giá nhưng không tạo, sửa hoặc xoá master; `Kế toán` vẫn quản lý được.
7. Thiết kế bước tiếp theo: reservation/ATP theo Sales Order; chưa bật trong đợt này.
8. Chỉ chuyển PR #25 khỏi draft sau exact-head CI xanh và browser/staging smoke.
9. Không merge hoặc deploy production nếu chưa có explicit approval.

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
