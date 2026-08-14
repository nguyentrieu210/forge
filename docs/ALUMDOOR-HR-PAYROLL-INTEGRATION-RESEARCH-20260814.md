# AlumDoor HR Lite — Audit và nghiên cứu kết nối chấm công, lương, tài khoản

- Ngày audit: 2026-08-14
- Trạng thái cổng: P1 Research — chờ duyệt phạm vi trước khi cập nhật BRD
- Mục tiêu: hoàn thiện một luồng HR đơn giản cho doanh nghiệp nhỏ, không dùng Phòng ban, tăng ca chính sách 50.000 VND/giờ, phân quyền an toàn theo tài khoản nhân viên.
- Kế thừa: `ALUMDOOR-HR-PAYROLL-LITE-*` ngày 2026-08-13; tài liệu này chỉ ghi delta sau khi audit code, UI chạy thật và nguồn bên ngoài.

## 1. Kết luận điều hành

Các phần lõi đã tồn tại nhưng chưa nối kín. Nhân viên Lite đã còn ba trường; hồ sơ lương và máy tính lương V2 đã có; phiếu lương cá nhân đã lọc theo `Employee.user_id`; dịch vụ RBAC đã có giao dịch nguyên tử, audit và thu hồi phiên đăng nhập. Tuy nhiên, chủ doanh nghiệp chưa thể cấp hoặc gắn tài khoản ngay từ nhân viên; màn cấp tài khoản bắt tự đặt mật khẩu và chọn giữa hàng chục vai trò kỹ thuật; màn chấm công quản lý chưa tách chắc chắn khỏi màn tự phục vụ; lương Lite còn phụ thuộc cấu hình Salary Structure/Assignment ẩn; và cấu hình tổ chức chỉ chạy khi hệ thống suy ra đúng duy nhất một Công ty/Nơi làm việc.

Khuyến nghị là nâng cấp theo một luồng duy nhất:

`Thêm nhân viên → Cấp/gắn tài khoản → Chấm công → Xử lý ngoại lệ → Tính thử → Chốt lương → Đã trả → Nhân viên tự xem`.

Không mở rộng thành HRM đầy đủ. Không đưa Phòng ban, chức danh, trung tâm chi phí, công thức lương, vai trò kỹ thuật hoặc cấu hình ERPNext lên giao diện Lite.

## 2. Audit hệ thống hiện tại

| Hạng mục | Hiện trạng | Mức | Quyết định đề xuất |
|---|---|---:|---|
| Nhân viên Lite | Tạo bằng Họ tên, SĐT, Ngày vào làm; trusted coordinator tự gán dữ liệu kỹ thuật | Đạt nền | Giữ đúng ba trường; thêm trạng thái tài khoản và mức lương trên từng dòng |
| Liên kết tài khoản | `Employee.user_id` đã unique nhưng chưa có action cấp/gắn trong HR Lite | P0 | Một action `Cấp tài khoản`; cho phép gắn tài khoản có sẵn; giao dịch phải atomically tạo User + role preset + bind Employee |
| Phiếu lương cá nhân | API chỉ trả slip submitted/approved/paid của Employee nối đúng tài khoản; UI hiện lỗi vì Dev User không có Employee | Đạt cơ chế, lỗi kết nối | Hoàn thiện onboarding và màn trạng thái; không cho chọn Employee từ client |
| Tự xem chấm công | Correction tự tìm Employee theo tài khoản, nhưng API `attendance.today/month` hiện nhận employee tùy chọn và có thể trả toàn bộ | P0 | Tách endpoint self và manager; self luôn resolve server-side từ session; deny-by-default |
| Cấp mật khẩu | UI hiện yêu cầu chủ tự nhập mật khẩu, hiển thị rõ để chép cho nhân viên; schema chưa có bắt đổi lần đầu | P0/P1 | Hệ thống sinh mật khẩu tạm ngẫu nhiên, chỉ hiện một lần, bắt buộc đổi ở đăng nhập đầu; đổi role/khóa tài khoản tiếp tục thu hồi phiên |
| Mẫu vai trò | UI hiện liệt kê hàng chục role ERP/kỹ thuật | P1 | HR Lite chỉ hiển thị 3 preset: Nhân viên, Quản lý chấm công, Phụ trách lương; Chủ xưởng do chủ sở hữu quản lý |
| Hồ sơ lương | Pay Profile Lite có version và submit; UI đã đơn giản | Đạt nền | Lưu hồ sơ lương đồng thời tạo/cập nhật canonical Salary Structure Assignment ở phía server |
| Tính lương | V2 dùng số nguyên VND, lương theo công và 50.000 VND/giờ OT; test sàn pháp lý có | Đạt nền, thiếu preflight | Thêm preflight theo từng nhân viên; không cho chốt khi thiếu công, công lỗi, hồ sơ lương hoặc sàn OT |
| Tăng ca 50.000 | Chính sách cố định đã khóa ở contract và snapshot; engine chặn khi thấp hơn sàn luật | Đạt | Giữ 50.000 VND/giờ; chỉ phút OT đã duyệt được trả; nếu dưới sàn áp dụng thì chặn chốt và nêu rõ chênh lệch |
| Cấu hình tổ chức | Lite yêu cầu suy ra duy nhất một Company và một Branch; dữ liệu local hiện chưa sẵn sàng | P1 | Cài đặt lần đầu chọn một Công ty và một Nơi làm việc, sau đó ẩn khỏi nghiệp vụ hằng ngày |
| Kỳ lương | UI có Tính thử → Chốt → Đã trả nhưng dữ liệu rỗng; `Đã trả` mới là trạng thái nghiệp vụ | P1 | Giữ ba bước; thêm danh sách blocker, bảng kiểm tra từng nhân viên, tham chiếu thanh toán; không gọi đó là bút toán kế toán |
| Dữ liệu nhạy cảm | Generic Employee có nhiều trường permlevel; HR Lite chưa có field-level projection riêng cho mọi persona | P0/P1 | Endpoint Lite trả allowlist field; nhân viên không được list Employee, bảng lương hoặc dữ liệu nhạy cảm của người khác |
| Nhật ký | RBAC audit và trace lương đã có nền | Đạt nền | Ghi thêm account bind/unbind, preset role, finalize/paid và mọi lần xem/xuất dữ liệu lương nhạy cảm |

