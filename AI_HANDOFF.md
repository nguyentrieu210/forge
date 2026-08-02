# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này → `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

## Active checkpoint — Website/CMS multi-tenant v1

- Canonical delivery branch: `feat/tenant-website-builder-final-20260802`, clean-transplant từ exact `main@4960de3443300245fcce3f69914826306a297266`.
- PR `#219` / `feat/tenant-website-builder` là implementation iteration trước; PR `#218` là bootstrap scaffold đã đóng superseded. Final delivery phải dùng clean branch để tránh stale/conflicting history.
- `website@1.0.0` là first-party installable app/capability với `Website Settings`, `Web Page`, `Web Page Block`, roles và versioned template/theme fixtures.
- Shared runtime thử public website trước AuthBoundary chỉ trên `/` hoặc một safe single slug; exact 404 fallback về Forge runtime cũ. Explicit runtime modes `?app=`, `?alumdoor=1`, `?landing=1` và reserved routes phải luôn giữ nguyên.

### Architecture invariants — Website/CMS

1. **Website app không phải Core customization.** Engine dùng chung nằm trong Forge; website cụ thể của khách là tenant data/config, không có per-customer source fork hoặc `if tenant === ...`.
2. **Một shared frontend/runtime.** Không build/deploy frontend riêng cho từng tenant. Public renderer đọc tenant metadata đã resolve.
3. **Public API là allowlist riêng.** Chỉ exact `forge.website.manifest` và `forge.website.page` GET được vào unauthenticated boundary. Không cấp Guest generic `/api/resource/Web Page` hoặc `get_list`.
4. **Tenant isolation là server authority.** Resolver nhận trusted `tenant_id` từ tenant context và mọi query `documents`/`master_records` bind tenant đó; client hostname/menu không phải security boundary.
5. **Publish fail closed.** `Website Settings.enabled && published` bắt buộc; tenant `Web Page` chỉ public khi `published=1`. Draft/unpublished và record nội bộ không được leak qua public shape.
6. **Structured blocks only.** V1 allowlist `hero`, `text`, `features`, `image-gallery`, `project-gallery`, `product-grid`, `cta`, `contact`; URL/asset/color/font/radius/density đều validate. Không arbitrary HTML/CSS/JS.
7. **Storefront là commerce authority.** `product-grid` gọi `forge.storefront.catalog`; Website không tính giá, tạo order hoặc ghi Sales/Stock/GL trực tiếp.
8. **Preset identity immutable.** Template/theme fixture lưu `${preset_id}@${version}`; `Website Settings` pin `template_preset + template_version` và `theme_preset + theme_version`. Thêm v2 trong app upgrade không được overwrite hoặc silently đổi tenant đang pin v1.
9. **Preset resolution + override.** V1 dùng versioned preset làm base metadata và tenant `Web Page` records overlay theo slug. Không cần materialize hàng chục page records để website xuất hiện. Nếu sau này cần UX “tách mẫu thành bản sao”, action materialization phải idempotent và explicit.
10. **Asset reuse existing file path.** Public shape chỉ nhận safe `/files/...` hoặc HTTPS asset; R2/file lifecycle vẫn qua Forge file capability, không tạo storage engine cạnh tranh trong Website.
11. **App install/upgrade != production deploy.** Không deploy Cloudflare, DNS/custom-domain automation hoặc production migration nếu user chưa cấp quyền riêng.

### Verification focus

- Contract test phải parse app source và xác nhận Website Settings/version fields, child block table, safe block set và versioned preset fixture names.
- Resolver regression phải cover tenant A/B isolation, draft hidden, unsafe javascript URL removed, unsupported block fail closed và preset version pinning v1 khi v2 cùng tồn tại.
- Frontend validation phải bảo đảm Website bootstrap không chiếm existing runtime/query modes và renderer build/lint/typecheck được.
- CI evidence chỉ hợp lệ cho exact final head; bất kỳ code/test/docs commit mới nào phải re-check workflow tương ứng trước khi mark ready.

### Ngoài scope v1

