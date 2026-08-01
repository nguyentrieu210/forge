# Công ty, Chi nhánh, Phòng ban, HRMS và Kế toán Việt Nam

Ngày cập nhật: 2026-08-01  
Nhánh: `feat/company-branch-department-hrms-accounting-20260801`

## Phạm vi đã triển khai

### Cây tổ chức

- `Company` là pháp nhân có sẵn của nền tảng.
- `Branch` thuộc đúng một công ty, có mã duy nhất, trung tâm chi phí, địa chỉ, người phụ trách và cờ đơn vị phụ thuộc.
- `Department` thuộc công ty + chi nhánh, hỗ trợ phòng ban cha, trưởng phòng và trung tâm chi phí.
- Nhân viên bắt buộc có công ty, chi nhánh, phòng ban, mã nhân viên, chức danh, loại lao động và trung tâm chi phí.
- Các chứng từ nghỉ phép, chấm công, phân ca, hợp đồng, cấu trúc lương và tạm ứng đều giữ chiều công ty/chi nhánh; phòng ban được giữ ở các chứng từ cần phân bổ.

### HRMS

- Hồ sơ nhân viên, hợp đồng lao động có duyệt chéo, chấm công, ca làm việc, phân ca, nghỉ phép, tạm ứng.
- Cấu trúc lương theo nhân viên gắn tài khoản chi phí, tài khoản phải trả, trung tâm chi phí và bộ quy tắc lương có hiệu lực theo ngày.
- Phiếu lương và bảng lương dùng DocType chuẩn của nền tảng; ứng dụng HRM mở trực tiếp các màn này và phân quyền Payroll User/Manager.
- Mã nhân viên trong một công ty và chấm công theo nhân viên/ngày có khóa chống trùng ở cơ sở dữ liệu.

### Kế toán Việt Nam

- `VN Accounting Policy` lưu chế độ kế toán, ngày bắt đầu năm tài chính, đồng tiền kế toán/báo cáo, phương pháp VAT, mô hình chi nhánh, quy chế nội bộ và nguồn pháp lý.
- `VN Legal Rule` phiên bản hóa quy tắc theo số văn bản, hiệu lực, đối tượng, biểu mẫu/XML, quy tắc bị thay thế, nguồn và dấu vết phê duyệt.
- `VN Accounting Period` hỗ trợ Open, Soft Closed và Hard Locked theo công ty hoặc chi nhánh.
- `Payroll Accounting Batch` liên kết bảng lương nguồn với tài khoản chi phí/phải trả/PIT/bảo hiểm, cost center, bút toán Journal Entry và rule/approval trace.
- Một bảng lương chỉ được tạo một hồ sơ hạch toán và một bút toán nguồn chưa hủy.
- Trigger D1 chặn submit chứng từ kế toán/kho/lương trong kỳ Hard Locked; kỳ Soft Closed chỉ nhận điều chỉnh có lý do và người duyệt.

## Luồng nghiệp vụ

1. Thiết lập Company → Branch → Department → Cost Center.
2. Tạo Employee, hợp đồng, ca làm và cấu trúc lương.
3. Ghi Attendance/Leave/Advance và duyệt theo vai trò.
4. Tạo Salary Slip → Payroll Entry.
5. Tạo Payroll Accounting Batch từ Payroll Entry, ghi rõ tài khoản, cost center, rule trace và approval trace.
6. Kế toán trưởng duyệt và liên kết Journal Entry cân bằng Nợ/Có.
7. Khóa kỳ: Soft Closed cho phép điều chỉnh đã duyệt; Hard Locked chặn mọi phát sinh thuộc phạm vi kỳ.
8. Hủy/điều chỉnh phải giữ liên kết chứng từ nguồn; không xóa vật lý chứng từ đã ghi sổ.

## Phân quyền cốt lõi

| Vai trò | Phạm vi |
|---|---|
| Employee | Xem hồ sơ/hợp đồng của mình, gửi nghỉ phép và tạm ứng |
| HR User | Lập hồ sơ, chấm công, phân ca, hợp đồng nháp |
| HR Manager | Quản trị tổ chức/nhân sự và duyệt hợp đồng/nghỉ phép |
| Payroll User | Chuẩn bị cấu trúc lương, phiếu lương và bảng lương |
| Payroll Manager | Duyệt nghiệp vụ lương, chuyển hồ sơ sang kế toán |
| General Accountant | Chuẩn bị chính sách, quy tắc và hạch toán lương |
| Chief Accountant / Accounts Manager | Duyệt chính sách, khóa kỳ và submit hạch toán |
| System Manager | Quyền cứu hộ nền tảng; mọi thay đổi vẫn có version/audit trail |

## Kiểm thử nghiệm thu

- App source HRM đóng gói: 12 DocType, 3 workflow, 7 role, 19 fixture, 14 nav.
- App source VN Accounting đóng gói: 4 DocType, 1 workflow, 5 role, 8 nav.
- Trùng mã nhân viên trong cùng công ty bị từ chối.
- Trùng chấm công nhân viên/ngày bị từ chối.
- Trùng bảng hạch toán hoặc Journal Entry cho cùng Payroll Entry bị từ chối.
- Hard Locked chặn Journal Entry trong kỳ.
- Soft Closed chặn chứng từ thường và cho phép điều chỉnh khi đủ `approved_adjustment`, `adjustment_reason`, `adjustment_approved_by`.
- Chứng từ ngoài kỳ khóa vẫn ghi nhận được.

## Giả định và điểm cần xác nhận pháp lý

- `need_legal_check=true` cho lựa chọn chế độ kế toán, thuế, PIT, bảo hiểm và hóa đơn điện tử của doanh nghiệp thực tế.
- Với năm tài chính bắt đầu từ 01/01/2026, doanh nghiệp phải đánh giá TT99/2025/TT-BTC; không mặc định dùng TT200 cho go-live mới.
- Doanh nghiệp siêu nhỏ có năm tài chính bắt đầu từ hoặc sau 01/07/2026 phải đánh giá TT58/2026/TT-BTC; TT132 được giữ dưới mã `TT132-legacy` cho dữ liệu/kỳ lịch sử.
- TT99 chỉ điều chỉnh chế độ kế toán; VAT/CIT/PIT/e-invoice/XML phải dùng quy tắc thuế riêng có hiệu lực theo ngày.
- Trước production cần xác nhận: loại hình doanh nghiệp, năm tài chính, chế độ đã lựa chọn, phương pháp VAT, mô hình đơn vị phụ thuộc, chính sách lương/bảo hiểm/PIT, nhà cung cấp hóa đơn điện tử và chữ ký số.
- Tài khoản/statutory forms cụ thể phải được kế toán trưởng hoặc đơn vị tư vấn pháp lý phê duyệt trước khi nạp dữ liệu chính thức.
