# MetaForge — Field Ledger: 43 fieldtype Frappe → Control kit (PHA 3)

> Fieldtype **grep-verify** trên 16.28.0: **43 authorable** (DocField picker `docfield.json`) + **Long Int** (runtime-only trong `frappe.model.data_fieldtypes`, KHÔNG có trong picker) = **44 dòng bảng, 43 tạo được từ builder**. Field Renderer dispatch theo `fieldtype`; PHA 5 code đúng dòng, muốn khác phải sửa ledger. Category từ `frappe/model/__init__.py` (numeric_fieldtypes, table_fields, no_value_fields).
>
> Cột: **Fieldtype · Loại · Control kit · Value (JSON gửi/nhận) · Zod base · `options` nghĩa gì · Hành vi đặc thù** (đọc-only/format/depends). Hành vi động chung (depends_on/read_only_depends_on/mandatory_depends_on/permlevel-mask/allow_on_submit) áp cho MỌI value-field — không lặp từng dòng (xem M11 §3.3 + appendix §D/§E).

## A. Layout / no-value (không có giá trị — chỉ bố cục)
| Fieldtype | Control | `options` | Hành vi |
|---|---|---|---|
| Section Break | `FormSection` | label | gập/mở theo `collapsible`/`collapsible_depends_on`; ẩn cả section nếu `depends_on` false |
| Column Break | `FormColumn` | — | chia lưới `sm:grid-cols-2` |
| Tab Break | `FormTab` | — | tab; giữ state mọi tab |
| Heading | `FieldHeading` | text | tiêu đề nhóm |
| HTML | `RawHtml` | html | render HTML tĩnh (sanitize) |
| Button | `FieldButton` | label | chạy client-script action (executor) |
| Fold | `FormFold` | — | (legacy) gập phần còn lại của form |

