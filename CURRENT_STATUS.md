# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` kiểm gần nhất: `f5d222e916795fd31cdc82f5746a1ba0af6318fb`.

## ACTIVE — Direct UI hotfix deploy

- Canonical branch: `hotfix/ui-one-click-deploy-v2-20260802`.
- Canonical PR: `#223`.
- PR `#222` là superseded iteration, không merge.
- Workflow mới: `.github/workflows/hotfix-ui-one-click.yml`.
- Luồng cuối cùng theo yêu cầu user: `checkout -> install -> build MetaForge bundle -> stage bundle -> wrangler deploy Gateway production`.
- Không chạy scope guard, lint, test, typecheck, dry-run, smoke hoặc auto-reconcile trong direct hotfix workflow.
- `.github/workflows/release-gateway.yml` đã được trả về implementation bình thường trên `main`; direct hotfix dùng workflow riêng, không sửa semantics của release chuẩn.
- Chưa deploy production trong task tạo workflow này.

## DONE — Warehouse Petty Cash

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.

## Chưa hoàn tất

1. Merge PR `#223` để workflow direct UI hotfix xuất hiện trên `main` và dùng được chính thức.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A.

## Guardrails

- Không tự deploy production nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
