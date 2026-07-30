# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature branch: `feat/purchase-receipt-complete-20260731`.
- Tracking issue: `#13`.
- Draft PR: `#14`.
- Feature HEAD trước commit trạng thái này: `eb1e426ff78c7ca0b5c42db535a588b95d15666e`.
- Technical plan: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-COMPLETION-PLAN.md`.
- Không commit `server/work/`, `tmp/`, backup SQL, `.env` hoặc generated artifacts.

## Gateway production

- Sidebar gọn đã được đưa lên `cloudforge-gateway`.
- Bằng chứng người vận hành cung cấp: active Version ID `61ad1d59`, traffic `100%`.
- Release này chỉ là Gateway/frontend; không bật FIFO.

## CI

Baseline đã xác minh:

- Exact code/schema: `591ca359937d6ae12803d36c74996db8482060af`.
- Workflow run `30570000862`, job `90964015638`.
- Install, test, typecheck và build: **PASS**.

Feature branch:

- Exact-head CI chưa có bằng chứng PASS.
- Run `30582490917` là `Cloudflare Production Release Observation`, không phải CI validation và không được dùng làm release evidence.
- Chưa đủ điều kiện staging hoặc deploy.

## Purchase Order / Purchase Receipt FIFO

Contract authoritative: `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

Baseline đã có:

- Migrations `0027`, `0028`, `0029`.
- Queue, window, obligation, allocation, unapplied, settlement và revision claims.
- Server canonical material key.
- Supplier-level Durable Object coordination và revision-conflict retry.
- PO submit mở obligation.
- Receipt submit phân bổ FIFO qua nhiều PO.
- Receipt cancel sinh reversal.
- Nhôm cây/lá dùng `qty_bar`; barem và actual weight tách riêng.

## Slice A đã thực hiện

1. `server/packages/contracts/src/purchase-allocation.ts`
   - thêm optional source `voucher_no` và `voucher_revision` cho cross-voucher allocation/unapplied rows;
   - thêm barem/projected actual-weight attribution vào unapplied movement contract.
   - commit `c5c3c299400c43b3cb82a2b980faff5b8cec58c3`.
2. `server/migrations/tenant/0030_purchase_unapplied_weight_attribution.sql`
   - append-only migration, không sửa `0027`;
   - thêm weight columns và D1 sign/pair/version guards.
   - commit `05d0106b87b28a655a9e84c6423be614a8ee7947`.
3. `server/scripts/test-purchase-unapplied-weight-migration.py`
   - cover valid receive/reverse balance và invalid sign/projection combinations.
   - commit `9861558b2e70b56797b076f092e2e2b763336240`.
4. `server/package.json`
   - đưa test `0030` vào `test:sql`.
   - commit `eb1e426ff78c7ca0b5c42db535a588b95d15666e`.

## Verification hiện có

- Isolated SQLite syntax/trigger smoke cho migration `0030`: **PASS**.
- Chưa chạy full repository test, typecheck hoặc build cho feature HEAD.
- Chưa chạy D1 integration, worker concurrency hoặc Browser Preview QA.

## Blocker kỹ thuật kế tiếp

- D1 và in-memory stores chưa dùng source voucher override.
- Reader chưa trả unapplied sources theo queue/window cùng remaining weight và voucher revision.
- PO submit chưa tạo cặp `apply_unapplied` allocation + negative `apply` movement.
- Procurement compatibility projection chưa hỗ trợ source voucher override.
- Receipt submit chưa ghi planner-returned unapplied weight vào ledger.

## Rollout safety

`purchase_allocation_rollout_state.enabled` vẫn phải là `0`:

- FIFO production chưa activation.
- Không activation trước backfill checksum, `unresolved_count=0`, staging smoke và explicit approval riêng.

## Gate hiện tại

- G0 Scope: PASS.
- G1 Requirements: PASS.
- G2 Technical plan: PASS.
- G3 Local verification: PARTIAL, chỉ isolated migration smoke.
- G4 CI: chưa PASS.
- G5 Staging: chưa mở.
- Production: không được phép từ feature branch.
