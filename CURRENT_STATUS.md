# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release. Không hardcode exact current `main` vào status dài hạn; phải đọc GitHub khi bắt đầu/tiếp tục.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Warehouse Cash Alumdoor merge checkpoint: `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.

## READY TO MERGE — Website/CMS v1

- Canonical working branch: `feat/tenant-website-builder-delivery-v6-20260802`.
- Canonical PR: `#251`, ready for review; PR `#249`, `#238` và các Website delivery iteration cũ đã superseded/closed, không merge.
- Clean-transplant implementation commit: `fb18af84ea66fa7758eb2398a9395941e87be86b`, created directly from exact `main@061ad31b33243e6cace6bd9f13b3f6726c5443c4` after GitHub validation workflows were removed/consolidated into build/deploy-only policy.
- Scope: first-party `website` app metadata, Website Settings/Web Page/Web Page Block, version-pinned templates/themes, exact public Website methods, shared runtime renderer and public E2E.
- Security boundary: public allowlist only `forge.website.manifest` + `forge.website.page`; Guest has no generic DocType read; Website queries bind trusted tenant context; draft/unpublished content fails closed; public block/URL/theme fields are allowlisted.
- Quality tier: **CRITICAL** because this adds unauthenticated public routing and tenant-scoped reads.
- Reused validation on unchanged application blobs: server/client tests PASS, typecheck PASS, build PASS, frontend lint PASS, MetaForge browser QA PASS. Main changes after that evidence were workflow-only; package/application/dependency inputs did not change.
- Prior public E2E PASS desktop/tablet and exposed a real mobile defect because the only navigation was hidden below `md`.
- Final navigation blob `82e25b446885b8719340a38013c801135e2a52c2` fixes the defect with a dedicated accessible mobile navigation row, horizontal overflow and `aria-current`; desktop behavior remains separate.
- Final targeted regression executed locally from the actual navigation markup using TypeScript + Chromium/Playwright: **mobile 390x844 PASS, tablet 834x1112 PASS, desktop 1440x1000 PASS**. Assertions cover exactly one visible navigation per viewport, active-page `aria-current=page`, `/login`, title/meta description, mobile `overflow-x:auto`, and `scrollWidth > clientWidth`.
- GitHub current policy: validation workflows are no longer present on `main`; GitHub is build/deploy only. Do not restore deleted CI workflows just for Website.
- No production deploy, custom domain, DNS or production secrets are part of this task.
- Merge is intentionally not executed without a new explicit user instruction naming merge.

## DONE — Minimal risk-based gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong `RUNBOOK.md` và `DELIVERY_POLICY.md`.
- Gate đã PASS trên đúng SHA không chạy lặp nếu input/dependency/config không đổi; commit mới chỉ rerun gate bị ảnh hưởng.
- `FAST`: presentation/UI nhỏ, kiểm tra tối thiểu theo blast radius; không bắt buộc full pipeline.
- `STANDARD`: test/validation/PR/CI phù hợp logic sản phẩm.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/data giữ regression/integration/security/data-integrity gates đầy đủ.

## ACTIVE — UI theme hotfix auto-deploy validation

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`; PR `#230` là stale iteration đã đóng.
- Theme hotfix replay hiện ở PR `#232`, branch `hotfix/ui-document-theme-auto-20260802` theo checkpoint gần nhất; phải kiểm GitHub trước khi tiếp tục vì lane này đang thay đổi độc lập.
- Merge/code state không thay cho release evidence.

## DONE — Alumdoor Warehouse Cash integration

- Canonical delivery PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Final validated feature head `162bc010692d3a2997ddbc9bd5e9a59e11cb5d60`: **6/6 required workflows PASS**.
- Alumdoor có tab `Quỹ kho` role-gated và mở 4 DocType canonical qua generic MetaForge route: `Warehouse Cash Fund`, `Warehouse Cash Voucher`, `Warehouse Cash Transfer`, `Warehouse Cash Count`.
- Alumdoor không copy schema/controller/ledger Finance; `server/briefs/alumdoor-v2.integrations.json` khai `vn-accounting >= 1.1.0` và 4 DocType trên là `externalDocTypes`.
- Canonical brief reader merge integration sidecar theo fail-closed validation; duplicate dependency/external ownership hoặc unsupported key bị từ chối.
- Browser regression xác nhận role kho thấy Quỹ kho và mở đúng Voucher; role kinh doanh không thấy tab.
- Không đổi Warehouse Cash GL/controller/migration trong PR `#233`; không deploy production trong task này.

## DONE — Warehouse Petty Cash backend

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.
- `gl_entries` là money source of truth; balance/daily usage chỉ là rebuildable projection.
- Supplier/Customer party dimension không tự settle AR/AP; invoice settlement vẫn phải qua canonical Payment Entry/payment allocation.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.

## Chưa hoàn tất

1. Website/CMS v1: chỉ còn merge PR `#251` khi user ra lệnh merge rõ ràng; sau merge mới kiểm exact `main` và ghi post-merge evidence nếu cần.
2. Kiểm exact GitHub state/release evidence của UI hotfix lane trước khi tiếp tục task #232 hoặc iteration thay thế.
3. Bulk Transaction cho Stock Reconciliation.
4. Bulk Transaction cho BOM parent + child/version.
5. First-class AppAction input-table contract.
6. Batch Print / QR label queue.
7. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
8. Plastic ERP các wave sau P0-A.
9. Nếu cần dùng quỹ kho để tất toán trực tiếp Purchase/Sales Invoice, thiết kế canonical payment allocation; không dùng party dimension trên GL thay settlement.

## Guardrails

- Không tự merge PR hoặc deploy production nếu user chưa yêu cầu rõ.
- Không sửa production secrets/DNS hoặc mutate customer data nếu user chưa yêu cầu đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
