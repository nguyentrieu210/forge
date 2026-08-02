# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho code, branch, PR, merge và release. GitHub Actions chỉ dùng làm máy build/deploy; validation phát triển chạy local theo blast radius.

## 1. Trước khi làm

- Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` khi task có nghiệp vụ/rủi ro hoặc cần tiếp tục công việc cũ.
- Task mới không code trực tiếp trên `main`; mở branch riêng.
- Không hỏi lại thứ có thể tự xác định từ GitHub.
- Không kiểm tra lặp cùng một trạng thái nếu chưa có commit/SHA/scope thay đổi.

## 2. Nguyên tắc chống lặp

Một SHA chỉ cần một validation path đủ cho blast radius của nó.

- Không build lại cùng SHA nếu artifact đã hợp lệ và có thể reuse.
- Không chạy cùng test/typecheck/lint nhiều lần trên cùng SHA nếu input, dependency và config không đổi.
- Không mở nhiều workflow riêng. GitHub Actions chỉ giữ pipeline build/deploy cần thiết.
- Nếu một bước local fail do hạ tầng/flaky, retry đúng bước cần thiết; không chạy lại toàn bộ pipeline nếu dependency không đổi.
- Commit mới chỉ kiểm tra lại phần bị ảnh hưởng bởi diff mới.

## 3. UI AUTO DEPLOY — mặc định cho mọi sửa UI-only

Mọi task chỉ sửa giao diện phải dùng một trong các branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Khi push có thay đổi `client/**`, GitHub tự động:

`checkout -> guard UI-only -> install -> build MetaForge -> stage bundle -> deploy Gateway production -> health smoke`

Không cần mở PR, không cần bấm Actions, không chạy test/lint/typecheck trên GitHub.

Guard bắt buộc:

- Branch phải chứa exact current `main`; branch stale không được deploy.
- Diff so với `main` phải có ít nhất một file `client/**`.
- Ngoài `client/**`, chỉ cho phép các file tài liệu vận hành: `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.
- Nếu phát hiện backend, API, schema, migration, permission, tenant, accounting, inventory hoặc business logic thì auto-deploy UI phải fail closed và task phải chuyển khỏi UI lane.

Đây là automation production đã được user chủ động thiết lập. Vì vậy push đúng UI lane là authorization để build và deploy UI production.

## 4. Chọn mức xử lý

Mặc định chọn mức nhẹ nhất phù hợp blast radius.

### FAST

Dùng cho CSS, text, spacing, icon, layout, print UI nhỏ hoặc thay đổi thuần hiển thị.

`branch UI -> sửa -> diff local -> commit -> push -> auto deploy`

Không bắt buộc PR, full test, lint, typecheck hoặc CI. Build/install/stage trong GitHub chỉ là packaging/deploy.

Nếu phát hiện chạm business logic, API, data, permission, tenant hoặc schema thì nâng mức và không dùng UI auto-deploy lane.

### STANDARD

Dùng cho CRUD, API và logic sản phẩm thông thường.

`branch -> code -> targeted local check -> commit -> push -> merge/release theo nhu cầu`

- Chỉ chạy nhóm kiểm tra trực tiếp liên quan đến phần sửa.
- PR chỉ dùng khi review/merge thực sự cần; không dùng như nghi thức.
- GitHub không chạy CI phát triển; chỉ build/deploy khi được kích hoạt theo release path.
- Build local chỉ khi cần xác minh compile/bundle trước khi push.

### CRITICAL

Dùng cho accounting, tiền, công nợ, kho, giá vốn, manufacturing/costing, auth, permission, tenant isolation, migration, destructive state hoặc production data.

`branch -> code -> regression/integration/data-integrity/security local -> validation cần thiết -> PR -> merge -> explicit release`

Không dùng UI auto-deploy lane cho CRITICAL và không hạ CRITICAL chỉ để làm nhanh.

## 5. Full ALU deploy

Full release Tenant + Alumdoor App + Gateway chỉ chạy thủ công bằng workflow `ALU Build and Deploy` với confirm `alu`.

Pipeline:

`checkout -> install -> build once -> backup/migrate tenant -> deploy Tenant -> deploy Alumdoor App -> deploy Gateway -> health smoke`

Không tự đổi DNS/secrets. Destructive migration hoặc production data mutation ngoài pipeline chuẩn vẫn cần yêu cầu rõ.

## 6. Khi dừng

Với STANDARD/CRITICAL hoặc thay đổi kỹ thuật quan trọng: cập nhật status/handoff khi có thông tin lâu dài cần lưu và báo branch, SHA, validation, rủi ro.

Với FAST UI nhỏ: chỉ báo branch, SHA, thay đổi và deploy state; không tạo thêm nghi thức tài liệu.
