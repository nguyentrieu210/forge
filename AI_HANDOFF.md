# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` -> `CURRENT_STATUS.md` -> `NEXT_TASKS.md` -> file này -> `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Active checkpoint — Auto deploy UI hotfix lane

- Canonical branch: `fix/ui-hotfix-auto-deploy-v2-20260802`, clean-transplant từ exact `main@efa2aa6df385ca0775523f1756494d2ae54ec132`.
- PR `#230` là stale iteration; không merge.
- `.github/workflows/hotfix-ui-one-click.yml` chuyển sang auto production deploy khi push branch `hotfix/ui-*` có `client/**`; manual `workflow_dispatch` vẫn là fallback.
- Invariant bắt buộc trước deploy:
  1. current `main` phải là ancestor của target SHA;
  2. diff phải có ít nhất một `client/**` file;
  3. ngoài `client/**` chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`;
  4. tối đa 10 file / 300 changed lines;
  5. mọi server/workflow/package/migration/metadata/secret/DNS/data change đều fail closed vì nằm ngoài allowlist;
  6. production path chỉ build MetaForge client -> stage bundle -> deploy Gateway;
  7. lint/test/typecheck vẫn do PR/normal CI chịu trách nhiệm, không làm chậm fast production path.
- Sau khi lane này có trên `main`, AI sửa UI trên branch `hotfix/ui-*` và push là production deploy tự chạy, không bắt người dùng bấm GitHub Actions.
- Theme fix PR #227 phải được replay trên branch hotfix mới từ exact main sau merge lane này để push event dùng workflow mới.

## Merged checkpoint — Warehouse Petty Cash per warehouse

- Canonical PR `#214` squash-merge tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là source of truth; Warehouse Cash Balance/Daily Usage chỉ là rebuildable projection.
- Purchase/Sales Invoice settlement cần canonical payment allocation.

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

- Merge code không đồng nghĩa deploy production, ngoại trừ UI fast lane đã được user yêu cầu rõ: push hợp lệ vào `hotfix/ui-*` sẽ tự deploy production sau fail-closed scope guard.
- Không dùng UI fast lane cho backend/business logic/data chỉ để tiết kiệm thời gian.
- Không đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