- Custom domain/DNS provisioning lifecycle.
- Edge published snapshot + cache invalidation.
- Free-form drag/drop builder.
- Payment checkout.
- Richer template/block library + CRM/public form integration.
- Optional explicit `apply template` materialization nếu product UX thực sự cần tenant-owned copies của mọi preset page.

## Merged checkpoint — Warehouse Petty Cash per warehouse

- Canonical PR `#214` đã squash-merge vào `main` tại `da37060f3c02a6a5f9701d60edc3284575f00deb`.
- Final validated head `5255dae609a7a4c30ab25ffc397f81422c2c69fc` đạt **6/6 required workflows PASS**:
  - CI `30747511668`;
  - UI Pull Request Validation `30747511724`;
  - PR Validation `30747511689`;
  - Purchase `30747511672`;
  - Sales `30747511686`;
  - Inventory/Manufacturing `30747511661`.
- PR `#210` là stale iteration và đã đóng superseded; không reopen/merge.
- Prior CI failure không phải Daily Ledger, SQL cash guard hay GL logic. Root cause là app-source Link contract: `Purchase Receipt` và `Stock Entry` chưa được khai báo trong `vn-accounting/app.json.externalDocTypes`.

### Architecture invariants — Warehouse Cash

1. **GL là source of truth.** `Warehouse Cash Voucher` và `Warehouse Cash Transfer` là chứng từ kế toán first-class post trực tiếp balanced immutable `gl_entries`. Không tạo shadow `Payment Entry`, `Journal Entry` hoặc cash ledger cạnh tranh.
2. **Cash Count không tự thay đổi tiền.** `Warehouse Cash Count` snapshot system balance và counted balance; variance phải có lý do, correction tiền đi qua adjustment voucher riêng liên kết confirmed count.
3. **Projection không phải ledger.** `Warehouse Cash Balance` và `Warehouse Cash Daily Usage` nằm trong `master_records` chỉ là materialized projection rebuildable từ GL, cập nhật cùng SQLite/D1 transaction để có O(1) check và tránh race.
4. **DB trigger là race-safe authority.** Migration `0038_warehouse_cash.sql` guard tenant/fund availability, account, currency, warehouse, negative balance, max balance, daily outgoing limit, reversal usage; mapping fund không đổi sau history, non-zero fund không disable và fund có history không delete.
5. **Server giữ approval boundary.** Submit/cancel yêu cầu authorized manager/accounting role; creator không tự duyệt chứng từ của mình; accounting period lock áp dụng cho posting/cancel.
6. **Transfer không ăn hạn mức chi phí.** Inter-fund transfer thay đổi balance hai quỹ nhưng không tính vào direct-outgoing daily petty-cash expense limit.
7. **Cancel reverse đúng revision.** Controller đọc exact original GL revision rồi `reverseGl`; không tái tính bút toán từ payload hiện tại.
8. **Tenant isolation bắt buộc.** Fund/document/master projection/reference lookup đều dùng `tenant_id`; DB projection key cũng gồm tenant.
9. **AR/AP chưa tự settle.** Party dimension trên counter GL line không đồng nghĩa payment allocation. Nếu yêu cầu quỹ kho tất toán Purchase/Sales Invoice thì phải tích hợp canonical payment ledger riêng, không vá bằng GL-only flag.
10. **App-source Link trap.** Link target không thuộc package và không nằm trong `PLATFORM_EXTERNAL_DOCTYPES` phải khai rõ `externalDocTypes`; Warehouse Cash cần explicit `Purchase Receipt` + `Stock Entry` với `app: "erpnext"`, `kind: "transaction"`.

### Verification notes

- Warehouse Cash controller tests: 7/7 PASS trong unit run.
- SQL migration acceptance cover balance/daily usage, negative/max/daily limit, account/warehouse/currency mismatch, reversal, transfer, tenant isolation, immutable mapping/history và disable guard.
- Diagnostic workflow từng được thêm tạm để lấy CI traceback do connector không trả log, sau đó đã restore workflow gốc trước merge; không được reintroduce diagnostic artifact vào source.
- Migration `0038_warehouse_cash.sql` không collision với `main` tại thời điểm merge.
- Merge và production deploy là hai quyền riêng biệt; Warehouse Cash đã merge nhưng chưa deploy production trong đợt này.

