# M11 — Form View (renderer generic) ⭐ MÀN CHÍNH RUNTIME

> Render 1:1 form của MỌI DocType từ meta. Đây là nơi "metadata-driven" sống hoặc chết — mọi hành vi động của Frappe Desk phải tái hiện đúng. Đối chiếu: `frappe/public/js/frappe/form`.

## Khối 1 — Định danh
- **Tên**: Form View — **route**: `/app/<doctype>/<name>` (xem/sửa), `/app/<doctype>/new` (tạo), `/app/<doctype>/<name>?workflow=...`
- **Role vào**: user có `read` DocType (xem); `write` (sửa); `create` (tạo). permlevel/if_owner/User Permission do Frappe lọc — engine phản chiếu.
- **Contract áp dụng**: `form-workflow-contract.md` (toàn bộ) + `screen-catalog-contract.md` (Detail 3 cột + Lịch sử & vòng đời) + `media-capture-contract.md` (Attach/Signature/Barcode/Geolocation) + `field-ledger.md` (ánh xạ 43 authorable + Long Int runtime → control).
- **Nguồn meta**: `getdoctype(doctype)` — Form metadata bundle: fields + permissions + links + **`__js`/`__custom_js`/`__list_js`/`__custom_list_js`** (client behavior assets) + **`masked_fields`**; `getdoc(doctype,name)` — giá trị đã áp **`apply_fieldlevel_read_permissions()`** + docinfo; `get_docinfo` — timeline/comment/version/assign/attachments + `docinfo.permissions`.

## Khối 2 — Layout

**Desktop (≥768px) — 3 cột (list–detail–context):**
- **Cột trái (~300px)**: nếu vào từ List (M04) → danh sách bản ghi cùng DocType (co lại, giữ cột chính + tìm/lọc), điều hướng ↑↓ chuyển record giữ mạch (queue mode). Nếu vào trực tiếp (deep-link) → ẩn, form chiếm 2 cột.
- **Cột giữa (form body)**: Header (title theo `title_field`, badge **docstatus**/`workflow_state`, mã/naming, nút Save combo) → **Tabs** (nếu có `Tab Break`) → mỗi tab: **Section** (Section Break, gập/mở theo `collapsible`/`collapsible_depends_on`) → **Column** (Column Break chia lưới) → **field control** theo fieldtype. Field ẩn/hiện realtime theo `depends_on`; readonly theo `read_only`/`read_only_depends_on`/docstatus/permlevel.
- **Cột phải (~320px, ngữ cảnh & hành động)**: **Workflow action bar** (nút transition đúng role tại state hiện tại) → **Nút bước tiếp theo** theo docstatus/state → **Assignments** (ToDo) + **Attachments** + **Tags** + **Shared** + **Connections/Links** (dashboard liên kết: "1 Sales Invoice, 2 Payment…") → **Timeline/Lịch sử** (gộp: đổi workflow-state + comment + Version field-level + communication) mới nhất trên cùng → **panel AI ngữ cảnh** ("Tóm tắt bản ghi", "Điền từ ảnh/tệp").
- Responsive 1024–1279px: cột phải thu thành drawer bật từ cạnh.

**Mobile (<768px) — full-screen stack:**
- Form full-screen `inset-0`, header sticky (title + docstatus badge + đóng), footer sticky (Save + ⋯ menu: Submit/Print/Assign…). Tabs → thanh tab cuộn ngang hoặc accordion. Section gập/mở. Field 1 cột (`grid-cols-1`). Input `font-size ≥16px`. Timeline + workflow + connections → tab/sheet riêng "Ngữ cảnh" (không nhồi vào form). Link field `+Thêm mới` mở nested full-screen. Bàn phím không che input đang gõ (`scrollIntoView`).

