# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho code, branch, PR, CI, merge và release.

## 1. Trước khi làm

- Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` khi task có nghiệp vụ/rủi ro hoặc cần tiếp tục công việc cũ.
- Task mới không code trực tiếp trên `main`; mở branch riêng.
- Không hỏi lại thứ tự có thể tự xác định từ GitHub.

## 2. Chọn mức xử lý

Mặc định chọn mức nhẹ nhất phù hợp blast radius.

### FAST

Dùng cho CSS, text, spacing, icon, layout, print UI nhỏ hoặc thay đổi thuần hiển thị.

Luồng:

`branch -> sửa -> xem diff -> commit -> push`

Nếu là `hotfix/ui-*` hợp lệ thì push có thể tự deploy theo workflow hiện có.

Không bắt buộc PR, full test, lint, typecheck, build, CI hoặc cập nhật 3 file status cho từng chỉnh sửa nhỏ. Build/install/stage nếu workflow cần để tạo artifact chỉ là packaging.

Nếu phát hiện chạm business logic, API, data, permission, tenant hoặc schema thì nâng mức.

### STANDARD

Dùng cho CRUD, API và logic sản phẩm thông thường.

`branch -> code -> test liên quan -> kiểm tra kỹ thuật phù hợp -> PR/CI phù hợp -> merge`

Không chạy gate không liên quan chỉ để đủ quy trình.

### CRITICAL

Dùng cho accounting, tiền, công nợ, kho, giá vốn, manufacturing/costing, auth, permission, tenant isolation, migration, destructive state hoặc production data.

`branch -> code -> regression/integration/data-integrity/security -> typecheck/lint/build phù hợp -> PR -> required CI -> merge`

Không hạ CRITICAL chỉ để làm nhanh.

## 3. Production

- Không tự deploy production, đổi DNS/secrets, chạy destructive migration hoặc mutate customer data nếu user chưa yêu cầu rõ, ngoại trừ automation production đã được user chủ động thiết lập cho đúng fast lane.
- Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential/token hoặc generated artifact không thuộc source control.

## 4. Khi dừng

Với STANDARD/CRITICAL hoặc thay đổi kỹ thuật quan trọng: cập nhật status/handoff phù hợp và báo branch, SHA, validation, rủi ro.

Với FAST nhỏ: chỉ cần báo branch, SHA, thay đổi đã làm và deploy state; không tạo thêm nghi thức tài liệu nếu không có thông tin lâu dài cần handoff.
