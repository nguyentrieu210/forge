# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

## Nguyên tắc

- GitHub Actions chỉ dùng làm máy build/deploy, không làm CI phát triển tự động.
- Validation chạy local theo blast radius.
- Không build/test/lint/typecheck lặp cùng SHA nếu input/dependency/config không đổi.
- Không mở nhiều workflow riêng cho cùng một release path.

## UI AUTO DEPLOY FAST PATH

Mọi task UI-only dùng branch `hotfix/ui-*`, `fix/ui-*`, `feat/ui-*` hoặc `refactor/ui-*`.

Push có `client/**` tự động build và deploy Gateway production. Không cần PR hoặc bấm Actions.

Pipeline bắt buộc:

`shallow checkout -> push-file guard -> cached install -> runtime + warehouse mobile build -> stage -> Gateway deploy -> health + exact-release smoke`

Quy tắc:

- Chỉ trigger trên `push`, không trigger deploy trên `pull_request`.
- Không fetch toàn history/main và không dùng stale-main ancestor check trong deploy path.
- Guard đọc file của chính push event; file ngoài `client/**` và docs vận hành allowlist phải fail closed.
- Không build toàn MetaForge monorepo; chỉ build artifact mà Gateway thực sự stage.
- Push mới cùng UI branch hủy run cũ đang chạy.
- Deploy chỉ DONE khi `/health` PASS và `/release.json` trả đúng `TARGET_SHA` + `bundleHash`.
- Scope chạm backend/API/data/schema/permission/tenant/accounting/inventory/business logic thì không được dùng UI lane.

Push đúng UI lane được coi là authorization production do user đã chủ động thiết lập automation này.

## FAST

`UI branch -> sửa -> local diff -> commit -> push -> auto deploy`

Không bắt buộc PR, full test, lint, typecheck hoặc CI.

## STANDARD

`branch -> code -> targeted local check -> commit -> push -> merge/release`

GitHub chỉ build/deploy khi release path được kích hoạt.

## CRITICAL

Accounting, tiền, công nợ, inventory, costing, manufacturing, auth, permission, tenant, migration hoặc production data không được dùng UI auto-deploy lane.

`branch -> code -> regression/integration/data-integrity/security local -> PR -> merge -> explicit release`

## Full production release

Workflow duy nhất `ALU Build and Deploy` hỗ trợ full release thủ công với confirm `alu`:

`build -> backup/migrate -> Tenant -> Alumdoor App -> Gateway -> exact-release smoke`

Không tự đổi DNS/secrets hoặc thực hiện destructive operation ngoài release path đã xác định.
