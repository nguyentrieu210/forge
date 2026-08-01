# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

## IN PROGRESS — Plastic Factory ERP G1 Requirements

- Canonical working branch cho session này: `feat/plastic-factory-erp-brd-20260802`.
- Branch merge-base: `3222beb66bd3e6b2abbab1b17a6009044a2d5358`.
- Current `main` head đã xác minh qua GitHub compare: `2d0d4ab871714d84ba015afcd8e4797623bad558`; branch hiện diverged, ahead 6 / behind 12. Không merge nguyên branch trước khi sync/review conflict sau khi G1 được duyệt.
- Current docs head sau enterprise scope update: `c83a2d3b23f67b47aba0e0d1fe76ecca77ff0c4c` trước commit status này.
- Combined status tại docs head `c83a2d3b...`: không có status checks; thay đổi là docs-only nên test/typecheck/build chưa chạy.
- BRD draft: `docs/plastic-factory-erp/BRD.md`.
- Enterprise scope matrix: `docs/plastic-factory-erp/ENTERPRISE_SCOPE.md`.
- Scope đã mở rộng từ manufacturing ERP thành plant-wide ERP: 50 domain từ commercial/demand, S&OP/MRP, PLM-lite, SRM/procurement, WMS, plastic process execution, QMS, EAM, packing/recall, costing/finance, HR operational, EHS/energy, document control, BI, integrations, security/DR và multi-plant foundation.
- Product shape: internal operational ERP web/mobile trên Forge kernel; không tạo ERP thứ hai tách khỏi stock/manufacturing canonical hiện có.
- Core mới dự kiến: plastic material/process profiles, Machine, Mold/Tool, Routing/Process Parameters, Production Run, Drying/Mixing/Changeover, QMS/NCR/CAPA, Maintenance/EAM, Packaging/Pallet genealogy, planning/MRP/capacity và plant costing extensions.
- Core tái sử dụng: versioned BOM, immutable Work Order snapshot, stock lifecycle, lot/batch lineage, reservation, RBAC và MetaForge runtime policy.
- Gate hiện tại: **G1 Requirements**. Chưa implementation trước khi enterprise scope được duyệt và process profile chính được chốt.
- Không deploy Cloudflare, không sửa production secret/DNS, không mutate tenant production.

## DONE — Authenticated reservation availability lifecycle

- PR `#175` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `e839599ddf23e6cf89a325497b62f20085f62ffd`.
- Merge commit: `509db8c32625168316696fb0deb3760a434aedf9`.
- Final exact-head CI: **6/6 PASS**.
  - CI `30718759652`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30718759696`: frontend lint/build, MetaForge browser QA, Alumdoor browser QA và authenticated cookie+CSRF reservation lifecycle PASS.
  - PR Validation `30718759665`: PASS.
  - Purchase Feature CI `30718759676`: PASS.
  - Sales Feature CI `30718759661`: PASS.
  - Inventory and Manufacturing CI `30718759660`: PASS.

### Reservation evidence đã khóa

1. QA tạo item theo lô, Batch thật và submitted Serial and Batch Bundle trong local D1; `Thủ kho` post tracked Material Receipt 10 cây.
2. Physical-stock report `include_lineage=true` thấy đúng batch và quantity 10.
3. Giữ 6 không đổi physical stock; giữ thêm 5 bị từ chối với available còn đúng 4 (`tổng 10, đã giữ 6`).
4. Nhả reservation có lý do không đổi physical stock; sau nhả có thể giữ đủ 10.
5. Khi giữ đủ 10, reservation tiếp theo bị từ chối với available 0.
6. Double-release bị từ chối bằng Frappe `ValidationError` HTTP 417; reservation terminal không đổi ngược về `Đang giữ`.
7. `Thủ kho` không được tạo Stock Reservation; `Chủ xưởng` thực hiện reservation/release theo RBAC hiện hành.
8. Test chạy desktop + mobile bằng cookie + CSRF thật trên D1 local/ephemeral.
9. Không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.

## DONE — Stock acceptance foundations

- PR `#176`: MetaForge Form Renderer canonical policy 10/10, merge `a7643cee0102aee1c37d4f00afac1594d0261e68`, exact-head CI 6/6 PASS.
- PR `#173`: physical-stock catch-weight reconciliation, merge `25df9d32217703b9c6c3f965f318b779fe028333`, exact-head CI 6/6 PASS.
- PR `#170`: Stock Entry operational submit RBAC, merge `9b51da20902ac67dc3b4df7ce6ee77b11f886007`, exact-head CI 6/6 PASS.
- PR `#167`: authenticated stock lifecycle + mobile canonical contracts, merge `ec80180632438680e872e5b4075f492cf1c0e8f7`, exact-head CI 6/6 PASS.
- PR `#164`: canonical first-party Meta boundary, merge `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`, exact-head CI 6/6 PASS.

## Main và production boundary

- Default branch: `main`.
- Exact current `main` head theo GitHub compare trong đợt này: `2d0d4ab871714d84ba015afcd8e4797623bad558`.
- Main executable checkpoint sau PR #175: `509db8c32625168316696fb0deb3760a434aedf9`; phải kiểm lại nếu cần executable head mới hơn.
- Production checkpoint trong handoff chỉ là lịch sử, không được suy ra provider hiện tại.
- Không deploy production nếu user chưa yêu cầu rõ.

## NEXT

1. **Plastic ERP G1:** review enterprise scope 50 domain và khóa process profile/dry-mix/regrind/QC/packing/finance/multi-plant/device integration decisions.
2. **Plastic ERP G2:** sau G1, sync từ exact current `main`, resolve docs conflict, rồi tách implementation roadmap thành dependency-ordered epics; foundation phải giữ one-stock-ledger/one-genealogy/one-document-source-of-truth.
3. **P0:** QR/lineage end-to-end và cleanup QA không residue.
4. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
5. **P2:** warranty/defects/capacity theo quy trình 25.7.
6. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
