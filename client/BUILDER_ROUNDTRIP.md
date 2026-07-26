# BUILDER_ROUNDTRIP — canonical DocType Builder (Gate 6)

> Nguyên tắc: Builder KHÔNG sinh metadata riêng của MetaForge. Nó là **trình chỉnh sửa có kiểm soát** trên chính canonical DocTypeMeta tương thích Frappe. Runtime, preview, serializer đi CHUNG một đường dữ liệu.

## Model dùng chung
- Builder model = **`DocTypeMeta`** (canonical, như runtime). Thao tác pure: `blankDocType/addField/removeField/moveField/updateField` (`builder/doctype/meta-build.ts`).
- Draft + history: `BuilderKernel` (`kernel.ts`) — present/past/future, undo/redo, immutable.
- **Preview = runtime `FormView`** (không renderer riêng) — thấy đúng như app thật.

## Baseline ↔ Draft (`builder/doctype/validate.ts`)
```
serverMeta ──openDraft──▶ { baseline: normalizeMeta(canonical, bất biến), draft: clone } ──user sửa──▶ draft'
```
- `reloadDraft(serverMeta)` — nạp lại: baseline mới + reset draft.
- `draftStatus(session)` → `{ diff, validation, canApply }`.

## Diff tất định (`builder/doctype/diff.ts`) — 6.1
`diffMeta(baseline, draft)` so theo `fieldname` (không theo vị trí), output sắp xếp ổn định:
- `added` / `removed` / `changed` (per-prop `{from,to}`) / `reordered` (+ `moves`) / `doc` (title_field/is_submittable/autoname…) / **`permissions`** (xem dưới).
- **Bỏ qua** khoá tính toán (`_compat`), thứ tự (`idx`), và **plumbing child-row Frappe** (doctype/parent/parentfield/parenttype/name/creation/modified/owner) ⇒ semantic-equality bền qua round-trip.
- So sánh giá trị coi **`undefined`/`null`/`0` tương đương** (KHÔNG áp cho giá trị khác) — 1 rule/field
  draft tự construct thường CHỈ set property nào đã chạm tới, còn server reload LUÔN trả đủ property
  tường minh; nếu so strict, "chưa set" (draft) ≠ "0 tường minh" (server) sẽ báo changed SAI dù ngữ
  nghĩa giống hệt (phát hiện LIVE qua round-trip permission, xem dưới).
- `metaEqual(a,b)` = diff rỗng (dùng cho round-trip test). `hasChanges(diff)` gate nút Apply.

### `diffPermissions` — P2-BUILDER-01 (review độc lập, đã sửa)
Trước đây `diffMeta` **bỏ qua `permissions` hoàn toàn** — 1 thay đổi CHỈ-permission (không đụng field/
doc prop nào) báo `hasChanges=false` (nút Apply không bật) và `metaEqual=true` (round-trip coi 2 meta
khác quyền là "giống hệt"). `diffPermissions(baseline, draft)` mới, khoá bằng **`(role, permlevel,
if_owner)`** — Frappe cho phép NHIỀU hàng CÙNG role+permlevel chỉ khác `if_owner` (vd 1 role có cả hàng
"không phải owner: read-only" + hàng "là owner: full write"), nên `(role, permlevel)` KHÔNG đủ để định
danh duy nhất. Trả `{added, removed, changed}` — `changed` so MỌI ptype (read/write/create/delete/
submit/cancel/amend/report/export/print/email/share/select/mask/import/impersonate) qua cùng logic
`diffProps` với field. `metaEqual`/`hasChanges` nay GỒM `permissions`.

## Validate TRƯỚC apply (fail-closed) — 6.2
`validateDraft(meta)` → `{ ok, issues }`:
- `normalizeMeta` (cấu trúc, ném → error) · fieldname pattern `/^[a-z][a-z0-9_]*$/` · **không trùng** · **không đụng field hệ thống** (SYSTEM_FIELDS) · options bắt buộc (Link/Table/Table MultiSelect) · title_field phải tồn tại & non-layout. Select rỗng = warning.
- **Còn error ⇒ KHÔNG apply** (DocTypeBuilder disable nút Lưu + đếm lỗi).

## Apply contract (`builder/doctype/apply.ts`) — 6.3
`serializeDocTypeForSave(session)` → payload lưu DocType:
- child table `fields`: strip computed (`_compat`) · gắn `idx` theo thứ tự · envelope `doctype:DocField/parentfield:fields/parenttype:DocType/parent`.
- child table **`permissions`** (P2-BUILDER-01, mới): CANONICAL HOÁ GIỐNG `fields` — trước đây gửi RAW
  `draft.permissions`, thiếu `idx`/envelope (`doctype:DocPerm/parentfield:permissions/parenttype:
  DocType/parent`) nếu rule mới do Builder tạo không tự có sẵn các key này.
- doc-level props (bỏ computed/masked_fields).
- **`modified` của baseline** = OCC token ⇒ server bắt `TimestampMismatch` (**417**) = conflict/version detection (cùng cơ chế OCC như form).
- `roundTripLocal(session)` = `normalizeMeta(serialize(draft))` — bất biến PURE: serialize không mất/méo ngữ nghĩa (`metaEqual` với draft, qua add/reorder).

