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

## P0 — RBAC

### Slice A — hoàn thành và đã merge

- Implementation gốc: `ab974f92ffbcf015fb71d3051df33508c9f09942`.
- Exact head đã kiểm chứng: `0db13898ed00cbfe3835ce511f90c84aef38c8e8`.
- PR `#37` đã squash-merge.
- Merge commit: `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- Final diff: 9 file code/test/tài liệu RBAC, không có workflow/harness/placeholder tạm.
- G3 PASS trước rebase: workflow `30612014393`, job `91101823154`.
- G4 PASS trên exact head:
  - workflow `30618821462`, job `91118225164`;
  - workflow `30619133964`, job `91119230663`;
  - workflow `30619408760`, job `91120101038`.
- `pnpm test`, `pnpm typecheck`, `pnpm build`: PASS.

### Việc tiếp theo — Slice B riêng

1. Mở branch mới từ default head sau merge, dự kiến `feat/rbac-permission-slice-b-20260731`.
2. Viết migration append-only cho RBAC audit.
3. Làm atomic create user + role grants.
4. Làm atomic replace roles.
5. Thêm last-admin guard.
6. Thêm self-disable/self-demote guard.
7. Audit role/scope/enable-disable/password reset/session revoke.
8. Không ghi password, hash, token hoặc secret vào audit.
9. Chạy targeted tests, root `pnpm test`, `pnpm typecheck`, `pnpm build` và exact-head PR Validation.
10. Sau Slice B/C mới chạy G5 staging/browser QA.

Không deploy Cloudflare, sửa production secrets hoặc bật FIFO trong luồng RBAC khi chưa có yêu cầu riêng.

### Cập nhật authoritative — Slice B đã implement, chờ review

- Branch: `feat/rbac-permission-slice-b-core-20260731`.
- Draft PR authoritative: `#43`; PR `#38`, `#39`, `#42` đã đóng và không merge.
- Wiring implementation commit: `35da85cc3c8db4603df3cf0308b36dc422b524a7`.
- Đã hoàn thành:
  1. migration `0030_rbac_audit.sql` append-only;
  2. audit ledger tenant scoped và JSON validated;
  3. atomic create user + role grants;
  4. atomic replace roles;
  5. atomic enable/disable + session epoch;
  6. atomic password change/reset + session revoke;
  7. atomic User Permission upsert/remove;
  8. application và database last-admin guard;
  9. self-disable và self-demote guard;
  10. audit redaction, không ghi password/hash/token/cookie/secret/trusted identity;
  11. router wiring và allowed/forbidden endpoint contract tests.
- Bằng chứng:
  - service tests 8/8 PASS;
  - core run `30622251469`, job `91129287256`: root test/typecheck/build PASS;
  - wiring run `30623092302`, job `91131952789`: PASS;
  - cùng run, job `91131952849`: root test/typecheck/build PASS.
- Workflow tạm đã được gỡ; default `PR Validation` đã trở lại `contents: read` tại `952e7dd5443e3ace23b94935aca7f23978d1948a`.
- Còn lại:
  1. exact-head PR Validation sau commit bàn giao;
  2. review final diff, unresolved threads và mergeability;
  3. chỉ merge sau explicit approval;
  4. G5 staging/browser QA sau khi Slice B/C hoàn tất.
- Không deploy Cloudflare, sửa production secrets hoặc bật FIFO trong luồng RBAC khi chưa có yêu cầu riêng.