### Khối 2b — Khai nghiệp vụ bắt buộc CHO MÀN NÀY
| # | Mục | Khai |
|---|---|---|
| 7 | Kanban/Pipeline | Không áp dụng ở màn Form (Kanban là M06) — nhưng đổi `workflow_state` qua nút ở đây tuân luật chip lý do khi là bước lùi/hủy (comment lý do bắt buộc) |
| 8 | Tích hợp AI | **Áp dụng** — panel phải: "Tóm tắt bản ghi này" (đọc doc theo quyền), "Điền từ ảnh/tệp" (OCR→prefill nháp ✨) cho field Attach/Data; "Viết giúp" ở Text Editor/Small Text. Bảng màn×AI: xem cuối card |
| 18 | Lịch sử & vòng đời | **Áp dụng** — Timeline cột phải: gộp workflow-state changes + comment + **Version (before→after field-level)** + assignment + communication; 1 component `MetaTimeline` chuẩn tái dùng. Empty: "Chưa có lịch sử" |
| 2 | Thùng rác/soft-delete | **Áp dụng** — Delete gọi Frappe (`DELETE /api/resource`), Frappe chặn nếu có link/submitted; document `submitted`(docstatus 1)/`cancelled`(2) không sửa/không xoá — nút ẩn theo docstatus |
| 4 | Báo cáo/thống kê | Không áp dụng — Form là 1 bản ghi (báo cáo ở M05/M10/M15) |
| 5+12 | Thông báo & nhắc đa kênh | **Áp dụng (một phần)** — action "Email"/"Assign" bắn Notification Log (Frappe); Frappe `Notification` (email/Zalo) tự chạy nếu site cấu hình — engine không tự gửi |
| 6 | Mã vạch | **Áp dụng có điều kiện** — nếu DocType có fieldtype `Barcode`: render mã + nút sinh + quét (súng=bàn phím focus ô; camera QR/1D lazy-load) |
| 10 | Ảnh/chữ ký/QR/OCR | **Áp dụng** — fieldtype `Attach Image`/`Attach`/`Signature`/`Geolocation` render đúng control (upload R2/Frappe File, key vào doc); OCR "Điền từ ảnh/tệp"; ảnh gắn doc submitted = bất biến |
| 11 | In ấn | **Áp dụng** — nút "In" mở M13 (Print Format của doc này); route `/print/<dt>/<name>` |
| 13 | Mã sinh tự động | **Áp dụng** — field theo `autoname`/`naming_series`: hiện "mã dự kiến" (preview) khi tạo; số thật do Frappe cấp lúc lưu; `naming_series` là Select control |
| 14 | Calendar view | Không áp dụng ở Form (Calendar là M07) |
| 15 | Tiện VN | **Áp dụng** — field `Phone`/`Data(options=Phone)` bấm gọi/Zalo; `Data(options=URL)` mở link; tìm không dấu ở Link field; format ngày/tiền qua `shared/format.ts` |
| 19 | Danh mục (Link Field +Thêm mới) | **Áp dụng — cốt lõi** — mọi fieldtype `Link`/`Table MultiSelect`/`Dynamic Link` = combobox tìm được + `+Thêm mới` mở form gốc DocType đích (nested), prefill text, lưu xong chọn sẵn + focus field kế; nested nhiều lớp chạy được |

## Khối 3 — Bảng COMPONENT (đến từng control nhỏ nhất)

