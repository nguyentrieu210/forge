# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật. Exact branch head, PR và CI phải kiểm tra lại trước mỗi đợt làm việc theo `RUNBOOK.md` và `DELIVERY_POLICY.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` kiểm gần nhất: `e156182fd88e629420f8f3d0dabd329ce22355d1` — `fix(release): refresh production content manifest (#215)`.
- Exact feature merge checkpoint: `e447eca0e020da161dcee4f0b865206921718a61` — merge PR `#209`.
- PR `#203` và `#205` là các iteration Bulk Transaction đã đóng/superseded; không dùng làm live source.
- Không deploy Cloudflare/production trong các slice này.

## ACTIVE — Warehouse Petty Cash per warehouse

- Canonical PR: `#214` — `feat/alumdoor-warehouse-petty-cash-v3-20260802`.
- Feature commit: `b152fd85c9d930f026b568eac003d4784ea43bfc`.
- CI root-cause fix: `e142a3ceb90179bca28080f488dfb83ebeedcdaa`.
- Main CI validation run `30746967088`, job `91494093839`: tests + typecheck + build **PASS** sau fix.
- Root cause của CI đỏ trước đó là app-source metadata: `Warehouse Cash Voucher.purchase_receipt` và `stock_entry` link tới DocType ngoài package nhưng `vn-accounting/app.json` chưa khai báo. Đã khai báo `Purchase Receipt` và `Stock Entry` là ERPNext transaction DocTypes.
- Warehouse Cash controller regression: **7/7 PASS** trong unit run; SQL migration acceptance cho balance/daily limit/max balance/tenant isolation/reversal/immutability đã PASS.
- `Warehouse Cash Voucher` và `Warehouse Cash Transfer` là chứng từ kế toán chuyên biệt, post trực tiếp balanced immutable GL; không tạo shadow `Payment Entry`/`Journal Entry`.
- `Warehouse Cash Count` chỉ chụp số dư authoritative và chênh lệch; không tự ý thay đổi tiền. Điều chỉnh phải qua adjustment voucher riêng.
- `gl_entries` là source of truth. `Warehouse Cash Balance` và `Warehouse Cash Daily Usage` trong `master_records` chỉ là projection rebuildable, được cập nhật cùng transaction để chống race và kiểm O(1).
- Migration `0038_warehouse_cash.sql` chưa phát hiện collision trên `main` tại lần kiểm gần nhất.
- Diagnostic CI artifact/workflow phục vụ điều tra đã được gỡ khỏi final code diff; exact clean-head CI vẫn là gate trước merge.
- Không merge PR `#214` và không deploy production nếu chưa có lệnh riêng.

## DONE — Bulk Transaction v1: Purchase Receipt / nhập nhôm nhiều mã

- Canonical PR: `#209` — `feat/bulk-transaction-purchase-receipt-final-20260802`.
- Final validated head: `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`.
- Merge SHA: `e447eca0e020da161dcee4f0b865206921718a61`.
- Required workflows trên exact final head: **6/6 PASS**.
  - CI `30742437972`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30742437975`: frontend lint/build, MetaForge/Alumdoor browser QA, purchase allocation QA, authenticated desktop/mobile Purchase lifecycle và cleanup no-residue SUCCESS.
  - PR Validation `30742437970`: SUCCESS.
  - Purchase Feature CI `30742437971`: SUCCESS.
  - Sales Feature CI `30742437999`: SUCCESS.
  - Inventory and Manufacturing CI `30742437973`: SUCCESS.

### Functional boundary

- AppAction mới `nhap-nhom-hang-loat` cho phép nhập nhiều mã nhôm bằng transaction grid metadata-driven.
- Grid hỗ trợ thêm/xóa dòng, existing Link/Select/number controls, paste vùng Excel/Google Sheets, required-cell validation và invalidate preview/result khi input đổi.
- Backend tái sử dụng canonical single-line FIFO preview; dòng sau trong cùng payload phải nhìn thấy allocation tạm của dòng trước.
- Commit tạo đúng **một Purchase Receipt nháp** chứa toàn bộ dòng đã phân bổ.
- Action không submit Purchase Receipt và không direct-write stock/accounting ledger; submit chuẩn của Purchase Receipt vẫn là authority làm thay đổi tồn kho/kế toán.
- Tối đa 100 dòng/lần; bắt buộc `supplier_invoice_no`; tất cả target Purchase Order phải cùng company/currency.
- Tenant/platform call guard giữ fail-closed.
- Duplicate prevention dùng SHA-256 normalized payload fingerprint + supplier delivery note: exact retry trả lại cùng receipt; cùng delivery note nhưng payload khác bị từ chối.

### Regression đã khóa

- FIFO cộng dồn giữa nhiều dòng cùng quy cách trong một payload.
- Callback URL có internal prefix vẫn phải inject synthetic receipt đúng; không phụ thuộc callback path bắt đầu bằng `/api`.
- One-draft aggregate create.
- Exact retry idempotency và changed-payload conflict.
- Cross-company fail closed.
- Tenant / delivery-note / 100-row guards.
- Brief action sidecar → schema → compiler → canonical manifest parser.
- Authenticated desktop + mobile: login/cookie/CSRF thật, mở action, paste 2 dòng, preview, commit một draft, retry không tạo draft thứ hai.

### Root cause bắt được trong acceptance

- Browser QA đầu tiên phát hiện dòng thứ hai có thể ăn lại Purchase Order cũ vì synthetic FIFO interceptor match callback pathname quá cứng theo `/api/resource/...`.
- Fix canonical hóa callback pathname theo suffix `/resource/...`, giữ callback prefix là runtime/provider detail.
- Có unit regression riêng cho callback prefix khác `/api`; exact final browser acceptance đã PASS sau fix.

## Merged checkpoints liên quan

- PR `#190`: MetaForge safe Bulk View cho master — merged.
- PR `#195`: Bulk unsaved-edit guard — merged.
- PR `#179`: Tiến Đạt FIFO complete operations UI — merged.
- PR `#189`: Stock P0 QR/lineage + cleanup QA — merged.
- PR `#200`: Plastic ERP P0-A foundation — merged trước slice này.
- PR `#204`: Alumdoor process workspace UI — merged trước slice này.
- PR `#207`: Alumdoor multi-UOM Item Price matrix — merged trước PR #209.

Generic Bulk View vẫn chỉ dùng `document_update` cho master an toàn; transaction/submittable/ledger không được mass-update bằng generic Bulk.

## Chưa hoàn tất toàn hệ thống

1. Exact clean-head CI và merge authorization cho Warehouse Petty Cash PR `#214`.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract thay compatibility `BulkTransaction:<json>` trong Text options.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A, warranty/defects/capacity/overtime và authenticated E2E xuyên miền.

## Guardrails

- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
- Mỗi task mới mở branch riêng từ exact current `main`; PR stale phải clean-transplant nếu base đã đổi, không force-push/rewrite history để cứu evidence cũ.
