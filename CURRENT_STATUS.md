# CURRENT STATUS

Ngày cập nhật: **2026-08-03**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Không hardcode exact current `main` vào status dài hạn; phải đọc GitHub khi bắt đầu/tiếp tục.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Warehouse Cash Alumdoor merge checkpoint: `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.

## DONE — HRM operational 1.5

- Canonical PR `#261` đã squash-merge vào `main` tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`; PR `#253` là stale/diverged iteration đã đóng superseded.
- HRM đã mở rộng xuyên suốt tuyển dụng, hire-to-retire, nghỉ phép, ca/check-in/chấm công/tăng ca, payroll input, tạm ứng/công tác, mục tiêu/đánh giá và đào tạo.
- Payroll giữ canonical `SalarySlipController -> PayrollEntryController -> GL`; không tạo payroll/accounting ledger cạnh tranh.
- Generated Salary Slip có salary assignment luôn recompute authoritative inputs khi save/submit; submitted slip khóa các nguồn Attendance/Leave/OT/Salary Assignment/Additional Salary đã dùng cho tới correction bằng cancel/amendment/rerun.
- `VN Payroll Rule` được effective-date validate và trace `rule_code`, văn bản pháp lý, source URL, approval metadata, SHA-256 của canonical `formula_json`; migration `0041` khóa update/delete/disable/record-type mutation sau khi rule đã được dùng.
- Migrations `0039-0041` giữ tenant-scoped/race-safe overlap, duplicate, payroll-source freeze và payroll-rule integrity.
- Validation trên application blobs đã merge: isolated TypeScript strict PASS; HRM operational regressions 4/4 PASS; migrations `0035+0039+0040+0041` acceptance PASS; Python migration syntax PASS; metadata JSON 44/44 PASS. GitHub development CI = N/A theo policy hiện hành vì Actions chỉ dùng build/deploy.
- Không production deploy/migration trong task HRM này.
- Boundary còn lại: `formula_json` là versioned/audited legal-rule evidence, chưa phải statutory PIT/BHXH evaluator. Nếu cần tự động hóa luật Việt Nam phải làm task CRITICAL riêng với schema công thức explicit, effective versions, nguồn chính thức và regression pháp lý.

## DONE — VN Accounting Period Integrity Hardening

- PR `#266` đã merge vào `main`; migration `0042_vn_accounting_period_hardening.sql` là canonical period-integrity baseline.
- Hard Locked chặn submit, cancel và payload scope move vào/ra kỳ khóa. Soft Closed chỉ cho approved adjustment khi period bật `allow_approved_adjustments` và chứng từ có reason + approver.
- Accounting period chặn invalid range và overlap theo tenant/company/branch; company-wide period conflict với branch period cùng khoảng ngày.
- Guard 0042 bao phủ Journal/Invoice/Payment, Purchase Receipt, Delivery Note, Payroll, Stock Entry/Reconciliation và Warehouse Cash Voucher/Transfer.

## ACTIVE — VN Accounting 100/100 technical closure

