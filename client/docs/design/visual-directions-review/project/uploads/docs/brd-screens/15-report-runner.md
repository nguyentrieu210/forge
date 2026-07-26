# M15 — Report Runner (Query/Script/Report Builder, Frappe v16)

> Chạy + xem Frappe **Report** đúng runtime v16 (đã grep-verify: `query_report.get_script` + `run`). **QUAN TRỌNG:** Report có **JS asset** (filters/formatter/chart/onload/datatable options/tree) — KHÔNG chỉ `Report.filters` trong DB.

## Khối 1 — Định danh
- **Tên**: Report Runner — **route**: `/app/query-report/<report-name>`.
- **Role**: role được cấp Report (`Report.roles`) + `read` DocType nguồn.
- **Contract**: `screen-catalog-contract.md` + `data-table-contract.md` + `dataviz` + appendix §Q (report JS asset) + §F3 (executor).
- **Nguồn (v16 verified)**:
  - **`frappe.desk.query_report.get_script(report_name)`** → trả **report JS** (định nghĩa `filters`, `formatter`, `get_chart_data`, `onload`, `get_datatable_options`, tree behavior…) — chạy dạng **IIFE** trong **compatibility executor** (§F3).
  - **`frappe.desk.query_report.run(report_name, filters, ...)`** → response contract: **`result`, `columns`, `message`, `chart`, `report_summary`, `skip_total_row`** + trạng thái **prepared report** (async) nếu report `prepared_report=1`.

## Khối 2 — Layout
**Desktop:** header (tên report) + **thanh filter** — filter đến từ **cả** `Report.filters` (DB) **và** report JS `filters` (executor) → hợp nhất; mỗi filter control theo fieldtype (Link/Select/Date range/MultiSelect). Nút Chạy/Làm mới + Xuất Excel/PDF. Nếu run trả `chart` → khối biểu đồ (Recharts) trên bảng; `report_summary` → dải KPI; `message` → banner. Bảng: cột từ `columns` (áp `formatter` từ JS), số canh phải; tổng cột trừ khi `skip_total_row`. Ô Link → M11. Prepared report: hiện "Đang tạo báo cáo…" + poll.

**Mobile:** filter trong sheet; kết quả bảng trong khối `overflow-x-auto` riêng (report nhiều cột — cho cuộn ngang CHỈ khối bảng); chart cuộn dọc.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 4 báo cáo | **Áp dụng — cốt lõi** — chạy report + filter (DB+JS) + xuất; chart/summary từ run response |
| 8 AI | **Áp dụng có điều kiện** — "Vì sao?"/tóm tắt kết quả |
| 15 Tiện VN | **Áp dụng** — format số/tiền/ngày; tổng cột |
| 7/18/2/6/10/11/13/14/19/5/12 | | Không áp dụng (đọc) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `ReportScriptLoader` | `get_script` | chạy report JS (IIFE) trong executor → lấy filters/formatter/chart/onload | — | fallback nếu JS lỗi |
| `ReportFilters` | `Report.filters` + JS filters | control theo fieldtype; Chạy → run | theo quyền | reqd chưa nhập = chặn |
| `ReportTable` | `run().columns/result` + `formatter` | cột + formatter; sort; tổng (trừ `skip_total_row`); ô Link→M11 | server scope | skeleton |
| `ReportChart` | `run().chart` | Recharts (dataviz) | — | ẩn nếu không có chart |
| `ReportSummary` | `run().report_summary` | dải KPI | — | — |
| `PreparedReportStatus` | prepared report | poll khi async | — | "Đang tạo…" |
| `ExportButton` | export | Excel/PDF theo kết quả | `export` | — |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Nạp report JS | `query_report.get_script(name)` | — | filters/formatter/chart sẵn | JS lỗi → executor catch, dùng filter DB, log |
| Chạy report | `query_report.run(name, filters)` | filter bắt buộc đủ | bảng + chart + summary + message | "Thiếu filter bắt buộc: X"; "Report lỗi thực thi" (không lộ SQL) |
| Prepared report | run async | — | poll → sẵn thì render | "Tạo báo cáo lỗi" |
| Xuất | export | `export` | file | "Không có quyền xuất" |
| Bấm ô Link | M11 | `read` | 3 cột | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Mở report | filter `default` (kỳ hiện tại, company session) + JS `onload` set | nhớ filter lần trước theo user |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton bảng khi chạy; "Đang tạo…" nếu prepared |
| Empty | chưa chạy → "Chọn bộ lọc và bấm Chạy"; ra rỗng → "Không có dữ liệu" |
| Error | lỗi SQL/script → tiếng Việt + mã tra cứu (không lộ SQL) |
| Offline | banner; cần mạng |
| Thiếu quyền | không được cấp report → 403 |
| Dữ liệu dài | virtualize + paginate |
| In-flight | nút Chạy spinner |

## Acceptance Criteria (theo appendix §N)
- [ ] Nạp + chạy **report JS** (get_script, IIFE executor) — filters/formatter/chart/onload hoạt động, không chỉ Report.filters DB
- [ ] `run` response map đủ `result/columns/message/chart/report_summary/skip_total_row` + prepared report
- [ ] Query/Script Report chuẩn ERPNext (vd Accounts Receivable) render đúng filter + formatter
- [ ] Permission report chốt server; không lộ SQL khi lỗi
- [ ] Responsive; test unit(formatter) + integration(run+quyền) + visual baseline