**3.1 Khung form**
| Component | Dữ liệu nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `MetaForm` (RHF + Zod sinh từ meta) | getdoctype.fields + getdoc | dựng field theo thứ tự `idx`; validate on-blur+on-submit; dirty-tracking từng field | render theo permission đã lọc | skeleton khớp cấu trúc section khi loading |
| `FormTabs` | field `Tab Break` | chuyển tab giữ dữ liệu mọi tab (RHF giữ state) | — | tab có lỗi → chấm đỏ |
| `FormSection` | `Section Break` (label, `collapsible`, `collapsible_depends_on`) | gập/mở; ẩn cả section nếu `depends_on` section false | — | mặc định mở nếu chứa field reqd |
| `FormColumn` | `Column Break` | chia `grid sm:grid-cols-2`; field `col-span-2` nếu long text/table | — | — |
| `NamingPreview` | `autoname`/`naming_series` | hiện "Mã dự kiến: SINV-2026-#####"; Select nếu naming_series prompt | readonly | — |
| `WorkflowActionBar` | Workflow + state hiện tại | nút transition đúng `Allowed` role; bấm → apply_workflow | chỉ role trong transition | ẩn nếu DocType không có workflow |
| `DocStatusBadge` | `docstatus` (0/1/2) | Draft/Submitted/Cancelled + màu | đọc: mọi role | — |
| `MetaTimeline` | get_docinfo (versions/comments/communications/assignments/workflow) | gộp theo thời gian, mới nhất trên; bấm mở nguồn | theo quyền đọc | empty state chuẩn |
| `FormSidebarContext` | docinfo (assignments/attachments/tags/shared/links) | Assign ToDo, đính kèm, tag, chia sẻ, connections đếm | theo `share`/`write` | — |
| `SaveButton` (combo) | dirty state | Lưu (`Ctrl+S`) + dropdown: Lưu & Tạo tiếp, Lưu & In, Lưu & Submit; nhớ lựa chọn theo user | `write`/`create` | disable+spinner khi đang lưu; chống bấm 2 lần |

**3.2 Control theo fieldtype (ánh xạ đầy đủ — chi tiết 9 cột ở PHA 3 Field Ledger)**
| Nhóm | Fieldtype | Control kit |
|---|---|---|
| Dữ liệu | Data (+options Email/Phone/URL/Name), Int, Float, Currency, Percent, Check, Password, Read Only, Rating, Duration, Color | Input/NumberInput(money có phân cách)/Checkbox/PasswordInput/`text` readonly/Rating/DurationInput/ColorPicker |
| Ngày giờ | Date, Datetime, Time | DatePicker/DateTimePicker/TimePicker (popover mobile) |
| Chọn/liên kết | Select · **Link** · **Dynamic Link** · **Table** · **Table MultiSelect** | Segmented(≤5)/`select-enum` · **LinkField** (ERPNext combobox +Thêm mới nested) · DynamicLinkField (chọn doctype+doc) · **Table → ChildGrid (M12)** · **Table MultiSelect → `TableMultiSelectControl`** (chip multi-select Link + dedupe; child DocType phục vụ TẬP CHỌN, KHÔNG phải grid đầy đủ) |
| Văn bản | Small Text, Long Text, Text, Text Editor, HTML Editor, Markdown Editor, Code, JSON | Textarea/RichText(TipTap)/HTMLEditor/Markdown/CodeEditor(monaco lazy)/JSONEditor |
| Tệp/media | Attach, Attach Image, Signature, Image, Geolocation, **Barcode** | FileUpload/ImageUpload(chụp+dán+kéo)/SignaturePad/ImageDisplay/MapPicker/BarcodeControl(sinh+quét) |
| Bố cục | Section Break, Column Break, Tab Break, Heading, Fold, Button, HTML | (xử ở khung 3.1) · Heading · nút chạy client-script action · render HTML |

Lib nặng (RichText/monaco/map/qr-scan) **lazy-load** (>100KB). Mỗi control: đọc value từ RHF, ghi lại on-change, tôn trọng read_only/hidden/reqd realtime.

**3.3 Hành vi động (client, 1:1 Desk)**
| Hành vi | Nguồn meta | Cách chạy |
|---|---|---|
| Ẩn/hiện field | `depends_on` (`eval:doc.x=='y'` hoặc `fieldname`) | parser biểu thức Frappe → eval theo doc hiện tại; re-eval mỗi khi field phụ thuộc đổi |
| Bắt buộc động | `mandatory_depends_on` | thêm/bỏ Zod required realtime + dấu `*` |
| Readonly động | `read_only_depends_on` | khoá control realtime (thứ CRM Vue bỏ — ta PHẢI có) |
| Autofill | `fetch_from` (`link_field.source_field`) + `fetch_if_empty` | khi Link đổi → `frappe.client.get_value` lấy field nguồn → set nếu ô chưa dirty |
| Client Script | client behavior assets `__js`+`__custom_js` từ getdoctype bundle (F3) | **compatibility executor** (`new Function`, code tin cậy cùng site — KHÔNG phải security sandbox) chạy `frappe.ui.form.on` handlers (`refresh`, `validate`, `before_save`, `<field>`, `<child>_add`…) map vào lifecycle MetaForm |

