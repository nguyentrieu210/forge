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

## 4. Luồng bình thường

Với feature, backend, nghiệp vụ, data, migration, accounting, inventory, manufacturing hoặc thay đổi có rủi ro:

`branch -> code -> test/typecheck/build phù hợp -> PR -> required CI -> merge -> release khi được yêu cầu`

## 5. UI hotfix trực tiếp

Dùng cho thay đổi UI nhỏ khi user muốn phát hành nhanh và chấp nhận bỏ toàn bộ validation tự động trước deploy.

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

Không dùng lane này nếu thay đổi có backend, schema, migration, data, accounting, warehouse, production business rule, secrets hoặc DNS. Các thay đổi đó quay lại luồng bình thường.

## 6. Production boundary

Không tự deploy production nếu user chưa yêu cầu rõ. UI hotfix workflow tồn tại không đồng nghĩa AI được phép tự chạy production.

Không tự sửa production secrets/DNS, xoá resource, chạy destructive migration hoặc mutate customer data.

## 7. File cấm commit

Không commit `.env`, secrets, `server/work/`, `tmp/`, backup, credential, cookie/token hoặc generated artifact không thuộc source control.

## 8. Kết thúc một đợt làm việc

Cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, và `AI_HANDOFF.md` khi có quyết định kỹ thuật quan trọng. Báo branch, commit SHA, PR/merge SHA, file sửa, test/build/CI đã chạy hoặc không chạy, rủi ro còn lại, việc user cần làm và việc AI làm tiếp.
