# NEXT TASKS

Ngày cập nhật: **2026-08-04**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## DONE — Enterprise Transaction Closure

- Canonical convergence PR `#519` đã squash-merge vào `main` tại `2b1d088c353bd2c15cd6bc2a74b342c98df1dcf7`.
- Đã hội tụ và kiểm chứng một candidate duy nhất cho: Sales/O2C, Manufacturing, Inventory/WMS/valuation, Finance Daily Ledger + cross-ledger reconciliation, Procurement/P2P và Warranty/Service.
- Exact CRITICAL evidence: candidate `9ef9944f4a28e884979d790fc359d7c2c08da497` trên `main@f6f1905bd18e33ed87896b94ba10670b3b2c53b3`, GitHub Actions run `30847056639`, job `91797832548`.
- Focused Node matrix **221/221 PASS**; Finance SQL/period/AP/bank controls PASS; `manufacturing-qms`, `procurement`, `maintenance` package gates PASS; authority diff audit PASS.
- Không thêm Transaction Closure migration, không tạo shadow GL/Payment Ledger/Stock Ledger/AR/AP/valuation authority và không có backend production deploy trong phase này.
- Full repository TypeScript vẫn có exact-main baseline debt ngoài changed authority set; phase này không tự phong global TypeScript PASS hoặc `Hardened`.
- Completion evidence: `docs/agents/transaction-closure/07-CONVERGENCE.md` và phase-close record cùng thư mục.

## NEXT PROGRAM — Platform Productization

Ưu tiên sau Transaction Closure không phải mở thêm horizontal ERP feature wave. Mục tiêu tiếp theo là biến core đã chứng minh thành platform có thể tạo/cài/nâng cấp/vận hành app cho nhiều tenant một cách an toàn.

Thứ tự ưu tiên:

1. **WS09 — App Factory operationalization**
   - first-class `AppAction` input-table contract;
   - generic batch-action / batch-transaction primitives dùng chung cho Stock/BOM/other apps;
   - reusable action/approval primitives;
   - shared app-registry/compiler/builder contract vẫn do WS09 sở hữu;
   - không hard-code vertical schema vào generic runtime.
2. **WS11 — SaaS / IAM / Security closure**
   - tenant provisioning và organization/company isolation;
   - role/permission authority, MFA/SSO/step-up, session lifecycle;
   - module entitlement / suspend-reactivate boundaries;
   - security/audit control surface và server-side row-scope nơi còn thiếu.
3. **WS13 — Migration / onboarding / tooling**
   - Excel/ERPNext import, mapping, dry-run, retry/idempotency;
   - reconciliation/cutover evidence;
   - tenant bootstrap, app install/upgrade/rollback path.
4. **WS12 — Production hardening / SRE**
   - release evidence, backup/restore/PITR, rollback, observability, DR;
   - migration safety và tenant-scoped recovery proof.
5. **WS01/WS06/VN compliance owners — Vietnam statutory closure**
   - PIT/BHXH/BHYT/BHTN, VAT/CIT, e-invoice/e-sign;
   - versioned effective-date legal rules, fixed-point/rounding semantics, official-source evidence và statutory regression.

## Forge 0.2.0 parallel execution

- Canonical board: `docs/agents/AGENT_BOARD.md`.
- Protocol: `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.
- 18 branch `agent/ent-00-*` -> `agent/ent-17-*` là workstream ownership baseline; branch stale phải đối chiếu/rebase lên exact current `main` trước implementation nhưng giữ handoff của chính nó.
- Mỗi agent phải audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject` để không vừa mất code tốt vừa kéo nguyên branch stale vào main.
- Merge theo dependency order trong board; shared hotspots không có hai owner cùng lúc.
- Transaction Closure worker PR `#498/#501/#502/#506/#507/#510` là lịch sử/evidence; canonical merged result là `#519`, không mở lại worker branch để tạo competing authority.

## VN Accounting / Finance — WS01

