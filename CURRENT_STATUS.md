# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

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
- Main executable head sau PR #175: `509db8c32625168316696fb0deb3760a434aedf9`.
- Alumdoor production vẫn chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Production full release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta vẫn là `2.1.0`; source code hiện có Alumdoor metadata `2.1.1` nhưng chưa deploy.
- G03 Organization Security có trên main nhưng chưa có production release evidence.

## NEXT

1. **P0:** QR/lineage end-to-end và cleanup QA không residue.
2. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
3. **P2:** warranty/defects/capacity theo quy trình 25.7.
4. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
