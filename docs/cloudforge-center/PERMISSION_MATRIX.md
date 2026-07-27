# PERMISSION MATRIX — CloudForge Center v1

Nguồn: `server/briefs/center.json`. Chữ quyền: `r` đọc · `w` ghi · `c` tạo · `s` submit · `x` cancel
· `a` amend. `r` **tự kéo theo** print/email/report/export.

**KHÔNG có chữ `d`.** Xoá là hành vi hạng "write" trong nhân này (`deleteDocument` xác thực qua đường
ghi), nên `w` đã bao gồm xoá — viết `"rwc"` mà tưởng đã chặn xoá là hiểu sai. Bộ biên dịch brief **từ
chối** chữ `d` để không ai khai một chính sách nền tảng không thi hành.

| DocType | Chủ TT | Quản lý | Lễ tân | Kế toán | Giáo viên | Trợ giảng | Kiểm toán |
|---|---|---|---|---|---|---|---|
| Cơ sở | rwc | rwc | r | r | r | r | r |
| Phòng học | rwc | rwc | r | — | r | r | r |
| Học viên | rwc | rwc | rwc | r | r | r | r |
| Phụ huynh | rwc | rwc | rwc | r | — | — | r |
| Giáo viên | rwc | rwc | r | r | — | — | r |
| Chương trình | rwc | rwc | r | r | r | — | r |
| Gói học | rwc | rwc | r | r | — | — | r |
| Lớp học | rwc | rwc | rwc | r | r | r | r |
| **Ghi danh** | rwcsxa | rwcsxa | rwcs | r | r | — | r |
| **Buổi học** | rwcsxa | rwcsxa | rwcs | r | rwcs | rw | r |
| Điểm danh | rwc | rwc | r | r | rwc | rwc | r |
| **Đơn xin nghỉ** | rwcsxa | rwcsxa | rwcs | r | rwcs | — | r |

## Ai chuyển được trạng thái nào

| Workflow | Hành động | Vai trò | Tự duyệt |
|---|---|---|---|
| Duyệt ghi danh | Gửi duyệt | Lễ tân, Quản lý | — (0→0) |
| | **Duyệt ghi danh** | Quản lý, Chủ TT | **CHẶN** |
| | Từ chối | Quản lý | **CHẶN** |
| | Tạm dừng / Học lại / Kết thúc khoá | Quản lý | tuỳ hướng docstatus |
| Vòng đời buổi học | Mở buổi học | Giáo viên, Quản lý | — (0→0) |
| | **Hoàn thành buổi** | Giáo viên | **CHO PHÉP** (`self`) |
| | Huỷ buổi | Quản lý | **CHẶN** |
| Duyệt đơn xin nghỉ | Gửi duyệt | Lễ tân, Giáo viên | — (0→0) |
| | **Chấp nhận / Từ chối** | Quản lý | **CHẶN** |

"Hoàn thành buổi" là chỗ DUY NHẤT bật `self`, và có lý do: giáo viên đóng buổi học của chính mình
không phải tự duyệt — đó là người duy nhất biết buổi đã dạy xong. Mọi transition tăng docstatus khác
đều chặn tự duyệt theo mặc định của bộ biên dịch.

## Đã kiểm trên tenant sống

`node scripts/verify-center.mjs --origin https://edu.kairo.vn` — **16/16 PASS**, gồm:

- **tiền đề được khẳng định**: tài khoản test THẬT SỰ mang vai trò Giáo viên. Lần chạy đầu, tài khoản
  có `roles: []` nên ba kiểm "teacher không được X" **đỗ giả** — user không vai trò thì bị chặn mọi
  thứ. Khẳng định tiền đề là thứ biến chúng từ trang trí thành bằng chứng.
- giáo viên ĐỌC được học viên (200) nhưng **không tạo được Gói học** (403 *Role is not allowed to
  create Tuition Plan*) và **không sửa được Cơ sở** (403).
- giáo viên **không được mời** hành động "Duyệt ghi danh".

## GAP-1 — chưa có phạm vi theo bản ghi

§12.4 và §12.7 (quản lý cơ sở chỉ thấy cơ sở mình; giáo viên chỉ thấy lớp được giao) **CHƯA đạt**.
DocPerm chặn theo vai trò, không theo hàng. Nền có `metaforge.api.add_user_permission` nhưng cấp tự
động khi phân công lớp là tự động hoá ⇒ cần app Worker. Hiện giáo viên đọc được **mọi** học viên
trong tenant.
