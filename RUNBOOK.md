# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

GitHub là nguồn sự thật cho code, branch, PR, merge và release. GitHub Actions chỉ dùng làm máy build/deploy; validation phát triển chạy local theo blast radius.

## 1. Trước khi làm

- Đọc `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` khi task có nghiệp vụ/rủi ro hoặc cần tiếp tục công việc cũ.
- Task mới không code trực tiếp trên `main`; mở branch riêng.
- Không hỏi lại thứ có thể tự xác định từ GitHub.
- Không kiểm tra lặp cùng một trạng thái nếu chưa có commit/SHA/scope thay đổi.

## 2. UI AUTO DEPLOY — fast path mặc định

Mọi task chỉ sửa giao diện phải dùng một trong các branch:

- `hotfix/ui-*`
- `fix/ui-*`
- `feat/ui-*`
- `refactor/ui-*`

Khi push có `client/**`, GitHub chỉ làm đúng pipeline deploy:

`shallow checkout -> guard file của push -> restore cache/install -> build runtime + warehouse mobile -> stage -> deploy Gateway -> exact-release smoke`

Quy tắc:

- Không chạy workflow trên `pull_request`; push UI branch là trigger duy nhất.
- Không fetch toàn bộ history/branch và không bắt branch phải chứa exact current `main` chỉ để deploy UI.
- Guard đọc chính danh sách file của push event; push có file ngoài `client/**` và docs vận hành allowlist thì fail closed.
- Không build toàn MetaForge monorepo. Chỉ build dependency graph của `runtime` và warehouse mobile bundle mà Gateway thực sự stage.
- Push mới trên cùng UI branch hủy run cũ đang chạy để tránh queue/deploy artifact cũ.
- Không test/lint/typecheck riêng trên GitHub. TypeScript compile nằm trong build artifact khi package cần nó.
- Sau deploy phải `/health` PASS và `/release.json` trả đúng `TARGET_SHA` + `bundleHash` mới được coi là lên production thật.

Ngoài `client/**`, UI push chỉ được phép kèm: `RUNBOOK.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`, `DELIVERY_POLICY.md`.

Nếu phát hiện backend, API, schema, migration, permission, tenant, accounting, inventory hoặc business logic thì không dùng UI lane.

Push đúng UI lane là production authorization do user đã chủ động thiết lập automation này.

## 3. Chọn mức xử lý

### FAST

CSS, text, spacing, icon, layout, print UI nhỏ hoặc thay đổi thuần hiển thị:

`UI branch -> sửa -> diff local -> commit -> push -> auto deploy`

Không bắt buộc PR, full test, lint, typecheck hoặc CI.

### STANDARD

CRUD, API và logic sản phẩm thông thường:

`branch -> code -> targeted local check -> commit -> push -> merge/release theo nhu cầu`

GitHub không chạy CI phát triển.

### CRITICAL

Accounting, tiền, công nợ, kho, giá vốn, manufacturing/costing, auth, permission, tenant isolation, migration, destructive state hoặc production data:

`branch -> code -> regression/integration/data-integrity/security local -> validation cần thiết -> PR -> merge -> explicit release`

Không dùng UI auto-deploy lane cho CRITICAL.

## 4. Full ALU deploy

Full release Tenant + Alumdoor App + Gateway chỉ chạy thủ công bằng workflow `ALU Build and Deploy` với confirm `alu`.

`checkout -> install -> build once -> backup/migrate -> deploy Tenant -> deploy Alumdoor App -> deploy Gateway -> exact-release smoke`

Không tự đổi DNS/secrets. Destructive migration hoặc production data mutation ngoài pipeline chuẩn vẫn cần yêu cầu rõ.

## 5. Khi dừng

STANDARD/CRITICAL hoặc quyết định kỹ thuật lâu dài: cập nhật status/handoff khi cần.

FAST UI nhỏ: báo branch, SHA, thay đổi và deploy state; không tạo thêm nghi thức tài liệu.
