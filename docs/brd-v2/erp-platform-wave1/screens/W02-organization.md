# W02 — Cơ cấu tổ chức

## Khối 1 — Định danh

- Route: `/organization`; route con `/companies/:id`, `/branches/:id`, `/departments/:id`.
- Tác nhân: Owner, System Manager, HR Manager, Accountant, Auditor read-only.
- Dữ liệu: Company, Branch, Department, Cost Center, Organization Assignment.

## Khối 2 — Layout desktop/mobile

- Desktop: ba cột cây tổ chức → chi tiết → context (người quản lý, cost center, hiệu lực, audit); toolbar có company switch và tìm kiếm.
- Mobile: stack Cấp pháp nhân → chi nhánh → phòng ban; breadcrumb/back thật; form full-screen, lưu sticky; không bảng ngang.
- Danh sách >200 node tải lười theo cây, search server-side; URL riêng cho từng node, quay lại giữ node/filter/scroll.

### Khối 2b — 13 nghiệp vụ bắt buộc

| Mục | Quyết định |
|---|---|
| #7 Kanban | Không áp dụng; dùng Tree view, không kéo-thả để đổi pháp nhân. |
| #8 AI | AI read-only trả lời “ai phụ trách/đơn vị nào” theo scope và dẫn nguồn; không sửa cây. |
| #18 Vòng đời | Master `draft→active→disabled`; không disable khi còn giao dịch cần scope mà chưa có successor. |
| #2 Xóa | Soft-delete chỉ khi chưa được tham chiếu; đã dùng thì disable/merge có audit. |
| #4 Báo cáo | Headcount/cost theo cây, orphan assignment, node không manager; KPI drill-down. |
| #5+#12 Thông báo | In-app/email/Zalo khi thay manager, scope hoặc node bị disable; gom một tin/ngày. |
| #6 Barcode | Không áp dụng. |
| #10 Media/QR/OCR | Logo Company và tệp pháp lý lên R2 riêng tư; không OCR tự quyết định MST. |
| #11 In | In sơ đồ tổ chức/profile pháp nhân PDF A4 có version. |
| #13 Mã tự động | Company/Branch/Department có counter/prefix; số chính thức cấp lúc lưu. |
| #14 Lịch | Hiệu lực assignment/manager xem trên calendar; không dùng để sửa hàng loạt. |
| #15 Tiện ích VN | MST/địa chỉ 2 cấp/điện thoại VN; recent nodes; tìm không dấu; duplicate/merge có hướng dẫn. |
| #19 Master data | Company, Branch, Department, Cost Center là bảng riêng và link-field có quick-create theo quyền. |

## Khối 3 — Component

| Component | Hành vi | Quyền |
|---|---|---|
| `OrganizationTreeDesktop` / `OrganizationStackMobile` | tải lười, badge active/disabled, tìm không dấu | role được gán scope |
| `OrganizationDetail` | form Company/Branch/Department từ meta, diff version | Owner/HR Manager tùy entity |
| `ScopeAssignmentGrid` | user-role-scope-effective dates | System Manager |
| `OrgContextPanel` | manager, cost center, headcount, linked docs, audit | masked theo role |
| `MergeDisableDialog` | mô tả hậu quả có số lượng tham chiếu | Owner/HR Manager |

## Khối 4 — Hành động

| Hành động | Validate/server | Thành công/lỗi |
|---|---|---|
| Tạo node | parent cùng company, mã duy nhất | chèn đúng cây + highlight; trùng mã link node cũ |
| Di chuyển Department | không chu trình, không đổi company trái phép | preview ảnh hưởng rồi commit + audit |
| Gán manager/cost center | cùng scope, hiệu lực hợp lệ | timeline mới; lỗi chỉ rõ đối tượng lệch company |
| Disable/merge | kiểm linked active assignments/documents | yêu cầu successor; không hard delete |
| Gán user scope | không vượt effective permission người gán | policy cache version bump |

## Khối 5 — Autofill

- Branch kế thừa company, currency và cost center template; Department kế thừa company/branch.
- Địa chỉ từ master địa giới 2 cấp, manager từ employee cùng node; autofill có provenance và dừng khi field dirty.
- “Lưu & tạo tiếp” giữ company/branch; clone xóa mã và status.

## Khối 6 — 7 trạng thái

| Trạng thái | Hiển thị |
|---|---|
| Loading | Skeleton cây + detail; node đang tải có spinner cục bộ. |
| Chưa có dữ liệu | Wizard Company đầu tiên, không demo giả. |
| Lọc không ra | Nêu từ khóa và nút xóa lọc. |
| Error | Error block theo cột, giữ node/form, nút thử lại. |
| Thiếu quyền | Cây chỉ có scope được phép; API cross-branch trả 403. |
| Saved/success | Node mới highlight 1,5s, toast có “Xem”. |
| Mạng gián đoạn | Giữ draft localStorage, khóa mutation, không queue/PWA. |
