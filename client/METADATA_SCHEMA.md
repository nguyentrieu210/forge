# METADATA_SCHEMA — canonical model MetaForge

> Nguồn: `@metaforge/core` types + `meta/normalize.ts` + `meta/resolver.ts` + `meta/serialize.ts`.

MetaForge KHÔNG có schema riêng. Model là **canonical DocTypeMeta** tương thích Frappe (từ `getdoctype`). Cùng model dùng cho runtime render, Builder edit, và app factory — một đường dữ liệu.

## Kiểu lõi (`core/types/meta.ts`)
```ts
DocField  { fieldname; fieldtype; label?; options?; reqd?; read_only?; hidden?;
            default?; depends_on?; mandatory_depends_on?; read_only_depends_on?;
            fetch_from?; permlevel?; in_list_view?; precision?; link_filters?; [k]:unknown }  // giữ extension
DocPerm   { role; permlevel; read?/write?/create?/delete?/submit?/cancel?/amend?; if_owner?; [ptype]:unknown }
DocTypeMeta { name; module?; issingle?; istable?; is_submittable?; is_tree?; autoname?;
              title_field?; image_field?; fields: DocField[]; permissions: DocPerm[]; masked_fields?; …RuntimeAssets }
```
`[k]: unknown` index-signature ⇒ Frappe đổi/thêm khoá KHÔNG mất dữ liệu (passthrough).

## Pipeline
```
getdoctype(raw) ──normalizeMeta──▶ canonical DocTypeMeta ──resolveMeta──▶ ResolvedField[] (runtime state)
                                          │
                              serializeCreate/UpdatePatch ──▶ payload ghi (Frappe)
```

### 1) normalizeMeta (`meta/normalize.ts`) — P0-08
- **Validate shape**: thiếu `name`/`fields` không phải mảng / field thiếu `fieldname`|`fieldtype` → ném `MetaValidationError` (KHÔNG cast mù).
- **Giữ nguyên** mọi prop; `permissions` = mảng hoặc `[]`.
- **Tag `_compat`** mỗi field = `fieldTypeStatus(ft)`:
  - `SUPPORTED` — control đầy đủ.
  - `PARTIAL` — có control nhưng chưa đủ ngữ nghĩa Frappe: Dynamic Link · Code · JSON · HTML/Markdown/Text Editor · Geolocation · Fold · **Duration** · **Rating** (hạ cấp về số/text — KHÔNG tuyên bố supported giả).
  - `READ_ONLY` — Read Only.
  - `UNSUPPORTED_VISIBLE` — fieldtype lạ → diagnostic, không âm thầm render như Data.
- Chi tiết: FIELD_TYPE_COMPATIBILITY.md.

### 2) resolveMeta / resolveField (`meta/resolver.ts`) — mirror Frappe Desk
Tính trạng thái RUNTIME mỗi field từ meta + doc + roles:
- `visible` = `!hidden && evalDependsOn(depends_on)` (rỗng ⇒ true).
- `masked` = `masked_fields (server AUTHORITATIVE)` HOẶC permlevel không đọc được.
- `readOnly` = `read_only | read_only_depends_on | docstatus-lock | thiếu quyền ghi permlevel | forceReadOnly`.
- `required` = `(reqd | mandatory_depends_on)` CHỈ khi `visible && !readOnly` (Frappe không ép field ẩn/khoá).
- `state` = hidden | masked | locked | editable.
- `evalDependsOn` chạy qua **safe-eval** (allowlist, KHÔNG new Function — SECURITY_MODEL). Hỗ trợ số âm/unary minus.
- Child table: `ctx.assumeWritable` (quyền ghi kế thừa doctype cha vì DocType con `permissions` rỗng) — vẫn tôn trọng read_only/depends_on/docstatus/masked (review fix H1).

### 3) Serialize ghi (`meta/serialize.ts`) — P0-03
- `serializeCreateDocument(meta, values)` — TẠO: gửi TOÀN BỘ authorable doc (default ⊕ nhập), loại SYSTEM_FIELDS (name/owner/creation/modified/docstatus/parent…) + field layout (NO_VALUE). Tránh mất default/required chưa chạm.
- `serializeUpdatePatch(meta, name, modified, changed)` — SỬA: chỉ field đổi + `name` + `modified` (OCC → 417). Không ghi đè field không đổi.
- *Debt (KNOWN_GAPS)*: create-full-doc gửi `workflow_state` → 500 trên doctype có workflow; sửa = loại field permlevel-không-ghi/workflow_state khỏi payload create.

## Liên kết & phụ thuộc
- `buildLinkFilters(field, docValues)` (`meta/link-query.ts`) — Link filters từ `field.link_filters` (Frappe) + resolve `eval:` ngữ cảnh qua safe-eval; sai → bỏ (fail-safe, warn-once).
- `collectFetchFrom(meta)` / `parseFetchFrom` (`meta/fetch-from.ts`) — `fetch_from = "link.source"` → auto-fill khi Link đổi.
