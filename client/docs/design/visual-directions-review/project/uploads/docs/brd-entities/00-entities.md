# Entities — MetaForge

> **Đặc thù meta-engine:** hầu hết "thực thể" là **meta-DocType của Frappe** — MetaForge **TIÊU THỤ**, không định nghĩa/sở hữu. Field của chúng là của Frappe (đã liệt kê thuộc tính then chốt ở `BRD.md` mục 4, E01–E16). MetaForge chỉ **tự sở hữu** vài entity local dưới đây. Bảng §5 (kiểu D1/Zod) áp cho entity MetaForge sở hữu; entity Frappe consume dùng khuôn "trường then chốt đã đọc" (không tự định nghĩa lại).

## A. Entity MetaForge TỰ SỞ HỮU (§5 đầy đủ)

> Lưu ý: MetaForge chạy trên Frappe (không D1). "Kiểu" ghi theo nơi lưu: **localStorage** (client) hoặc **Frappe DocType** (nếu cần chia sẻ). Không tạo bảng D1.

### E-own-1 — `mf_user_prefs` (localStorage, per user+site) — KHÔNG lên server
| Field | Kiểu | Ràng buộc | Zod | UI | Ý nghĩa |
|---|---|---|---|---|---|
| `key` | string | `meta-forge:<doctype>:<userId>` | `z.string()` | — | khoá phân tầng (data-table-contract: URL=lọc, localStorage=sở thích) |
| `columns` | json | mảng {fieldname, width, visible, order} | `z.array(z.object({...}))` | ColumnPicker | độ rộng + tập cột hiển thị + thứ tự bảng M04/M05 |
| `density` | enum | `'compact'\|'comfortable'` | `z.enum([...])` | toggle | mật độ bảng |
| `theme` | enum | `'light'\|'dark'\|'system'` | `z.enum([...])` | ThemeProvider | dark mode 3 chế độ |
| `font_scale` | enum | `'sm'\|'md'\|'lg'` | `z.enum([...])` | Settings | cỡ chữ (polish/operator #58) |
| `default_view` | json | `{[doctype]: 'list'\|'report'\|'kanban'\|...}` | `z.record(...)` | ViewSwitcher | view mặc định theo DocType |
| `last_filters` | json | `{[doctype]: filters}` | `z.record(...)` | Filters | nhớ bộ lọc gần nhất (bổ trợ URL) |
| `recent_records` | json | mảng {doctype, name, title} tối đa 20 | `z.array(...)` | Awesomebar #15 | vừa xem gần đây |

### E-own-2 — `mf_form_draft` (localStorage, per user+form) — autosave
| Field | Kiểu | Ràng buộc | Zod | UI | Ý nghĩa |
|---|---|---|---|---|---|
| `key` | string | `meta-forge:draft:<doctype>:<name\|new>:<userId>` | `z.string()` | — | định danh bản nháp |
| `values` | json | giá trị form dirty | `z.record(z.unknown())` | MetaForm | autosave (polish §4); mở lại hỏi "Khôi phục bản nháp lúc HH:mm?" |
| `saved_at` | string | ISO | `z.string()` | — | thời điểm nháp |

### E-own-3 — `mf_saved_view` (TÙY CHỌN — nếu cần chia sẻ, dùng Frappe DocType hoặc `List View Settings` sẵn có)
| Field | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `name` | Frappe name | PK | tên saved view |
| `doctype` | Link→DocType | NOT NULL | áp cho DocType nào |
| `config` | JSON | cột/filter/group/sort | cấu hình view chia sẻ |
| `is_public` | Check | default 0 | chia sẻ cả team hay riêng |
| `owner` | Frappe owner | — | người tạo |

> Ưu tiên dùng **`List View Settings`** (Frappe có sẵn) trước khi tự tạo DocType — đúng luật "không tự chế thứ đã có".

## B. Entity Frappe CONSUME (trường then chốt — không tự định nghĩa lại)

Chi tiết ở `BRD.md` mục 4 (E01–E16). Tóm tắt để builder/dev đối chiếu:

| Entity | Trường then chốt MetaForge đọc/ghi | Ghi (builder) |
|---|---|---|
| DocType (E01) | module, autoname, naming_rule, is_submittable, istable, issingle, title_field, image_field, track_changes, search_fields, sort_field/order | M17 |
| DocField (E02) | 24 thuộc tính (xem mục 4) — nguồn của **Field Ledger 43 authorable + Long Int runtime = 44 dòng→control ở PHA 3** | M17 |
| DocPerm (E03) | role, permlevel, read/write/create/delete/submit/cancel/amend/report/export/import/share/print/email, if_owner | M16/M17 |
| Workflow +State +Transition (E05) | document_type, workflow_state_field, state/doc_status/allow_edit, transition state→action→next+allowed+condition | M18 |
| Client behavior (E06) | `__js`/`__custom_js`/`__list_js`/`__custom_list_js` (runtime bundle) | M17 (Client Script CRUD) |
| Print Format (E07) | doc_type, html/css/Jinja hoặc builder JSON, standard, format_data | M21 |
| Custom Field/Property Setter (E08) | overlay field/property lên DocType chuẩn | M17 Customize |
| Number Card/Dashboard Chart/Dashboard (E10) | function/aggregate/based_on/type/group_by/filters | M22 |
| Workspace (E11) | shortcuts/cards/charts/links theo module+role | M02 |
| Kanban Board (E12) | field_name (Select), columns, filters | M06 |
| Report (E13) | filters, columns, query/script | M15 |
| File (E15) | attach/image/signature → `upload_file`, key + metadata | M11 |
| Version/Comment/Activity/Notification Log (E16) | timeline field-level + comment + thông báo | M11/M19 |

## C. Field Ledger (PHA 3)
Bảng ánh xạ **43 fieldtype authorable + Long Int runtime = 44 dòng → control kit + hành vi 9 cột** (field-ledger.md) là artifact PHA 3 (`docs/technical/field-ledger.md`). BRD đã định hình ở M11 §3.2 (nhóm control) + mục 4 E02 (thuộc tính). PHA 3 mở rộng máy móc, không làm lại.