- Audit canonical accounting-period/legal work còn lại trên exact current `main`; không mặc định branch lịch sử còn canonical chỉ vì tên nghe quan trọng.
- Migration mới phải kiểm exact `main`; không dùng lại số migration đã có.
- Finance/stock/payroll/legal path là CRITICAL: cần exact tests, correction/reversal, reconciliation, permission/tenant boundary và migration replay trước merge.
- Transaction Closure đã đóng Finance Daily Ledger + cross-ledger read/control evidence cho declared scope; follow-up chỉ mở khi capability gap cụ thể hoặc deferred boundary có owner rõ.
- Không production migration/deploy khi chưa có verification đầy đủ và authorization rõ.

## Frontend/runtime — WS14

- UI V3 đã tiến đáng kể trên `main`; mọi follow-up phải audit exact release state thay vì dùng snapshot trước V3.
- Production UI evidence vẫn phải chứng minh build -> stage -> Wrangler deploy -> `/health` -> `/release.json` đúng SHA/hash; `Merged` không tự động đồng nghĩa `Deployed`.
- Offline read/write/background sync/conflict (`U01-003..007`) phải consume WS00/WS11/WS12 tenant/session/cache/OCC/release-freshness contract, không tạo client-only authority.
- Domain-specific profiles trong shared views phải đưa về metadata qua WS09/domain owner trước khi generic renderer được coi là generic hoàn toàn.
- Shared React runtime/core/views/shell thuộc WS14; domain agent không tự sửa shared renderer nếu metadata/contract layer giải được.

## HCM / payroll — WS06

- Audit HRM operational 1.5 và substantive statutory-payroll PR lịch sử trên exact main.
- `VN Payroll Rule.formula_json` là versioned/audited evidence; statutory automation phải có formula schema explicit, fixed-point/rounding semantics, effective-date/version selection, official legal source, approval lifecycle và regression theo từng version pháp lý.

## Inventory/WMS — WS04

Transaction Closure đã giữ một Stock Ledger/valuation authority và tăng evidence cho reservation/picking/reconciliation/backdate/repost. Follow-up ưu tiên depth thay vì tạo ledger mới:

- persisted Warehouse Task / putaway / pick orchestration;
- cycle count / count freeze / authoritative task completion;
- automated reservation consumption/expiry theo fulfillment evidence;
- mobile scanner server integration;
- landed-cost authoritative valuation application/reversal contract cho Procurement;
- side-effect-free generic transaction preview nếu shared platform contract được owner chốt.

## Manufacturing/QMS — WS05

- Tiếp tục BOM parent + child/version bulk transaction khi shared App Factory batch primitive đã rõ.
- Rework/subcontract operating-model depth và posted labor/machine/overhead variance GL là follow-up riêng; không giả định Transaction Closure đã Hardened toàn M01..M04.
- Không tạo costing/stock ledger cạnh tranh với canonical ledger.

## BPM / App Factory — WS09

Đây là workstream ưu tiên số 1 của program kế tiếp:

- first-class AppAction input-table contract;
- generic Batch Transaction / Batch Action primitives;
- reusable approval/action contracts;
- import/export/bulk operation contract;
- đưa các pattern đã được chứng minh bởi Stock/BOM/Sales/Procurement xuống platform khi thực sự generic;
- shared app-registry/compiler/builder contract chỉ WS09 sở hữu.

## Cross-domain follow-up

- Transaction Closure `Sales -> Manufacturing -> Inventory -> Finance/Daily Ledger -> Procurement -> Warranty/Service`: **DONE for declared scope** qua `#519`.
- Deferred cross-domain boundaries phải được mở bằng capability ID + owner cụ thể, không tạo một “closure wave” thứ hai mơ hồ.
- Migration/onboarding/tooling: WS13.
- Security/IAM/SaaS: WS11.
- SRE/release/backup/DR: WS12.
- Alumdoor reference vertical: WS17, tiếp tục làm reference consumer, không fork Forge core.
