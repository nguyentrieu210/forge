# CURRENT STATUS

Ngày cập nhật: **2026-08-03**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không hardcode exact current `main` vào status dài hạn; phải đọc GitHub khi bắt đầu/tiếp tục.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Warehouse Cash Alumdoor merge checkpoint: `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.

## DONE — decimal display hotfix

- Branch: `hotfix/ui-decimal-display`, clean-based on `main@4c816fd45a1944aa90abb448b436890bb45c114b`.
- Root cause: `GroupedNumberInput` dùng `toFixed(precision)` trực tiếp, nên Float/Currency/Percent có precision 6 hiển thị `22,000000` dù giá trị thật là `22`.
- Fix tại `client/packages/controls/src/controls.tsx`: precision chỉ là giới hạn tối đa; phần 0 thập phân dư được trim khi render, giữ nguyên rounding theo precision và không đổi numeric value gửi ra form/backend.
- Expected display: `22 -> 22`, `22.5 -> 22,5`, `22.125 -> 22,125` với locale Việt Nam.
- Implementation commit: `3cf1f770a610e0dd215df1b0999b76557f51469d`.
- Validation: diff scope chỉ 1 client file trước docs; branch ahead main 1 commit, behind 0 tại thời điểm kiểm tra. Không có local workspace trong phiên connector nên chưa chạy package typecheck/browser test trực tiếp.

## DONE — exact production release evidence

- `server/scripts/stage-client-bundle.mjs` ghi public `release.json` khi có release SHA; marker chứa `releaseSha` + `bundleHash`, không chứa secret.
- `ALU Build and Deploy` smoke yêu cầu `/health` và `/release.json`; fail nếu production `releaseSha` khác `TARGET_SHA`.
- Canonical merge checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.

## ACTIVE — fast UI auto deploy

- Working branch: `fix/ui-deploy-fastpath-20260802`, clean-based on exact `main@a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- UI deploy chỉ trigger trên `push` của `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*` khi có `client/**`; không còn `pull_request` deploy trigger.
- Checkout dùng `fetch-depth: 2`, không fetch toàn bộ history/main.
- Scope guard đọc file từ push event; không còn stale-main ancestor check gây fail chỉ vì `main` tiến lên sau khi branch UI được mở.
- Build chỉ dependency graph của `runtime` + warehouse mobile bundle cần cho Gateway; không build toàn 18/19 MetaForge workspace project.
- Push mới cùng UI branch cancel run cũ để tránh queue/deploy artifact cũ.
- Production proof vẫn bắt buộc `/health` + `/release.json` đúng SHA/hash.
- Chưa có production run mới của fast path này; cần một UI push thực tế sau merge để chốt performance/e2e evidence.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- First-party `website` app gồm Website Settings, Web Page, Web Page Block, roles và version-pinned template/theme presets.
- Public API chỉ allowlist `forge.website.manifest` và `forge.website.page`; Guest không có generic DocType read; mọi Website query bind trusted tenant context; draft/unpublished fail closed.
- Shared runtime render `/` và one-segment slug, giữ nguyên reserved Forge runtime modes; product grid reuse canonical Storefront public API.
- Mobile navigation fix đã targeted regression bằng Chromium trên final blob `82e25b446885b8719340a38013c801135e2a52c2`: mobile 390x844 PASS, tablet 834x1112 PASS, desktop 1440x1000 PASS.

## DONE — GitHub build/deploy only

- GitHub Actions không còn là CI phát triển; validation chạy local theo blast radius.
- Một workflow `ALU Build and Deploy` là release pipeline duy nhất.
- Full ALU release vẫn manual với confirm `alu`: build once -> backup/migrate -> Tenant -> Alumdoor App -> Gateway -> exact-release smoke.

## DONE — Minimal risk-based gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong `RUNBOOK.md` và `DELIVERY_POLICY.md`.
- FAST UI nhỏ không bắt buộc full pipeline; STANDARD validation targeted local; CRITICAL giữ regression/integration/security/data-integrity đầy đủ trước release.

## DONE — Alumdoor Warehouse Cash integration

- Canonical delivery PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata và generic routes.

## DONE — Warehouse Petty Cash backend

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- `gl_entries` là money source of truth; projections chỉ rebuildable.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.

## Chưa hoàn tất

1. Một UI push thực tế sau fast-path merge để đo duration và xác nhận `Deploy Gateway + /release.json` PASS.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A.

## Guardrails

- UI auto production deploy chỉ áp dụng UI-only branch đúng naming + push scope guard.
- Không sửa production secrets/DNS hoặc mutate customer data ngoài automation/release path user đã chủ động thiết lập.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
