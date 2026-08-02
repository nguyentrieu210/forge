# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` khi mở policy task: `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.

## ACTIVE — Risk-based quality gates

- Canonical branch: `chore/risk-based-quality-gates-20260802`.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` đã chuyển từ full-pipeline mặc định sang 3 tier `FAST` / `STANDARD` / `CRITICAL`.
- `FAST`: UI/presentation nhỏ, kiểm tra tối thiểu theo blast radius; không bắt buộc full test/lint/typecheck/build/CI.
- `STANDARD`: test liên quan + typecheck/lint/build/CI phù hợp.
- `CRITICAL`: accounting, inventory, costing, auth, tenant, migration, production data phải giữ regression/integration/security/data-integrity gates đầy đủ.
- Build/install/stage chỉ để tạo artifact deploy được xem là packaging, không tự động biến task FAST thành full quality gate.

## ACTIVE — Auto deploy UI hotfix

- Canonical working branch: `fix/ui-hotfix-auto-deploy-v2-20260802`.
- PR iteration `#230` từ stale main là superseded; không merge.
- `.github/workflows/hotfix-ui-one-click.yml` đổi từ manual-only sang auto deploy khi push vào `hotfix/ui-*` có thay đổi `client/**`; vẫn giữ `workflow_dispatch` fallback.
- Fail-closed scope guard chạy trước production: current `main` phải là ancestor; bắt buộc có `client/**`; ngoài client chỉ cho `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`; tối đa 10 file / 300 changed lines.
- Fast path: scope guard -> install -> build MetaForge bundle -> stage bundle -> wrangler deploy Gateway production.
- Mục tiêu: UI hotfix hợp lệ push xong tự deploy, không cần người dùng bấm Run workflow.

## DONE — Warehouse Petty Cash

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.

## Chưa hoàn tất

1. Merge policy risk-based gates vào `main`.
2. Merge auto-deploy workflow vào `main`, replay UI theme fix trên hotfix mới và xác nhận production deploy tự chạy.
3. Bulk Transaction cho Stock Reconciliation.
4. Bulk Transaction cho BOM parent + child/version.
5. First-class AppAction input-table contract.
6. Batch Print / QR label queue.
7. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
8. Plastic ERP các wave sau P0-A.

## Guardrails

- Auto production deploy chỉ áp dụng `hotfix/ui-*` vượt qua scope guard fail-closed.
- Không sửa production secrets/DNS hoặc mutate customer data trong UI fast lane.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
