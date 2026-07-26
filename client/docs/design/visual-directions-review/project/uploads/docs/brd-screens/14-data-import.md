# M14 — Data Import (wizard, Frappe v16)

> Bọc Frappe **Data Import** (đã grep-verify VPS 222). **QUAN TRỌNG:** Frappe Data Import là **partial success** (log OK/lỗi theo dòng), KHÔNG rollback toàn batch; preview KHÔNG phải guarantee validate y hệt import (final validation vẫn chạy lúc import).

## Khối 1 — Định danh
- **Tên**: Data Import — **route**: `/app/data-import` (+ `/app/data-import/<name>`).
- **Role**: System Manager hoặc role có `import` DocType đích.
- **Contract**: `data-table-contract.md` (wizard 5 bước) + `screen-catalog-contract.md` Nhập liệu + appendix §R (import = partial, không atomic).
- **Nguồn (v16 verified)**: doctype `Data Import` + methods: `download_template(doctype, export_fields, file_type)` · `get_preview_from_template(data_import, import_file, google_sheets_url)` · `form_start_import(data_import)` (chạy background job) · `get_import_status(data_import_name)` (poll/realtime) · `download_errored_template(data_import_name)`.

## Khối 2 — Layout
**Desktop:** header + **lịch sử import** (từ list `Data Import`: ai/lúc nào/DocType/`import_type`/status/`payload_count`). Wizard 5 bước (thanh tiến trình, Quay lại, đóng giữa chừng confirm):
1. **Tạo Data Import doc**: chọn DocType đích + `import_type` (Insert New / Update Existing) → tải template (`download_template`, `.csv`/`.xlsx`, có sheet hướng dẫn).
2. **Upload** file đính vào Data Import doc (chọn sheet, xem dòng đầu).
3. **Map cột** (file ↔ DocField; tự khớp không dấu; AI gợi ý cột lạ + confidence; cột bắt buộc chưa map = đỏ chặn).
4. **Preview** (`get_preview_from_template`): hiện warning/lỗi từng dòng/ô Frappe trả về; đếm ước lượng OK/lỗi. **Ghi rõ đây là PREVIEW — validation cuối vẫn chạy khi import** (không hứa preview = import 1:1).
5. **Import** (`form_start_import` → background job) → **poll `get_import_status`** (queued/running/success/**partial success**/error) + progress; kết quả: **số dòng thành công / số dòng lỗi theo row** + **tải errored template** (`download_errored_template`) để sửa & nhập lại. **KHÔNG hứa rollback toàn batch.**

**Mobile:** wizard 1 cột full-screen từng bước; preview cuộn trong khối `overflow-x-auto` riêng.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 4 báo cáo | **Áp dụng** — import/update; đối xứng Xuất Excel (M04) |
| 8 AI | **Áp dụng** — AI map cột lạ (bước 3, confidence); OCR bảng kê nếu nguồn giấy |
| 2 soft-delete | **Áp dụng (một phần)** — `import_type=Update Existing` theo khóa `name`, có confirm |
| 13 mã | **Áp dụng** — dòng thiếu name → Frappe naming; có name → update/validate |
| 15 Tiện VN | **Áp dụng** — lỗi tiếng Việt; format ngày/số VN template |
| 19 Danh mục | **Áp dụng** — Link/Select validate theo danh mục đích ("ngoài danh mục") |
| 7/18/6/10/11/14/5/12 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `ImportHistory` | list `Data Import` | xem lại/tải file cũ, status | `import` | empty |
| `WizardStepper` | — | 1→5, Back, confirm đóng | — | — |
| `TemplateDownload` | `download_template` | tải template theo DocType + import_type | — | — |
| `FileUpload` | attach vào Data Import | .csv/.xlsx, chọn sheet | — | "File sai định dạng" |
| `ColumnMapper` (+AI) | meta fields | map + tự khớp + AI | — | cột bắt buộc chưa map = đỏ |
| `PreviewGrid` | `get_preview_from_template` | warning/lỗi từng dòng (Frappe trả) | — | tooltip lý do; nhãn "PREVIEW" |
| `ImportRunner` | `form_start_import` + poll `get_import_status` | job nền; progress; báo chuông khi xong | `import` | queued/running/partial/success/error |
| `ErroredTemplate` | `download_errored_template` | tải dòng lỗi để sửa | — | — |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tải template | `download_template(doctype, file_type)` | — | file mẫu | — |
| Preview | `get_preview_from_template(data_import, import_file)` | file hợp lệ | bảng warning/lỗi + đếm | "Đọc file lỗi" |
| Bắt đầu import | `form_start_import(data_import)` → job | map đủ cột bắt buộc | job chạy nền; poll status | validation cuối per-row |
| Poll status | `get_import_status(name)` | — | success / **partial success** / error | — |
| Tải file lỗi | `download_errored_template(name)` | có dòng lỗi | .xlsx dòng lỗi + lý do | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Map cột | tự khớp tên gần đúng (không dấu) + AI | nhớ map lần trước |
| Dòng thiếu name | Frappe naming (Insert New) | — |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton lịch sử/preview |
| Empty | chưa có Data Import → hướng dẫn bắt đầu |
| Error | file/map lỗi → chặn Next + lý do |
| Offline | banner; import cần mạng |
| Thiếu quyền | không `import` → chặn (403) |
| Dữ liệu dài | preview virtualize; import job progress |
| In-flight | job chạy: progress, rời trang vẫn chạy (poll), chuông báo xong |

## Acceptance Criteria (theo appendix §N)
- [ ] 5 bước wizard đúng chuỗi API v16; **partial success 1:1** (hiện dòng OK/lỗi + errored template), KHÔNG hứa rollback toàn batch
- [ ] Preview gắn nhãn "chưa phải import cuối"; server validate lại lúc import
- [ ] Poll `get_import_status` (không chặn UI); rời trang job vẫn chạy
- [ ] Permission `import` chốt ở server (role thấp bypass → 403)
- [ ] Responsive; loading/empty/error tiếng Việt; test unit(map) + integration(import job) + visual baseline
