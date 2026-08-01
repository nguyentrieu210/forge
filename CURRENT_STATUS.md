# CURRENT STATUS

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho branch head, PR, CI và release evidence.

## DONE — MetaForge Form Renderer canonical policy — 10/10

- PR `#176` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `acf53e12b3e59f21dde35ad6f27cc014fb624c00`.
- Merge commit: `a7643cee0102aee1c37d4f00afac1594d0261e68`.
- Re-audit canonical Form Renderer: **10/10** cho metadata composition boundary, permission/workflow safety, quick/full consistency và regression gate.
- Final exact-head CI: **6/6 PASS**.
  - CI `30717282793`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30717282801`: frontend lint/build + MetaForge workspace browser QA + Alumdoor browser QA PASS.
  - PR Validation `30717282798`: PASS.
  - Sales Feature CI `30717282809`: PASS.
  - Purchase Feature CI `30717282807`: PASS.
  - Inventory and Manufacturing CI `30717282796`: PASS.

### Form policy đã chốt

1. `resolveFormRenderPolicy()` là composition point dùng chung cho existing Form, Full New Form và Quick New Form.
2. `viewPolicy.form/quickEntry.enabled=false` là quyết định runtime thật; Quick Form không tự rơi về Full Form trong dialog.
3. `viewPolicy.*.fields` được thực thi như whitelist canonical của renderer.
4. Canonical `surface=internal` luôn bị loại ở lớp cuối, kể cả field required/title; meta gốc vẫn giữ nguyên để default/serialization/server dùng.
5. `FormProfile` tiếp tục là compatibility/app overlay trước canonical policy, nên metadata legacy không bị phá.
6. Selfcheck khóa explicit form/quick fields, disabled renderer, internal leakage và legacy compatibility.
7. Mô tả package đã bỏ tuyên bố layout “copy 1:1”; MetaForge tương thích hành vi Frappe/ERPNext nhưng giữ responsive form layout riêng.
8. Không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.

## DONE — Physical stock catch-weight reconciliation

- PR `#173` đã merge vào `main` ngày 2026-08-02.
- Final validated PR head: `99e198b39998a96d21e35c11ae0bdb5bfa4633fb`.
- Merge commit: `25df9d32217703b9c6c3f965f318b779fe028333`.
- Final exact-head CI: **6/6 PASS**.
  - CI `30716396423`: tests PASS, typecheck PASS, build PASS.
  - UI Pull Request Validation `30716396394`: PASS; authenticated cookie+CSRF catch-weight stock lifecycle PASS.
  - PR Validation `30716396428`: PASS.
  - Sales Feature CI `30716396392`: PASS.
  - Purchase Feature CI `30716396405`: PASS.
  - Inventory and Manufacturing CI `30716396389`: PASS.

### Catch-weight evidence đã khóa

1. `D1PhysicalStockLedgerReader` đọc `actual_weight_micros` từ append-only stock ledger và giữ `NULL` khác `0`.
2. Physical-stock lineage, balance và totals cùng reconcile `quantity_micros`, `weight_micros`, value và physical-count.
3. Nếu có quantity movement không có bằng chứng cân, aggregate `weight_micros` trả `null`; hệ thống không cộng phần biết được rồi giả đó là tổng kg đầy đủ.
4. Zero-quantity valuation movement không làm mất weight balance đã biết; quantity/weight trái dấu bị từ chối fail-closed.
5. Physical-stock CSV export có `weight_micros` và vẫn giữ scope/formula-safety hiện có.
6. Authenticated local D1 QA dùng role nghiệp vụ thật với item catch-weight riêng: nhập `10 / 65.7 kg` → xuất `2 / 13.14 kg` → chuyển `3 / 19.71 kg` → kiểm kê kho đích còn `2 / 13.14 kg`; qty + kg + lineage được đối chiếu sau từng bước.
7. `Thủ kho` submit receipt/issue, `Chủ xưởng` submit transfer + reconciliation, `Sản xuất` submit Stock Entry vẫn nhận `403`.
8. Không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.

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
- Main executable head sau PR #176: `a7643cee0102aee1c37d4f00afac1594d0261e68`.
- Alumdoor production vẫn chạy exact SHA `b46d322831ebe7b57e29d4363d2daa005bb56e55`.
- Production full release run `30707135053`: PASS.
- Protected Alumdoor Meta installer run `30707517624`: PASS.
- Production Alumdoor Meta vẫn là `2.1.0`: 74 DocTypes, 969 fields, 255 Links, 27 child tables, 12 reports, 3 report-backed charts, 6 external DocTypes.
- PR #176 không deploy Cloudflare, không sửa production secrets/DNS và không mutate tenant production.
- G03 Organization Security có trên main nhưng chưa có production release evidence; không gộp G03 deploy vào stock acceptance QA.

## NEXT

1. **P0:** hoàn tất stock acceptance còn thiếu: giữ chỗ/nhả giữ chỗ, QR/lineage end-to-end và cleanup QA không residue.
2. **P1:** daily detailed ledger: snapshot ngày, freeze, append-only adjustment, reconciliation nhiều miền.
3. **P2:** warranty/defects/capacity theo quy trình 25.7.
4. **P3:** end-to-end acceptance xuyên Sales → Production → Inventory → Delivery → Finance → Daily Ledger → Warranty.

## Guardrails

- Không thay branch head khi exact-head CI đang queued/in-progress.
- Không deploy Cloudflare hoặc sửa production secret/DNS nếu user chưa yêu cầu rõ.
- Không commit `.env`, `server/work/`, `tmp/`, backup, cookie, token hoặc generated evidence.
- Mỗi epic một branch/PR; merge chỉ sau exact-head required checks PASS.
