# Business Flows — MetaForge (kịch bản per-actor + nhánh lỗi)

> 10 luồng lõi F0–F9 (guide §3). Actor = role Frappe. "Hệ thống" = MetaForge FE + Frappe server (chốt).

## F0 — Login & Boot
| Bước | Ai | Làm gì (màn+component) | Hệ thống làm gì (API + side effect) | Ai thấy gì tiếp theo |
|---|---|---|---|---|
| 1 | User | M01 `/login` → nhập email+mật khẩu → Đăng nhập | `POST /api/method/login`; Frappe verify + set cookie `sid` | redirect `/app` |
| 2 | Engine | — | nạp **boot** (get_logged_user, roles, workspaces, DocType có quyền) qua FrappeAdapter | M00 Shell dựng sidebar theo role |
| 3 | User | bấm avatar → Đăng xuất | `POST /api/method/logout`; clear cookie | về `/login` |

**Nhánh lỗi:** B1 sai mật khẩu → Frappe 401 "Email hoặc mật khẩu không đúng" (+ rate-limit/lockout của Frappe hiển thị). B2 boot lỗi → trang lỗi "Không tải được không gian làm việc" + Thử lại. Hết phiên giữa chừng → `/login?reason=expired` + toast vàng TRƯỚC redirect.

## F1 — Mở List bất kỳ DocType
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | User | Shell → chọn DocType (sidebar/Awesomebar) → M04 | `getdoctype` (meta cột `in_list_view`, filter, quyền) | bảng skeleton |
| 2 | Engine | — | `get_list` (fields, filters, order_by [saved→sort_field→**creation desc** v16], limit) + `get_count` | bảng dữ liệu (server scope theo User Permission) |
| 3 | User | bấm 1 dòng | route `/app/<dt>/<name>` | bảng co trái + M11 giữa + ngữ cảnh phải (3 cột) |

**Nhánh lỗi:** không `read` DocType → 403 "Bạn không có quyền xem dữ liệu này". Lọc không ra → empty "Không có kết quả" + xoá lọc. Mạng lỗi → error khối + Thử lại.

## F2 — Mở/Tạo/Lưu document (hành vi động 1:1) ⭐
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | User | M11 `/app/<dt>/new` | `getdoctype` (fields+perms+`__js`+`masked_fields`) → dựng MetaForm (RHF+Zod) theo section/tab/column | form trống + default (Today/user/naming preview) |
| 2 | Engine | — | eval `depends_on` ẩn/hiện; `mandatory_depends_on`/`read_only_depends_on` realtime; chạy Client Script `refresh` (executor) | field đúng trạng thái |
| 3 | User | chọn Link field (vd Customer) | combobox tìm (server `search_link`); nếu thiếu → `+Thêm mới` mở form gốc nested → lưu → chọn sẵn + focus field kế | Link đã chọn; `fetch_from` điền các ô liên quan (ô chưa dirty) |
| 4 | User | nhập child rows (M12) | grid inline; mỗi dòng `fetch_from`; tổng realtime | tổng cập nhật |
| 5 | User | bấm Lưu (Ctrl+S) | Client Script `validate`/`before_save` → `POST /api/resource/<dt>` (`db.createDoc`); Frappe naming cấp số thật + validate/controller server | toast "Đã tạo <name>" + panel bước-tiếp (Submit/In/Tạo tiếp) |

**Nhánh lỗi:** B5 thiếu field bắt buộc → inline đỏ + scroll/focus field đầu + đếm ở nút (không toast từng lỗi). Server 417 `TimestampMismatchError` (sửa) → "Bản ghi vừa được <ai> sửa lúc <giờ> — xem khác biệt / tải lại" (không ghi đè). Client Script lỗi runtime → bắt trong executor, cảnh báo nhỏ, form vẫn dùng được. `depends_on` sai cú pháp → coi như luôn hiện (không ẩn nhầm) + log.

## F3 — Chạy Client Script
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | Engine | mở form/list | lấy `__js`+`__custom_js` từ getdoctype bundle | — |
| 2 | Engine | — | **compatibility executor** (`new Function`, code tin cậy cùng site) đăng ký handlers `frappe.ui.form.on(dt, {...})` map vào lifecycle MetaForm (`refresh`/`validate`/`<field>`/`<child>_add`/`before_save`) | hành vi custom chạy y Desk |
| 3 | User | đổi field có handler | executor gọi handler (set_df_property/set_value/add_fetch/msgprint…) qua proxy `frm` | UI cập nhật theo script |

**Nhánh lỗi:** script throw → catch, log, cảnh báo "Client script <name> lỗi", KHÔNG vỡ form. Script gọi API ngoài whitelist → chặn ở proxy (contract), không phải ranh giới bảo mật (server vẫn chốt mọi ghi). ⚠️ Executor KHÔNG phải security sandbox — chỉ chạy script do System Manager/Developer cài.

