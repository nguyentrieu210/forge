# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

## Chống lặp

- Một SHA chỉ có một validation path chính theo blast radius.
- Gate đã PASS trên đúng SHA không chạy lại nếu input/dependency/config không đổi.
- Không build lại cùng SHA ở PR và release nếu artifact đã có thể reuse.
- Không tách lint/test/typecheck/build thành nhiều workflow nếu có thể gom vào một pipeline chính.
- Commit mới chỉ rerun gate bị ảnh hưởng bởi diff mới.
- Retry flaky/hạ tầng ở bước lỗi; không mặc định rerun cả pipeline.

## FAST

Dùng cho UI/presentation nhỏ, không đụng business logic, API, permission, tenant, data hoặc schema.

`branch -> sửa -> diff -> commit -> push`

Không bắt buộc PR, full test, lint, typecheck, build hoặc CI. Nếu workflow cần install/build/stage để tạo artifact thì đó là packaging.

`hotfix/ui-*` hợp lệ có thể tự deploy production theo workflow đã thiết lập.

## STANDARD

Dùng cho CRUD, API và product logic thông thường.

`branch -> code -> targeted check -> commit -> push -> merge/release theo nhu cầu`

- Chỉ chạy validation trực tiếp liên quan đến phần sửa.
- PR/CI không mặc định bắt buộc nếu branch protection và scope không yêu cầu.
- Nếu cần CI, ưu tiên một workflow chính thay vì nhiều workflow trùng nhau.
- Build chỉ khi cần compile/bundle/artifact; release reuse artifact đúng SHA thay vì build lại.

## CRITICAL

Dùng cho accounting, tiền, công nợ, inventory, costing, manufacturing, auth, permission, tenant, migration hoặc production data.

`branch -> code -> regression/integration/data-integrity/security -> validation cần thiết -> PR -> required CI -> merge`

CRITICAL vẫn áp dụng chống lặp: gate đã PASS đúng SHA không chạy lại nếu điều kiện không đổi.

Không hạ CRITICAL xuống FAST để tiết kiệm thời gian.

## Production boundary

Không tự đổi DNS/secrets, destructive migration hoặc customer data. Production deploy chỉ chạy khi user yêu cầu rõ hoặc qua automation fast lane mà user đã chủ động thiết lập.

## Evidence

Chỉ báo gate thực tế đã chạy. FAST/STANDARD không bị coi là chưa hoàn thành chỉ vì gate không liên quan là `NOT RUN`.

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential/token hoặc generated artifact không thuộc source control.
