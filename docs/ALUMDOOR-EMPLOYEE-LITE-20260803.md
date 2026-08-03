# Alumdoor — Employee Lite cho chấm công

Ngày: 2026-08-03  
Trạng thái: code chuẩn bị xong trên nhánh `feat/alumdoor-employee-lite-20260803`; **chưa áp production**.

## Quyết định nghiệp vụ

Hồ sơ `Employee` trên Alumdoor chỉ phục vụ nhận diện nhân viên và nối với chấm công. Người vận hành không phải khai cơ cấu HR/kế toán chỉ để thêm một người vào danh sách.

Các ô người dùng trực tiếp nhập:

1. `employee_name` — Họ và tên.
2. `mobile` — Số điện thoại.
3. `bank_account_no` — Số tài khoản ngân hàng.
4. `bank_name` — Ngân hàng.
5. `user_id` — Tài khoản đăng nhập, Link tới `User` có sẵn.

## Những gì bỏ khỏi form Alumdoor

Không bắt nhập và không hiển thị trong trải nghiệm Employee Lite:

- Công ty.
- Chi nhánh.
- Mã nhân viên nội bộ.
- Phòng ban.
- Chức danh.
- Loại lao động.
- Trung tâm chi phí.
- Ngày vào làm.
- Email công việc/cá nhân.
- Ngày sinh, giới tính.
- MST, BHXH.
- Liên hệ khẩn cấp.
- Quản lý trực tiếp, lịch nghỉ.
- Ghi chú lương và các field vòng đời HR khác.

`employee_status` tiếp tục mặc định `Đang làm việc`; `date_of_joining` mặc định ngày hiện tại để giữ dữ liệu hệ thống có ích nhưng không bắt người dùng thao tác.

## Biên kỹ thuật

Không sửa `server/apps-src/hrm/doctypes/employee.json`, vì đây là DocType HRM dùng chung cho mọi tenant. Alumdoor áp `Property Setter` trên tenant `alu`, đúng cơ chế customization overlay của Forge. Vì vậy:

- HRM tenant khác không thay đổi.
- Upgrade HRM có thể thay base metadata mà không mất cấu hình Alumdoor.
- Các field đang `required` phải được bỏ `reqd` trước khi ẩn, tránh form đẹp nhưng không lưu được.
- Không sửa trực tiếp D1; script dùng API `Property Setter` có System Manager guard và server validate effective schema.

## Quyền dữ liệu nhạy cảm

`mobile`, `bank_account_no`, `bank_name` giữ `permlevel=1` để không làm lộ SĐT/tài khoản ngân hàng cho role `Employee` chỉ có quyền đọc hồ sơ.

Script bảo đảm level 1 read/write/create cho các role vận hành Employee hiện hữu:

- `HR User`
- `HR Manager`
- `System Manager`

Không cấp level 1 cho role `Employee`.

## Script áp dụng

`server/scripts/apply-alumdoor-employee-lite.mjs`

Mặc định chỉ dry-run, không ghi production. Ghi thật cần đồng thời:

```text
--execute --confirm ALU_EMPLOYEE_LITE
```

Credential chỉ lấy từ environment, không nhận password qua command line.

## Acceptance

- Tạo/Sửa Nhân viên trên Alumdoor chỉ thấy 5 field nghiệp vụ đã chốt.
- Không còn yêu cầu Công ty/Chi nhánh/Phòng ban/Chức danh/Cost Center khi tạo Employee.
- `Tài khoản đăng nhập` là Link tới `User`, không phải text tự do.
- SĐT và tài khoản ngân hàng hiển thị được cho role vận hành có quyền level 1.
- Role `Employee` không được mở rộng quyền đọc dữ liệu ngân hàng.
- Shared HRM không thay đổi.

## Phạm vi chưa thay đổi

DocType `Attendance` vẫn giữ contract hiện hành trong slice này. Yêu cầu hiện tại là làm hồ sơ Nhân viên đủ nhẹ để phục vụ chấm công; không tự suy thêm chính sách ca, giờ vào/ra hoặc trạng thái công khi người dùng chưa chốt chúng.

## Release gate

Đây là thay đổi metadata/quyền tenant, không phải UI-only. Theo quy ước dự án: tạo branch + PR và dừng trước merge/apply production để xin xác nhận rõ ràng. Không deploy Worker, không đổi DNS/secret và không tạo dữ liệu nhân viên giả để smoke test.
