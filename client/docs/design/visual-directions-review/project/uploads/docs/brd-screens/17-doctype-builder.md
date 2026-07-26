# M17 — DocType Builder ⭐ (Frappe v16) — MÀN CHÍNH AUTHORING

> Thiết kế DocType trực quan. **QUAN TRỌNG (review M6):** tách rõ **2 MODE** — *Schema Authoring* (sửa DocType thật, cần Developer/Administrator) vs *Customize Overlay* (Custom Field + Property Setter + Custom DocPerm, KHÔNG sửa JSON core). Lưu DocType = **schema sync** (add/alter cột), KHÔNG phải `bench migrate`.

## Khối 1 — Định danh
- **Tên**: DocType Builder — **route**: `/app/doctype-builder/<name>` (Schema Authoring) · `/app/customize-form?doctype=<dt>` (Customize Overlay).
- **Role**:
  - **Schema Authoring**: Administrator / System Manager + **Developer Mode** (DocType chuẩn của app chỉ sửa khi dev mode + `custom=0`); DocType `custom=1` do người dùng tạo thì System Manager sửa được.
  - **Customize Overlay**: System Manager (không cần dev mode) — chỉ ghi Custom Field/Property Setter/Custom DocPerm.
- **Contract**: `form-workflow-contract.md` + `field-ledger.md` + `brd-builder/00-builder-engine.md` (Sortable-Tree canvas).
- **Nguồn (v16)**: `DocType` (custom, module, autoname, naming_rule, is_submittable, istable, issingle, track_changes, title_field, image_field, search_fields) + child **`fields[]`=DocField** + child `permissions[]`=DocPerm. Customize: `Custom Field` + `Property Setter` + `Custom DocPerm`. Reload meta = `getdoctype` + clear cache.

## Khối 2 — Layout
**Desktop:** 3 vùng —
- **Trái (palette)**: 43 fieldtype authorable kéo được (Long Int là runtime-only, không có trong palette) + panel DocType settings (naming/submittable/istable/issingle/title_field/image_field/track_changes/search_fields).
- **Giữa (canvas Sortable-Tree)**: form preview Tab→Section→Column→Field; kéo field vào / sắp `idx` / tạo Section-Column-Tab Break; bấm field → panel phải.
- **Phải (property field)**: mọi thuộc tính DocField (fieldname, label, fieldtype, options, reqd, unique, read_only, hidden, default, depends_on, mandatory_depends_on, read_only_depends_on, fetch_from/fetch_if_empty, in_list_view, in_standard_filter, permlevel, precision, length, non_negative, allow_on_submit, bold, collapsible, columns…). Tab **Permissions** (nhúng M16). Tab **Naming**.
- **Banner mode**: rõ đang *Schema Authoring* hay *Customize Overlay* (Customize: chỉ property/Custom Field được phép, field chuẩn không đổi cấu trúc).

**Mobile:** xem + sửa property field cơ bản; kéo-thả canvas khuyến nghị desktop (builder-engine §13).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 1 Phân quyền | **Áp dụng** — tab Permissions ghi DocPerm (Schema) / Custom DocPerm (Overlay) |
| 3 Audit | **Áp dụng** — thay đổi DocType/Custom Field/Property Setter ghi Version |
| 19 Danh mục | **Áp dụng — cốt lõi** — tạo field Link = định nghĩa danh mục (chọn DocType đích) |
| 8 AI | **Áp dụng có điều kiện** — gợi ý fieldtype/label từ tên (nháp) |
| 15 Tiện VN | **Áp dụng** — nhãn/tooltip tiếng Việt; validate fieldname snake_case |
| 2/4/6/10/11/13/14/7/18/5/12 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `FieldtypePalette` | 43 fieldtype authorable | kéo vào canvas | Schema: Dev; Overlay: System Manager | — |
| `FormTreeCanvas` (dnd-kit) | DocField tree | kéo sắp idx/section/column/tab | theo mode | skeleton |
| `FieldPropertyPanel` | DocField | sửa thuộc tính; validate depends_on | theo mode | báo fieldname trùng/không hợp lệ |
| `DoctypeSettingsPanel` | DocType | naming/submittable/… | Schema: Dev cho DocType chuẩn | — |
| `PermissionsTab` | DocPerm / Custom DocPerm | nhúng M16 | System Manager | — |
| `ModeBanner` | `custom`/dev mode | Schema vs Customize; giới hạn thao tác | — | cảnh báo Overlay |
| `SaveSync` | — | lưu → **schema sync** (add/alter cột) + clear cache | theo mode | — |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tạo DocType (custom) | `POST /api/resource/DocType` | fieldname snake_case duy nhất; Link options DocType tồn tại; module | doc mới + **schema sync** | "fieldname trùng"; "Link options không tồn tại" |
| Sửa DocType (Schema) | **`PUT /api/resource/DocType/<name>`** | Dev mode nếu `custom=0` | lưu + schema sync + clear cache | "DocType chuẩn — cần Developer Mode" |
| Customize (Overlay) | Custom Field / Property Setter / Custom DocPerm (Customize Form save) | System Manager | overlay lưu, không đụng JSON core | "Chỉ được đổi property/Custom Field cho DocType chuẩn" |
| Đổi naming | DocType.autoname/naming_rule | hợp lệ | preview "mã kế tiếp" | "Naming series sai định dạng" |
| Xoá field | remove DocField/Custom Field | **impact analysis**: dữ liệu/index/unique đang dùng? | confirm mạnh | "Field có dữ liệu/đang index/unique — cân nhắc/di trú" |

> **Thuật ngữ đúng:** lưu DocType → Frappe chạy **schema sync** (`db_schema`/`sync`) add/alter cột; đây **KHÔNG** phải `bench migrate` (migrate = chạy patch + sync toàn site qua CLI).

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Nhập label | fieldname = slug snake_case của label | không đè nếu gõ tay |
| Chọn fieldtype Link | gợi ý options = DocType gần đúng | — |
| Type có precision/length | default hợp lý | — |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton canvas + palette |
| Empty | DocType mới → canvas trống + gợi ý kéo field đầu |
| Error | schema sync lỗi (fieldname trùng cột…) → báo rõ, không lưu nửa vời |
| Offline | banner; cần mạng |
| Thiếu quyền | Schema cần Dev/Administrator; Overlay cần System Manager; thiếu → chặn |
| Dữ liệu dài | DocType nhiều field → canvas cuộn + minimap tab |
| In-flight | Lưu: spinner "Đang đồng bộ schema…" |

## Acceptance Criteria (theo appendix §N)
- [ ] Tách rõ **Schema Authoring** (DocType/DocField, Dev/Administrator, custom vs standard) vs **Customize Overlay** (Custom Field/Property Setter/Custom DocPerm, không đụng core)
- [ ] Thuật ngữ **schema sync** (không "bench migrate"); API PUT **`/DocType/<name>`**
- [ ] Xoá field có **impact analysis** (dữ liệu/index/unique) + confirm mạnh
- [ ] Tạo Link field = định nghĩa danh mục đúng (chọn DocType đích)
- [ ] Permission theo mode chốt server; test unit(serialize tree) + e2e(dựng DocType→lưu→render ở M04/M11) + visual baseline
