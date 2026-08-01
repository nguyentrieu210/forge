# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence. Bản lịch sử chi tiết trước đợt rút gọn trạng thái này vẫn nằm trong Git tại parent `73305ec68318dcc194fda271a191997f7aed76e7`.

## Merge gate hiện tại — Canonical first-party Meta boundary

- PR: `#164` — `feat(meta): make canonical contract the first-party app boundary`.
- Branch: `feat/canonical-meta-platform-20260801`.
- Code head đã validate: `73305ec68318dcc194fda271a191997f7aed76e7`.
- Exact-head CI tại code head: **6/6 PASS**.
  - CI run `30712530415`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30712530454`: PASS.
  - Purchase Feature CI `30712530409`: PASS.
  - Sales Feature CI `30712530426`: PASS.
  - Inventory and Manufacturing CI `30712530470`: PASS.
  - PR Validation `30712530431`: PASS.
- Final branch head sau cập nhật tài liệu phải chạy lại exact-head CI và chỉ được merge khi toàn bộ gate terminal + PASS.
- Doc refresh đã được gom trên staging rồi fast-forward một lần; commit hiện tại tồn tại để GitHub phát `pull_request:synchronize` và tạo final exact-head checks.

### Nội dung kiến trúc đã hoàn tất trong PR #164

1. `apps-src` là authoring source; pack/install bắt buộc đi qua canonical compiler và package đầu ra dùng `metaContractVersion: 1`.
2. Compiler hoàn thiện `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced`; Link ngoài package phải thuộc registry nền tảng hoặc khai explicit `externalDocTypes`.
3. Gate `verify-first-party-meta` kiểm các first-party app `visits`, `hrm`, `vn-accounting`, `erp-organization-security` bằng cùng canonical contract.
4. Canonical `surface=internal` là hard visibility boundary; metadata legacy chưa có ownership/enforcement vẫn giữ safety rule cho required/title/dependency để không làm hỏng form cũ.
5. Client dùng typed `DocTypeViewPolicy`; server giữ semantic `reasonRequiredOn` qua parser.
6. G03 Organization Security dùng generic `/app/Department` và `/permissions?tab=roles|approvals`; package không còn phụ thuộc `/organization` hoặc `/security/*`.
7. Regression tests khóa canonical source compiler, external Link fail-closed, view-policy round-trip, internal surface và generic G03 navigation.

### CI failure đã xử lý trong đợt cuối

- General CI cũ đỏ vì demo selfcheck kỳ vọng metadata legacy `surface=internal` vẫn giữ required field `company`, trong khi implementation ban đầu strip mọi internal field.
- Fix `73305ec6` phân biệt canonical internal bằng ownership/enforcement metadata. Kết quả: legacy safety test vẫn đúng, canonical regression vẫn chặn internal/server-owned field lọt vào form.
- General CI sau fix đã qua server tests, client selfcheck, typecheck và build.

## Main và production boundary

- Default branch: `main`.
- Main executable code head trước khi PR #164 merge: `19f949c6aba3541c7d3585ad42f8a8c42ebeea74` (G03 Organization Security).
- Alumdoor production đang chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Full production release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta `2.1.0`: 74 DocTypes, 969 fields, 255 Links, 27 child tables, 12 reports, 3 report-backed charts, 6 external DocTypes.
- PR #164 **không deploy Cloudflare**, không sửa production secrets/DNS và không mutate tenant production.
- G03 đã merge vào main trước PR #164 nhưng **chưa có production release evidence**; không gộp G03 deploy vào smoke kho.

## Các mốc đã hoàn tất trên main

- PR `#154`: Canonical DocType Meta, merge `6c89e1a9227e989fd8b08d6e55b35ce2e74d87c7`.
- PR `#140`: MetaForge MISA-style workspace, merge `f6420c70823b969a28b43e3f93004ebd52546adc`.
- PR `#150`: Alumdoor PWA + official brand/media, đã có trong production release `b46d3228...`.
- PR `#161`: G03 Organization Security, main executable `19f949c6...`, CI PASS, chưa deploy production.

## Công việc tiếp theo sau PR #164

1. **P0:** authenticated stock lifecycle trên môi trường release/production có kiểm soát: nhập kho → xuất kho → chuyển kho → kiểm kho, desktop + mobile, đối chiếu ledger/qty/kg/QR và cleanup theo lineage.
2. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
3. **P2:** warranty/defects/capacity theo quy trình 25.7.
4. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails bắt buộc

- Không thay branch head khi exact-head CI của head hiện tại còn queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
