# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Hoàn thành — Alumdoor landing/login refresh

- PR `#17`, branch `feat/login-landing-ui-refresh`.
- Code head đã kiểm chứng trước cập nhật tài liệu: `b90fc6760439f6bb90a5bb42a417fe7c9c1c409d`.
- `PR Validation` run `30622672127`, job `91130621484`: **PASS**.
- `UI Pull Request Validation` run `30622672113`, job `91130621422`: lint, tests, typecheck, build, Chromium browser QA, artifact ảnh và cookie auth smoke **PASS**.
- Việc còn lại trong luồng này: kiểm exact-head docs commit, bỏ Draft và merge PR; không deploy Cloudflare.

## P0 — Xác minh release sidebar gọn trên production

**Mục tiêu:** xác nhận Cloudflare đã đưa bản sidebar desktop gọn lên Gateway production mà không ảnh hưởng route hoặc permission.

- Code sidebar: `87cd45aa9272f5600ff3d5914f697ce9a26994b6`.
- Release target: `da04f7fcfdc4c8e4ddf7ff70c79e3a10458ce412`.
- Production trigger: `9a7bbc14b8e7f3e556404cce19914da1e21e5e10`.
- Chưa có Cloudflare deployment/version ID hoặc smoke evidence sau trigger.
- Cần smoke desktop/mobile tại `alu.kairo.vn`, ghi deployment/version ID và ảnh; không đổi permission hay route.

## P0 — Xác minh production tenant `alu`

- Xác nhận Gateway version và production traffic.
- Smoke `alu.kairo.vn`: health, login, list, form, CRUD chứng từ thử, Purchase Order preview và tải PDF.
- Ghi deployment/version ID, thời điểm và kết quả từng bước; không ghi secret hoặc dữ liệu khách hàng.
- Rollback trigger: login/API 5xx, sai tenant/database, mất dữ liệu CRUD, permission regression hoặc print/PDF lỗi nghiêm trọng.

## P0 — Hoàn thiện FIFO Purchase Receipt

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

### Hoàn thành

- M1 schema/contracts/atomic persistence với migration `0027`, `0028`, `0029`.
- M2 canonical material key.
- M3 supplier coordinator.
- M4 hiện có PO obligation, Receipt FIFO qua nhiều PO, unapplied quantity, reversal khi cancel, integration 200 + 100 nhận 230, và stress planner 250 rows.

### Còn lại M4

1. `apply_unapplied` khi PO mới gia nhập window.
2. Production-shaped Receipt cancel integration test.
3. Test nhiều Receipt lines cùng queue.
4. Worker/DO concurrency test.

### P0 — M5 Settlement và edge cases

- Close/reverse settlement, permission và reason bắt buộc.
- Shortage/overage variance, append-only settlement event.
- Manual FIFO override có permission + reason.
- Backdated Receipt warning và lifecycle PO amend/cancel, Receipt cancel.

### P0 — M6 Backfill và cutover

- Viết `backfill-purchase-receipt-allocations.mjs`, dry-run mặc định.
- Xuất resolved/unresolved và PO-level checksum; không đoán row ID.
- Không activation nếu checksum lệch hoặc unresolved > 0.
- Activation ghi checksum, actor và timestamp.

### P1 — M7 UI và báo cáo

- Allocation preview, timeline/drill-down, remaining/received/unapplied/variance.
- Settlement/manual override action có confirmation, permission và reason.
- Báo cáo nhà cung cấp.

### P0 — M8 Gate và rollout

- Đo D1 batch/latency và supplier contention.
- Backup production mới, staging migrations, backfill dry-run, review unresolved/checksum.
- Staging smoke PO → Receipt → cancel → settlement → report.
- Explicit production approval trước activation.

## P1 — Purchase Order print/PDF verification

- Còn lại browser smoke production, tải PDF thật, kiểm font, tràn nội dung, trang trắng và visual regression Chromium.

## P1 — Partial submitted-document save test

- Cover PUT partial merge cho normal doc, submitted doc, child table và concurrency/timestamp.

## P2 — Runtime completeness

- Hoàn thiện page/dashboard/process renderers.
- Hoàn thiện assign picker, attachment upload/delete và tag UI.
- Đồng bộ `server/STATUS.md`, known gaps và traceability.

## P3 — Engineering hygiene

- Giảm frontend chunk lớn có đo lường.
- Chuẩn hóa local onboarding Gateway + Tenant + D1, không dùng production secret.
- Cài Forge project pack qua PR riêng sau khi review ZIP; không chạy installer mù quáng.

## P0 — RBAC

### Slice A — hoàn thành và đã merge

- PR `#37`, merge commit `93ac85a0f16c2668b706ffcf8e15d3da53c8c7a9`.
- G3 và G4 PASS; G5 staging/browser QA chưa chạy.

### Slice B riêng

1. Migration append-only cho RBAC audit.
2. Atomic create user + role grants và replace roles.
3. Last-admin và self-disable/self-demote guards.
4. Audit role/scope/enable-disable/password reset/session revoke, không ghi secret.
5. Targeted tests, root test/typecheck/build và exact-head PR Validation.
6. Sau Slice B/C mới chạy G5 staging/browser QA.

Không deploy Cloudflare, sửa production secrets hoặc bật FIFO khi chưa có yêu cầu riêng.
