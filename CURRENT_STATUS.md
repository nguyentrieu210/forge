# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` khi mở hotfix decimal: `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.

## ACTIVE — Global numeric display max 2 decimals

- Canonical branch: `hotfix/ui-global-decimal-2dp-20260802`.
- Yêu cầu: mọi numeric presentation canonical của MetaForge tối đa 2 chữ số thập phân; ví dụ `22,000000` -> `22,00`, `10,000000 %` -> `10,00 %`.
- `client/packages/core/src/i18n/format.ts`: canonical number/currency formatter cap presentation precision ở 2, kể cả metadata/site khai precision lớn hơn.
- `client/packages/controls/src/register.ts`: Float/Currency/Percent/Rating default controls nhận presentation precision tối đa 2 để editable form không hiện 6 chữ số lẻ.
- Không đổi schema, metadata nghiệp vụ, giá trị lưu DB hay độ chính xác tính toán; chỉ đổi presentation.
- Branch thuộc `hotfix/ui-*`, nên guarded auto-deploy production tự chạy sau push theo workflow trên `main`.

## DONE — Guarded auto deploy UI hotfix

- PR `#231` merged vào `main` tại `cd1f76dbb47432e2312c6f5577eb955b48c3a856`.
- Push hợp lệ vào `hotfix/ui-*` có `client/**` tự build/stage/deploy Gateway production sau fail-closed scope guard.

## DONE — Warehouse Petty Cash

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc`: 6/6 required workflows PASS.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`: 6/6 required workflows PASS.

## Chưa hoàn tất

1. Xác nhận exact-head CI + production auto-deploy của global decimal hotfix; merge reconcile PR khi đạt gate.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A.

## Guardrails

- Auto production deploy chỉ áp dụng `hotfix/ui-*` vượt qua scope guard fail-closed.
- Decimal cap là presentation-only; không làm tròn dữ liệu backend/DB hoặc thay business calculation.
- Không sửa production secrets/DNS hoặc mutate customer data trong UI fast lane.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