## 3. Phạm vi P0 được đề xuất cho bản nâng cấp

### 3.1 Chủ xưởng

- Danh sách nhân viên: Họ tên, SĐT, Ngày vào làm, Tài khoản, Mức lương, Trạng thái công tháng.
- `Cấp tài khoản`: mặc định tên đăng nhập là SĐT chuẩn hóa; sinh mật khẩu tạm; chọn một preset tiếng Việt; liên kết duy nhất một User ↔ một Employee.
- Có thể `Gắn tài khoản có sẵn`, `Đặt lại mật khẩu`, `Khóa tài khoản`; khóa phải thu hồi mọi phiên.
- Khi nhân viên nghỉ việc, hỏi xác nhận khóa tài khoản, không tự làm âm thầm.

### 3.2 Nhân viên

- Chỉ xem công hôm nay/tháng của mình, gửi yêu cầu sửa công, xem trạng thái duyệt.
- Chỉ xem phiếu lương của mình sau khi kỳ đã chốt; thấy công, OT, lương theo công, phụ cấp, khấu trừ và thực nhận.
- Không thấy menu quản lý nhân viên, hồ sơ lương, người dùng, bảng lương toàn công ty hoặc role kỹ thuật.

### 3.3 Quản lý chấm công

- Xem bảng công toàn Nơi làm việc, lọc bằng tên/SĐT, xử lý thiếu vào/ra và duyệt yêu cầu sửa.
- Không thấy lương cơ bản, phụ cấp, thuế, bảo hiểm, ngân hàng hoặc phiếu lương.

### 3.4 Phụ trách lương

- Xem hồ sơ lương, preflight và tính thử.
- Mặc định không quản lý tài khoản và không sửa công.
- Chốt lương/đã trả chỉ Chủ xưởng; role kỹ thuật Payroll Approver được giữ phía server, không hiện thành lựa chọn khó hiểu.

## 4. Hợp đồng bảo mật tối thiểu

1. Mặc định từ chối; kiểm tra quyền ở mọi request, không dựa vào việc ẩn menu.
2. Self endpoint luôn suy Employee từ `session.user_id`; bỏ qua/không nhận employee id từ trình duyệt.
3. Manager endpoint yêu cầu role rõ ràng và áp scope tenant + nơi làm việc.
4. User–Employee là quan hệ một-một trong tenant; tạo/gắn/role/audit trong một transaction hoặc rollback toàn bộ.
5. Mật khẩu tạm sinh bằng Web Crypto, không dùng `Math.random`, không ghi log, không trả lại lần hai; bắt đổi ở lần đăng nhập đầu.
6. Đổi role, khóa tài khoản, reset mật khẩu đều tăng `session_epoch` và thu hồi phiên.
7. API HR Lite chỉ trả field allowlist; salary, PIT, bảo hiểm, ngân hàng và số định danh là dữ liệu nhạy cảm.
8. Test bắt buộc có gọi API thẳng bằng Nhân viên, Quản lý chấm công, Phụ trách lương và Chủ xưởng.

