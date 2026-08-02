# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

Đây là runbook vận hành canonical của repository `nguyentrieu210/forge`.

## 1. Nguồn sự thật

GitHub là nguồn sự thật cho code, branch head, pull request, CI, merge và release evidence.

Không lấy branch, SHA, PR hoặc CI từ lịch sử chat làm trạng thái hiện hành. Mọi SHA/branch ghi trong tài liệu chỉ là snapshot tại thời điểm cập nhật và phải được kiểm tra lại trên GitHub trước khi làm tiếp.

## 2. Thứ tự đọc bắt buộc

Mỗi phiên làm việc đọc theo thứ tự:

1. `RUNBOOK.md`.
2. `CURRENT_STATUS.md`.
3. `NEXT_TASKS.md`.
4. `AI_HANDOFF.md`.
5. `DELIVERY_POLICY.md` khi liên quan release/deploy.

## 3. Bắt đầu một đợt làm việc

Trước khi sửa code hoặc tài liệu:

1. Kiểm tra exact `main` hiện tại trên GitHub.
2. Kiểm tra branch/PR liên quan còn tồn tại và đúng scope.
3. Task mới phải mở branch riêng từ exact current `main`.
4. Không code trực tiếp trên `main`.
5. Phân loại thay đổi thành `FAST`, `STANDARD` hoặc `CRITICAL` trước khi chọn quality gate.

## 4. Quality gate theo rủi ro

Không chạy toàn bộ test/typecheck/lint/build/CI một cách máy móc cho mọi task. Chỉ chạy gate có khả năng phát hiện lỗi do thay đổi hiện tại gây ra, dựa trên blast radius thực tế.

### FAST

Dùng cho thay đổi presentation nhỏ, không đổi contract hay business logic: CSS, spacing, text, icon, layout, print template/UI nhỏ hoặc chỉnh component thuần hiển thị.

Mặc định:

`branch -> sửa -> review diff -> kiểm tra tối thiểu phần bị tác động -> commit -> push -> deploy khi được yêu cầu`

Không bắt buộc full test suite, full lint, full typecheck, full build hoặc chờ required CI chỉ để hoàn tất thay đổi FAST. Nếu cần build để tạo artifact deploy thì build là bước packaging, không được coi là quality gate.

Nếu trong lúc làm phát hiện thay đổi thực tế chạm business logic, API, data, permission hoặc phạm vi lớn hơn dự kiến thì nâng lên `STANDARD` hoặc `CRITICAL` ngay.

### STANDARD

Dùng cho CRUD, API, frontend logic, backend logic thông thường hoặc thay đổi product behavior không thuộc nhóm high-risk.

Mặc định:

`branch -> code -> test liên quan -> typecheck/lint/build phù hợp -> PR -> CI phù hợp -> merge -> release khi được yêu cầu`

Không cần chạy test/module không liên quan chỉ để đủ nghi thức.

### CRITICAL

Dùng cho accounting, thu chi, công nợ, kho, giá vốn, mua/bán hàng có ledger impact, manufacturing/costing, auth, permission, tenant isolation, migration, destructive state transition, secrets hoặc production data.

Mặc định:

`branch -> code -> regression/integration/data-integrity/security checks -> typecheck/lint/build -> PR -> required CI -> merge -> release khi được yêu cầu`

Với `CRITICAL`, correctness và data integrity ưu tiên hơn tốc độ. Bug quan trọng phải có regression protection khi phù hợp.

## 5. UI hotfix trực tiếp

Dùng cho thay đổi `FAST` ở UI khi user muốn phát hành nhanh và chấp nhận bỏ validation tự động trước deploy.

Luồng duy nhất:

`branch -> sửa client -> commit -> Actions -> ALU UI Hotfix - One Click Deploy -> build bundle -> stage bundle -> deploy Gateway production`

Workflow: `.github/workflows/hotfix-ui-one-click.yml`.

Workflow này **không chạy**:

- scope guard;
- lint;
- unit/integration test;
- typecheck;
- Wrangler dry-run;
- smoke test;
- PR reconcile tự động.

Nó chỉ làm các bước kỹ thuật bắt buộc để có artifact chạy được: checkout, cài dependency, build MetaForge UI, stage bundle vào Gateway và chạy `wrangler deploy`.

Không dùng lane này nếu thay đổi có backend, schema, migration, data, accounting, warehouse, production business rule, auth/permission/tenant, secrets hoặc DNS. Các thay đổi đó phải được nâng cấp khỏi `FAST` và quay lại quality gate tương ứng.

## 6. Production boundary

Không tự deploy production nếu user chưa yêu cầu rõ. UI hotfix workflow tồn tại không đồng nghĩa AI được phép tự chạy production.

Không tự sửa production secrets/DNS, xoá resource, chạy destructive migration hoặc mutate customer data.

## 7. File cấm commit

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.

## 8. Kết thúc một đợt làm việc

Cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, và `AI_HANDOFF.md` khi có quyết định kỹ thuật quan trọng. Báo branch, commit SHA, PR/merge SHA, file sửa, quality tier đã chọn, test/build/CI đã chạy hoặc không chạy, rủi ro còn lại, việc user cần làm và việc AI làm tiếp.
