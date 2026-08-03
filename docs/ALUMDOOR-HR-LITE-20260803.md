# Alumdoor — Nhân sự tối giản

Ngày: 2026-08-03
Trạng thái: UI metadata hoàn tất trên nhánh `ui/alumdoor-hr-lite-20260803`.

## Quyết định nghiệp vụ

Phần Nhân sự của Alumdoor chỉ cần hai nghiệp vụ hiển thị:

1. `Employee` — Nhân viên.
2. `Attendance` — Chấm công.

Không đưa tuyển dụng, nghỉ phép, ca/phân ca, tạm ứng, lương, công tác, đánh giá, đào tạo và các màn HRM mở rộng vào navigation vận hành Alumdoor.

## Cách thực hiện

- Rút navigation của app HRM xuống đúng `Employee` và `Attendance`.
- Home của app đi thẳng `/app/Employee`.
- Business context chỉ bắt buộc `company`; bỏ `branch` và `fiscal_year` khỏi context bắt buộc của trải nghiệm này.
- Giữ nguyên các DocType/workflow/backend hiện có để không xóa dữ liệu hay phá contract; thay đổi này là presentation/navigation.
- Cho phép group `Nhân sự` đi qua Alumdoor sidebar whitelist để hai mục không bị shell ẩn trên `alu.kairo.vn`.

## Acceptance

- Sidebar/workspace Nhân sự chỉ có `Nhân viên` và `Chấm công`.
- Không còn menu tuyển dụng, nghỉ phép, lương, tạm ứng, công tác, đánh giá, đào tạo trong app HRM.
- Mở app mặc định vào danh sách Nhân viên.
- Alumdoor shell vẫn giữ nguyên các module khác và không mở lại catalog/cross-app workspace đã chủ động ẩn.
