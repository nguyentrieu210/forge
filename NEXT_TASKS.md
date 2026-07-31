# NEXT TASKS

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

## P0 — Hoàn thiện RBAC và data scope

Branch: `feat/rbac-permission-completion-20260731`.  
Draft PR: `#22`.

Tài liệu authoritative:

- BRD: `server/docs/RBAC-PERMISSION-BRD.md`.
- Kế hoạch: `server/docs/RBAC-PERMISSION-IMPLEMENTATION-PLAN.md`.

### Gate hiện tại

- G0 scope: **PASS**.
- G1 requirements: **PASS** với D1=A, D2=A, D3=A.
- G2 implementation plan: **PASS**.
- Slice A implementation: **PASS** tại `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- G3 server tests/root typecheck/root build: **PASS** trên run `30612014393`, job `91101823154`.
- G4 exact-head CI sau cleanup/docs: **CHƯA CÓ BẰNG CHỨNG**.
- G5 staging/browser QA: **CHƯA CHẠY**.

### Slice A — hoàn thành

1. `explain_permission` dùng đúng user được chọn, roles và scope từ tenant user store.
2. Non-admin không được inspect user khác; target không tồn tại/disabled bị từ chối.
3. Capability và trace dùng cùng evaluator, không có bộ luật UI song song.
4. Stable composite User Permission id cho add/profile/remove.
5. Adapter xoá scope bằng `{ id }`; UI không crash khi trace rỗng.
6. `hide_descendants=true` bị từ chối fail-closed.
7. Contract version tăng lên `16.0.0-forge.3`.
8. Targeted RBAC tests và root gate đã xanh; workflow/harness/placeholder tạm đã được loại khỏi final diff.

### Việc tiếp theo — theo thứ tự

1. **G4:** chạy workflow `CI` chuẩn trên exact HEAD của PR #22 sau commit tài liệu cuối; yêu cầu `test`, `typecheck`, `build` PASS.
2. Review final diff để xác nhận chỉ còn code, test và tài liệu RBAC; không còn workflow điều phối tạm.
3. **Slice B:**
   - migration append-only cho RBAC audit;
   - atomic create user + role grants;
   - atomic replace roles;
   - last-admin guard và self-disable/self-demote guard;
   - audit role/scope/enable-disable/password reset/session revoke;
   - không ghi password/hash/token/secret.
4. **Slice C:** chốt static-vs-metadata authority, scope nhất quán trên list/count/read/write/report/export/search/print, share không bypass scope, field/file/action/cross-tenant tests.
5. **Slice D:** staging/browser QA, selected-user UX, role matrix read-only, scope reload, cảnh báo last-admin/session revocation và responsive layout.

Không deploy production, sửa secret hoặc bật FIFO trong công việc RBAC nếu chưa có approval riêng.
