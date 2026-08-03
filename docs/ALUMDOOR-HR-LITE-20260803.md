# Alumdoor — Nhân sự tối giản

Ngày: 2026-08-03
Trạng thái: UI-only, giới hạn riêng bề mặt Alumdoor.

## Quyết định nghiệp vụ

Phần Nhân sự của Alumdoor chỉ cần hai nghiệp vụ hiển thị:

1. `Employee` — Nhân viên.
2. `Attendance` — Chấm công.

Không đưa tuyển dụng, nghỉ phép, ca/phân ca, tạm ứng, lương, công tác, đánh giá, đào tạo và các màn HRM mở rộng vào navigation vận hành Alumdoor.

## Cách thực hiện

- Giữ nguyên app HRM dùng chung, gồm đầy đủ metadata, DocType, workflow, home và business context cho các tenant khác.
- Chỉ tại bề mặt Alumdoor, shell nhận diện các nhóm HR (`Nhân sự`, `Vòng đời nhân sự`, `Chấm công & ca`) và chỉ cho hai key `Employee` + `Attendance` đi qua.
- Không xóa dữ liệu, không đổi schema, workflow, permission hay contract backend.
- Catalog/cross-app navigation tiếp tục bị ẩn trên Alumdoor như thiết kế hiện hành.

## Acceptance

- Trên Alumdoor, phần Nhân sự chỉ hiện `Nhân viên` và `Chấm công`.
- Các menu tuyển dụng, nghỉ phép, ca/phân ca, tạm ứng, lương, công tác, đánh giá, đào tạo không xuất hiện trong trải nghiệm Alumdoor.
- App HRM dùng chung vẫn giữ đầy đủ chức năng và cấu trúc navigation ngoài bề mặt Alumdoor.
- Các module Alumdoor khác không thay đổi.

## Audit phạm vi

Bản sửa đầu tiên đã rút trực tiếp manifest HRM dùng chung. Audit sau merge xác định blast radius này không phù hợp với yêu cầu riêng Alumdoor, nên thay đổi đó được đảo lại và chuyển thành filter presentation tại Alumdoor shell.
