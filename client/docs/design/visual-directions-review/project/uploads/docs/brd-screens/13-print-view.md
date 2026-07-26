# M13 — Print View (render Print Format)

> Render Frappe **Print Format** (Standard/Jinja/HTML) của 1 document → route in + `window.print()`. Đối chiếu: Frappe printview v16.

## Khối 1 — Định danh
- **Tên**: Print View — **route**: `/print/<doctype>/<name>` (+ `?format=<print-format>&letterhead=<lh>&lang=`).
- **Role**: user có `print` DocType.
- **Contract**: `print-contract.md` (toàn bộ) + `media-capture-contract.md` (QR + chữ ký trên bản in).
- **Nguồn**: `frappe.www.printview.get_html`/`frappe.client` render Print Format + Letter Head + doc data.

## Khối 2 — Layout
**Desktop:** thanh trên (chọn **Print Format**, **Letter Head**, ngôn ngữ, khổ A4/A5, nút **In**, **Tải PDF**, **Gửi email**) — thanh này `print:hidden`. Vùng preview render HTML Print Format đúng khổ (`@page size`), có logo/tổ chức từ Letter Head, **QR mở bản ghi** + **số chứng từ** + **tiền bằng chữ**, khu chữ ký (chữ ký điện tử đã ký). `window.print()` chỉ in vùng preview.

**Mobile:** preview cuộn dọc; nút In → share sheet / tải PDF (không dựa máy in).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 11 In ấn | **Áp dụng — cốt lõi** — Print Format render 1:1; A4/A5/nhiệt 58-80mm; QR + số + tiền bằng chữ; `@page` + `print:hidden` |
| 10 media | **Áp dụng** — chữ ký điện tử + QR trên bản in |
| 8 AI | Không áp dụng |
| 7/18/2/4/5/6/13/14/19 | | Không áp dụng (màn in) |
| 15 Tiện VN | **Áp dụng** — tiền bằng chữ tiếng Việt; format ngày dd/MM; địa chỉ tổ chức |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `PrintToolbar` (print:hidden) | Print Format list + Letter Head | chọn format/letterhead/khổ; In/PDF/Email | `print`/`email` | — |
| `PrintPreview` | printview.get_html | render HTML Jinja + doc; `@page` khổ | `print` | skeleton |
| `PrintCss` | Print Format `css` | áp CSS in; đen trắng an toàn | — | — |
| `QrOnPrint` | token bản ghi | QR mở đúng doc | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| In | `window.print()` sau render | `print` | hộp thoại in trình duyệt | "Không có quyền in" (403) |
| Tải PDF | `frappe.utils.print_format.download_pdf(doctype, name, format=None, no_letterhead=0, letterhead=None, language=None, pdf_generator="wkhtmltopdf"\|"chrome")` → **binary PDF** | `print` | file PDF | "Tạo PDF lỗi" |
| Gửi email | `frappe.core.doctype.communication.email.make(doctype, name, recipients, subject, content, send_email=True, print_format, cc, bcc, attachments, send_me_a_copy)` (kiểm quyền email) | `email` | toast "Đã gửi" | "Gửi email lỗi" |
| Đổi Print Format/Letter Head | re-render | — | preview cập nhật | — |

## Khối 5 — Autofill
> Không áp dụng — màn in, dữ liệu từ document.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton trang in |
| Empty | DocType chưa có Print Format → dùng Standard tự sinh từ meta |
| Error | render lỗi Jinja → "Mẫu in lỗi — chọn mẫu khác" |
| Offline | banner; cần mạng để render server |
| Thiếu quyền | không `print` → chặn (403) |
| Dữ liệu dài | nhiều trang → lặp header bảng mỗi trang (`thead group`) |
| In-flight | nút In/PDF spinner |

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
