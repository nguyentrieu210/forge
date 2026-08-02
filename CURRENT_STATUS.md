# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` khi mở policy task: `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- Exact `main` khi clean-transplant Website/CMS v1: `18d2161de589fcd1677886f0e9136006fd60e9e5`.

## ACTIVE — Website/CMS v1 clean delivery

- Canonical branch: `feat/tenant-website-builder-delivery-v2-20260802`.
- Canonical PR: `#238` (draft); PR `#219` và `#220` là stale iterations, không merge.
- Clean-transplant trực tiếp từ exact `main@18d2161de589fcd1677886f0e9136006fd60e9e5`, không merge/rebase lịch sử stale.
- Base implementation commit: `d26cfbe62843b78a13aa377920c6aefae6d1cc2a`.
- Mobile navigation fix: `802ea8f96cd4afdc17815a446db218f8f6202eb1`.
- Scope: first-party `website` app metadata, Website Settings/Web Page/Web Page Block, version-pinned templates/themes, public Website resolver, runtime renderer và public E2E.
- Security boundary: public API chỉ allowlist `forge.website.manifest` + `forge.website.page`; Guest không có generic DocType read; mọi query bind trusted `tenantId`; draft/unpublished fail closed; block/URL/theme được allowlist.
- Quality tier: **CRITICAL** vì thay đổi unauthenticated public routing + tenant isolation.
- Validation trên head trước mobile fix `432d3df862249e9843cb4c2f79af6a5a357bad2e`: server/client tests PASS, typecheck PASS, build PASS, frontend lint PASS, MetaForge browser QA PASS; Website public E2E PASS desktop + tablet nhưng FAIL mobile vì navigation bị ẩn ở `< md` mà không có mobile nav.
- Root cause mobile đã sửa ở `802ea8f9`: thêm navigation responsive riêng cho mobile, horizontal overflow khi nhiều mục và `aria-current`; desktop behavior giữ nguyên.
- Validation còn lại: required CI/public browser QA phải PASS trên exact final head sau fix; không rerun thủ công gate không bị ảnh hưởng nếu GitHub đã có evidence hợp lệ.

## ACTIVE — Minimal risk-based gates

- Canonical branch: `chore/risk-based-quality-gates-20260802`.
- `FAST`: `branch -> sửa -> diff -> commit -> push`.
- FAST không bắt buộc PR, full test/lint/typecheck/build/CI hoặc cập nhật status/handoff cho từng chỉnh sửa nhỏ.
- `STANDARD`: test/validation/PR/CI phù hợp với logic sản phẩm.
- `CRITICAL`: giữ regression/integration/security/data-integrity và required CI cho accounting/inventory/costing/auth/tenant/migration/production data.
- Build/install/stage chỉ để tạo artifact deploy là packaging.

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

1. Website/CMS v1: validate exact final head của PR `#238`; chỉ ready khi public/tenant/security gates xanh.
2. Merge policy risk-based gates vào `main`.
3. Merge auto-deploy workflow vào `main`, replay UI theme fix trên hotfix mới và xác nhận production deploy tự chạy.
4. Bulk Transaction cho Stock Reconciliation.
5. Bulk Transaction cho BOM parent + child/version.
6. First-class AppAction input-table contract.
7. Batch Print / QR label queue.
8. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
9. Plastic ERP các wave sau P0-A.

## Guardrails

- Auto production deploy chỉ áp dụng `hotfix/ui-*` vượt qua scope guard fail-closed.
- Không sửa production secrets/DNS hoặc mutate customer data trong UI fast lane.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
