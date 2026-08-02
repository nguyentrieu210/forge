# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` trước docs-only closure này: `18d2161de589fcd1677886f0e9136006fd60e9e5`.

## DONE — Minimal risk-based gates

- Canonical PR `#234` đã merge tại `c453df3026095b314f82f79e338bd56af90632ca`.
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong `RUNBOOK.md` và `DELIVERY_POLICY.md`.
- Gate đã PASS trên đúng SHA không chạy lặp nếu input/dependency/config không đổi; commit mới chỉ rerun gate bị ảnh hưởng.
- `FAST`: presentation/UI nhỏ, kiểm tra tối thiểu theo blast radius; không bắt buộc full pipeline.
- `STANDARD`: test/validation/PR/CI phù hợp logic sản phẩm.
- `CRITICAL`: accounting/cash/AR-AP/inventory/costing/manufacturing/auth/permission/tenant/migration/data giữ regression/integration/security/data-integrity gates đầy đủ.

## ACTIVE — UI theme hotfix auto-deploy validation

- Guarded auto-deploy lane đã merge qua PR `#231` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`; PR `#230` là stale iteration đã đóng.
- Theme hotfix replay hiện ở PR `#232`, branch `hotfix/ui-document-theme-auto-20260802`.
- Phải kiểm exact workflow/release evidence của #232 trước khi kết luận production deploy; merge/code state không thay cho release evidence.

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

1. Kiểm exact GitHub workflow/release evidence của PR `#232` cho UI theme hotfix auto-deploy.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A.
8. Nếu cần dùng quỹ kho để tất toán trực tiếp Purchase/Sales Invoice, thiết kế canonical payment allocation; không dùng party dimension trên GL thay settlement.

## Guardrails

- Auto production deploy chỉ áp dụng `hotfix/ui-*` vượt qua scope guard fail-closed.
- Không sửa production secrets/DNS hoặc mutate customer data nếu user chưa yêu cầu đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
