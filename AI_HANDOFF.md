# AI HANDOFF

Ngày cập nhật: **2026-08-03**.

Tài liệu này lưu facts, checkpoints và business invariants. Exact GitHub state luôn thắng prose nếu repo đã thay đổi sau thời điểm ghi.

## Repository / execution state

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- WS00–WS17 convergence đã đóng ở repository level.
- RC Hardening Wave 0 đã hội tụ vào main qua RC-01..RC-05.
- PR/branch cũ chỉ là history/evidence; task mới bắt đầu từ exact current main.
- Canonical execution plan: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- Capability truth: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.

## Enterprise maturity truth

Capability denominator: **956**.

```text
Hardened: 0
RC: 4
Wired: 448
Foundation: 345
Missing: 159
```

Overall Forge vẫn là **Wired**, đang đi vào RC hardening. Không promote từ merge/code existence hoặc test count đơn lẻ.

## RC Wave 0 facts

### Capability Truth

- 956/956 capability có maturity assignment.
- Evidence Index và completeness validator tồn tại trên main.
- Hardened = 0 vì exact production/failure/reconciliation evidence chưa đủ.

### Release/SRE

- Canonical release workflow: `.github/workflows/alu-build-deploy.yml`.
- Duplicate automatic Gateway deploy workflow và stale purchase-funding one-off đã được RC-02 loại khỏi main.
- Production maintenance workflow nhạy cảm phải manual/exact-main guarded.
- Merge state không phải production proof.

### Validation

- FAST/STANDARD/CRITICAL có executable matrix/runner.
- Finance/stock/payroll phải CRITICAL và cần correction/reversal + reconciliation.
- UI promotion cần browser/mobile evidence khi applicable.
- HARDENED/DEPLOYED cần exact release evidence.

### Kernel/Auth

- Canonical document create/save/submit/cancel giữ OCC/idempotency/audit/outbox/receipt authority.
- Logout valid session fail-closed khi CSRF/session registry/revoke write không hợp lệ.
- Current browser session revoke authority là logout path; duplicate revoke_session không được mutate current session.
- Delete/rename maintenance semantics vẫn là explicit shared-contract gap, không tự coi đã Hardened.

### IAM/Tenant/App lifecycle

- Permission authority vẫn server-side: Role/DocPerm/permlevel/owner/Share/User Permission/org scope/Role Policy.
- App upgrade fail-closed nếu package làm mất materialized metadata mà chưa có reverse migration/uninstall contract.
- Same-app concurrent upgrade OCC/serialization vẫn là hardening gap.

### Offline

- `docs/FORGE_OFFLINE_SYNC_CONTRACT.md` là contract freeze.
- `U01-003..007` vẫn Missing.
- Offline private data phải partition theo trusted tenant/user + access revision + bounded lease + schema/release identity.
- Offline write deny-by-default; retry giữ stable command_id/expected_version/payload hash; server là OCC/conflict authority.
- Không generic last-write-wins cho business documents.

## Next execution order

1. Finance `RC-020..023`.
2. Inventory `RC-024..025`.
3. Authority freeze.
4. Procurement / CRM / HCM / Manufacturing `RC-030..038` theo domain song song.
5. Enterprise Depth `RC-040..045`.
6. App Factory + AI `RC-046..047`.
7. Alumdoor proof `RC-050..054`.

## Core architecture invariants

- CloudForge/Document Kernel và domain authorities là authoritative write path.
- Không bypass tenant/permission/OCC/idempotency/audit để làm nhanh UI.
- D1 ledger/source/projection boundary phải giữ một source of truth.
- Shared runtime không hard-code business doctype nếu metadata/manifest biểu diễn được.
- Pattern lặp lại ở nhiều app phải được đánh giá để nâng thành shared/App Factory primitive.

## Finance / stock / payroll invariants

- `gl_entries` + canonical accounting controllers là financial authority.
- Payment Entry/payment allocation là authority cho invoice settlement.
- Stock correction/repost/valuation đi qua canonical stock ledger/controller; reconcile với finance khi valuation tích hợp GL.
- Payroll dùng effective-dated/versioned evidence; used legal rule không được sửa lịch sử lặng lẽ.
- Correction/reversal/backdate/reconciliation là promotion gate, không phải optional polish.

## Alumdoor invariants

- Alumdoor là reference vertical trên Forge, không fork core.
- Nhôm mua/nhập và accounting stock dùng kg thực cân; physical operation có thể giữ thêm số cây/lá, mã, màu, trạng thái, kích thước, kho/lô.
- Finished door có thể bán theo m²; không đổi stock authority thành “Bộ” để làm UI dễ hơn.
- Mobile ưu tiên sales/receivables/delivery.
- Shared HRM vẫn đầy đủ; Alumdoor shell chỉ expose Employee + Attendance theo product decision hiện hành.
- Warehouse Cash thuộc VN Accounting backend authority, Alumdoor consume qua generic integration.

## Production evidence

- `/health` chỉ chứng minh service availability.
- `/release.json`/release evidence phải khớp exact SHA + bundle marker cho deployed claim.
- Các merge RC Wave 0 không được coi là production deployment.
- Không production migration/restore/PITR/secret/DNS/customer-data mutation được thực hiện trong RC Wave 0 convergence.

## Business decisions phải dừng khi thực sự gặp

Không tự bịa policy nếu repo/tài liệu không suy ra được, ví dụ:

- Employee Loan outstanding khi separation nếu flow mới chạm tới;
- rework/subcontract operating model nếu implementation cần semantics chưa chốt;
- provider/vendor cụ thể cho e-invoice/e-sign/bank/BHXH/tax khi abstraction kỹ thuật không đủ để quyết định thay doanh nghiệp.

Nếu chỉ block một phần, ghi Dependency Request và tiếp tục phần độc lập.
