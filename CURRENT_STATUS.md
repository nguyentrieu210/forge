# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

## REVIEW — MetaForge Form Renderer — 82/100

- Nhánh audit: `review/metaforge-form-render-audit-20260802`, base `main@2b10626bacb2f96487b24ec8ba4551ab49fa4eb0`.
- Báo cáo chi tiết: `docs/METAFORGE_FORM_RENDER_AUDIT_20260802.md`.
- Kết luận: runtime Form hiện mạnh ở permission fail-closed, workflow server-authoritative, conflict/dirty guard và selective reactivity, nhưng chưa thể coi canonical Meta-driven hoàn chỉnh.
- **High 1:** `NewFormContainer` dùng `applyFormSurface`, còn existing `FormContainer` truyền `useFormMeta` thẳng vào `FormView`; canonical `surface=internal` hard visibility boundary chưa được áp đồng nhất ở existing form.
- **High 2:** canonical compiler sinh `viewPolicy.form/quickEntry`, nhưng đường render được review hiện dùng `FormProfile + surface`; chưa có runtime enforcement rõ cho `viewPolicy.*.fields` và `enabled`.
- **Medium:** `layoutColumns()` flatten `Column Break`, nên renderer đang opinionated hơn tuyên bố copy hành vi Frappe/ERPNext Desk; cần chốt fidelity contract.
- **Medium:** `FormView` comment nói width ceiling `96rem` nhưng code là `max-w-[72rem]`.
- Audit chỉ thay docs; chưa sửa runtime, chưa deploy Cloudflare, chưa sửa production secrets/DNS, chưa mutate tenant production.

## DONE — Stock Entry operational submit RBAC

- PR `#170` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `33622c680bce5978d97d26be8f1216436da13817`.
- Merge commit: `9b51da20902ac67dc3b4df7ce6ee77b11f886007`.
- Final exact-head CI: **6/6 PASS**.
  - CI `30715672279`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30715672304`: PASS; authoritative Alumdoor `2.1.1` install PASS và authenticated cookie+CSRF stock lifecycle PASS.
  - PR Validation `30715672283`: PASS.
  - Sales Feature CI `30715672294`: PASS.
  - Purchase Feature CI `30715672278`: PASS.
  - Inventory and Manufacturing CI `30715672276`: PASS.

### RBAC đã chốt

1. `Thủ kho`: `rwcs` trên `Stock Entry` — được lập, sửa và post phiếu kho vận hành.
2. `Chủ xưởng`: `rwcs` — quyền quản lý/override vận hành.
3. `Sản xuất`: `rwc` — được chuẩn bị nháp nhưng không post sổ kho.
4. `Kế toán`: `r` — chỉ đọc.
5. Authenticated QA chứng minh `Thủ kho` submit Material Receipt + Material Issue, `Chủ xưởng` submit Material Transfer, còn `Sản xuất` tạo draft được nhưng submit nhận đúng `403` và draft vẫn `docstatus=0`.
6. Stock Reconciliation separation-of-duties của PR #167 vẫn PASS trong cùng auth suite.

### Permission source

- Thêm `server/briefs/alumdoor-v2.permissions.json`; Alumdoor metadata source tăng version từ `2.1.0` lên `2.1.1`.
- `readBriefSource` hỗ trợ sibling `<brief>.permissions.json` và thay **toàn bộ** permission map của DocType được nêu, không merge lẻ từng role để tránh giữ sót grant cũ.
- Loader có regression cho version merge, full role matrix, DocType không tồn tại và unsupported sidecar keys.
- Đây mới là source code/CI evidence; production Alumdoor vẫn ở metadata `2.1.0` vì đợt này không deploy.

## DONE — Authenticated stock lifecycle + mobile canonical contracts

- PR `#167` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `c03a97372359823e0f4609015e287b3d306a851e`.
- Merge commit: `ec80180632438680e872e5b4075f492cf1c0e8f7`.
- Final exact-head CI: **6/6 PASS**.
  - CI `30714523969`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30714523967`: PASS; MetaForge browser QA PASS, Alumdoor browser QA PASS, authenticated cookie+CSRF stock lifecycle PASS.
  - PR Validation `30714523968`: PASS.
  - Sales Feature CI `30714523958`: PASS.
  - Purchase Feature CI `30714523990`: PASS.
  - Inventory and Manufacturing CI `30714524000`: PASS.

### Evidence đã khóa

1. App kho điện thoại dịch payload Stock Entry/Stock Reconciliation legacy sang contract canonical tại Frappe adapter; backend/kernel vẫn strict.
2. Browser QA bấm thật Nhập/Xuất/Chuyển/Kiểm trên Pixel 7 và compact phone, đồng thời khóa payload canonical.
3. Sửa lỗi bottom navigation đè nút Lưu trên màn nghiệp vụ mobile.
4. Authenticated D1 QA dùng cookie + CSRF thật và dữ liệu local/ephemeral: nhập 10 → xuất 2 → chuyển 3; physical stock đối chiếu 10 → 8 → nguồn 5 / đích 3.
5. Kiểm kê đích từ 3 xuống 2: `Thủ kho` tạo phiếu và không được tự duyệt; `Chủ xưởng` duyệt thành công; physical stock về 2; phiếu đã ghi sổ bị từ chối khi huỷ.
6. Không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.

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

## Main và production boundary

- Default branch: `main`.
- Main executable head sau PR #170: `9b51da20902ac67dc3b4df7ce6ee77b11f886007`.
- Alumdoor production vẫn chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Production full release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta vẫn là `2.1.0`: 74 DocTypes, 969 fields, 255 Links, 27 child tables, 12 reports, 3 report-backed charts, 6 external DocTypes.
- PR #170 không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.
- G03 Organization Security có trên main nhưng chưa có production release evidence; không gộp G03 deploy vào stock acceptance QA.

## NEXT

1. **P0:** hoàn tất stock acceptance còn thiếu: kg thực cân, giữ chỗ/nhả giữ chỗ, QR/lineage và cleanup QA không residue.
2. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
3. **P2:** warranty/defects/capacity theo quy trình 25.7.
4. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