## Checkpoint — Bulk Transaction v1 Purchase Receipt

- Canonical PR `#209` merged tại `e447eca0e020da161dcee4f0b865206921718a61`.
- Final validated head `70f266d9ecbc8c01c69b3deb125d1f4dc172a46a` đạt **6/6 required workflows PASS**:
  - CI `30742437972`;
  - UI Pull Request Validation `30742437975`;
  - PR Validation `30742437970`;
  - Purchase `30742437971`;
  - Sales `30742437999`;
  - Inventory/Manufacturing `30742437973`.
- PR `#203` và `#205` là superseded history; không reopen/merge.

### Architecture invariants

1. **Generic Bulk View không phải transaction writer.** `resolveBulkRenderPolicy()` vẫn master-only `document_update`; transaction/submittable/ledger fail closed.
2. **Bulk Transaction là controller-backed AppAction.** UI grid chỉ thu input/preview; backend controller giữ validation/business rule/permission boundary.
3. **Không direct-write ledger.** Bulk action chỉ tạo một Purchase Receipt nháp. Stock/accounting mutation chỉ xảy ra qua canonical Purchase Receipt submit flow.
4. **Canonical FIFO reuse.** Bulk controller gọi chính single-line `handlePurchaseFifoRequest(..., create=false)` cho planning, không duy trì thuật toán FIFO thứ hai.
5. **Rows trong cùng payload phải thấy allocation trước đó.** Synthetic submitted Purchase Receipt chỉ tồn tại in-memory trong planning để row sau không ăn lại debt của row trước.
6. **Callback prefix không phải contract nghiệp vụ.** Synthetic interceptor canonical hóa pathname theo suffix `/resource/...`; không giả định callback URL bắt đầu bằng `/api`.
7. **Idempotency/duplicate prevention.** `supplier_invoice_no` bắt buộc; fingerprint SHA-256 trên normalized supplier/warehouse/delivery note/driver/lines. Exact retry trả receipt cũ; cùng delivery note nhưng payload khác fail closed.
8. **Document integrity.** Tối đa 100 input rows; allocations phải cùng company/currency trước khi tạo một draft.
9. **Tenant/auth boundary.** Platform/tenant call required; authenticated desktop/mobile evidence dùng cookie + CSRF thật.

### UI/meta contract

- Action `nhap-nhom-hang-loat`, Alumdoor source version `2.2.0`.
- AppAction grid dùng compatibility transport `BulkTransaction:<json>` trong `Text.options`.
- `ActionScreen` render add/delete rows, existing controls, rectangular Excel/Sheets paste, required-cell validation và stale-preview invalidation.
- Sidecar `alumdoor-v2.actions.json` được merge vào brief trước canonical schema/compiler/manifest parser; đây là transport, không phải nguồn contract cạnh tranh.
- Follow-up nên tạo first-class typed AppAction input-table schema/compiler/parser/selfcheck rồi migrate khỏi compatibility string.

### Acceptance trap đã khóa

Authenticated browser QA bắt được bug mà unit test cũ không thấy: local callback có internal prefix khiến exact pathname matcher không inject synthetic receipt, nên row 2 ăn lại PO cũ. Fix dùng resource suffix matching và thêm regression callback-prefix. Không được quay lại exact `/api/resource/...` matching.

## Remaining Bulk Transaction

- Stock Reconciliation controller-backed grid.
- BOM parent + child/version grid.
- First-class AppAction input-table transport.
- Batch Print / QR label queue.

## Release boundary

- Merge code không đồng nghĩa deploy production.
- Không deploy Cloudflare/production, đổi DNS/secrets hoặc mutate customer data nếu user chưa yêu cầu rõ cho đúng đợt.
- Không commit `.env`, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated evidence không được quản lý.
