# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho code, branch, PR, CI, merge và release.

## 1. Trước khi làm

- Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` khi task có nghiệp vụ/rủi ro hoặc cần tiếp tục công việc cũ.
- Task mới không code trực tiếp trên `main`; mở branch riêng.
- Không hỏi lại thứ có thể tự xác định từ GitHub.
- Không kiểm tra lặp cùng một trạng thái nếu chưa có commit/SHA/scope thay đổi.

## 2. Nguyên tắc chống lặp

Một SHA chỉ cần một validation path đủ cho blast radius của nó.

- Không build lại cùng SHA chỉ vì chuyển từ local/PR sang release nếu artifact đã hợp lệ và có thể reuse.
- Không chạy cùng test/typecheck/lint nhiều lần trên cùng SHA nếu input, dependency và config không đổi.
- Không mở nhiều workflow riêng cho những gate có thể chạy chung trong một workflow/job pipeline.
- Ưu tiên một workflow chính theo task; workflow khác chỉ chạy khi kiểm tra khác bản chất hoặc là production deploy.
- Nếu CI đã xác nhận đúng SHA thì không chạy lại thủ công chỉ để có thêm bằng chứng.
- Nếu một bước fail do hạ tầng/flaky, retry đúng bước cần thiết; không chạy lại toàn bộ pipeline trừ khi dependency của bước đó thay đổi.
- Commit mới chỉ chạy lại gate bị ảnh hưởng bởi diff mới; không mặc định chạy lại mọi thứ.

## 3. Chọn mức xử lý

Mặc định chọn mức nhẹ nhất phù hợp blast radius.

### FAST

Dùng cho CSS, text, spacing, icon, layout, print UI nhỏ hoặc thay đổi thuần hiển thị.

`branch -> sửa -> diff -> commit -> push`

Nếu là `hotfix/ui-*` hợp lệ thì push có thể tự deploy theo workflow hiện có.

Không bắt buộc PR, full test, lint, typecheck, build, CI hoặc cập nhật status cho từng chỉnh sửa nhỏ. Build/install/stage nếu workflow cần để tạo artifact chỉ là packaging.

Nếu phát hiện chạm business logic, API, data, permission, tenant hoặc schema thì nâng mức.

### STANDARD

Dùng cho CRUD, API và logic sản phẩm thông thường.

Mặc định:

`branch -> code -> targeted check -> commit -> push -> merge/release theo nhu cầu`

- Chỉ chạy 1 nhóm kiểm tra trực tiếp liên quan đến phần sửa; không mặc định full test + typecheck + lint + build.
- PR chỉ bắt buộc khi branch protection, review hoặc scope thay đổi cần nó; không dùng PR như nghi thức cho mọi sửa nhỏ.
- CI nếu cần phải gom gate liên quan vào một workflow chính thay vì kích nhiều workflow trùng chức năng.
- Build chỉ chạy khi thay đổi có thể ảnh hưởng compile/bundle hoặc cần artifact. Không build lại cùng SHA ở release nếu artifact có thể reuse.
- Test đã PASS trên đúng SHA thì release không chạy lại test đó.

### CRITICAL

Dùng cho accounting, tiền, công nợ, kho, giá vốn, manufacturing/costing, auth, permission, tenant isolation, migration, destructive state hoặc production data.

`branch -> code -> regression/integration/data-integrity/security -> validation cần thiết -> PR -> required CI -> merge`

CRITICAL vẫn phải đủ bằng chứng correctness, nhưng cũng áp dụng chống lặp: cùng SHA không chạy lại gate đã PASS nếu input/config không đổi.

Không hạ CRITICAL chỉ để làm nhanh.

## 4. Production

- Không tự deploy production, đổi DNS/secrets, chạy destructive migration hoặc mutate customer data nếu user chưa yêu cầu rõ, ngoại trừ automation production đã được user chủ động thiết lập cho đúng fast lane.
- Release ưu tiên reuse artifact đã build/validated từ đúng SHA thay vì build lại.
- Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential/token hoặc generated artifact không thuộc source control.

## 5. Khi dừng

Với STANDARD/CRITICAL hoặc thay đổi kỹ thuật quan trọng: cập nhật status/handoff khi có thông tin lâu dài cần lưu và báo branch, SHA, validation, rủi ro.

Với FAST nhỏ: chỉ báo branch, SHA, thay đổi và deploy state; không tạo thêm nghi thức tài liệu.
