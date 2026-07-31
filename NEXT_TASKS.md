# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn thiện tài chính và công nợ AR/AP

Contract: `server/docs/FINANCE-AR-AP-BRD.md` trên branch `feat/finance-ar-ap-completion`, draft PR `#15`.

### Quyết định đã chốt

- Customer AR + Supplier AP cùng workstream.
- Aging bucket: chưa đến hạn, 1–30, 31–60, 61–90, trên 90 ngày.
- Allocation chỉ cùng company, party, party account và currency.
- Credit-limit/Sales Order blocking và cross-currency allocation để pha sau.
- Không deploy Cloudflare hoặc sửa production secrets trong workstream nếu chưa có yêu cầu rõ.

### Đã implement — M1A due date và aging backend

- Migration append-only `0030_finance_invoice_aging.sql`.
- Database guard cho due date bắt buộc/hợp lệ và không trước posting date.
- Legacy invoice thiếu due date fallback về posting date trong `finance_invoice_terms`.
- Metadata Sales Invoice có field Due Date bắt buộc.
- `FinanceQueryCompiler` cho:
  - `Accounts Receivable Aging`;
  - `Accounts Payable Aging`.
- `as_of_date` bắt buộc, tenant/cutoff/filter dùng bind parameter.
- Query Worker dùng finance compiler cho synchronous và prepared reports.
- Permission server-side cho Accounts, Sales Manager và Purchase Manager theo domain.
- D1 guard map thành validation 422 an toàn.
- SQL test mới đã được nối vào `server/package.json`.
- Targeted tests đã thêm cho migration, query compiler, permission và error mapping.
- Implementation head trước các commit trạng thái cuối: `0c6193090471d447936131bb38e9e4b6306916af`.

### Verification hiện có

- Migration test độc lập: **PASS** sau khi kiểm metadata required.
- TypeScript strict harness cho finance compiler: **PASS**.
- SQL execution fixture tại cutoff `2026-07-31`: invoice 1.000, đã thanh toán 300, thanh toán 700 sau cutoff => outstanding 700, overdue 21 ngày, bucket 1–30 ngày: **PASS**.
- Chưa có root `pnpm run test`, `pnpm run typecheck`, `pnpm run build` hoặc GitHub code CI exact-head.

### Việc tiếp theo

#### M1B — Đóng gate aging backend

1. Đọc workflow `CI` mới nhất cho exact branch head sau commit trạng thái cuối.
2. Chạy/đợi root test/typecheck/build và sửa mọi regression, đặc biệt query-worker worker typecheck và migration chain.
3. Thêm worker-level report request fixture nếu root tests chưa cover D1ReportService với finance compiler.
4. Cập nhật exact PASS SHA vào CURRENT_STATUS/NEXT_TASKS/AI_HANDOFF.
5. Chỉ chuyển PR ready khi exact-head CI xanh.

#### M2 — Advance và Payment Allocation

1. Nới Payment Entry để hỗ trợ zero/partial/full allocation.
2. Thiết kế Payment Ledger row cho unallocated advance có source Payment Entry rõ ràng.
3. Migration append-only cho source advance cap, target outstanding cap và cancel guards.
4. Thêm submittable `Payment Allocation`, reclassify Payment Ledger mà không tạo GL mới.
5. Serialize theo company/party/account/currency, giữ idempotency/OCC/D1 atomic batch.
6. Unit, SQL, integration và worker concurrency tests.

#### M3 — Báo cáo còn lại

- Party Statement.
- Debt Summary.
- Advance Balance.
- Đối chiếu tổng từng report với Payment Ledger theo cùng cutoff/currency.

#### M4 — Metadata/UI

- Hiển thị AR/AP Aging trong report navigation.
- Form Payment Allocation metadata-driven.
- Invoice/payment timeline và drill-down.
- Confirmation + reason cho reverse/override.

#### M5 — Backfill/rollout

- Dry-run legacy invoice thiếu due date và payment chưa phân bổ.
- Unresolved report/checksum; không activation khi còn ambiguity.
- Staging migration và smoke trước mọi production action.

Hoàn thành khi aging/advance/allocation/statement/debt summary đạt acceptance criteria trong BRD, root gates pass và handoff ghi đúng bằng chứng.

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
