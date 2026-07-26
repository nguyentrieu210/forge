# M03 — Awesomebar / Command Palette (Ctrl+K)

> Tìm nhanh toàn app + hành động. Bắt buộc mọi app AppWeb (frontend-360). Đối chiếu: Frappe Awesomebar v16 + polish §3 (Ctrl+K là hành động, không chỉ điều hướng).

## Khối 1 — Định danh
- **Tên**: Awesomebar — **route**: overlay (mở bằng Ctrl/Cmd+K hoặc `/`, hoặc ô tìm topbar).
- **Role**: mọi role (kết quả lọc theo quyền).
- **Contract**: `frontend-360-contract.md` (CommandPalette bắt buộc) + `polish-contract.md` §3.
- **Nguồn**: `frappe.desk.search.search_link`/`search_widget` (record) + danh sách DocType có quyền (điều hướng) + registry hành động của engine.

## Khối 2 — Layout
**Desktop:** overlay giữa trên (`max-w-[640px]`), ô nhập + danh sách kết quả phân nhóm: **Hành động** ("Tạo <DocType>", "Xuất Excel", "Giao diện tối", "Mở Settings") · **Màn hình/DocType** (điều hướng tới List) · **Bản ghi** (kết quả search_link, hiện title + doctype + badge) · **Vừa xem gần đây** (5 bản ghi — polish §3). Điều hướng ↑↓, Enter mở, Esc đóng. Gõ "new <doctype>" → tạo; "report <doctype>" → report view.

**Mobile:** nút tìm trên topbar mở full-screen search (không phụ thuộc bàn phím vật lý); cùng nhóm kết quả.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 8 AI | **Áp dụng có điều kiện** — nếu gõ câu hỏi tự nhiên → chuyển sang panel AI (đúng quyền) |
| 15 Tiện VN | **Áp dụng** — tìm không dấu; tìm bản ghi bằng 4 số cuối SĐT (#14); recent records (#15) |
| 19 Danh mục | **Áp dụng** — điều hướng tới List DocType master |
| 7/18/2/4/5/6/10/11/13/14 | | Không áp dụng (công cụ tìm/điều hướng) |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `CommandInput` | — | debounce 200ms; parse "new/report/<text>" | mọi role | — |
| `ActionGroup` | registry engine | tạo DocType/xuất/theme/settings | theo `create`/quyền | chỉ hiện action hợp lệ |
| `DoctypeGroup` | DocType có quyền | điều hướng List | `read` | — |
| `RecordGroup` | search_link | kết quả bản ghi (title+doctype) | server lọc quyền | "Không tìm thấy" |
| `RecentGroup` | localStorage | 5 bản ghi gần đây | mọi role | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Tìm bản ghi | `search_link`(doctype?, txt) | — | danh sách kết quả (lọc quyền) | "Không tìm thấy" |
| Chọn bản ghi | mở M11 | `read` | 3 cột | — |
| "Tạo <DocType>" | mở M11 `?new=1` | `create` | form mới | ẩn nếu không `create` |
| Hành động (theme/xuất/settings) | tương ứng | — | thực thi | — |

## Khối 5 — Autofill
> Không áp dụng — công cụ tìm, không có form.

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | spinner nhỏ trong ô khi đang tìm |
| Empty — chưa gõ | hiện "Vừa xem gần đây" + hành động gợi ý |
| Empty — không kết quả | "Không tìm thấy '<txt>'" + gợi ý tạo mới |
| Error | "Lỗi tìm kiếm — thử lại" |
| Offline | tìm trong recent/cache; báo "đang offline" |
| Thiếu quyền | bản ghi/DocType không quyền không xuất hiện |
| In-flight | kết quả cập nhật khi gõ (không chặn gõ) |

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
