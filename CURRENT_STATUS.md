# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` khi clean-transplant task auto deploy: `efa2aa6df385ca0775523f1756494d2ae54ec132`.

## ACTIVE — Auto deploy UI hotfix

- Canonical working branch: `fix/ui-hotfix-auto-deploy-v2-20260802`.
- PR iteration `#230` từ stale main là superseded; không merge.
- `.github/workflows/hotfix-ui-one-click.yml` đổi từ manual-only sang auto deploy khi push vào `hotfix/ui-*` có thay đổi `client/**`; vẫn giữ `workflow_dispatch` fallback.
- Fail-closed scope guard chạy trước production: current `main` phải là ancestor; bắt buộc có `client/**`; ngoài client chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`; tối đa 10 file / 300 changed lines.
- Fast path: scope guard -> install -> build MetaForge bundle -> stage bundle -> wrangler deploy Gateway production.
- Mục tiêu: UI hotfix hợp lệ push xong tự deploy, không cần người dùng bấm Run workflow.
- Sau khi merge cơ chế này vào `main`, theme fix sẽ được replay lên branch `hotfix/ui-*` mới từ exact main để chính push đó kích production deploy.

## DONE — Warehouse Petty Cash

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.

## Chưa hoàn tất

1. Merge auto-deploy workflow vào `main`, replay UI theme fix trên hotfix mới và xác nhận production deploy tự chạy.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A.

## Guardrails

- Auto production deploy chỉ áp dụng `hotfix/ui-*` vượt qua scope guard fail-closed.
- Không sửa production secrets/DNS hoặc mutate customer data trong UI fast lane.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
