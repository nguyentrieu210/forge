# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

## FAST

Dùng cho thay đổi UI/presentation nhỏ, không đụng business logic, API, permission, tenant, data hoặc schema.

`branch -> sửa -> diff -> commit -> push`

Không bắt buộc PR, full test, lint, typecheck, build hoặc CI. Nếu workflow cần install/build/stage để tạo artifact thì đó là packaging.

`hotfix/ui-*` hợp lệ có thể tự deploy production theo workflow đã thiết lập.

## STANDARD

Dùng cho CRUD, API và product logic thông thường.

`branch -> code -> test liên quan -> validation phù hợp -> PR/CI phù hợp -> merge`

## CRITICAL

Dùng cho accounting, tiền, công nợ, inventory, costing, manufacturing, auth, permission, tenant, migration hoặc production data.

`branch -> code -> regression/integration/data-integrity/security -> validation đầy đủ -> PR -> required CI -> merge`

Không hạ CRITICAL xuống FAST để tiết kiệm thời gian.

## Production boundary

Không tự đổi DNS/secrets, destructive migration hoặc customer data. Production deploy chỉ chạy khi user yêu cầu rõ hoặc qua automation fast lane mà user đã chủ động thiết lập.

## Evidence

Chỉ báo những gate thực tế đã chạy. FAST không bị coi là chưa hoàn thành chỉ vì test/lint/typecheck/build/CI là `NOT RUN`.

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential/token hoặc generated artifact không thuộc source control.
