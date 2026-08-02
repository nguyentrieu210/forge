# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không hardcode exact current `main` vào status dài hạn; phải đọc GitHub khi bắt đầu/tiếp tục.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Warehouse Cash Alumdoor merge checkpoint: `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.

## DONE — Website/CMS multi-tenant v1

- Canonical PR `#254` đã squash-merge vào `main` tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- First-party `website` app gồm Website Settings, Web Page, Web Page Block, roles và version-pinned template/theme presets.
- Public API chỉ allowlist `forge.website.manifest` và `forge.website.page`; Guest không có generic DocType read; mọi Website query bind trusted tenant context; draft/unpublished fail closed.
- Shared runtime render `/` và one-segment slug, giữ nguyên reserved Forge runtime modes; product grid reuse canonical Storefront public API.
- Mobile navigation fix đã targeted regression bằng Chromium trên final blob `82e25b446885b8719340a38013c801135e2a52c2`: mobile 390x844 PASS, tablet 834x1112 PASS, desktop 1440x1000 PASS; `aria-current`, login link, metadata và horizontal overflow đúng.
- Server/client tests, typecheck, build, frontend lint và MetaForge browser QA đã PASS trên cùng application blob set trước clean-transplant cuối; các main commit sau đó chỉ đổi release/docs policy, không đổi application/package/dependency inputs.
- Không deploy production, đổi DNS/custom domain hoặc secrets trong task Website/CMS này.

## DONE — GitHub build/deploy only + UI auto deploy

- GitHub Actions không còn là CI phát triển; validation chạy local theo blast radius.
- Một workflow `ALU Build and Deploy` là release pipeline duy nhất.
- UI-only branch `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*`, `refactor/ui-*` tự build/deploy Gateway khi push có `client/**`.
- UI auto-deploy fail closed nếu branch stale so với current `main` hoặc diff có file ngoài UI/docs vận hành cho phép.
- Full ALU release vẫn manual với confirm `alu`: build once -> backup/migrate -> Tenant -> Alumdoor App -> Gateway -> smoke.

## DONE — Minimal risk-based gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong `RUNBOOK.md` và `DELIVERY_POLICY.md`.
- Gate đã PASS trên đúng SHA không chạy lặp nếu input/dependency/config không đổi; commit mới chỉ rerun gate bị ảnh hưởng.
- `FAST`: presentation/UI nhỏ, kiểm tra tối thiểu theo blast radius; không bắt buộc full pipeline.
- `STANDARD`: test/validation phù hợp logic sản phẩm, chạy local.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/data giữ regression/integration/security/data-integrity gates đầy đủ, chạy trước explicit release.

## DONE — Alumdoor Warehouse Cash integration

- Canonical delivery PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc5d60`: **6/6 required workflows PASS** theo cơ chế cũ.
- Alumdoor có tab `Quỹ kho` role-gated và mở 4 DocType canonical qua generic MetaForge route: `Warehouse Cash Fund`, `Warehouse Cash Voucher`, `Warehouse Cash Transfer`, `Warehouse Cash Count`.
- Alumdoor không copy schema/controller/ledger Finance; `server/briefs/alumdoor-v2.integrations.json` khai `vn-accounting >= 1.1.0` và 4 DocType trên là `externalDocTypes`.

## DONE — Warehouse Petty Cash backend

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- `gl_entries` là money source of truth; balance/daily usage chỉ là rebuildable projection.
- Supplier/Customer party dimension không tự settle AR/AP; invoice settlement vẫn phải qua canonical Payment Entry/payment allocation.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.

## Chưa hoàn tất

1. Bulk Transaction cho Stock Reconciliation.
2. Bulk Transaction cho BOM parent + child/version.
3. First-class AppAction input-table contract.
4. Batch Print / QR label queue.
5. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
6. Plastic ERP các wave sau P0-A.
7. Nếu cần dùng quỹ kho để tất toán trực tiếp Purchase/Sales Invoice, thiết kế canonical payment allocation; không dùng party dimension trên GL thay settlement.

## Guardrails

- UI auto production deploy chỉ áp dụng UI-only branch đúng naming + scope guard.
- Không sửa production secrets/DNS hoặc mutate customer data ngoài automation/release path user đã chủ động thiết lập.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
