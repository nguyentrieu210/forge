# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật. Exact branch head, PR và CI phải kiểm tra lại trước mỗi đợt làm việc theo `RUNBOOK.md` và `DELIVERY_POLICY.md`.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Exact `main` kiểm gần nhất: `f5d222e916795fd31cdc82f5746a1ba0af6318fb` — `fix(metadata): make customer_group visible and auto-populate from customer.price_group on Sales Order, Delivery Note, and Sales Invoice`.
- Exact Warehouse Cash merge checkpoint: `da37060f3c02a6a5f9701d60edc3284575f00deb` — PR `#214`.
- PR `#210` là iteration Warehouse Cash cũ đã đóng/superseded bởi `#214`; không reopen/merge.
- PR `#203` và `#205` là các iteration Bulk Transaction đã đóng/superseded; không dùng làm live source.

## ACTIVE — One-click UI hotfix production lane

- Canonical implementation branch: `hotfix/ui-one-click-deploy-v2-20260802`, clean-transplant từ exact `main@f5d222e916795fd31cdc82f5746a1ba0af6318fb` sau khi branch đầu tiên bị stale do `main` tiến thêm 20 commits.
- Branch cũ `hotfix/ui-one-click-deploy-20260802` và PR `#222` là superseded evidence, không merge.
- Mục tiêu: thay đổi giao diện nhỏ dùng branch `hotfix/ui-*` rồi bấm một workflow production duy nhất, không chạy tenant migration/app worker/full-estate rollout sai phạm vi.
- Workflow mới `.github/workflows/hotfix-ui-one-click.yml`:
  - chỉ nhận branch `hotfix/ui-*`;
  - current `main` phải là ancestor của exact hotfix SHA;
  - bắt buộc có `client/**`, ngoài client chỉ cho ba file status/handoff canonical;
  - giới hạn tối đa 20 file và 600 dòng text;
  - package/dependency, backend, migration, metadata và workflow ngoài fast-lane bị chặn;
  - gọi reusable Gateway release để lint/test/typecheck/build/stage/dry-run/deploy/smoke exact SHA;
  - best-effort tạo hoặc annotate PR reconcile về `main` sau production release.
- `.github/workflows/release-gateway.yml` mở thêm `workflow_call` nhưng giữ một release implementation duy nhất.
- `RUNBOOK.md` và `DELIVERY_POLICY.md` đã định nghĩa boundary của fast lane.
- Chưa deploy production trong task tạo quy trình này.
- Actionlint trên branch stale ban đầu đã bắt SC2221/SC2222 do glob package overlap; root cause đã sửa trước clean-transplant.
- Cần PR/CI exact-head trên branch v2 trước khi merge và sử dụng chính thức.

## DONE — Warehouse Petty Cash per warehouse

- Canonical PR: `#214` — `feat/alumdoor-warehouse-petty-cash-v3-20260802`.
- Final validated head: `5255dae609a7a4c30ab25ffc397f81422c2c69fc` — **6/6 required workflows PASS**:
  - CI `30747511668`: tests + typecheck + build SUCCESS.
  - UI Pull Request Validation `30747511724`: SUCCESS; UI-specific steps fast-pathed vì scope không đổi frontend.
  - PR Validation `30747511689`: SUCCESS.
  - Purchase Feature CI `30747511672`: SUCCESS.
  - Sales Feature CI `30747511686`: SUCCESS.
  - Inventory and Manufacturing CI `30747511661`: SUCCESS.
- Squash merge SHA: `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Root cause CI đỏ trước đó là app-source metadata thiếu `externalDocTypes` cho `Purchase Receipt` và `Stock Entry`; đã sửa.
- Warehouse Cash controller regression: **7/7 PASS**; SQL migration acceptance cho balance/daily limit/max balance/tenant isolation/reversal/immutability PASS.
- `gl_entries` là source of truth. `Warehouse Cash Balance` và `Warehouse Cash Daily Usage` chỉ là projection rebuildable.
- Không deploy production trong đợt merge này.

## DONE — Bulk Transaction v1: Purchase Receipt / nhập nhôm nhiều mã

- Canonical PR: `#209` — `feat/bulk-transaction-purchase-receipt-final-20260802`.
- Final validated head: `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a`.
- Merge SHA: `e447eca0e020da161dcee4f0b865206921718a61`.
- Required workflows trên exact final head: **6/6 PASS**.
- AppAction `nhap-nhom-hang-loat` dùng metadata-driven transaction grid, Excel/Sheets paste, canonical FIFO reuse, one-draft aggregate create, tenant guard và idempotency/duplicate prevention.
- Action không submit Purchase Receipt và không direct-write stock/accounting ledger; submit chuẩn vẫn authoritative.
- Regression đã khóa callback URL prefix, cumulative FIFO, cross-company fail closed, 100-row guard và authenticated desktop/mobile retry no-duplicate.

## Merged checkpoints liên quan

- PR `#190`: MetaForge safe Bulk View cho master — merged.
- PR `#195`: Bulk unsaved-edit guard — merged.
- PR `#179`: Tiến Đạt FIFO complete operations UI — merged.
- PR `#189`: Stock P0 QR/lineage + cleanup QA — merged.
- PR `#200`: Plastic ERP P0-A foundation — merged.
- PR `#204`: Alumdoor process workspace UI — merged.
- PR `#207`: Alumdoor multi-UOM Item Price matrix — merged.

Generic Bulk View vẫn chỉ dùng `document_update` cho master an toàn; transaction/submittable/ledger không được mass-update bằng generic Bulk.

## Chưa hoàn tất toàn hệ thống

1. Hoàn tất PR/CI và merge one-click UI hotfix lane; sau merge mới dùng workflow mới cho hotfix giao diện production.
2. Bulk Transaction cho Stock Reconciliation.
3. Bulk Transaction cho BOM parent + child/version.
4. First-class AppAction input-table contract thay compatibility `BulkTransaction:<json>` trong Text options.
5. Batch Print / QR label queue.
6. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
7. Plastic ERP các wave sau P0-A, warranty/defects/capacity/overtime và authenticated E2E xuyên miền.
8. Nếu quỹ kho cần tất toán trực tiếp Purchase/Sales Invoice thì phải tích hợp canonical payment allocation; party dimension trên GL hiện không tự settle AR/AP.

## Guardrails

- Không deploy production, sửa production secret/DNS hoặc mutate customer data nếu chưa có lệnh rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence/build artifact không được quản lý.
- Mỗi task mới mở branch riêng từ exact current `main`; PR stale phải clean-transplant nếu base đã đổi, không force-push/rewrite history để cứu evidence cũ.
