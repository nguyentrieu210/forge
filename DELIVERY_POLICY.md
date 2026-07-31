# Production-first delivery policy

Ngày hiệu lực: **2026-08-01**.

## Mặc định

Mọi yêu cầu sửa hoặc xây dựng code sản phẩm được hiểu là yêu cầu giao hàng hoàn chỉnh:

`code -> test/typecheck/build -> pull request -> required CI -> merge -> deploy production -> production smoke -> cập nhật handoff`

Không dừng lại để hỏi lại ở từng bước. Yêu cầu ban đầu đã là authorization cho merge và deploy production, trừ khi người dùng ghi rõ `code-only`, `không merge`, `không deploy` hoặc giới hạn tương đương.

## Preview và staging

Preview/staging không còn là bước mặc định và không được dùng thay cho sản phẩm thật.

Chỉ dùng preview/staging khi có ít nhất một điều kiện:

1. người dùng yêu cầu rõ;
2. repository/provider bắt buộc;
3. production target hoặc workflow chưa thể xác định từ source và provider;
4. thay đổi có migration, permission, dữ liệu hoặc hạ tầng không thể rollback an toàn;
5. production đang incident và cần môi trường cô lập để chẩn đoán.

Khi điều kiện trên hết, luồng phải tiếp tục tới production; không kết thúc ở preview.

## Gate bắt buộc

- GitHub là nguồn sự thật cho code, SHA, PR và CI.
- Chỉ deploy đúng SHA đã được required checks xác minh.
- Không deploy khi CI đỏ, thiếu, stale, cancelled, conflict hoặc chưa terminal.
- Build, regression và dry-run phải chạy trước live deploy khi target hỗ trợ.
- Production deployment phải trả về target identity, run ID và version/deployment ID.
- Smoke phải bao phủ hành trình người dùng bị thay đổi.
- Nếu smoke fail, release là fail; rollback/forward-fix theo runbook, không tô dashboard thành màu xanh bằng cách bỏ test.

## Tự động hoá

- Validation chạy trên pull request.
- Production secret chỉ được dùng từ trusted workflow/job sau merge hoặc protected ref.
- Khi required checks xanh và PR mergeable, tự merge nếu người dùng không cấm merge.
- Sau merge, workflow theo path tự deploy component liên quan lên production.
- Workflow phải ghi `$GITHUB_STEP_SUMMARY` và upload artifact evidence; không phụ thuộc vào comment PR để kết luận release.

## Target đã biết

### Alumdoor app Worker

- Source: `server/apps-src/alumdoor-worker/**` và dependency server liên quan.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Workflow: `.github/workflows/release-alumdoor-app.yml`.
- Required bindings: `PLATFORM`, `AI`.

Không dùng version của `cloudforge-tenant-alu` hoặc Gateway `/health` làm bằng chứng app Worker đã cập nhật.

### Frontend / MetaForge UI

Không deploy backend Worker để giả vờ rằng frontend đã được phát hành. Trước lần release UI đầu tiên phải xác định đúng Pages/Worker project, production hostname, build mode (`VITE_LIVE`) và authenticated smoke. Sau khi mapping được ghi vào repository, các thay đổi UI phải tự deploy theo cùng policy.

## Ngoại lệ cần lệnh riêng

Không tự suy diễn quyền để:

- sửa hoặc đọc giá trị production secret;
- đổi DNS, domain, billing hoặc account ownership;
- xoá Cloudflare resource;
- bật rollout dữ liệu không thể đảo ngược;
- chạy migration không có backup/recovery;
- bật FIFO production;
- mutate dữ liệu khách hàng ngoài smoke có dữ liệu thử và cleanup rõ ràng.

Đây là ranh giới phá huỷ, không phải vòng approval cho công việc code bình thường.

## File không được commit

- `.env` và secret;
- `server/work/`;
- `tmp/`;
- backup, credential, cookie, token;
- generated evidence hoặc build artifact không được repository quản lý.

## Báo cáo sau mỗi đợt

Báo rõ:

1. file đã sửa và lý do;
2. test, typecheck, build và CI;
3. branch, commit SHA, PR và merge SHA;
4. production workflow run, target, version/deployment ID và URL;
5. smoke result;
6. lỗi/rủi ro còn lại;
7. `Tao cần làm gì` và `Tao làm tiếp`.
