# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — hoàn tất PR #49 Inventory Slice B

1. Lấy exact final head sau các commit tài liệu.
2. Chờ toàn bộ required workflows PASS trên exact final head:
   - PR Validation;
   - CI;
   - Inventory and Manufacturing CI;
   - Purchase Feature CI;
   - Sales Feature CI;
   - UI Pull Request Validation gồm browser QA và local cookie-auth smoke.
3. Kiểm PR vẫn `mergeable=true`, không có unresolved review thread.
4. Cập nhật PR body với final SHA, run IDs và kết quả test/typecheck/build.
5. Chuyển PR khỏi draft khi mọi gate xanh.
6. Không merge vào default nếu chưa có yêu cầu merge rõ ràng.

## P0 — sau khi Slice B merge

1. Retarget/rebase PR `#50` Manufacturing Slice C lên default mới.
2. Kiểm lại diff để Slice C không mang duplicate physical-stock contracts hoặc stale status docs.
3. Chạy exact-head CI và review scorecard cho Slice C.
4. Mở/hoàn thiện Slice D cho physical-stock UI, report và read model.

## P0 — Inventory release readiness

- Chạy read-only live tenant catalog audit và tạo remediation plan đã redacted.
- Không auto-fix hoặc mutate Item/UOM/Warehouse/BOM từ audit.
- Chạy staging journeys:
  1. receive;
  2. transfer lần một và lần hai;
  3. issue/manufacture;
  4. quarantine và quality release;
  5. scrap/offcut recovery;
  6. cancel/exact reversal.
- Đo latency/contention của company-wide inventory lock ở tải gần production.
- Chỉ deploy khi có approval riêng, backup và rollback plan.

## Purchase/FIFO

- FIFO production vẫn **disabled**.
- Trước activation phải có staging migration/backfill, PO-level checksum và `unresolved_count=0`.
- Chạy authenticated business smoke PO → Receipt → cancel → settlement/reverse → manual override → supplier debt report.
- Tạo production backup mới ngay trước activation.
- Approval deploy code không phải approval bật FIFO.

## Sales và UI functional acceptance

- Kiểm production price autofill bằng Item Price canonical, legacy và renamed records.
- Kiểm đổi UOM/Price List không lấy chéo giá.
- Kiểm disabled, sai currency, thiếu currency và duplicate active Item Price.
- Kiểm Link dropdown wheel trong child table lớn và boundary relay về child grid.
- Kiểm Item picker chỉ hiện Item bán hàng active và giữ đúng permission/filter.
- Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## RBAC

- Chạy staging/browser QA cho user lifecycle, role refresh, password/session revoke, audit log và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không deploy Cloudflare hoặc sửa production secrets khi chưa được yêu cầu rõ.