## Khối 4 — Bảng HÀNH ĐỘNG
| Thao tác | API Frappe | Validate | Thành công | Lỗi (tiếng Việt) |
|---|---|---|---|---|
| Lưu (tạo) | `POST /api/resource/<dt>` (`db.createDoc`) | Zod client (sinh từ meta) + mandatory + mandatory_depends_on | toast "Đã tạo <name>" + naming thật + panel bước-tiếp | field-level lỗi map về đúng field + scroll/focus; "Thiếu trường bắt buộc: X" |
| Lưu (sửa) | `PUT /api/resource/<dt>/<name>` (`db.updateDoc`) kèm `modified` | optimistic lock | toast "Đã lưu" + highlight | **`TimestampMismatchError`** (HTTP **417** ở v16, nhận qua `exc_type`/API v2 error type — KHÔNG hardcode 409) → "Bản ghi vừa được <ai> sửa lúc <giờ> — xem khác biệt / tải lại" (không ghi đè im lặng) |
| Lưu & Tạo tiếp | như tạo | — | giữ field lặp, mở form trống | — |
| Submit | `POST frappe.client.submit` (docstatus 0→1) | doc hợp lệ + role `submit` | badge Submitted, field khoá trừ `allow_on_submit` | "Bạn không có quyền ghi sổ" (403); lỗi validate server |
| Cancel | cancel API (1→2) | role `cancel` + confirm + lý do | badge Cancelled | "Không huỷ được: còn <n> chứng từ liên kết đã ghi sổ" |
| Amend | tạo bản mới `amended_from` | doc cancelled | mở form mới prefill | — |
| Xoá | `DELETE /api/resource/<dt>/<name>` | role `delete` + confirm | toast "Đã xoá" + về list (**KHÔNG undo hard delete**; `Deleted Document` nếu site bật) | "Không xoá được: đang liên kết ở <dt>" (link integrity của Frappe) |
| Workflow transition | `POST apply_workflow` | role trong `Allowed` + bước lùi/hủy bắt buộc chip lý do (comment) | state đổi + timeline ghi + audit | "Bạn không thể chuyển sang <state>" |
| Thêm comment | `frappe.desk.form.utils.add_comment` | có text | comment lên timeline ngay (optimistic) | — |
| Assign (ToDo) | `frappe.desk.form.assign_to.add` | chọn user | badge assign + notify | — |
| Đính kèm | `POST /api/method/upload_file` | mime/size, nén client | file vào sidebar + doc | "File quá lớn / sai định dạng" |
| In | mở M13 `/print/<dt>/<name>` | role `print` | tab print | — |
| Điền từ ảnh/tệp (AI) | endpoint OCR site (nếu có) | — | prefill nháp ✨ chờ duyệt | "Chưa cấu hình AI trên site" (không chặn) |

## Khối 5 — Bảng AUTOFILL
| Khi | Tự điền | Rule |
|---|---|---|
| Mở form tạo | field có `default` (kể cả `Today`, `user`, `:company`…) | set nếu ô trống; ngày mặc định hôm nay |
| Chọn Link field | các field có `fetch_from = <link>.<src>` | `get_value` lấy giá trị nguồn; chỉ điền ô **chưa dirty** (`fetch_if_empty` tôn trọng) |
| Naming | field mã | "mã dự kiến" từ naming_series; số thật lúc lưu |
| Session | owner/company/branch theo User Permission mặc định | Frappe default + boot |
| Lần trước theo user | Link hay chọn (vd kho mặc định) | nhớ localStorage per user+doctype |

