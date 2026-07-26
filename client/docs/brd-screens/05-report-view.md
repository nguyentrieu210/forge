# M05 — Report View (renderer generic)

> Bảng dạng báo cáo: group-by, aggregate, chọn/sắp cột, tổng nhóm, saved view. Đối chiếu: Frappe Desk Report View v16.

## Khối 1 — Định danh
- **Tên**: Report View — **route**: `/app/<doctype>/view/report`.
- **Role**: user có `read` (+ `report`/`export` cho xuất).
- **Contract**: `data-table-contract.md` + `screen-catalog-contract.md`.
- **Nguồn**: `getdoctype` + `frappe.desk.reportview.get` (fields + filters + group_by + aggregate + order_by + page_length).

## Khối 2 — Layout
**Desktop:** toolbar (filter như M04 + nút **Group By** field + **Aggregate** count/sum/avg + **Cột** chọn/sắp/resize + **Sort** + Xuất Excel + toggle view). Bảng đầy đủ cột chọn được; **nhóm gập/mở** với dòng tổng mỗi nhóm + tổng cuối (tabular-nums, canh phải). Bấm dòng → M11 (3 cột). Saved view: lưu cấu hình cột/filter/group (List View Settings hoặc localStorage).

**Mobile:** không bảng ngang — card nhóm gập/mở, mỗi card hiện field cột đã chọn; filter trong sheet. Group-by hiện dạng section header + tổng.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 4 báo cáo | **Áp dụng — cốt lõi** — group-by/aggregate + Xuất Excel theo lọc; 100% số bấm drill-down |
| 8 AI | **Áp dụng** — "Hỏi AI" → group-by/filter tự động; "Vì sao?" trên số tổng |
| 7/14/18/6/10/11/13 | | Không áp dụng (báo cáo đọc) — trừ 6/11 nếu DocType hàng hoá thì Xuất/In từ đây |
| 2 soft-delete | Không áp dụng (đọc) |
| 5+12 | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — format số/tiền/ngày VN; tổng ghim; giữ filter URL |
| 19 Danh mục | **Áp dụng** — group-by theo Link field (nhóm theo danh mục: theo Item Group, Territory…) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `ReportTable` (TanStack) | reportview.get | group-by (client/server), aggregate, resize/sắp cột; nhóm gập | server scope | skeleton |
| `GroupByPicker` | meta fields (Link/Select/Date) | chọn field nhóm + hàm tổng | mọi role | — |
| `ColumnManager` | meta fields | chọn/sắp/ẩn cột; lưu saved view | mọi role | localStorage/List View Settings |
| `GroupTotalRow` | field số | tổng mỗi nhóm + tổng cuối | đọc | — |
| `SavedViewSelect` | List View Settings | chọn/lưu view chia sẻ | write settings | — |
| `ExportButton` | reportview.export | xuất theo lọc/cột hiện tại | `export` | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Group by / aggregate | reportview.get | — | bảng nhóm + tổng | — |
| Chọn/sắp cột | local + save | — | bảng cập nhật | — |
| Lưu saved view | List View Settings / localStorage | tên view | toast "Đã lưu view" | "Không lưu được" |
| Xuất Excel | reportview.export_query | `export` | file theo lọc/cột | "Không có quyền xuất" (403) |
| Bấm dòng | mở M11 | `read` doc | 3 cột | — |

## Khối 5 — Autofill
> Không áp dụng — Report không có form nhập liệu.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton bảng |
| Empty — chưa có | "Chưa có dữ liệu" |
| Empty — lọc không ra | "Không có kết quả" + xoá lọc |
| Error | tiếng Việt + Thử lại |
| Offline | banner + cache |
| Thiếu quyền | không `read`/`report` → chặn (403) |
| Dữ liệu dài | virtualize + paginate; nhóm lazy |

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
