# M21 — Print Format Builder (Frappe v16)

> Thiết kế Print Format đúng schema v16 (đã grep-verify). **QUAN TRỌNG:** `print_format_builder_beta` = **Check** (cờ chọn mode), KHÔNG phải JSON. Dữ liệu builder nằm ở **`format_data` (Code)**. Custom Format nằm ở **`html`/`css` (Code)**.

## Khối 1 — Định danh
- **Tên**: Print Format Builder — **route**: `/app/print-format-builder/<name>`.
- **Role**: System Manager.
- **Contract**: `print-contract.md` + `brd-builder/00-builder-engine.md` (Paper-Blocks canvas).
- **Nguồn (v16 verified)**: doctype `Print Format` — `doc_type`(Link), **`format_data`(Code = JSON builder data)**, **`html`(Code)**, **`css`(Code)**, **`custom_format`(Check)**, **`print_format_builder`(Check)**, **`print_format_builder_beta`(Check)**, `raw_printing`(Check), `standard`, `print_format_type`. + meta DocType nguồn (kéo field vào).

## Khối 2 — Layout
Ba mode (theo cờ `custom_format`/`print_format_builder_beta`):
- **WYSIWYG (builder)** — mặc định: kéo khối field/section/table-con/Text/Image/QR/Chữ ký/Letter Head/Ngắt trang trên canvas khổ A4/A5; ghi vào **`format_data`** (JSON). Không hứa chuyển 2 chiều lossless sang HTML.
- **Custom Format (code)**: `custom_format=1` → sửa **`html` + `css`** (Jinja) trong monaco (lazy); builder tắt.
- Nút chuyển mode có **cảnh báo**: bật Custom Format thì builder `format_data` không còn dùng; và ngược lại (không tự merge). Nút **Lưu**, **In thử** (M13 với bản ghi mẫu).

**Mobile:** xem + sửa property khối cơ bản; thiết kế khuyến nghị desktop (builder-engine §13).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 11 In ấn | **Áp dụng — cốt lõi** — thiết kế mẫu; A4/A5; QR + số + tiền bằng chữ + chữ ký |
| 10 media | **Áp dụng** — khối QR/chữ ký/Letter Head |
| 8 AI | **Áp dụng có điều kiện** — "AI dựng mẫu từ mô tả" (nháp `format_data`/html) |
| 3 Audit | **Áp dụng** — sửa Print Format ghi Version |
| 15 Tiện VN | **Áp dụng** — tiền-bằng-chữ tiếng Việt; ngày dd/MM |
| 2/4/6/13/14/7/18/5/12/19 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `FieldBlockPalette` | meta DocType nguồn | kéo field/section/table-con vào canvas | System Manager | — |
| `PrintCanvas` (WYSIWYG) | **`format_data`** JSON | kéo khối; sắp cột; khổ giấy | System Manager | preview dữ liệu mẫu |
| `BlockProperty` | khối | font/canh/độ rộng/điều kiện hiện | — | — |
| `CustomFormatEditor` (monaco lazy) | **`html`+`css`** | Jinja + CSS; chỉ khi `custom_format=1` | System Manager | báo lỗi Jinja |
| `ModeSwitch` | `custom_format`/`print_format_builder_beta` | chuyển builder↔code có cảnh báo | System Manager | — |
| `PreviewPane` | render bản ghi mẫu | cập nhật khi sửa | — | — |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tạo | `POST /api/resource/Print Format` | có `doc_type` | doc mới | "Thiếu DocType nguồn" |
| Lưu (builder) | **`PUT /api/resource/Print Format/<name>`** ghi `format_data` | có `doc_type` + block | toast "Đã lưu mẫu" | — |
| Lưu (custom) | PUT `/<name>` ghi `html`+`css`, `custom_format=1` | Jinja hợp lệ | toast lưu | "Lỗi cú pháp mẫu dòng X" |
| Chuyển mode | set cờ | confirm (không merge 2 chiều) | mode đổi | — |
| In thử | M13 (bản ghi mẫu) | có bản ghi mẫu | tab in | "Chưa có bản ghi mẫu" |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Tạo mẫu mới | khối Letter Head + bảng field chính từ meta (vào `format_data`) | sửa được |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton canvas + preview |
| Empty | mẫu mới → gợi ý khối đầu |
| Error | lỗi Jinja → báo dòng, preview giữ bản trước |
| Offline | banner; render preview cần mạng |
| Thiếu quyền | không System Manager → chặn |
| Dữ liệu dài | mẫu nhiều trang → preview cuộn |
| In-flight | Lưu spinner |

## Acceptance Criteria (theo appendix §N)
- [ ] Mapping đúng: WYSIWYG ↔ **`format_data`(Code)**; Custom ↔ **`html`/`css`(Code)**; `print_format_builder_beta`/`custom_format` = **Check** (mode), không phải nơi chứa data
- [ ] Chuyển mode có cảnh báo; **KHÔNG hứa chuyển 2 chiều lossless**
- [ ] API create POST / update **PUT `/<name>`**
- [ ] In thử render đúng khổ; QR + số + tiền bằng chữ
- [ ] Permission System Manager chốt server; test unit(serialize format_data) + e2e(dựng→lưu→in) + visual baseline
