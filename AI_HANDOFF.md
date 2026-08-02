# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này → `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Active checkpoint — One-click UI hotfix lane

- Canonical branch: `hotfix/ui-one-click-deploy-v2-20260802`, base exact `main@f5d222e916795fd31cdc82f5746a1ba0af6318fb`.
- Canonical PR: `#223`. Iteration `#222` đã superseded do stale main.
- `.github/workflows/hotfix-ui-one-click.yml` là one-click orchestrator; `.github/workflows/release-gateway.yml` vẫn là single Gateway production implementation và có input `quick_ui_hotfix`.
- Quick UI invariant:
  1. chỉ branch `hotfix/ui-*`;
  2. current `main` phải là ancestor của target SHA;
  3. bắt buộc có `client/**`, ngoài client chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`;
  4. tối đa 10 file / 300 dòng text;
  5. package/dependency, server, migration, business metadata, workflow, secret, DNS và production data bị chặn;
  6. production path chỉ Gateway/client bundle;
  7. quick path chạy `build -> stage -> deploy -> exact-SHA smoke`;
  8. `lint/test/typecheck/Wrangler dry-run` deferred sang reconciliation PR/normal CI;
  9. sau deploy workflow best-effort tạo/annotate PR reconcile về `main`.
- Mục tiêu dưới 30 giây là thao tác người dùng, không phải tổng runtime GitHub runner/Cloudflare.
- Không dùng lane này cho business logic/backend/data chỉ để tiết kiệm thời gian.
- Task tạo lane chưa deploy production.

## Merged checkpoint — Warehouse Petty Cash per warehouse

- Canonical PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Purchase/Sales Invoice settlement cần canonical payment allocation, không được coi GL party dimension là đã settle AR/AP.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- Canonical PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.
- Bulk action tạo một Purchase Receipt nháp, reuse canonical FIFO, có idempotency/duplicate guard, same-company/currency guard và tenant guard.
- Generic Bulk View vẫn master-only; transaction/submittable/ledger fail closed.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa deploy production.
- Quick UI lane cho phép exact branch SHA deploy Gateway trước reconcile merge chỉ khi user chủ động chạy production workflow và hard scope guard PASS.
- Không deploy Cloudflare/production, đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ cho đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
