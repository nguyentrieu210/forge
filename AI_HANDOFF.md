# AI HANDOFF

Ngày cập nhật: **2026-08-03**.

Tài liệu này lưu facts, checkpoints và business invariants của Forge. Exact GitHub state luôn thắng tài liệu nếu có thay đổi sau thời điểm này.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- WS00–WS17 convergence đã đóng ở repository level.
- Toàn bộ PR delivery cũ còn mở tại thời điểm reset 2026-08-03 đã được đóng không merge.
- Branch/history cũ chỉ là reference; task mới phải bắt đầu từ exact current `main`.

## Enterprise maturity

- Theo `skills/forge-enterprise-completion/SKILL.md`, Forge hiện ở mức tổng thể **Wired**, với RC cục bộ ở một số capability/domain.
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` có **956 capability ID** tại thời điểm lập kế hoạch.
- Chưa có live maturity register 956/956 trên current main; không báo phần trăm tổng cảm tính.
- Chương trình mặc định tiếp theo: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- Wave đầu phải tạo `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` và chấm toàn bộ capability theo `Missing / Foundation / Wired / RC / Hardened` với evidence.

## RC Hardening execution order

1. Capability truth + evidence register.
2. Platform/SRE/Security RC.
3. ERP Core RC: Finance/VN -> Inventory/WMS -> Procurement -> CRM/O2C -> HCM/Payroll -> Manufacturing/QMS.
4. Enterprise Depth: Project/Service, BI Semantic, Integration Hub, Workplace/DMS.
5. App Factory + generic enterprise UI + deterministic AI tooling.
6. Alumdoor reference vertical 95% + current production hardening/evidence.

Không mở lại PR cũ làm canonical. Nếu lịch sử có code hữu ích, audit exact current main rồi cherry-pick/rebuild phần còn đúng contract.

## Core architecture invariants

- CloudForge/document kernel là authoritative write path.
- Không bypass tenant/permission/OCC/idempotency/audit để làm nhanh UI.
- D1/ledger/projection phải giữ source-of-truth boundary hiện hành.
- Money/stock/payroll/legal rule phải có correction/reversal/traceability phù hợp.
- Shared runtime không hard-code business doctype nếu metadata/manifest biểu diễn được.
- Pattern lặp lại từ nhiều app phải được đánh giá để nâng thành platform/App Factory primitive.

## Finance / stock / payroll invariants

- `gl_entries` và canonical accounting controllers là financial authority; không tạo ledger cạnh tranh.
- Payment allocation/Payment Entry là authority cho invoice settlement.
- Stock correction/repost/valuation phải đi qua canonical stock ledger/controller và có reconciliation với finance khi tích hợp.
- Payroll phải dùng effective-dated/versioned legal evidence; used rule không được sửa lịch sử lặng lẽ.

## Alumdoor invariants

- Alumdoor là reference vertical chạy trên Forge, không fork core.
- Mua/nhập nhôm và accounting stock dùng kg thực cân; physical operation có thể giữ thêm số cây/lá, mã nhôm, màu, tình trạng, khổ/chiều dài, kho/lô.
- Bán cửa/thành phẩm tính theo đơn vị thương mại phù hợp, ví dụ m²; không ép stock authority thành “Bộ” chỉ để dễ UI.
- Mobile Alumdoor ưu tiên sales/receivables/delivery use case.
- Shared HRM vẫn là app đầy đủ; Alumdoor chỉ expose Employee + Attendance ở product/shell khi đó là product decision.

## Release/workflow truth

- Canonical release workflow trên main hiện là `.github/workflows/alu-build-deploy.yml`.
- Cleanup PR #427 đã đóng không merge; vì vậy `.github/workflows/deploy-ui-once.yml` và `.github/workflows/tmp-alumdoor-purchase-funding-release.yml` vẫn phải được audit lại từ current main ở Wave 0, không được coi là đã xóa.
- Production proof cần exact release SHA + health + release marker/evidence; merge state không phải deploy proof.

## Business decisions still requiring explicit input when encountered

Không tự bịa policy nếu repo/tài liệu không suy ra được, ví dụ:

- company policy cho outstanding Employee Loan khi separation nếu flow mới chạm tới;
- rework/subcontract operating model khi implementation cần business semantics chưa được chốt;
- provider/vendor cụ thể cho e-invoice, e-sign, bank/BHXH/tax nếu technical abstraction không đủ để chọn thay doanh nghiệp.

Nếu dependency này chỉ block một phần, ghi Dependency Request và tiếp tục phần độc lập.
