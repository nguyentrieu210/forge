# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

`RUNBOOK.md` là quy tắc vận hành canonical. File này mô tả ranh giới giao hàng và phát hành.

## Risk tier quyết định delivery gate

Mỗi thay đổi phải được phân loại trước khi chọn validation/release path:

- `FAST`: presentation/UI nhỏ, không đổi business logic, API contract, permission, tenant, data hoặc schema.
- `STANDARD`: CRUD, API hoặc product behavior thông thường.
- `CRITICAL`: accounting, cash, AR/AP, inventory, costing, manufacturing, auth, permission, tenant isolation, migration, destructive state hoặc production data.

Không dùng một full pipeline cố định cho cả ba nhóm.

## FAST

Luồng mặc định:

`branch -> sửa -> review diff -> kiểm tra tối thiểu phần bị tác động -> commit -> push -> deploy khi được yêu cầu`

Không bắt buộc full test suite, full lint, full typecheck, full build hoặc chờ required CI nếu thay đổi thực tế vẫn nằm trong phạm vi `FAST`.

Nếu build/install/stage là bước bắt buộc để tạo artifact deploy thì đó là packaging, không phải quality gate.

## STANDARD

Luồng mặc định:

`branch -> code -> test liên quan -> typecheck/lint/build phù hợp -> PR -> CI phù hợp -> merge -> production khi được yêu cầu`

Chỉ chạy validation có liên quan đến blast radius thực tế; không chạy module không liên quan để đủ nghi thức.

## CRITICAL

Luồng mặc định:

`branch -> code -> regression/integration/data-integrity/security checks -> typecheck/lint/build -> PR -> required CI -> merge -> production khi được yêu cầu`

Không hạ `CRITICAL` xuống `FAST` chỉ vì cần phát hành nhanh.

## UI hotfix trực tiếp

Khi user yêu cầu sửa UI nhỏ và phát hành nhanh, dùng `.github/workflows/hotfix-ui-one-click.yml`.

Luồng:

`checkout branch -> pnpm install -> build MetaForge -> stage client bundle -> wrangler deploy Gateway production`

Không có pre-deploy validation trong lane này. Cụ thể không chạy lint, test, typecheck, dry-run, smoke test, scope guard hoặc PR reconcile tự động.

Lý do giữ `install`, `build` và `stage`: đây là các bước tạo bundle và đóng bundle vào Gateway trước khi Cloudflare có thể deploy.

Lane này chỉ dành cho `FAST`. Nếu thay đổi đụng backend, schema, migration, data, accounting, warehouse/inventory state, auth/permission/tenant, secrets, DNS hoặc business rule production thì phải nâng lên `STANDARD` hoặc `CRITICAL`.

## Production authorization

Chỉ chạy workflow production khi user yêu cầu rõ. Không tự deploy chỉ vì workflow đã tồn tại.

Không tự sửa production secrets/DNS, xoá Cloudflare resource, chạy destructive migration hoặc mutate customer data.

## Evidence

Chỉ báo đúng những gì thực tế đã chạy. Gate không chạy phải ghi `NOT RUN`, không suy diễn PASS.

Với `FAST`, việc một gate là `NOT RUN` không tự động đồng nghĩa task chưa hoàn thành nếu gate đó không phù hợp blast radius.

## File cấm commit

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