## F4 — Workflow transition
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | Engine | mở M11/M06 | đọc Workflow(dt) + state hiện tại (`workflow_state`) | WorkflowActionBar hiện nút transition đúng `Allowed` role tại state |
| 2 | User (role) | bấm action (vd "Approve") hoặc kéo cột (M06) | nếu bước LÙI/HỦY → dialog chip lý do bắt buộc; **orchestration `metaforge.api.workflow_action_with_comment`** (`apply_workflow` + `add_comment` trong 1 DB txn — appendix §R) | state đổi + badge + timeline ghi mốc + lý do |

**Nhánh lỗi:** role không trong `Allowed` → nút không hiện + server từ chối nếu gọi thẳng. Huỷ dialog chip → thẻ/không đổi state. Condition transition sai → "Không đủ điều kiện chuyển sang <state>".

## F5 — Render theo permission
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | Engine | tải meta+doc | `getdoctype` trả `masked_fields`; `getdoc` áp `apply_fieldlevel_read_permissions()` mask GIÁ TRỊ theo permlevel; `docinfo.permissions` | engine biết field nào đọc/sửa/mask được |
| 2 | Engine | dựng UI | phân biệt 6 trạng thái field (schema/hiển thị/đọc-giá-trị/sửa/mask/khóa); ẩn nút thao tác không có quyền | user chỉ thấy đúng phần được phép |

**Nhánh lỗi (test PHA 6) — đúng hình dạng:** (a) `GET /api/resource/<dt>?fields=["<field-permlevel-cao>"]`/`get_value` → **giá trị bị omit/mask**; (b) `getdoc`/`get_docinfo` → field cao bị loại + `docinfo.permissions` báo không write; (c) **PUT ghi field cao → server reject 403**. KHÔNG đòi field biến mất khỏi metadata — đòi giá trị bị mask + ghi bị chặn. **Server Frappe là ranh giới cuối.**

## F6 — In (Print Format)
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | User | M11 → "In" | mở M13 `/print/<dt>/<name>` | preview Print Format |
| 2 | User | chọn format/khổ → In | `printview.get_html` render Jinja + Letter Head; `window.print()` (QR+số+tiền bằng chữ) | hộp thoại in |

**Nhánh lỗi:** không `print` → 403. Jinja lỗi → "Mẫu in lỗi — chọn mẫu khác". Không có Print Format → dùng Standard tự sinh từ meta.

## F7 — Data Import
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | System Manager | M14 → chọn DocType → tải template | `download_template` | file mẫu |
| 2 | ~ | upload → map cột (AI gợi ý) → preview | `get_preview_from_template` validate toàn bộ; đánh dấu ô lỗi | "X hợp lệ / Y lỗi" + chế độ trùng |
| 3 | ~ | Import | **`form_start_import(data_import)`** (client-callable → enqueue job; `start_import` là hàm job NỘI BỘ, KHÔNG gọi trực tiếp) → poll `get_import_status` | progress; **partial success**: "Đã nhập X, lỗi Y" + `download_errored_template` + audit |

**Nhánh lỗi:** cột bắt buộc chưa map → chặn Next đỏ. Dòng lỗi → **partial success** (ghi OK/lỗi theo TỪNG DÒNG, KHÔNG rollback toàn batch) + `download_errored_template` kèm lý do. Không `import` → 403.

## F8 — Submit / Cancel / Amend
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | User (role submit) | M11 doc draft → Submit | `frappe.client.submit` docstatus 0→1; field khoá trừ `allow_on_submit` | badge Submitted; nút Cancel/Amend/Print |
| 2 | User (role cancel) | Cancel (+ confirm/lý do) | docstatus 1→2; kiểm link integrity | badge Cancelled |
| 3 | User | Amend | tạo doc mới `amended_from` prefill | form mới draft |

**Nhánh lỗi:** không role submit → "Bạn không có quyền ghi sổ" (403). Cancel khi có chứng từ liên kết đã ghi sổ → "Không huỷ được: còn N liên kết". Doc submitted không sửa/xoá (nút ẩn theo docstatus).

## F9 — Customize (Custom Field / Property Setter)
| Bước | Ai | Làm gì | Hệ thống | Ai thấy gì tiếp |
|---|---|---|---|---|
| 1 | System Manager | M17 Customize Form → chọn DocType chuẩn | load meta + overlay hiện tại | canvas + property panel |
| 2 | ~ | thêm Custom Field / đổi property (label/reqd/hidden/options/depends_on) | ghi **Custom Field**/**Property Setter** (overlay, KHÔNG sửa DocType gốc) | — |
| 3 | ~ | Lưu | clear cache meta → mọi renderer thấy thay đổi | toast "Đã lưu" |

**Nhánh lỗi:** sửa field chuẩn ngoài phạm vi cho phép → "Chỉ được đổi property, không đổi field chuẩn". Migrate lỗi → không lưu nửa vời.