## 5. Hợp đồng tính lương đơn giản nhưng không đánh đổi tính đúng

- Công thức mặc định: `Lương theo công + Phụ cấp cố định + OT đã duyệt − Tạm ứng − Khấu trừ hợp lệ`.
- OT chính sách: 50.000 VND/giờ, tính theo tổng phút đã duyệt và làm tròn một lần ở cuối.
- 50.000 VND/giờ không được dùng để hạ mức tối thiểu pháp luật. Kỳ vẫn cho tính thử nhưng không được chốt nếu bucket ngày thường/nghỉ/lễ/đêm thấp hơn sàn áp dụng.
- Bảng công có `open` hoặc `exception`, thiếu toàn bộ ngày công, thiếu hồ sơ lương, hoặc có hơn một assignment hiệu lực đều là blocker.
- Phiếu lương lưu snapshot nguồn, phiên bản công thức, hồ sơ lương, attendance và người chốt để tính lại lịch sử không bị đổi kết quả.
- `Đánh dấu đã trả` chỉ là trạng thái vận hành kèm tham chiếu thanh toán; không tự nhận là đã hạch toán sổ cái. Kết nối kế toán là phạm vi riêng nếu sau này được duyệt.

## 6. Nghiên cứu bên ngoài — 5 lớp

### Lớp 1 — Vận hành Việt Nam

