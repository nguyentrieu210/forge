# M16 — Role Permission Manager (Frappe v16)

> Xem/sửa DocPerm (role × permlevel × ptype). API = `frappe.core.page.permission_manager.permission_manager.*` (đã grep-verify 16.28 — `api-map.md`). **UI render danh sách ptype ĐỘNG từ response** (`get_roles_and_doctypes`/`get_permissions` trả rights/ptype map), KHÔNG hardcode.

## Khối 1 — Định danh
- **Tên**: Role Permission Manager — **route**: `/app/permission-manager`.
- **Role**: System Manager (Administrator).
- **Contract**: `screen-catalog-contract.md` Users & Roles.
- **Nguồn (grep-verify — `frappe.core.page.permission_manager.permission_manager`)**:
  - `get_roles_and_doctypes()` — danh sách role + doctype + **bộ ptype/rights** (UI render ptype từ đây, không cứng).
  - `get_permissions(doctype=None, role=None)` — các rule DocPerm/Custom DocPerm hiện có.
  - `add(parent, role, permlevel)` — thêm rule role/permlevel.
  - `update(doctype, role, permlevel, ptype, value=None, if_owner=0)` — bật/tắt 1 ptype.
  - `remove(doctype, role, permlevel, if_owner=0)` — xoá rule.
  - `reset(doctype)` — xoá Custom DocPerm về mặc định.
  - `get_users_with_role(role)`, `get_standard_permissions(doctype)`.
  - **Standard DocPerm** (DocType JSON) vs **Custom DocPerm** (overlay): sửa DocType chuẩn → ghi Custom DocPerm; `reset` xoá overlay.

## Khối 2 — Layout
**Desktop:** chọn **DocType**(Link) + **Role**(Link) + **permlevel**(số). Ma trận: mỗi dòng (role, permlevel) với toggle cho **từng ptype do response trả về** (đọc/ghi/tạo/xoá/submit/cancel/amend/report/export/import/share/print/email/`set_user_permissions`… — **render từ `get_roles_and_doctypes` chứ không danh sách cứng**) + `if_owner`. Nút thêm role, xoá rule, "Khôi phục mặc định". **Cảnh báo khi sửa DocType chuẩn** → tạo Custom DocPerm.

**Mobile:** chọn DocType/Role → danh sách ptype (động) toggle 1 cột; permlevel qua sheet.

### Khối 2b — Nghiệp vụ bắt buộc màn này
| # | Mục | Khai |
|---|---|---|
| 1 Phân quyền | **Áp dụng — cốt lõi** — cấu hình DocPerm; ghi Custom DocPerm overlay cho DocType chuẩn |
| 3 Audit | **Áp dụng** — thay đổi quyền ghi Version + clear permission cache |
| 15 Tiện VN | **Áp dụng** — nhãn ptype tiếng Việt (map từ mã ptype response) + tooltip |
| 19 Danh mục | **Áp dụng** — DocType/Role chọn qua Link |
| 8/7/18/2/4/6/10/11/13/14 | | Không áp dụng |

## Khối 3 — Component
| Component | Nguồn | Hành vi | Quyền | Trạng thái |
|---|---|---|---|---|
| `DoctypeRoleSelect` | Link DocType + Role | lọc rule | System Manager | — |
| `PermissionMatrix` | `get_permissions` + ptype list từ `get_roles_and_doctypes` | toggle ptype × permlevel (**ptype render động**); thêm/xoá role | System Manager | cảnh báo sửa DocType chuẩn |
| `PtypeToggle` | ptype trong response | 1 toggle/ptype; nhãn VN map từ mã | System Manager | — |
| `PermlevelInfo` | meta fields permlevel | field nào ở permlevel nào | — | — |
| `ResetDefault` | `reset(doctype)` | xoá Custom DocPerm về mặc định | System Manager | confirm |

## Khối 4 — Hành động (grep-verify)
| Thao tác | API (verified) | Validate | Thành công | Lỗi |
|---|---|---|---|---|
| Bật/tắt 1 ptype | `update(doctype, role, permlevel, ptype, value, if_owner)` | System Manager | toast "Đã cập nhật quyền" + **clear permission cache** | "Không có quyền quản trị" |
| Thêm role | `add(parent, role, permlevel)` | System Manager | dòng role mới | — |
| Xoá rule | `remove(doctype, role, permlevel, if_owner)` | System Manager + confirm | rule biến mất | "Không xoá rule cuối của Read" (constraint Frappe) |
| Khôi phục mặc định | `reset(doctype)` | System Manager + confirm | xoá Custom DocPerm | — |
| Tải rule/ptype | `get_permissions(doctype, role)` + `get_roles_and_doctypes()` | System Manager | ma trận + danh sách ptype động | — |

## Khối 5 — Autofill
| Khi | Tự điền | Rule |
|---|---|---|
| Thêm role mới | permlevel=0, ptype `read`=1 | `add(parent, role, 0)` rồi bật read |

## Khối 6 — 7 trạng thái
| Trạng thái | Mô tả |
|---|---|
| Loading | skeleton ma trận |
| Empty | chưa chọn DocType → "Chọn DocType để xem quyền" |
| Error | tiếng Việt + Thử lại |
| Offline | banner; cần mạng |
| Thiếu quyền | không System Manager → 403 cả trang |
| Dữ liệu dài | nhiều role → nhóm/cuộn |
| In-flight | toggle optimistic + rollback nếu server từ chối |

## Acceptance Criteria (theo appendix §N)
- [ ] Dùng đúng `permission_manager.get_permissions/add/update/remove/reset` (đã grep-verify — KHÔNG `frappe.permissions.*`, KHÔNG "pin PHA 3")
- [ ] **Danh sách ptype render ĐỘNG** từ `get_roles_and_doctypes` response, KHÔNG hardcode 13 ptype
- [ ] Standard vs Custom DocPerm rõ; `reset` = xoá Custom DocPerm; clear permission cache sau ghi
- [ ] Permission System Manager chốt server; test integration(update+cache) + regression(role thấp bị chặn)
