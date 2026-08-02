# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

## Nguyên tắc

- GitHub Actions chỉ dùng làm máy build/deploy, không làm CI phát triển tự động.
- Validation chạy local theo blast radius.
- Không build/test/lint/typecheck lặp cùng SHA nếu input/dependency/config không đổi.
- Không mở nhiều workflow riêng cho cùng một release path.

## UI AUTO DEPLOY

Mọi task UI-only dùng branch `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*` hoặc `refactor/ui-*`.

Push có `client/**` tự động build và deploy Gateway production. Không cần PR hoặc bấm Actions.

UI lane fail closed nếu:

- branch không chứa current `main`;
- không có `client/**`;
- diff chứa file ngoài `client/**` và các docs vận hành cho phép;
- scope thực tế chạm backend/API/data/schema/permission/tenant/accounting/inventory/business logic.

Push đúng UI lane được coi là authorization production do user đã chủ động thiết lập automation này.

## FAST

Dùng cho UI/presentation nhỏ.

`UI branch -> sửa -> local diff -> commit -> push -> auto deploy`

Không bắt buộc PR, full test, lint, typecheck hoặc CI.

## STANDARD

Dùng cho CRUD, API và product logic thông thường.

`branch -> code -> targeted local check -> commit -> push -> merge/release`

GitHub chỉ build/deploy khi release path được kích hoạt.

## CRITICAL

Accounting, tiền, công nợ, inventory, costing, manufacturing, auth, permission, tenant, migration hoặc production data không được dùng UI auto-deploy lane.

`branch -> code -> regression/integration/data-integrity/security local -> PR -> merge -> explicit release`

## Full production release

Workflow duy nhất `ALU Build and Deploy` hỗ trợ full release thủ công với confirm `alu`:

`build once -> backup/migrate -> Tenant -> Alumdoor App -> Gateway -> health smoke`

Không tự đổi DNS/secrets hoặc thực hiện destructive operation ngoài release path đã xác định.
