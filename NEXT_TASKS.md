# NEXT TASKS

Ngày cập nhật: **2026-08-04**.

Đây là backlog hiện tại của Forge. AI tự đánh giá cách thực hiện dựa trên code và trạng thái GitHub tại thời điểm làm.

## DONE — RC3 release-confidence rebaseline

- Capability truth reconciled from A0-A5 against exact WS09 main seed.
- New maturity candidate: **Hardened 0 / RC 65 / Wired 407 / Foundation 327 / Missing 157** across exactly 956 IDs.
- WS09 Batch Productization source convergence is DONE; remaining App Factory work is residual RC evidence/rollback/workflow depth, not another generic batch rewrite.
- Next work should follow the RC3 top-30 queue: WS11 IAM/privacy, WS12 provider/SRE recovery, WS13 migration/cutover, WS01/WS06 statutory + reconciliation depth, then WS14 browser/mobile/offline evidence.

## DONE — CFMAX R2 source convergence

- Canonical PR `#570` đã merge vào `main` tại `88a349e3f4267aa749d791b504cb7a7c13f3e9b5`.
- Final exact-head candidate `4705fe6c4f22ddaf1fe397d433f7361dd953f94b` có integrated run `30854860156` **SUCCESS**.
- CF01/02/03/04/05/06/08 source outcomes đã merge; CF07 optional runtime lane kết thúc **DEFERRED**.
- Source completion không đồng nghĩa RC/Hardened; provider/live evidence còn thiếu được tách thành phase riêng.
- Canonical evidence: `docs/agents/cloudflare-cfmax/CFMAX_R2_POST_MERGE_20260804.md`.

## NEXT — CFMAX provider / non-production evidence closure

Đây không phải một source rewrite wave mới. Chỉ mở từng primitive khi có environment, quyền và evidence phù hợp.

1. **D1 read replication / consistency proof**
   - bật read replication trong approved non-production only;
   - đo `served_by_region` / primary behavior, bookmark correctness và APAC latency;
   - chứng minh dependent read-after-write không regress trước RC.
2. **Cloudflare Workflows live recovery proof**
   - deploy Workflow Worker vào approved non-production;
   - test retry, resume/restart, terminate, duplicate/idempotency và route-index recovery;
   - Workflow vẫn gọi control-plane authority, không direct-write D1/KV.
3. **Usage / Analytics Engine proof nếu adopt**
   - tạo dataset/binding chỉ khi usage/cost telemetry được quyết định dùng thật;
   - tenant separation, low-cardinality schema và billing reconciliation phải PASS trước quota/invoice enforcement.
4. **Edge security provider proof**
   - WAF/rate-limit/Turnstile/Access chỉ triển khai theo threat-route matrix;
   - đo false positive và API/PWA/machine compatibility;
   - Forge auth/permission vẫn authoritative.
5. **AI Gateway provider proof**
   - resource/config/spend-policy/privacy evidence;
   - không cho model output mutate business authority trực tiếp.
6. **Browser Run live proof**
   - validate authorized HTML -> PDF path trong approved environment;
   - permission và tenant-scoped artifact handling phải giữ nguyên.
7. **CF08 remote governance / recovery**
   - read-only desired-vs-observed Cloudflare inventory;
   - drift report, quota/cost evidence;
   - controlled rollback/restore/PITR exercise với RTO/RPO trước Hardened.

Không tự deploy production, đổi DNS/WAF/secrets, enable replica hoặc chạy PITR chỉ để đóng checklist.

## DONE — Enterprise Transaction Closure

- Canonical convergence PR `#519` đã squash-merge vào `main` tại `2b1d088c353bd2c15cd6bc2a74b342c98df1dcf7`.
- Đã hội tụ và kiểm chứng một candidate duy nhất cho: Sales/O2C, Manufacturing, Inventory/WMS/valuation, Finance Daily Ledger + cross-ledger reconciliation, Procurement/P2P và Warranty/Service.
- Exact CRITICAL evidence: candidate `9ef9944f4a28e884979d790fc359d7c2c08da497` trên `main@f6f1905bd18e33ed87896b94ba10670b3b2c53b3`, GitHub Actions run `30847056639`, job `91797832548`.
- Focused Node matrix **221/221 PASS**; Finance SQL/period/AP/bank controls PASS; `manufacturing-qms`, `procurement`, `maintenance` package gates PASS; authority diff audit PASS.
- Không thêm Transaction Closure migration, không tạo shadow GL/Payment Ledger/Stock Ledger/AR/AP/valuation authority và không có backend production deploy trong phase này.
- Full repository TypeScript vẫn có exact-main baseline debt ngoài changed authority set; phase này không tự phong global TypeScript PASS hoặc `Hardened`.
- Completion evidence: `docs/agents/transaction-closure/07-CONVERGENCE.md` và phase-close record cùng thư mục.

