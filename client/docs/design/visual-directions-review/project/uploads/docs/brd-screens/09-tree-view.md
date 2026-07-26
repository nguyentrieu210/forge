# M09 — Tree View (renderer generic)

> Cây cha-con cho DocType nested-set (`is_tree`/NSM — vd Item Group, Territory, Account, Cost Center). Đối chiếu: Frappe Tree View v16.

## Khối 1 — Định danh
- **Tên**: Tree View — **route**: `/app/<doctype>/view/tree`.
- **Role**: `read` (+ `write`/`create` để thêm/đổi cha).
- **Contract**: `screen-catalog-contract.md` + `master-data-contract.md` (danh mục cha-con).
- **Nguồn**: `frappe.desk.treeview.get_children` (lazy theo `parent_<doctype>`) + meta (field `parent_*`, `is_group`).

## Khối 2 — Layout
**Desktop:** cây thụt lề, node có mũi tên gập/mở (lazy tải con khi mở), icon nhóm/lá. Bấm node → M11 (3 cột) hoặc panel phải. Nút trên node: `+ Thêm con`, `Đổi tên/cha`, `Sửa`. Kéo-thả đổi cha (confirm — cập nhật NSM ở server). Nút "Mở rộng tất cả"/"Thu gọn".

**Mobile:** cây 1 cột, gập/mở bằng chạm; thêm con qua nút trên node hoặc FAB; kéo-thả đổi cha tắt (đổi qua form).

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 19 Danh mục | **Áp dụng — cốt lõi** — cây danh mục cha-con; node lá = Link field đích ở form khác; chặn xoá cứng nếu có tham chiếu |
| 2 soft-delete | **Áp dụng** — xoá qua Frappe (chặn nếu là group có con / có tham chiếu) |
| 8 AI | Không áp dụng (vòng đầu) |
| 7/18/4/5/6/10/11/13/14 | | Không áp dụng |
| 15 Tiện VN | **Áp dụng** — tìm không dấu node; tên dài truncate + tooltip |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `TreeNode` | get_children (lazy) | gập/mở tải con; bấm → chi tiết | `read` | skeleton node |
| `NodeActions` | meta | +Thêm con / Sửa / Đổi cha / Xoá | theo quyền | chỉ hiện action hợp lệ |
| `DragReparent` | — | kéo node vào node khác → đổi parent (confirm) | `write` | — |
| `TreeSearch` | get_list | tìm node (không dấu), mở đường tới node | `read` | — |
| `ExpandAll` | — | mở/thu toàn cây | — | — |

## Khối 4 — Hành động
| Thao tác | API | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Thêm con | `POST /api/resource/<dt>` (parent = node) | `create` + tên | node con mới | "Trùng tên trong nhóm" |
| Đổi cha (kéo) | confirm → `updateDoc(parent_<dt>)` + **save** → NestedSet controller rebuild `lft/rgt` (api-map §10; KHÔNG sửa lft/rgt trực tiếp). Thêm node = `treeview.add_node` | `write`; không tạo vòng | cây cập nhật | "Không thể chuyển vào chính con của nó" |
| Đổi tên | rename doc | `write` | node đổi tên | — |
| Xoá | `DELETE` | `delete`; không có con/tham chiếu | node biến mất | "Đang dùng ở N bản ghi / còn node con — không xoá" |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Thêm con từ node | `parent_<dt>` = node hiện tại | prefill form |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton node gốc |
| Empty | "Chưa có danh mục" + nút thêm gốc |
| Error | tiếng Việt + Thử lại |
| Offline | banner; cache node đã mở |
| Thiếu quyền | không `read` → chặn |
| Dữ liệu dài | lazy load con; virtualize khi node nhiều con |
| In-flight | node mờ khi đang đổi cha/xoá |

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
