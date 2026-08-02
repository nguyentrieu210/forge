# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## Forge 0.2.0 parallel execution

- Canonical board: `docs/agents/AGENT_BOARD.md`.
- Protocol: `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.
- 18 branch `agent/ent-00-*` -> `agent/ent-17-*` là workstream ownership mới.
- Trước implementation, mỗi branch phải được đối chiếu/rebase lên exact current `main` nếu còn dựa snapshot cũ, nhưng phải giữ workstream handoff file của chính nó.
- Mỗi agent phải audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject` để không vừa mất code tốt vừa kéo nguyên branch stale vào main.
- Merge theo dependency order trong board; shared hotspots không có hai owner cùng lúc.

## VN Accounting / Finance — WS01

- Audit canonical work hiện có quanh `fix/vn-accounting-period-integrity-20260803-r8` và các substantive accounting PR còn mở trước khi viết mới.
- Migration mới phải kiểm exact `main`; không dùng lại số migration đã có.
- Regression phải bao phủ Hard/Soft lock, cancel, scope move, tenant isolation, period overlap/range và expanded posting doctypes.
- Finance/stock/payroll/legal path là CRITICAL: cần exact tests, correction/reversal, reconciliation, permission/tenant boundary và migration replay trước merge.
- Không production migration/deploy khi chưa có verification đầy đủ và authorization rõ.

## Frontend/runtime — WS14

- Xác nhận một UI push thực tế đi hết build -> stage -> Wrangler deploy -> `/health` -> `/release.json` đúng SHA/hash khi có UI task phù hợp fast path.
- Ghi duration thực tế của fast path và nguyên nhân nếu còn fail.
- Shared React runtime/core/views/shell thuộc WS14; domain agent không tự sửa shared renderer nếu có thể giải bằng metadata.

## HCM / payroll — WS06

- Audit HRM operational 1.5 và substantive statutory-payroll PR lịch sử.
- `VN Payroll Rule.formula_json` hiện là versioned/audited evidence trong merged baseline; statutory automation phải có formula schema explicit, fixed-point/rounding semantics, effective-date/version selection, official legal source, approval lifecycle và regression theo từng version pháp lý.

## Inventory/WMS — WS04

- Stock Reconciliation Bulk Transaction: audit PR lịch sử trước khi viết lại.
- Backdated/repost/valuation/reconciliation phải giữ một stock ledger/source of truth.
- WMS core tiếp tục từ inventory nền: bin/putaway/picking/cycle count/mobile scanner theo capability map.

## Manufacturing/QMS — WS05

- BOM parent + child/version Bulk Transaction.
- Audit manufacturing-costing/Plastic ERP PR lịch sử rồi quyết định reuse/cherry-pick/supersede.
- Không tạo costing/stock ledger cạnh tranh với canonical ledger.

## BPM / App Factory — WS09

- First-class AppAction input-table contract.
- Batch action primitives dùng chung cho Stock/BOM/other apps khi pattern lặp lại.
- Shared app-registry/compiler/builder contract chỉ WS09 sở hữu.

## Cross-domain priorities

- P1 Daily Detailed Ledger exact-state review: WS01 + WS08 + WS12.
- End-to-end closure `Sales -> Production -> Inventory -> Delivery -> Finance -> Daily Ledger -> Warranty`: coordinator chia dependency qua WS02/WS05/WS04/WS01/WS07/WS17.
- Migration/onboarding/tooling: WS13.
- Security/IAM/SaaS: WS11.
- SRE/release/backup/DR: WS12.
- Alumdoor reference vertical: WS17, không fork Forge core.
