# FORGE RUNBOOK

Ngày cập nhật: **2026-08-02**.

Đây là runbook vận hành canonical của repository `nguyentrieu210/forge`.

## 1. Nguồn sự thật

GitHub là nguồn sự thật cho code, branch head, pull request, CI, merge và release evidence.

Không lấy branch, SHA, PR hoặc CI từ lịch sử chat làm trạng thái hiện hành. Mọi SHA/branch ghi trong tài liệu chỉ là snapshot tại thời điểm cập nhật và phải được kiểm tra lại trên GitHub trước khi làm tiếp.

## 2. Thứ tự đọc bắt buộc

Mỗi phiên làm việc đọc theo thứ tự:

1. `RUNBOOK.md` — quy tắc vận hành ổn định.
2. `CURRENT_STATUS.md` — snapshot trạng thái hiện tại đã xác minh.
3. `NEXT_TASKS.md` — hàng đợi công việc đang hoạt động.
4. `AI_HANDOFF.md` — ngữ cảnh kỹ thuật cô đọng và các checkpoint quan trọng.

`README.md`, `docs/ROADMAP.md`, tài liệu thiết kế, PR cũ và commit message không phải nguồn live status.

## 3. Bắt đầu một đợt làm việc

Trước khi sửa code hoặc tài liệu:

1. Kiểm tra default branch và exact HEAD hiện tại trên GitHub.
2. Kiểm tra branch được yêu cầu còn tồn tại hay không.
3. Kiểm tra PR đang mở có liên quan và exact PR head.
4. Kiểm tra CI/workflow của exact head cần dùng.
5. Nếu mở task mới, tạo branch riêng từ exact `main` hiện tại, trừ khi user chỉ định base khác.
6. Không tiếp tục một branch cũ chỉ vì branch đó còn được nhắc trong tài liệu hoặc chat.

## 4. Quy tắc branch / PR

- Một epic hoặc một đợt sửa độc lập dùng một branch canonical.
- Không sửa trực tiếp `main` cho công việc mới.
- Không đổi branch head trong lúc exact-head required CI đang queued/in-progress nếu việc đó làm evidence trở nên stale.
- Branch cũ/diverged chỉ dùng làm nguồn tham khảo từng thay đổi đã review; không merge nguyên branch để tiết kiệm thời gian.
- Chỉ kết luận PASS cho exact head đã có evidence tương ứng.

### One-click cho UI hotfix cực nhỏ

Dùng khi thay đổi thực sự chỉ là giao diện nhỏ của Alumdoor và không đụng backend, nghiệp vụ, data, schema, dependency hoặc metadata app.

1. Tạo branch từ exact current `main` với tên `hotfix/ui-<mô-tả>`.
2. Chỉ sửa `client/**`. Ba file `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` được phép đi kèm để giữ handoff.
3. Không dùng lane này nếu có thay đổi `server/**`, migration, brief/app metadata, package/dependency manifest, workflow, secret, DNS hoặc production data.
4. Commit xong, vào Actions → **ALU UI Hotfix - One Click Deploy** → chọn branch → **Run workflow**.
5. Workflow chỉ nhận hotfix nhỏ: current `main` phải là ancestor, tối đa 10 file/300 dòng, bắt buộc có `client/**`.
6. Quick release chỉ chạy `build -> stage -> deploy Gateway -> exact-SHA smoke`. `lint/test/typecheck/dry-run` được bỏ ở production fast path để giảm thời gian; normal PR/CI vẫn chạy sau để reconcile source về `main`.
7. Workflow best-effort tạo hoặc cập nhật PR reconcile sau deploy. Hotfix chỉ closure hoàn chỉnh khi source đã về `main` qua PR hợp lệ.

Mục tiêu là một thao tác người dùng dưới 30 giây. Thời gian máy chạy không cam kết 30 giây vì còn phụ thuộc dependency install, frontend build, GitHub runner và Cloudflare.

Không dùng lane này như lối tắt cho business logic hoặc backend. Nếu scope vượt giới hạn, quay lại flow branch → PR → required CI → merge → release bình thường.

## 5. Kiểm thử và bằng chứng

Luồng bình thường vẫn chạy gate phù hợp với phạm vi thay đổi:

- focused tests;
- test suite liên quan;
- typecheck;
- build;
- required CI / feature workflow / authenticated browser QA khi phạm vi yêu cầu.

Quick UI production lane là ngoại lệ tốc độ có hard scope guard. Build và production smoke là bắt buộc; full lint/test/typecheck được deferred sang PR reconcile, không được ghi là PASS nếu chưa chạy.

Docs-only change có thể không cần chạy test/typecheck/build nếu không chạm executable code; phải ghi rõ `not run — docs-only`.

## 6. Production boundary

Không được tự động:

- deploy Cloudflare hoặc production;
- sửa/đọc giá trị production secret;
- đổi DNS/domain/billing/account ownership;
- xoá Cloudflare resource;
- chạy migration production;
- bật rollout/FIFO production;
- mutate dữ liệu khách hàng.

Các hành động trên chỉ thực hiện khi user yêu cầu rõ cho đúng đợt làm việc và vẫn phải có gate/backup/recovery phù hợp.

Merge code và deploy production là hai authorization boundary riêng. UI hotfix fast lane chỉ được chạy khi user chủ động bấm production workflow; việc tồn tại workflow không tự cấp quyền deploy.

## 7. File và dữ liệu cấm commit

Không commit:

- `.env` hoặc secret;
- `server/work/`;
- `tmp/`;
- backup;
- cookie/token/credential;
- generated evidence;
- build/generated artifact không được repository quản lý.

QA ưu tiên local/ephemeral. Dữ liệu QA phải có lineage/prefix và cleanup được khi acceptance yêu cầu.

## 8. Kết thúc một đợt làm việc

Trước khi kết thúc:

1. Cập nhật `CURRENT_STATUS.md` với trạng thái đã xác minh, branch/PR/SHA/CI cần thiết và lỗi còn lại.
2. Cập nhật `NEXT_TASKS.md`, bỏ task đã hoàn tất khỏi hàng đợi active và chỉ giữ việc kế tiếp có thể hành động.
3. Nếu handoff kỹ thuật thay đổi đáng kể, cập nhật `AI_HANDOFF.md`.
4. Báo rõ file đã sửa và lý do.
5. Báo test/typecheck/build/CI đã chạy hoặc lý do không chạy.
6. Báo commit SHA và PR/merge SHA nếu có.
7. Báo lỗi/rủi ro còn lại.
8. Kết luận rõ việc AI làm tiếp và việc user cần làm.

## 9. Chống tài liệu cũ gây nhiễu

- Không tạo thêm file `*_STATUS.md`, `*_HANDOFF.md`, `*_NEXT.md` nếu nội dung thuộc ba file canonical hiện có.
- Tài liệu lịch sử phải ghi rõ `HISTORICAL` hoặc `NOT LIVE STATUS` ở đầu file.
- Không giữ tên branch cũ trong tài liệu canonical như một chỉ dẫn thực thi.
- Khi phát hiện tài liệu mâu thuẫn với GitHub, ưu tiên GitHub và sửa/xoá tài liệu gây nhiễu trong đợt docs cleanup gần nhất.
