# Forge CI/CD Runbook for AI Agents

Ngày cập nhật: **2026-07-31**.

## 1. Mục đích

Runbook này là quy trình bắt buộc cho mọi AI hoặc kỹ sư sửa code, CI/CD và release trong repository `nguyentrieu210/forge`.

Mục tiêu:

- CI chỉ chạy kiểm tra có liên quan.
- Không nhân bản workflow hoặc build cùng artifact nhiều lần.
- Validation và production release tách biệt tuyệt đối.
- Không deploy, migrate, sửa secret hoặc bật rollout chỉ vì một PR đã xanh.
- Mọi kết luận phải dựa trên GitHub exact HEAD và log thật, không dựa vào chat cũ.

## 2. Nguồn sự thật và bước bắt đầu bắt buộc

Trước mọi đợt làm việc:

1. Kết nối GitHub repository `nguyentrieu210/forge`.
2. Đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`.
3. Đọc runbook này.
4. Kiểm tra default branch hiện tại, working branch, PR head SHA và base SHA.
5. Kiểm tra CI trên exact HEAD. Không tái sử dụng kết quả của commit cũ.
6. Xác định thay đổi thuộc code, CI, release hay tài liệu.
7. Không sửa default trực tiếp. Tạo branch và draft PR, trừ khi người dùng yêu cầu rõ cách khác.

## 3. Kiến trúc workflow chuẩn

Repository chỉ nên có các nhóm workflow sau:

### `PR Validation`

- Check tổng quát bắt buộc cho PR.
- Chạy test, typecheck và build một lần.
- Commit chỉ đổi Markdown, `docs/` hoặc `.github/release/` được phép bỏ job nặng, nhưng workflow phải vẫn trả về kết quả cuối rõ ràng.
- Không chứa deploy, migration, backup hoặc production secret.

### `Business Domain CI`

- Router nhẹ xác định Sales, Purchase, Inventory/Manufacturing hoặc shared core.
- Cài dependency một lần cho run.
- Chỉ chạy focused tests của domain bị ảnh hưởng.
- `PR Validation` vẫn là check tổng quát authoritative.
- Không lặp lại toàn bộ `pnpm test`, `pnpm typecheck`, `pnpm build` nếu PR Validation đã làm.

### `UI Pull Request Validation`

- Chỉ chạy khi thay đổi UI, browser fixtures, auth/session frontend hoặc mã server trực tiếp phục vụ browser smoke.
- Playwright không được chạy cho thay đổi backend không liên quan.
- Không dùng browser QA như một phần của production deploy.

### `Gateway Production Release`

- Chỉ phát hành Gateway/frontend.
- Phải checkout exact verified SHA.
- Phải có explicit release trigger hoặc manual authorization.
- Phải smoke `/health`, `/` và unauthenticated boot.
- Phải thu Worker version ID từ Wrangler provider output.
- Không deploy tenant Worker hoặc migrate D1.

### `Tenant Production Release`

- Chỉ chạy manual `workflow_dispatch`.
- Bắt buộc exact 40-character target SHA và confirmation phrase.
- Trình tự bắt buộc: validate input → checkout exact SHA → backup → upload backup → migration dry-run → migration execute → deploy dry-run → deploy execute → smoke → provider version evidence.
- FIFO hoặc rollout khác giữ disabled trừ khi có approval riêng.

### Workflow tạm

- Chỉ được tạo cho một PR cụ thể khi workflow chuẩn chưa thể biểu diễn gate cần thiết.
- Tên và file phải ghi rõ PR/scope.
- PR body và `NEXT_TASKS.md` phải ghi điều kiện xóa.
- Xóa ngay khi PR hoàn tất hoặc gate được chuyển vào workflow chuẩn.

## 4. Quy tắc chống workflow thừa

Trước khi thêm workflow mới, AI phải trả lời được cả bốn câu:

1. Workflow hiện có nào không thể thực hiện việc này?
2. Check mới có lặp install, test, typecheck hoặc build không?
3. Check name mới có cần branch protection không?
4. Khi nào workflow này được xóa?

Nếu câu 1 không có bằng chứng cụ thể, không tạo workflow mới.

Không được:

- Tạo workflow riêng cho từng feature chỉ để chạy lại full repository test.
- Nhét production release vào PR validation.
- Dùng cả `ci.yml` và `pr-validation.yml` để chạy cùng một bộ lệnh.
- Dùng `paths-ignore` cho một required check nếu việc workflow không xuất hiện có thể làm merge gate treo `Pending`.
- Cài Playwright/Chromium trong workflow không cần browser evidence.
- Build frontend lại trong nhiều workflow trên cùng commit mà không có lý do artifact rõ ràng.

## 5. Bảng định tuyến thay đổi

| Thay đổi | PR Validation | Business Domain CI | UI Browser QA | Release |
|---|---:|---:|---:|---:|
| Markdown/docs | router/result nhẹ | router nhẹ | không | không |
| Sales server/client | đầy đủ | Sales focused | chỉ khi UI/browser liên quan | không |
| Purchase/FIFO | đầy đủ | Purchase focused | chỉ khi UI/browser liên quan | không |
| Inventory/Manufacturing | đầy đủ | Inventory focused | chỉ khi UI/browser liên quan | không |
| Shared package/lockfile | đầy đủ | tất cả domain cần thiết | nếu ảnh hưởng UI/runtime | không |
| Workflow validation | đầy đủ hoặc workflow-specific lint | router theo workflow | chỉ khi sửa UI workflow | không |
| Release trigger | result nhẹ | không | không | workflow release tương ứng |

## 6. Quy trình sửa CI

1. Tạo draft PR riêng cho CI cleanup.
2. Không trộn sửa nghiệp vụ và thay đổi production release trong cùng checkpoint.
3. Giữ tên required check ổn định, đặc biệt `PR Validation`.
4. Dùng concurrency theo PR number và `cancel-in-progress: true` cho validation.
5. Production release dùng concurrency riêng và `cancel-in-progress: false`.
6. Workflow router phải luôn có result job để trả về success/failure rõ ràng khi job nặng bị skip.
7. Sau mỗi thay đổi workflow:
   - đọc lại file từ GitHub;
   - kiểm YAML structure và expression;
   - đẩy commit nhỏ, có mục đích duy nhất;
   - kiểm workflow run trên exact HEAD;
   - đọc đúng failed step và log trước khi sửa tiếp.

## 7. Phân loại trạng thái đỏ

### Code failure

Có checkout và command thật đã chạy; test/typecheck/build trả exit code khác 0.

Hành động: sửa code hoặc test tương ứng.

### Workflow configuration failure

Workflow không parse, expression sai, permission thiếu, action input sai hoặc job dependency sai.

Hành động: sửa workflow; không đổ lỗi cho code nghiệp vụ.

### GitHub pre-run/infrastructure failure

Job không có step, không checkout, log không tồn tại hoặc runner không được cấp.

Hành động:

- ghi rõ không có command nào chạy;
- kiểm Actions settings, billing/spending, repository policy và runner availability;
- không thay đổi code để “chữa” một job chưa từng chạy.

### Cancelled/superseded

Run cũ bị commit mới hủy bởi concurrency.

Hành động: không coi là lỗi. Chỉ exact final HEAD cần PASS.

### Skipped by scope

Router xác định workflow/domain không liên quan.

Hành động: result job phải PASS; không coi skipped focused job là lỗi.

## 8. Quy trình release bắt buộc

Release chỉ được thực hiện khi người dùng yêu cầu rõ ràng.

Trước release:

1. Exact target SHA đã có required CI PASS.
2. PR đã merge hoặc target SHA được phê duyệt riêng.
3. Kiểm Cloudflare Git Build không chạy song song với GitHub release path.
4. Kiểm production secret tồn tại nhưng không in giá trị.
5. Kiểm backup/rollback plan.
6. Với tenant release, kiểm migration và dữ liệu gate tương ứng.
7. Với FIFO, rollout vẫn disabled cho tới approval kích hoạt riêng.

Sau release:

1. Ghi run ID, job ID, target SHA và Worker version ID.
2. Ghi smoke status.
3. Upload evidence đã redacted.
4. Cập nhật `CURRENT_STATUS.md` và `NEXT_TASKS.md`.
5. Không tuyên bố thành công nếu thiếu provider version evidence.

## 9. Quy tắc artifact và secret

Không commit:

- `.env`, `.dev.vars`, token, private key, cookie hoặc session secret;
- `server/work/`, `tmp/`;
- backup SQL;
- browser evidence thô;
- generated reports hoặc build output.

Artifact CI phải có retention hữu hạn và không chứa credential/dữ liệu khách hàng.

## 10. Checklist kết thúc đợt làm việc

Báo cáo bắt buộc:

- Branch và PR.
- Exact final HEAD SHA.
- File thêm/sửa/xóa và lý do.
- Workflow nào chạy, run/job ID và kết quả.
- Test/typecheck/build thực sự đã chạy hay chưa.
- Có hay không deploy, migration, secret change, rollout activation.
- Lỗi còn lại và bước tiếp theo.

Cập nhật bắt buộc:

- `CURRENT_STATUS.md` với trạng thái đã xác minh.
- `NEXT_TASKS.md` với việc còn lại và gate.
- `AI_HANDOFF.md` nếu working branch hoặc kiến trúc vận hành thay đổi đáng kể.

## 11. Nguyên tắc tối hậu

- GitHub là nguồn sự thật.
- Exact HEAD mới là bằng chứng.
- Một trách nhiệm, một workflow.
- Validation không deploy.
- Release không tự kích hoạt vì PR xanh.
- Không sửa production để làm CI đẹp hơn.
- Không biến cảnh báo hạ tầng thành một commit code vô nghĩa.
