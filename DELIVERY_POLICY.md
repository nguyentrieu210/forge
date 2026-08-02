# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

`RUNBOOK.md` là quy tắc vận hành canonical. File này mô tả ranh giới giao hàng và phát hành.

## Luồng mặc định

Với thay đổi code sản phẩm thông thường:

`branch -> code -> validation phù hợp -> PR -> required CI -> merge -> production khi được yêu cầu`

Merge và production deploy là hai ranh giới riêng.

## UI hotfix trực tiếp

Khi user yêu cầu sửa UI nhỏ và phát hành nhanh, dùng `.github/workflows/hotfix-ui-one-click.yml`.

Luồng:

`checkout branch -> pnpm install -> build MetaForge -> stage client bundle -> wrangler deploy Gateway production`

Không có pre-deploy validation trong lane này. Cụ thể không chạy lint, test, typecheck, dry-run, smoke test, scope guard hoặc PR reconcile tự động.

Lý do giữ `install`, `build` và `stage`: đây không phải quality gate mà là các bước tạo bundle và đóng bundle vào Gateway trước khi Cloudflare có thể deploy.

Lane này chỉ dành cho UI nhỏ. Nếu thay đổi đụng backend, schema, migration, data, accounting, warehouse/inventory state, secrets, DNS hoặc business rule production thì phải dùng luồng bình thường.

## Production authorization

Chỉ chạy workflow production khi user yêu cầu rõ. Không tự deploy chỉ vì workflow đã tồn tại.

Không tự sửa production secrets/DNS, xoá Cloudflare resource, chạy destructive migration hoặc mutate customer data.

## Evidence

Với direct UI hotfix, chỉ được báo đúng những gì thực tế đã chạy. Nếu không chạy lint/test/typecheck/smoke thì ghi `NOT RUN`, không suy diễn PASS.

## File cấm commit

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.