| Nguồn | Điều rút ra | Áp dụng |
|---|---|---|
| [MISA — quy trình chấm công tính lương](https://amis.misa.vn/66073/quy-trinh-cham-cong/) | Dữ liệu chấm công cần được tổng hợp, đối chiếu ngoại lệ và xác nhận trước khi lập bảng lương | Dùng preflight và blocker, không tính âm thầm trên công lỗi |
| [MISA Salary Agent](https://amis.misa.vn/salary-agent/) | Chấm công, hồ sơ nhân sự và điều chỉnh thu nhập cần nối trực tiếp vào bảng lương | Một nguồn Employee/Attendance/Pay Profile, không nhập lại ở màn lương |
| [MISA — bảng chấm công](https://amis.misa.vn/80766/cac-ky-hieu-tren-bang-cham-cong/) | Bảng công tháng là căn cứ tính lương nhưng ký hiệu cần tùy theo tổ chức | UI hiển thị trạng thái rõ, thuật ngữ Việt, không ép mã kỹ thuật |

### Lớp 2 — Pháp lý và dữ liệu cá nhân

| Nguồn | Điều rút ra | Áp dụng |
|---|---|---|
| [Chính phủ — Nghị định 13/2023/NĐ-CP](https://vanban.chinhphu.vn/default.aspx?docid=207759&pageid=27160) | Dữ liệu cá nhân phải được bảo vệ và xử lý có kiểm soát | Field projection, self-scope, audit xem/xuất dữ liệu nhạy cảm |
| [Chính phủ — tiền lương làm thêm ngày lễ/Tết](https://xaydungchinhsach.chinhphu.vn/co-phai-bat-buoc-thuong-tet-tien-luong-lam-them-gio-ngay-le-tet-duoc-tinh-the-nao-119240201145549.htm) | Điều 98 đặt mức tối thiểu theo loại ngày; ngày lễ ban ngày ít nhất 300%, chưa kể lương ngày lễ với lao động hưởng lương ngày | 50.000 là chính sách nhưng phải kiểm tra sàn theo bucket trước khi chốt |
| [BHXH Việt Nam — căn cứ đóng theo Luật BHXH 2024](https://baohiemxahoi.gov.vn/tintuc/Pages/hoat-dong-he-thong-bao-hiem-xa-hoi.aspx?CateID=0&ItemID=25395) | Từ 01/07/2025, nhóm lương doanh nghiệp có căn cứ gồm mức lương, phụ cấp và khoản bổ sung thường xuyên, ổn định theo quy định | Dữ liệu bảo hiểm phải là input có phiên bản; không suy đoán từ tổng thực nhận |

### Lớp 3 — Đối thủ và sản phẩm tương tự

| Nguồn | Điều rút ra | Áp dụng |
|---|---|---|
| [Base HRM](https://base.vn/app/hrm) | Sản phẩm nối dữ liệu nhân sự, self-service, phân quyền và tính lương nhưng bề mặt khá rộng | AlumDoor giữ chuỗi kết nối nhưng chỉ lộ tác vụ SME cần hằng ngày |
| [Tanca — chấm công](https://tanca.io/vi/feature/attendance) | Tính lương được lấy từ công đã xác thực; cần xử lý lỗi/duyệt trước khi tính | Chỉ OT và công ở trạng thái đủ điều kiện mới vào payroll |
| [Frappe HR — Employee](https://docs.frappe.io/hr/employee) | User có thể tạo và liên kết với Employee | Tận dụng `Employee.user_id`, không tạo bảng liên kết song song |
| [Frappe HR — Salary Slip](https://docs.frappe.io/hr/salary-slip) | Salary Slip phụ thuộc Employee, Salary Structure và Salary Structure Assignment; có thể tính dựa trên Attendance | Lite tự tạo/cập nhật cấu hình canonical phía sau thay vì bắt SME hiểu các DocType này |
| [Frappe HR — Payroll Entry](https://docs.frappe.io/hr/payroll-entry) | Payroll Entry là điểm xử lý hàng loạt và có bước kiểm tra attendance | Giữ Payroll Entry/Salary Slip làm nguồn chuẩn, thêm lớp Lite orchestration |

### Lớp 4 — Ngôn ngữ người dùng và phản hồi thực tế

| Nguồn | Điều rút ra | Áp dụng |
|---|---|---|
| [App Store — đánh giá Tanca](https://apps.apple.com/vn/app/tanca-ch%E1%BA%A5m-c%C3%B4ng-t%C3%ADnh-l%C6%B0%C6%A1ng/id1370259842?platform=iphone&see-all=reviews) | Phản hồi tích cực nhấn mạnh menu/biểu tượng dễ hiểu; phản hồi tiêu cực nhắc lỗi, layout/chữ và hỗ trợ | Role preset tiếng Việt, luồng ít bước, trạng thái lỗi có hành động sửa, kiểm thử mobile |

### Lớp 5 — Best practice quốc tế và nền tảng

| Nguồn | Điều rút ra | Áp dụng |
|---|---|---|
| [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Least privilege, deny-by-default và kiểm tra quyền ở mọi request | Tách self/manager API và test truy cập ngang tenant/nhân viên |
| [NIST — Role-Based Access Controls](https://csrc.nist.gov/CSRC/media/Projects/Role-Based-Access-Control/documents/ferraiolo-kuhn-92.pdf) | Role nên chứa đúng mức quyền tối thiểu cần cho công việc, và giao dịch phải kiểm tra cả role lẫn user | Preset vai trò ít, self-scope dựa đồng thời role + Employee.user_id |
| [Cloudflare Workers — best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) | Token bảo mật dùng Web Crypto; secret không nằm trong source; production cần logs/traces | Mật khẩu/token tạm sinh an toàn; structured audit/observability, không log bí mật |
| [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) | Structured JSON giúp truy tìm sự cố theo trường | Log theo trace id, actor, employee, action, kết quả; tránh field lương/PII thô |

## 7. Bằng chứng kiểm tra cục bộ

- Đã mở trực tiếp các màn ở `127.0.0.1:5174`: Nhân viên, Bảng công, Tính lương, Phiếu lương của tôi và Trung tâm phân quyền.
- `Phiếu lương của tôi` trả đúng lỗi kết nối: tài khoản phải gắn duy nhất một Employee.
- Form `Thêm người dùng` hiện yêu cầu mật khẩu rõ và hiển thị toàn bộ role kỹ thuật.
- `Tính lương` hiện không thao tác được khi tổ chức chưa sẵn sàng và chưa có hồ sơ lương/công.
- Bộ test hiện tại cho employee/pay-profile/payroll Lite: 17/17 đạt. Điều này xác nhận nền tính V2 và sàn OT đang ổn, nhưng chưa có test tích hợp account binding/self-attendance/role preset.

## 8. Ngoài phạm vi P0

- Phòng ban, chức danh, KPI, tuyển dụng, đánh giá nhân sự.
- Máy chấm công vân tay/Face ID mới; giữ QR và nguồn attendance hiện có.
- Tự động gửi SMS/email mời tài khoản nếu chưa có dịch vụ gửi được duyệt.
- Tự động hạch toán GL, Payment Entry hoặc chuyển khoản ngân hàng.
- Công cụ viết công thức lương tự do; chỉ dùng công thức đã kiểm thử và cấu hình đơn giản.

## 9. Cổng duyệt P1

Nếu phạm vi trên được duyệt, bước tiếp theo là cập nhật BRD hiện có thành bản tích hợp, chốt persona/permission matrix, acceptance criteria và danh sách màn. Chưa sửa source hoặc migration cho phần account/permission mới trước khi cổng này được duyệt.
