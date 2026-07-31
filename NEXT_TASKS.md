# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — xác nhận PR #81 trên exact final head

1. Lấy exact head mới nhất của `feat/metaforge-misa-workspace-tabs` sau các commit tài liệu.
2. Kiểm đủ workflow:
   - CI;
   - PR Validation;
   - UI Pull Request Validation;
   - Purchase Feature CI;
   - Sales Feature CI;
   - Inventory and Manufacturing CI.
3. Nếu GitHub không tự tạo run cho head mới, kích hoạt lại validation từ PR/Actions trước khi chuyển PR khỏi draft.
4. Không merge chỉ dựa trên workflow xanh của head cũ `464b713af4d8a0403f766f354d04ebcaee32e6b8`.

## P0 — browser acceptance

Kiểm desktop, mobile drawer và sidebar collapsed:

- sidebar chỉ hiện các phân hệ `Nghiệp vụ` và `Meta`;
- bấm phân hệ luôn đi tới tab `Quy trình nghiệp vụ`;
- tab 1 mở shortcut và modal tạo mới;
- tab 2 mở báo cáo/dashboard tổng quan;
- từ tab 3 trở đi là nghiệp vụ/DocType;
- list/form/kanban/calendar của Task vẫn giữ tab `Công việc` active;
- Meta hiển thị đúng thứ tự Quy trình → Tổng quan → DocType → Workflow → Print Format → Dashboard;
- tab dài cuộn ngang, không phá topbar;
- modal đóng đúng và điều hướng tới builder tương ứng;
- Command Palette vẫn tìm được route ngoài tab đang mở.

## P1 — nâng sang LiveApp/runtime

Chỉ làm sau khi prototype được duyệt:

1. Đưa primitive workspace tabs vào `@metaforge/shell` thay vì giữ riêng trong demo.
2. Sinh module/tab từ `ApplicationCatalog` và `AppManifest`.
3. Định nghĩa route và permission thật cho Meta builders:
   - DocType;
   - Workflow;
   - Print Format;
   - Dashboard.
4. Không hiển thị module/tab khi user không có quyền hoặc route chưa tồn tại.
5. Giữ quy tắc tab đầu `process`, tab hai `overview`, tab sau `doctype` bằng validator metadata.

## P1 — test tự động

- Bổ sung selfcheck cho thứ tự tab và route alias.
- Bổ sung browser test cho sidebar module, active tab, modal tạo mới và responsive overflow.
- Kiểm lint `check-native-ui` vẫn bằng 0 vi phạm.

## Không được làm

- Không deploy Cloudflare nếu chưa được yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated reports.
- Không đưa tab Meta vào LiveApp bằng route giả hoặc builder mock.
- Không bật FIFO production khi chưa có explicit approval.
