# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Hoàn tất PR #49 Physical inventory

1. Đồng bộ branch `feat/inventory-physical-stock-slice-b-20260731` với default hiện tại; behind phải bằng `0`.
2. Chạy exact-final-head:
   - `PR Validation`;
   - `Inventory and Manufacturing CI`;
   - `CI`;
   - `UI Pull Request Validation` gồm Chromium QA và cookie-auth smoke.
3. Đọc log và sửa code/config nếu có lỗi thật; không coi missing/cancelled run là PASS.
4. Xác minh:
   - review score `97/100`;
   - Critical/High `0`;
   - mergeable;
   - không unresolved review thread;
   - không migration/deploy/secret/tenant mutation.
5. Cập nhật PR #49 body bằng exact head/run/job IDs và kiến trúc company-wide inventory coordinator.
6. Chuyển PR #49 khỏi draft khi toàn bộ gate xanh.
7. Không merge trước explicit approval riêng.

## P0 — Hoàn tất stacked PR #50 Manufacturing lifecycle

1. Giữ PR #50 target vào branch Slice B cho tới khi PR #49 merge.
2. Đồng bộ final Slice B head vào C; effective diff chỉ gồm manufacturing lifecycle và tests/review của C.
3. Exact-final-head phải qua cùng các workflow bắt buộc.
4. Xác minh:
   - review score `97/100`;
   - Critical/High `0`;
   - BOM revision/effective interval/checksum;
   - immutable Work Order snapshot;
   - BOM-row progress caps;
   - stock-UOM output guard;
   - offcut/scrap value conservation;
   - exact cancel;
   - legacy Work Order rollout;
   - company-wide inventory coordinator được kế thừa, không còn Work Order-only coordinator.
5. Cập nhật PR #50 body với exact head/base/run/job IDs.
6. Chuyển PR #50 thành ready cho stacked review khi gate xanh.
7. Chỉ retarget/rebase default sau khi Slice B merge; chạy lại exact-head gates sau retarget.
8. Không merge trước explicit approval riêng.

## P1 — Sau khi Slice B/C merge

### Live catalog audit

Chạy read-only, redacted từ môi trường vận hành có Cloudflare credential hợp lệ:

```powershell
New-Item -ItemType Directory -Force C:\Forge-Audit | Out-Null
node server/scripts/audit-alumdoor-catalog.mjs `
  --tenant alu `
  --redacted `
  --output C:\Forge-Audit\alu-catalog-redacted.json
```

Không commit report thô. Chỉ ghi checksum, counts, severity và finding codes đã redacted. Lập remediation plan riêng; audit CLI không tự sửa dữ liệu.

### Staging inventory/manufacturing

1. Nhận vật tư dimensioned và kiểm physical identity/lineage.
2. Transfer RAW → WIP → FINISHED; chuyển khỏi quarantine với release reference.
3. Scrap/offcut recovery với reason và exact cancel.
4. Tạo BOM revision, kiểm overlap/circular/UOM/quantity basis.
5. Release Work Order và xác minh snapshot không đổi sau BOM mới.
6. Partial issue, partial manufacture, split lines, concurrency và over-limit guards.
7. Offcut/scrap value, finished value và cancellation conservation.
8. Kiểm legacy submitted Work Order vẫn chạy.
9. Đo latency/throughput của company-wide inventory lock ở tải gần production.

### Slice D

- Physical-stock availability/lineage report.
- WIP, shortage, production progress và standard-vs-actual variance.
- Scrap/offcut reusable balance.
- Item/BOM completeness indicators.
- Work Order snapshot/progress UI.
- Desktop/mobile business Browser QA.

## Purchase/FIFO — production follow-up

### Functional browser QA

1. Desktop/mobile PO và Receipt: submit preview, allocation timeline.
2. Settlement close/reverse, reason, capability/permission và confirmation scope.
3. Manual FIFO override và append-only audit.
4. Supplier debt drill-down, filters, summaries và CSV export.
5. Controlled PO → Receipt → cancel → settlement/reverse journey.
6. Hard refresh và kiểm cache/bundle cũ.
7. Evidence phải redacted; không chụp token, cookie, secret hoặc dữ liệu khách hàng thật.

### Trước FIFO activation

1. Staging migration và backfill dry-run trên bản sao dữ liệu phù hợp.
2. Review resolved/unresolved report và PO-level checksum.
3. `unresolved_count` phải bằng `0`.
4. Staging smoke đầy đủ.
5. Supplier contention/D1 latency ở tải gần production.
6. Production backup mới ngay trước activation.
7. Activation cần explicit approval riêng, không gộp với approval deploy code.

## Bán hàng/RBAC follow-up

- Browser smoke Item picker và multi-UOM theo Item + Kho + ĐVT.
- Role smoke `Kinh doanh`/`Kế toán` cho Price List và Item Price.
- RBAC staging QA cho user lifecycle, role refresh, session revoke, audit và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không deploy Slice B/C, không migrate/mutate tenant `alu`, không bật FIFO và không sửa production secrets nếu chưa có explicit approval riêng.