## Round-trip LIVE (6.4) — DocType dùng-một-lần
`server → normalizeMeta → draft → serialize/apply → reload → normalizeMeta → metaEqual`, verify THẬT trên `metaforge.localhost` (custom DocType, xoá sau):
- tạo (custom=1) → fetch → openDraft → sửa (đảo thứ tự + thêm field) → serialize → **save 200** → reload → **field mới còn, thứ tự giữ**, `diff removed=∅ reordered=false` → **conflict với `modified` stale → HTTP 417** → cleanup. **PASS** (`apps/demo/roundtrip-live.mjs`, TEST_REPORT §C2).
- KHÔNG đụng dữ liệu sản xuất.

## Round-trip permission LIVE (P2-BUILDER-01) — DocType dùng-một-lần
`apps/demo/permissions-roundtrip-live.mjs` — verify THẬT trên `metaforge.localhost` (custom DocType,
xoá sau): thêm 1 rule + đổi 1 rule → `diffMeta.permissions` đúng TRƯỚC apply (added/changed) →
`hasChanges`/`metaEqual` đúng (true/false, KHÔNG bị bỏ qua như trước fix) → `serializeDocTypeForSave`
gắn idx+envelope cho permissions → **apply 200** → **reload khớp** (`diffPermissions(draft, reload)`
rỗng) → xoá 1 rule → apply → reload xác nhận **mất ĐÚNG rule đó, không đụng rule khác** → cleanup.
**PASS** (17/17 assert, xem TEST_REPORT.md Phase 6b).

Phát hiện live giữa chừng: rule DocPerm MỚI Frappe lưu mặc định `report/export/print/email/share=1`
(không phải 0 như phần lớn ptype khác — vd `submit/cancel/amend/import/impersonate` mới default 0).
Sửa DỮ LIỆU test fixture cho khớp default thật của Frappe, KHÔNG sửa `diffPermissions` để tự đoán
default riêng từng ptype (sai lớp trách nhiệm — đó là hành vi của Frappe, không phải của diff logic).

## Bất biến
1. Builder chỉ SỬA canonical Frappe — không schema riêng MetaForge.
2. Preview/serializer/runtime cùng một model.
3. Validate fail-closed trước apply; conflict detection qua OCC `modified`.
4. Semantic-equality = `metaEqual` (bỏ plumbing) — GỒM permissions, không chỉ fields/doc prop.

## Serializer #1 — Customize STANDARD DocType ✅ (live)
`planCustomization(docType, diff, draftFieldOrder)` (`builder/doctype/customize.ts`) — map diff của
STANDARD DocType → thao tác Frappe KHÔNG sửa schema gốc:
- `added` → **Custom Field** (dt/fieldname/fieldtype/label/options/insert_after theo thứ tự draft).
- `changed` field prop → **Property Setter** (DocField; property_type suy: Check/Int/Text/Data).
- `changed` doc prop → **Property Setter** (DocType, field_name null).
- `removed` custom field → delete; **field CHUẨN → warning** (không xoá được, dùng hidden).
- reorder field chuẩn → warning (insert_after chỉ cho Custom Field).

**LIVE round-trip PASS** (`apps/demo/customize-live.mjs`, standard ToDo): baseline effective meta →
draft (thêm custom field + đổi label) → plan → insert Custom Field 200 + Property Setter 200 → reload
→ **custom field xuất hiện + label override áp dụng** → cleanup xoá CF/PS → **revert OK** (label về gốc).
KHÔNG đụng schema gốc (TEST_REPORT §C4).

## Serializer #2 Workflow ✅ (live) · #3 Print ✅ (live) · #4 Dashboard (pure)
- **#2 Workflow** (`workflow/serialize.ts`): `serializeWorkflow(model,{defaultEditRole})` → Frappe Workflow doc (child Workflow Document State `doc_status`=chuỗi + `allow_edit`; Workflow Transition state→action→next_state+role) · `validateWorkflow` (state unique, transition trỏ state tồn tại + action + role) · **`workflowMasters`** (Workflow State/Action Master phải insert TRƯỚC — Frappe Link). **LIVE round-trip PASS** (TEST_REPORT §C5).
- **#3 Print** (`print/serialize.ts`): `serializePrintFormat` → Print Format (Jinja html từ block visible; label/fieldname **HTML-escaped**, không inject) · `validatePrintFormat`. **LIVE round-trip PASS**.
- **#4 Dashboard** (`dashboard/serialize.ts`): `serializeDashboard` → Number Card + Dashboard Chart + Dashboard link (multi-doc, adapter riêng) · `validateDashboard`. Pure + test; **live hoãn** (Dashboard Chart cần cấu hình nguồn đầy đủ).

Nguyên tắc: mỗi loại tách **adapter riêng** (Workflow/Print/Dashboard), KHÔNG nhồi chung serializer DocType. UI diff-preview panel = follow-up.

**Debt ghi rõ**: `planCustomization` (Serializer #1, Standard DocType) CHƯA xử lý `diff.permissions` —
chỉ field/doc prop qua Custom Field/Property Setter. Permission cho Standard DocType cần cơ chế RIÊNG
(Custom DocPerm insert/update/delete, khác đường `frappe.client.save` trực tiếp mà `diffPermissions`/
round-trip live ở trên dùng cho DocType tự viết/custom) — ngoài phạm vi P2-BUILDER-01.