## B. Data / văn bản (value = string)
| Fieldtype | Control | Value | Zod base | `options` | Hành vi |
|---|---|---|---|---|---|
| Data | `TextInput` (biến thể theo options) | string | `z.string()` | Email/Phone/URL/Name/Barcode… (subtype) | subtype đổi validate/inputmode; Phone→bấm gọi/Zalo; URL→mở link |
| Autocomplete | `AutocompleteInput` | string | `z.string()` | danh sách gợi ý (newline) | cho **free text** + gợi ý; KHÁC Select (Select đóng) |
| Small Text | `Textarea` (rows nhỏ) | string | `z.string()` | — | 1 dòng nhập nhiều |
| Text | `Textarea` | string | `z.string()` | — | nhiều dòng |
| Long Text | `Textarea` (lớn) | string | `z.string()` | — | văn bản dài |
| Text Editor | `RichTextEditor` (TipTap, lazy) | string(HTML) | `z.string()` | — | WYSIWYG; nút AI "Viết giúp" |
| HTML Editor | `CodeEditor`(html, lazy) | string(HTML) | `z.string()` | — | sửa HTML thô |
| Markdown Editor | `MarkdownEditor` (lazy) | string(md) | `z.string()` | — | markdown + preview |
| Code | `CodeEditor` (monaco, lazy) | string | `z.string()` | ngôn ngữ (Python/JS/JSON…) | syntax theo options |
| JSON | `JsonEditor` (lazy) | string(JSON) | `z.string()` (parse hợp lệ) | — | validate JSON |
| Password | `PasswordInput` | string | `z.string()` | — | masked; không hiện lại giá trị cũ |
| Read Only | `ReadonlyText` | string | — | — | hiển thị, không sửa (value do fetch/set) |
| Phone | `PhoneInput` | string | `z.string()` (vnPhone tuỳ site) | — | bấm gọi/Zalo (Tiện VN) |
| Color | `ColorPicker` | string(#hex) | `z.string()` | — | — |
| Icon | `IconPicker` | string(tên icon) | `z.string()` | — | chọn icon Frappe/lucide |
| Barcode | `BarcodeControl` | string | `z.string()` | — | hiện mã + sinh + quét (súng=bàn phím focus; camera QR/1D lazy) |
| Rating | `StarRating` | number(0–1 hoặc /5) | `z.number()` | — | Frappe lưu 0–1; hiển thị sao |
| Duration | `DurationInput` | number(giây) | `z.number().int()` | cấu hình show_days/seconds | nhập d:h:m:s → giây |
| Geolocation | `MapPicker` (lazy) | string(GeoJSON) | `z.string()` | — | vẽ điểm/vùng trên map |

## C. Numeric (numeric_fieldtypes)
| Fieldtype | Control | Value | Zod base | Hành vi |
|---|---|---|---|---|
| Int | `NumberInput` | number(int) | `z.number().int()` | ↑↓ ±1, Shift ±10 |
| Long Int | `NumberInput` | number/bigint | `z.number().int()` | số lớn — **runtime-only** (`data_fieldtypes`), KHÔNG xuất hiện trong DocType Builder picker |
| Float | `NumberInput` | number | `z.number()` | precision theo meta |
| Currency | `MoneyInput` | number | `z.number()` | phân cách khi gõ; precision + `currency` field; canh phải tabular |
| Percent | `PercentInput` | number | `z.number()` | hậu tố % |
| Check | `Checkbox` | 0/1 | `z.union([z.literal(0),z.literal(1)])` | boolean ↔ 0/1 |

## D. Date & time
| Fieldtype | Control | Value | Zod base | Hành vi |
|---|---|---|---|---|
| Date | `DatePicker` | string(YYYY-MM-DD) | `z.string()` | hiển thị dd/MM/yyyy; chip Hôm nay/Hôm qua |
| Datetime | `DateTimePicker` | string(YYYY-MM-DD HH:mm:ss) | `z.string()` | tz theo System Settings (§I) |
| Time | `TimePicker` | string(HH:mm:ss) | `z.string()` | — |

## E. Selection / Link (nghiệp vụ Danh mục — master-data)
| Fieldtype | Control | Value | Zod base | `options` | Hành vi |
|---|---|---|---|---|---|
| Select | `SelectEnum` (Segmented ≤5 / dropdown) | string | `z.string()` | danh sách giá trị (newline) — **enum đóng** | không +Thêm mới (giá trị cố định trong meta) |
| Link | `LinkField` (ERPNext combobox) | string(name) | `z.string()` | **DocType đích** | `search_link`; `+Thêm mới` mở form gốc nested; `fetch_from` khi đổi |
| Dynamic Link | `DynamicLinkField` | string(name) | `z.string()` | **fieldname** chứa tên DocType đích | doctype đích lấy từ field khác → rồi search_link |
| Table | `ChildGrid` (M12) | array(child rows) | `z.array(...)` | **child DocType** (`istable=1`) | grid inline; row = form con |
| Table MultiSelect | `TableMultiSelectControl` | array(child rows có 1 Link) | `z.array(...)` | **child DocType** phục vụ tập chọn | chip multi-select Link + dedupe (KHÔNG grid đầy đủ) |

## F. Media / Attach (attachment_fieldtypes)
| Fieldtype | Control | Value | Zod base | `options` | Hành vi |
|---|---|---|---|---|---|
| Attach | `FileUpload` | string(file URL) | `z.string()` | — | `upload_file`; private/public; key vào doc |
| Attach Image | `ImageUpload` | string(file URL) | `z.string()` | — | chụp/kéo/paste; nén client ≤1600px; preview |
| Image | `ImageDisplay` | (không value riêng) | — | **fieldname** chứa Attach Image | chỉ hiển thị ảnh từ field khác |
| Signature | `SignaturePad` | string(data URL/attach) | `z.string()` | — | canvas ký; bất biến sau chốt; in lên phiếu |

---

## Nguyên tắc dịch ledger → code (PHA 5)
1. `Field Renderer` = `switch(fieldtype)` → mount đúng Control ở bảng trên (không tự chế).
2. Value type ở cột "Value" = kiểu JSON gửi/nhận qua FrappeAdapter (khớp Frappe).
3. Zod schema của form = build từ DocField: base ở cột "Zod" + `reqd`/`mandatory_depends_on` → `.min(1)`/optional; server (Frappe) là chốt.
4. `options` diễn giải đúng cột "options nghĩa gì" theo fieldtype — **cùng field `options` mang nghĩa khác nhau** (Select=list, Link=DocType, Dynamic Link=fieldname, Code=ngôn ngữ, Image=fieldname).
5. Hành vi động (depends_on/read_only_depends_on/mandatory_depends_on/permlevel-mask/allow_on_submit/docstatus) áp đồng loạt mọi value-field theo M11 §3.3 + appendix §E.
6. no-value fieldtype (mục A) không vào payload document; chỉ dựng layout.

## Cổng 3 — Field Ledger scorecard (tự chấm)
| # | Tiêu chí | Đạt? |
|---|---|---|
| 1 | **43 fieldtype authorable** (DocField picker `docfield.json` 16.28) + **Long Int** = fieldtype runtime của `frappe.model.data_fieldtypes` (KHÔNG có trong picker) = **44 dòng bảng, 43 tạo được từ builder** — mỗi loại 1 control | ✅ |
| 2 | `options` diễn giải đúng theo từng fieldtype (đa nghĩa) | ✅ |
| 3 | Layout vs value-field tách rõ (no-value không vào payload) | ✅ |
| 4 | Table vs Table MultiSelect control riêng (M7) | ✅ |
| 5 | Lib nặng (rich/monaco/map/qr) lazy-load | ✅ |
