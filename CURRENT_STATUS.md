# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

## IN PROGRESS — Plastic Factory ERP G1 Requirements

- Canonical working branch cho session này: `feat/plastic-factory-erp-brd-20260802`.
- Branch merge-base: `3222beb66bd3e6b2abbab1b17a6009044a2d5358`.
- Current `main` head đã xác minh qua GitHub compare trong đợt này: `2d0d4ab871714d84ba015afcd8e4797623bad558`; branch đã diverged và không được merge nguyên trạng trước khi sync/review conflict sau G1.
- Enterprise scope docs head trước commit status này: `2c09556d184fc766726bcdc3b76601594b7045ac`.
- Docs-only branch chưa có status checks; test/typecheck/build không chạy vì chưa chạm executable code.
- BRD draft: `docs/plastic-factory-erp/BRD.md`.
- Enterprise scope matrix D01-D50: `docs/plastic-factory-erp/ENTERPRISE_SCOPE.md`.
- Advanced requirements D51-D75: `docs/plastic-factory-erp/ADVANCED_REQUIREMENTS.md`.
- Scope hiện bao phủ 75 domain: commercial/demand, S&OP/MRP, PLM/NPI/APQP, supplier/procurement, WMS/silo/weighing, plastic MES, QMS/LIMS/SPC foundation, tooling/EAM, packing/TMS/recall, costing/finance/CAPEX, HR/competency, EHS/energy/sustainability, document/audit/compliance, EDI/IoT/OT security/data platform và multi-plant foundation.
- Các cross-domain model đã bổ sung: effective revision graph, ownership vs custody, configurable genealogy grain, quality reaction plan, mass balance, canonical time taxonomy và cost taxonomy.
- Product shape: internal operational ERP web/mobile trên Forge kernel; không tạo ERP thứ hai tách khỏi stock/manufacturing canonical hiện có.
- Core tái sử dụng: versioned BOM, immutable Work Order snapshot, stock lifecycle, lot/batch lineage, reservation, RBAC và MetaForge runtime policy.
- Gate hiện tại: **G1 Requirements**. Chưa implementation trước khi 75 domain được classify MUST/SHOULD/CONDITIONAL/LATER theo nhà máy thực tế và process profile chính được chốt.
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

1. **Plastic ERP G1:** classify D01-D75 và khóa process profile, material prep, regrind, tooling, QC/LIMS, packing/logistics, finance, ownership, multi-plant và device/OT decisions.
2. **Plastic ERP G2:** sau G1, sync từ exact current `main`, resolve docs conflict, rồi tách implementation roadmap theo dependency; foundation giữ one-stock-ledger/one-genealogy/one-document-source-of-truth.
3. **P0:** QR/lineage end-to-end và cleanup QA không residue.
4. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
5. **P2:** warranty/defects/capacity theo quy trình 25.7.
6. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
