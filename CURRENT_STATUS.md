# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch đang làm: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Gateway production

- Sidebar gọn đã được đưa lên `cloudforge-gateway`.
- Bằng chứng do người vận hành cung cấp trên Cloudflare: active Version ID `61ad1d59`, traffic `100%`.
- Đây là Gateway/frontend release; không chạy tenant migration và không bật FIFO.

## CI baseline

- Exact code/schema baseline: `591ca359937d6ae12803d36c74996db8482060af`.
- Workflow run `30570000862`, job `90964015638`.
- Install, test, typecheck và build: **PASS**.
- Feature branch mới chưa có exact-head CI evidence; không đủ điều kiện staging/deploy cho tới khi PR checks xanh.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

Đã có:

- Migrations `0027`, `0028`, `0029`.
- Queue, settlement window, obligation, allocation, unapplied, settlement và revision-claim schema.
- Server canonical material key.
- Supplier-level Durable Object coordination và revision-conflict retry.
- PO submit mở obligation.
- Receipt submit phân bổ FIFO qua nhiều PO.
- Receipt cancel sinh reversal.
- Nhôm cây/lá dùng `qty_bar`; barem và actual weight tách riêng.
- Integration scenario 200 + 100, nhận 230 => 200 + 30, còn 70.

## Audit đầu epic #13

`apply_unapplied` là cross-voucher mutation:

- PO mới là command kích hoạt.
- Allocation và unapplied movement phải giữ voucher Purchase Receipt nguồn.
- D1 adapter hiện mặc định lấy voucher từ aggregate đang submit, nên nếu triển khai ngây thơ sẽ ghi lịch sử Receipt thành PO.
- Slice đầu tiên phải mở rộng contract/store có kiểm soát, bảo toàn source voucher, weight attribution, idempotency và revision claims trong cùng batch.

## Rollout safety

`purchase_allocation_rollout_state.enabled` vẫn phải là `0`:

- Code/schema có thể live khi rollout tắt.
- FIFO production chưa được activation.
- Không activation trước backfill checksum, `unresolved_count=0`, staging smoke và explicit approval riêng.

## Gate hiện tại

- G0 Scope: PASS.
- G1 Requirements: PASS theo contract v1 và phê duyệt người dùng.
- G2 Technical plan: PASS tại commit `b328c3ddf3f927671c6e853abf4c7e2bfdb4c128`.
- G3 Local verification: chưa mở.
- G4 CI: chưa mở.
- G5 Staging: chưa mở.
- Production: chưa được phép từ feature branch.