Dirty-tracking: đổi Link sau khi đã autofill → ô chưa-chạm điền lại, ô đã-sửa giữ nguyên. Ô do fetch/AI điền đánh dấu ✨ tới khi user chạm. **fetch_from chạy client-side đúng hành vi Desk; giá trị đã fetch được GỬI KÈM document khi save; server tiếp tục validate/controller/business rules — KHÔNG mặc định coi server tự chạy lại mọi fetch_from.**

## Khối 6 — 7 trạng thái màn hình
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton theo cấu trúc section/tab (không spinner trơ); meta+doc song song |
| Empty | (form tạo) form trống với default; (không có bản ghi) 404 "Không tìm thấy <dt> <name>" + nút về list |
| Error | lỗi tải meta/doc → khối lỗi tiếng Việt + "Thử lại"; không lộ stack |
| Offline | banner offline; Save xếp hàng đợi (nếu bật offline), cảnh báo "sẽ gửi khi có mạng" |
| Thiếu quyền | không `read` doc → empty-state "Bạn không có quyền xem bản ghi này"; field permlevel cấm → server **mask/loại GIÁ TRỊ** (`apply_fieldlevel_read_permissions`) + `docinfo.permissions` báo không write → engine ẩn/khóa theo đó (field có thể vẫn còn trong schema — phân biệt 6 trạng thái field) |
| Dữ liệu dài | doc nhiều child rows → grid M12 virtualize; tab lazy-mount tab chưa xem |
| In-flight | nút Save spinner + "Đang lưu…"; toàn form disable; chống double-submit |

## Bảng màn × điểm AI (chứng minh nghiệp vụ 8)
| Vị trí | Điểm AI |
|---|---|
| Panel phải | "Tóm tắt bản ghi này" (đọc doc + connections theo quyền → 1 đoạn) |
| Field Attach/Attach Image/Data | "Điền từ ảnh/tệp" (OCR CCCD/hóa đơn/danh thiếp → prefill nháp ✨) |
| Text Editor / Small Text / Long Text | "Viết giúp" / "Tóm tắt lại" (nháp) |
| Link field | cảnh báo trùng khi tạo nhanh (SĐT/tên gần giống) — nếu DocType có field định danh |

## Nhánh lỗi trọng yếu
- Meta tải được nhưng doc bị người khác submit giữa chừng → reload hiện docstatus mới, khoá field, báo "Bản ghi đã được ghi sổ".
- Client Script lỗi runtime → **không làm vỡ form**: bắt lỗi trong executor, log, hiện cảnh báo nhỏ "Client script <name> lỗi", form vẫn dùng được. (Executor là lớp TƯƠNG THÍCH, không phải ranh giới bảo mật — chỉ chạy script tin cậy do quản trị site cài.)
- `depends_on` biểu thức sai cú pháp → coi như luôn hiện (không ẩn nhầm dữ liệu), log cảnh báo.
- Link field trỏ doc đã bị xoá/inactive → vẫn hiện giá trị đang chọn + cảnh báo, không cho chọn mới nếu rule cấm.

## Acceptance Criteria (theo appendix §N)
- [ ] Render 100% từ metadata (bật 1 DocType chưa từng thấy → đúng như Desk v16, KHÔNG hardcode)
- [ ] Desktop/mobile tách cây riêng; test 390/412/768/1280
- [ ] Keyboard shortcut của màn + `?` cheatsheet (mục áp dụng)
- [ ] Permission chốt ở **SERVER** (role thấp bypass UI → 403/mask, không chỉ ẩn nút)
- [ ] Loading skeleton khớp cấu trúc + empty 3 trạng thái + error tiếng Việt (không lộ stack/SQL)
- [ ] Optimistic + rollback (thao tác nhẹ); 417 conflict không ghi đè (màn nào có ghi)
- [ ] Lifecycle §D + State machine §E đúng (không tự chế state)
- [ ] Error Matrix §F map đủ; Cache §G; Perf §H đạt ngân sách của màn
- [ ] Test: unit(logic) + integration(API+quyền) + visual baseline 390/768/1280 (light+dark)
- [ ] Mục nghiệp vụ không áp dụng → ghi "N/A + lý do", không bỏ trống