- Working branch: `feat/accounting-100-hardening-20260803`.
- `main` đã tiến thêm nhiều commit trong lúc làm; compare từ merge-base cho thấy các thay đổi mới trên `main` chỉ thuộc UI/HRM và không overlap file accounting của branch. Trước merge vẫn phải đọc lại exact GitHub state.
- Migrations mới `0043-0047` đóng company/branch ledger scope, Payment Allocation period lock, legal/tax immutability, policy-effective ranges, TT99 mapping, reconciliation evidence, one-source period control, stock/GL parity và company/base-currency guard.
- `accounting_ledger_scope` gắn GL/payment-ledger line với pháp nhân/chi nhánh từ chứng từ authoritative; cross-company GL account/payment allocation fail closed.
- Financial reports AR/AP/General Ledger/Trial Balance/P&L/Balance Sheet/Cash Flow đã company/branch-scoped; thêm `Accounting Integrity Exceptions` control-tower report.
- `VN Accounting Policy` là accounting control source cho doanh nghiệp đã opt-in: accounting currency, inventory, COGS, stock adjustment, stock-received-not-billed account; legacy `accounting_period_locks` bị supersede và không được tái dùng sau khi policy VN đã submit.
- Purchase Receipt dưới policy VN chuyển valuation về Company.default_currency, ghi Dr Inventory / Cr Stock Received But Not Billed từ chính stock value; cancel đảo exact historical GL + stock revision.
- Stock Entry Material Receipt/Issue dưới policy VN ghi GL theo Inventory/Stock Adjustment; runtime final `RolloutManufacturingStockEntryController` route Material Receipt/Issue qua accounting controller để không bị registry override, còn Material Transfer/Manufacture giữ manufacturing rollout.
- Delivery Note dưới policy VN giữ valuation/COGS ở company currency; bán hàng dùng COGS/Inventory, issue phi-bán-hàng dùng Stock Adjustment/Inventory; stock-history currency mismatch fail closed.
- Journal Entry hỗ trợ account currency snapshot, server-resolved exchange rate, original debit/credit in account currency và GL company/base currency; client-supplied rate không authoritative.
- `VN Legal Rule`, `VN Tax Ruleset`, `TT99 Account Map` là effective-versioned/submittable và submitted version immutable; workflow tách preparer/Chief Accountant, không self-approve. Audit evidence authoritative lấy từ authenticated `versions`, không tin `approved_by` client payload.
- `VN Reconciliation Case` ghi expected/actual/difference minor units, root cause và submitted correction evidence; resolved case immutable.
- App `vn-accounting` tăng lên `1.2.0`, thêm Tax Specialist/Internal Auditor, TT99 Account Map, VN Tax Ruleset, VN Reconciliation Case và surface E-Invoice Submission hiện hữu, không tạo e-invoice ledger cạnh tranh.
- Regression source đã thêm: `accounting-query-scope.test.mjs`, `accounting-journal-entry-fx.test.mjs`, `vn-accounting-migration-gates.test.mjs`, `test-vn-accounting-integrity-closure.py` replay `0043-0047` cùng existing `0042` regression.
- Validation boundary hiện tại: exact local test/typecheck/build **chưa chạy được** vì shell session không resolve được GitHub DNS để checkout repo/dependency tree. Không được ghi PASS cho final branch cho tới khi có exact execution evidence.
- Không production migration, tenant mutation, secret/DNS change, merge hoặc deploy trong task này.
- “100/100 technical” nghĩa là invariants/architecture/regression target; statutory go-live vẫn phải bind đúng doanh nghiệp, regime/effective law, VAT/CIT/PIT/insurance rules, e-invoice provider, chữ ký số và test vectors được người có thẩm quyền phê duyệt. Không tự tuyên bố legal compliance chỉ từ code.

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
- Policy canonical: `FAST` / `STANDARD` / `CRITICAL` trong historical process docs trước khi main dọn process files; accounting/migration vẫn được xử lý theo mức CRITICAL trong session này.

## DONE — Alumdoor Warehouse Cash integration

- Canonical delivery PR `#233` đã squash-merge vào `main` tại `c3dbcd20a7a88c17c1a9f10c4fff82b329e27855`.
- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata và generic routes.

## DONE — Warehouse Petty Cash backend

- PR `#214` merged tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- `gl_entries` là money source of truth; projections chỉ rebuildable.

## DONE — Purchase Receipt Bulk Transaction

- PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.

## Chưa hoàn tất

1. Lấy exact execution evidence cho `feat/accounting-100-hardening-20260803`: migration acceptance `0042-0047`, accounting unit/query regressions, relevant typecheck/build; chỉ sau đó mới được nâng trạng thái technical closure thành DONE.
2. Statutory go-live: nạp/duyệt rule pháp lý chính thức theo doanh nghiệp, test vectors, regime/thuế/bảo hiểm/HĐĐT/chữ ký số; đây là legal/configuration gate riêng, không được giả thành code PASS.
3. Một UI push thực tế sau fast-path merge để đo duration và xác nhận `Deploy Gateway + /release.json` PASS.
4. HRM statutory payroll-rule evaluator nếu cần tự động PIT/BHXH theo luật; phải có schema/version/nguồn chính thức và không sửa rule đã dùng.
5. Bulk Transaction cho Stock Reconciliation.
6. Bulk Transaction cho BOM parent + child/version.
7. First-class AppAction input-table contract.
8. Batch Print / QR label queue.
9. P1 Daily detailed ledger hardening/closure theo exact GitHub state.
10. Plastic ERP các wave sau P0-A.

## Guardrails

- Không sửa production secrets/DNS hoặc mutate customer data khi chưa có yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
