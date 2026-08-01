# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

## DONE — Canonical first-party Meta boundary

- PR `#164` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `cbd77e2c0498691cc4b40cc824649d114f96c8c9`.
- Merge commit: `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- PR được rebase theo final file state lên `main@941adefbcf50dc5054b6dfc9c9d517e15ce17f53` trước final validation để giữ các thay đổi MetaForge visual-polish đã merge song song.
- Final exact-head CI: **6/6 PASS**.
  - CI `30713123515`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30713123569`: PASS.
  - Purchase Feature CI `30713123513`: PASS.
  - Sales Feature CI `30713123526`: PASS.
  - Inventory and Manufacturing CI `30713123527`: PASS.
  - PR Validation `30713123531`: PASS.

### Kiến trúc đã chốt

1. `apps-src` là authoring source; pack/install đi qua canonical compiler và package đầu ra dùng `metaContractVersion: 1`.
2. Compiler hoàn thiện `kind`, `viewPolicy`, `valueSource`, `editMode`, `surface`, `serverEnforced`; Link ngoài package phải thuộc registry nền tảng hoặc khai explicit `externalDocTypes`.
3. Gate `verify-first-party-meta` kiểm `visits`, `hrm`, `vn-accounting`, `erp-organization-security` bằng cùng canonical contract.
4. Canonical `surface=internal` là hard visibility boundary. Metadata legacy thiếu ownership/enforcement vẫn giữ safety rule cho required/title/dependency để không làm hỏng form cũ.
5. Client dùng typed `DocTypeViewPolicy`; server giữ `reasonRequiredOn` qua parser.
6. G03 Organization Security dùng generic `/app/Department` và `/permissions?tab=roles|approvals`; package không còn phụ thuộc `/organization` hoặc `/security/*`.
7. Regression tests khóa canonical source compiler, external Link fail-closed, view-policy round-trip, internal surface và generic G03 navigation.

### Lỗi CI cuối đã xử lý

- General CI trước fix đỏ ở client demo selfcheck vì metadata legacy có `surface=internal` nhưng chưa có canonical ownership fields vẫn cần giữ required field `company`.
- Fix `73305ec68318dcc194fda271a191997f7aed76e7` phân biệt canonical internal bằng ownership/enforcement metadata. Legacy safety và canonical hard boundary đều được giữ.
- Sau fix và rebase latest main, full exact-head gate 6/6 PASS.

## Main và production boundary

- Default branch: `main`.
- Main executable head sau PR #164: `9a1e8e9f9fbbe88e49ac0775683411aea771b69b`.
- Alumdoor production vẫn chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Production full release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta `2.1.0`: 74 DocTypes, 969 fields, 255 Links, 27 child tables, 12 reports, 3 report-backed charts, 6 external DocTypes.
- PR #164 không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.
- G03 Organization Security có trên main nhưng chưa có production release evidence; không gộp G03 deploy vào stock lifecycle QA.

## NEXT

1. **P0:** authenticated stock lifecycle: nhập kho → xuất kho → chuyển kho → kiểm kho trên desktop + mobile, đối chiếu ledger/qty/kg/QR và cleanup QA theo lineage.
2. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
3. **P2:** warranty/defects/capacity theo quy trình 25.7.
4. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
