# AI HANDOFF

Ngày cập nhật: **2026-08-18**.

Handoff này cố ý ngắn. Resolve exact GitHub state trước; không dùng file này để suy SHA/PR/workflow mới hơn.

## Bắt đầu một phiên mới

1. Resolve exact `main` và branch/PR liên quan.
2. Đọc `SENTRUX_MAP.md` để xác định owner, entrypoint và dependency boundary.
3. Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md`.
4. Đọc `docs/ARCHITECTURE.md` và docs domain/evidence đúng scope.
5. Với scope **Alumdoor Sales / Master / BOM / sản xuất / cắt nhôm**: đọc `apps/alumdoor/docs/nguon/SALES-BOM-SOURCE-MAP.md` → raw extract qua `apps/alumdoor/docs/nguon/00-MUC-LUC.md` → `docs/sales/ALUMDOOR_MASTER_SALES_BOM_AUDIT_20260816.md` → `server/briefs/alumdoor-v2.json`; không trả lời hoặc sửa rule từ trí nhớ.
6. Load skill/routing liên quan trước khi sửa.
7. Trước mọi **Alumdoor local D1 mutation / real-data import / local bootstrap**, bắt buộc đọc `skills/forge-local-runner-import/SKILL.md` và dùng canonical execution entrypoint; không tự viết backup/lock/Wrangler/process-control mutation path trong workflow.
8. Với structural refactor: lưu Sentrux gate baseline, sửa nhỏ theo root cause, rồi rescan/gate + typecheck/test.

## Invariants cần giữ

- Document/business writes đi qua canonical Document Kernel/aggregate path.
- GL/Payment Ledger và Stock Ledger không bị fork bởi vertical.
- Tenant/permission/security authority nằm server-side.
- Shared runtime/package không nhận hard-coded vertical schema nếu metadata/domain contract có thể biểu đạt.
- Migration history có khả năng applied là append-only.
- Merge không đồng nghĩa deploy; provider/live claim cần exact evidence.
- Local real-data mutation phải fail-closed, local-only, exact-SHA, backup-safe và serialized theo `skills/forge-local-runner-import/SKILL.md`.

## Documentation rule

Không tạo thêm status/architecture/handoff file mới nếu canonical file hiện có có thể cập nhật. Temporary prompt, open-order, experiment/probe và branch handoff phải được remove sau convergence. Final audit/release/source-lock evidence được giữ khi còn giá trị chứng minh.

## Sentrux rule

`SENTRUX_MAP.md` là bản đồ ownership; `.sentrux/rules.toml` là guardrail máy đọc. Sentrux score là sensor, không thay correctness tests hay business invariants.
