# AI HANDOFF

Ngày cập nhật: **2026-08-02**.

Đây là handoff kỹ thuật cô đọng. Quy tắc vận hành nằm ở `RUNBOOK.md`; live status ở `CURRENT_STATUS.md`; hàng đợi ở `NEXT_TASKS.md`; delivery gate ở `DELIVERY_POLICY.md`.

## Bắt buộc trước khi làm

- Repository: `nguyentrieu210/forge`.
- GitHub là nguồn sự thật cho exact `main`, branch, PR, CI, merge và release evidence.
- Đọc `RUNBOOK.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → file này → `DELIVERY_POLICY.md`.
- Mọi SHA/branch dưới đây là checkpoint lịch sử; phải xác minh GitHub trước khi dùng.

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
