# M22 — Dashboard Builder (Frappe v16)

> Tạo/sắp **Number Card** + **Dashboard Chart** đúng schema v16 (đã grep-verify). **QUAN TRỌNG:** Number Card có `type` (Document Type/Report/Custom) + `function`; Dashboard Chart tách **`chart_type`** (nguồn tính) ≠ **`type`** (kiểu vẽ). `based_on` chỉ cho time-series.

## Khối 1 — Định danh
- **Tên**: Dashboard Builder — **route**: `/app/dashboard/<name>/edit`.
- **Role**: System Manager.
- **Contract**: `screen-catalog-contract.md` Dashboard + `polish-contract.md` §7 + `dataviz` + `brd-builder/00-builder-engine.md` (Grid canvas).
- **Nguồn (v16 verified)**:
  - **`Number Card`**: `type`(**Document Type / Report / Custom**), `function`(**Count / Sum / Average / Minimum / Maximum**), `aggregate_function_based_on`(field cho Sum/Avg…), `document_type`, `parent_document_type`, `report_name`/`report_field`/`report_function`, `filters_json`, `dynamic_filters_json`, `show_percentage_stats`, `stats_time_interval`, `is_public`, `color`, `currency`.
  - **`Dashboard Chart`**: **`chart_type`**(Count/Sum/Average/**Group By**/Custom/Report), **`type`**(Line/Bar/Percentage/Pie/Donut/Heatmap), `based_on`(date field — **chỉ time-series**), `group_by_based_on`+`group_by_type`+`number_of_groups`, `document_type`/`report_name`/`source`/`use_report_chart`, `value_based_on`, `aggregate_function_based_on`, `timeseries`+`time_interval`+`timespan`, `roles`, `filters_json`+`dynamic_filters_json`, `parent_document_type`, `custom_options`, `heatmap_year`.
  - **`Dashboard`** (parent, grep-verify 16.28): **`charts`** (child = Dashboard Chart Link), **`cards`** (child = Number Card Link), **`chart_options`** (JSON), `dashboard_name`, `is_default`, `module`. (KHÔNG phải `chart_links`/`card_links`.)

## Khối 2 — Layout
**Desktop:** canvas lưới (react-grid-layout, kéo sắp/resize card+chart) + panel thêm:
- **Number Card editor**: chọn `type` → (Document Type: `document_type`+`function`+`aggregate_function_based_on` nếu Sum/Avg; Report: `report_name`+`report_field`+`report_function`; Custom: `method`) + filter (`filters_json`/`dynamic_filters_json`) + `show_percentage_stats`+`stats_time_interval` + tên. Preview số thật.
- **Dashboard Chart editor**: chọn `chart_type` → nguồn tương ứng (Group By: `group_by_based_on`+`group_by_type`; Count/Sum/Avg: `based_on` nếu timeseries + `value_based_on`; Report: `report_name`+`use_report_chart`; Custom: `source`) + `type`(kiểu vẽ) + `roles` + filter. Preview Recharts (dataviz, palette token).
- Nút **Lưu dashboard**; Xem thử (M10).

**Mobile:** xem + sửa filter/tên card; kéo-sắp khuyến nghị desktop.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 4 báo cáo | **Áp dụng — cốt lõi** — tạo Number Card + Chart; đảm bảo drill-down (M10) |
| 8 AI | **Áp dụng có điều kiện** — "AI gợi ý KPI/biểu đồ" theo DocType (nháp) |
| 3 Audit | **Áp dụng** — sửa card/chart ghi Version |
| 15 Tiện VN | **Áp dụng** — format số/tiền; màu token; chiều tốt chỉ số |
| 2/6/10/11/13/14/7/18/5/12/19 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `DashboardCanvas` (react-grid-layout) | Dashboard `charts` (Dashboard Chart Link) / `cards` (Number Card Link) + `chart_options` JSON | kéo sắp/đổi size | System Manager | skeleton |
| `NumberCardEditor` | Number Card (type/function/aggregate/filters) | cấu hình theo `type`; preview số thật | System Manager | preview |
| `ChartEditor` | Dashboard Chart (chart_type≠type/based_on/group_by/roles) | cấu hình theo `chart_type`; preview Recharts | System Manager | preview |
| `SourcePicker` | DocType/Report | chọn nguồn + field/aggregate | System Manager | — |
| `SaveDashboard` | — | lưu Dashboard + links | System Manager | — |

## Khối 4 — Hành động
| Thao tác | API (v16) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Thêm Number Card | create `POST /api/resource/Number Card` | `type` + `function` (+ `aggregate_function_based_on` nếu Sum/Avg/Min/Max) | card preview số thật | "Chọn trường để tính" |
| Sửa Number Card | **`PUT /api/resource/Number Card/<name>`** | như trên | lưu | — |
| Thêm Chart | create `POST /api/resource/Dashboard Chart` | `chart_type` + `type` + nguồn hợp lệ (`based_on` CHỈ khi timeseries) | chart preview | "Group By cần group field"; "Time-series cần based_on" |
| Sửa Chart | **`PUT /api/resource/Dashboard Chart/<name>`** | như trên | lưu | — |
| Lưu dashboard | **`PUT /api/resource/Dashboard/<name>`** (create = POST) | ≥1 card/chart | toast "Đã lưu" | — |
| Xem thử | M10 | — | render | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Thêm card/chart | tên tự sinh từ DocType+function/chart_type | sửa được |
| `function` Sum/Avg | gợi ý field số của DocType (`aggregate_function_based_on`) | — |
| `chart_type=Group By` | gợi ý `group_by_based_on` (Link/Select) | — |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton canvas |
| Empty | dashboard mới → "Thêm thẻ/biểu đồ đầu tiên" |
| Error | nguồn/aggregate lỗi → báo rõ, không lưu card hỏng |
| Offline | banner; preview cần mạng |
| Thiếu quyền | không System Manager → chặn |
| Dữ liệu dài | nhiều card/chart → canvas cuộn |
| In-flight | Lưu/preview spinner |

## Acceptance Criteria (theo appendix §N)
- [ ] Number Card đúng `type`(Document Type/Report/Custom) + `function`(Count/Sum/Average/Minimum/Maximum) + `aggregate_function_based_on`
- [ ] Dashboard Chart tách **`chart_type`**(nguồn) ≠ **`type`**(kiểu vẽ); `based_on` **chỉ** time-series; hỗ trợ Group By/Report/Custom + `roles` + dynamic filters
- [ ] API create POST / update **PUT `/<name>`** cho Number Card / Dashboard Chart / Dashboard
- [ ] Drill-down đảm bảo (M10); preview số/chart thật
- [ ] Permission System Manager chốt server; test unit(serialize) + e2e(tạo→lưu→xem) + visual baseline