## NEXT PROGRAM — RC3 residual release-confidence closure

Ưu tiên sau RC3 là đóng các blocker còn ngăn capability từ Wired/Foundation lên RC, không mở lại các source wave đã hội tụ.

Thứ tự ưu tiên:

1. **WS11 — IAM / privacy / SaaS operational evidence**: MFA browser/recovery, OIDC/SAML/SSO/SCIM lifecycle, support access, PII taxonomy/masking/retention.
2. **WS12 — SRE / provider / recovery evidence**: restore/PITR/DR/RTO-RPO, DLQ/alerts, edge policy, D1/Workflow/provider proofs.
3. **WS13 — Migration / onboarding / cutover**: retry/correction/incremental/reconciliation, cutover rollback and applied-state-aware migration numbering governance.
4. **WS01/WS06 — Finance/Vietnam statutory residuals**: year-end close, official effective-dated PIT/BHXH/BHYT/BHTN fixtures, e-invoice provider closure, landed-cost and Stock/GL repost reconciliation.
5. **WS14 — Current V2 browser/mobile/offline evidence**: desktop/tablet/Android/360px/a11y/PWA, then tenant/session/OCC-safe offline queue/conflict behavior.
6. **WS09 residual**: generic materialized rollback/reverse migration and approval quorum/timer/escalation only; do not rebuild BatchAction/BatchTransaction.

## Forge 0.2.0 parallel execution

- Canonical board: `docs/agents/AGENT_BOARD.md`.
- Protocol: `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.
- 18 branch `agent/ent-00-*` -> `agent/ent-17-*` là workstream ownership baseline; branch stale phải đối chiếu/rebase lên exact current `main` trước implementation nhưng giữ handoff của chính nó.
- Mỗi agent phải audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject` để không vừa mất code tốt vừa kéo nguyên branch stale vào main.
- Merge theo dependency order trong board; shared hotspots không có hai owner cùng lúc.
- Transaction Closure worker PR `#498/#501/#502/#506/#507/#510` là lịch sử/evidence; canonical merged result là `#519`, không mở lại worker branch để tạo competing authority.
- CFMAX worker branches là history/evidence sau `#570`; provider closure phải mở từ exact current `main`, không nối tiếp branch stale để tạo một Cloudflare authority thứ hai.

## VN Accounting / Finance — WS01

- Audit canonical accounting-period/legal work còn lại trên exact current `main`; không mặc định branch lịch sử còn canonical chỉ vì tên nghe quan trọng.
- Migration mới phải kiểm exact `main`; không dùng lại số migration đã có.
- Finance/stock/payroll/legal path là CRITICAL: cần exact tests, correction/reversal, reconciliation, permission/tenant boundary và migration replay trước merge.
- Transaction Closure đã đóng Finance Daily Ledger + cross-ledger read/control evidence cho declared scope; follow-up chỉ mở khi capability gap cụ thể hoặc deferred boundary có owner rõ.
- Không production migration/deploy khi chưa có verification đầy đủ và authorization rõ.

## Frontend/runtime — WS14

- UI V3/V2 runtime state phải audit exact current release; không dùng snapshot cũ.
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

WS09 Batch Productization source convergence đã DONE qua #553; chỉ mở residual RC gaps có capability/evidence cụ thể:

- first-class AppAction input-table contract;
- generic Batch Transaction / Batch Action primitives;
- reusable approval/action contracts;
- import/export/bulk operation contract;
- đưa các pattern đã được chứng minh bởi Stock/BOM/Sales/Procurement xuống platform khi thực sự generic;
- shared app-registry/compiler/builder contract chỉ WS09 sở hữu.

## Cross-domain follow-up

- Transaction Closure `Sales -> Manufacturing -> Inventory -> Finance/Daily Ledger -> Procurement -> Warranty/Service`: **DONE for declared scope** qua `#519`.
- CFMAX source convergence: **DONE for declared source scope** qua `#570`; provider/live evidence là phase riêng.
- Deferred cross-domain boundaries phải được mở bằng capability ID + owner cụ thể, không tạo một “closure wave” thứ hai mơ hồ.
- Migration/onboarding/tooling: WS13.
- Security/IAM/SaaS: WS11.
- SRE/release/backup/DR: WS12.
- Alumdoor reference vertical: WS17, tiếp tục làm reference consumer, không fork Forge core.
