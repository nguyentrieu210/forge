# AI HANDOFF

Ngày cập nhật: **2026-08-03**.

Tài liệu này chỉ lưu facts, checkpoints và business invariants của Forge. Không định nghĩa quy trình làm việc cho AI.

## Repository

- Repository: `nguyentrieu210/forge`.
- GitHub lưu code, branch, PR, commit và release history.
- `CURRENT_STATUS.md` lưu trạng thái dự án; `NEXT_TASKS.md` lưu backlog.

## VN Accounting — canonical facts

- Period-integrity baseline `0042_vn_accounting_period_hardening.sql` đã merge qua PR `#266`; không làm lại 0042 ở nhánh mới.
- Working branch cho technical closure: `feat/accounting-100-hardening-20260803`.
- Branch thêm migrations append-only `0043-0047`; không sửa migration history đã áp dụng.
- `accounting_ledger_scope` là authoritative projection để gắn GL/payment-ledger line với company/branch từ source/reference document. Financial reports phải company/branch-scoped, không được aggregate chỉ theo tenant.
- Với company đã submit `VN Accounting Policy`, policy + `VN Accounting Period` là nguồn kiểm soát kế toán; legacy `accounting_period_locks` bị supersede và không được tái tạo cho company đó.
- `VN Accounting Policy` phải có accounting currency khớp `Company.default_currency`, Inventory, COGS, Stock Adjustment và Stock Received But Not Billed account. Account mapping phải thuộc đúng company.
- GL và Stock Ledger của company opt-in VN Accounting chỉ dùng Company.default_currency + exact currency scale. Ngoại tệ sống ở document/account-currency snapshot và payment subledger; không trộn minor units của nhiều currency trong base ledger.
- Purchase Receipt dưới policy VN: transaction currency có thể khác company currency, nhưng stock valuation + GL được server-convert sang company currency từ Exchange Rate master. Dr Inventory / Cr Stock Received But Not Billed. Cancel đảo exact original GL + stock revision.
- Stock Entry Material Receipt/Issue dưới policy VN: Dr/Cr Inventory với Stock Adjustment. Runtime final controller là `RolloutManufacturingStockEntryController`; nó route Material Receipt/Issue qua `AccountingStockEntryController`, còn Material Transfer/Manufacture giữ manufacturing rollout. Không đăng ký controller accounting rồi để rollout cuối ghi đè.
- Delivery Note dưới policy VN: stock valuation phải đồng nhất company currency. `Bán hàng` dùng Dr COGS / Cr Inventory; issue phi-bán-hàng dùng Stock Adjustment / Inventory. Stock history sai currency/scale fail closed. Base Delivery Note cancel đã đảo exact historical ledger.
- Journal Entry có account-currency snapshot: Account.account_currency, server-resolved Exchange Rate, debit/credit nguyên tệ và base debit/credit. GL chỉ ghi company currency; client exchange rate không authoritative.
- Payment Allocation làm thay đổi authoritative AR/AP nên chịu VN Accounting Period Hard/Soft lock và không được cross-company reference.
- `VN Legal Rule`, `VN Tax Ruleset`, `TT99 Account Map` là effective-versioned/submittable; submitted version immutable, không cancel/amend. Workflow tách preparer/Chief Accountant và `allow_self_approval=false`.
- Approval evidence authoritative là authenticated `versions.actor + created_at + command_id`, không phải field `approved_by` do client gửi.
- `VN Reconciliation Case` lưu expected/actual/difference minor units, root cause và submitted resolution document; resolved case immutable.
- `Accounting Integrity Exceptions` là control-tower read model. Trước production migration, read-only audit phải về 0 CRITICAL hoặc có remediation/approved exception rõ ràng.
- App `vn-accounting` branch version `1.2.0`: thêm TT99 Account Map, VN Tax Ruleset, VN Reconciliation Case, Tax Specialist/Internal Auditor và surface existing E-Invoice Submission. Không tạo e-invoice/accounting ledger cạnh tranh.
- Regression source: `server/scripts/test-vn-accounting-period-hardening.py`, `server/scripts/test-vn-accounting-integrity-closure.py`, `server/tests/vn-accounting-migration-gates.test.mjs`, `server/tests/accounting-query-scope.test.mjs`, `server/tests/accounting-journal-entry-fx.test.mjs`.
- Exact final execution evidence chưa có vì shell không resolve GitHub DNS để checkout/run dependency tree. Không tuyên bố final technical PASS trước khi exact migration/unit/typecheck/build chạy thành công.
- Không merge/deploy/migrate production hoặc mutate tenant trong task này nếu chưa có lệnh riêng.
- “Legal compliance 100%” không được suy ra từ code. Go-live statutory cần company-specific regime/effective laws, VAT/CIT/PIT/insurance rules/test vectors, e-invoice provider, chữ ký số, nguồn pháp lý chính thức và approval thực tế.

## HRM operational 1.5

- PR `#261` squash-merge tại `b3dc2cf59ec5c85a977833da6edc986ac1bfe6fb`.
- HRM scope: recruitment, hire-to-retire, leave, attendance/overtime, payroll inputs, employee expenses, goals/appraisal/training.
- Salary Slip/Payroll Entry/GL là accounting source of truth; HRM cung cấp payroll inputs, không có payroll ledger cạnh tranh.
- Submitted Salary Slip khóa các source Attendance/Leave/OT/Salary Structure Assignment/Additional Salary đã dùng; correction đi qua cancel/amend/rerun.
- `VN Payroll Rule` có effective period, legal source, approval metadata và formula evidence; rule đã dùng là append-only.
- `formula_json` hiện là audited/versioned evidence, chưa phải statutory PIT/BHXH evaluator.

## Production release evidence

- Checkpoint: `a0ae5f4f00a6be7311efcaff87c4caabea60f6be`.
- `stage-client-bundle.mjs` có thể tạo `/release.json` chứa `releaseSha` + `bundleHash`.
- `/health` chứng minh service sống; `/release.json` dùng đối chiếu revision UI đang phục vụ.

## UI deploy implementation

- Workflow: `.github/workflows/manual-release-alu.yml` (`ALU Build and Deploy`).
- UI fast path hiện có trigger push cho các nhánh UI và build runtime + warehouse mobile trước khi deploy Gateway.
- Full ALU deploy vẫn tồn tại trong cùng workflow qua `workflow_dispatch`.
- Các thay đổi workflow gần đây tập trung giảm thời gian setup/build và giảm false-fail sau deploy.

## Website/CMS v1

- PR `#254` squash-merge tại `b25fc30b0f37d1218cafbb4dac40e37479bba0b9`.
- Public API allowlist: `forge.website.manifest`, `forge.website.page`.
- Public Website resolver tenant-scoped và published-only.

## Business checkpoints

- Warehouse Cash schema/controller/ledger thuộc `vn-accounting`; Alumdoor consume qua integration metadata/generic routes.
- `gl_entries` là money source of truth; balance/daily usage là projections rebuildable.
- Party dimension không đồng nghĩa settle AR/AP; invoice settlement dùng canonical Payment Entry/payment allocation.
- Generic Bulk View hiện master-only; transaction/submittable/ledger cần controller-backed flow riêng.
