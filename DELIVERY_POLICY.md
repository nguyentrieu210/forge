# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

`RUNBOOK.md` là quy tắc vận hành canonical. File này chỉ mô tả ranh giới giao hàng và phát hành.

## Luồng giao hàng mặc định

Với thay đổi code sản phẩm, luồng mặc định là:

`branch -> code -> focused validation -> test/typecheck/build phù hợp -> pull request -> exact-head required CI -> merge khi được phép`

Không được tự thêm bước deploy production vào authorization mặc định.

**Merge và production deploy là hai ranh giới riêng.** Yêu cầu sửa/xây code không tự động cấp quyền deploy Cloudflare, chạy migration production hoặc thay production state.

## Production chỉ khi có lệnh rõ

Chỉ deploy production khi user yêu cầu rõ trong đợt làm việc hiện tại. Khi được yêu cầu, release vẫn phải:

1. xác định đúng production target và exact SHA;
2. có required CI phù hợp;
3. có backup/recovery trước migration hoặc thay đổi dữ liệu;
4. dùng dedicated trusted production workflow;
5. ghi lại run ID, target identity và deployment/version ID;
6. smoke đúng hành trình bị ảnh hưởng;
7. rollback hoặc forward-fix nếu smoke fail.

Không dùng preview/staging để giả rằng production đã được phát hành, nhưng cũng không được tự tiếp tục từ preview/staging sang production nếu chưa có authorization production.

## Hành động cần lệnh riêng

Không tự động:

- deploy Cloudflare/production;
- sửa hoặc đọc giá trị production secret;
- đổi DNS/domain/billing/account ownership;
- xoá Cloudflare resource;
- chạy migration production;
- bật FIFO/rollout production;
- mutate dữ liệu khách hàng;
- thay production data/schema chỉ để lấy UI evidence.

## CI và evidence

- GitHub là nguồn sự thật cho code, SHA, PR và CI.
- Chỉ kết luận PASS cho exact head có evidence tương ứng.
- Không merge dựa trên CI đỏ, stale, cancelled, conflict hoặc chưa terminal nếu required gate chưa đạt.
- Docs-only change phải ghi rõ `not run — docs-only` nếu không cần test/typecheck/build.
- Production evidence không thay thế code CI; code CI cũng không thay thế production smoke.

## Target production đã từng dùng

Các tên dưới đây là mapping kỹ thuật lịch sử, không phải authorization deploy:

### Alumdoor app Worker

- Source: `server/apps-src/alumdoor-worker/**` và dependency server liên quan.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Workflow: `.github/workflows/release-alumdoor-app.yml`.
- Required bindings: `PLATFORM`, `AI`.

Không dùng version tenant Worker hoặc Gateway `/health` làm bằng chứng app Worker đã cập nhật.

### Frontend / MetaForge UI

Không deploy backend Worker để thay cho frontend release. Trước release UI phải xác định đúng Pages/Worker project, production hostname, build mode và authenticated smoke từ repository/provider hiện hành.

## File không được commit

- `.env` hoặc secret;
- `server/work/`;
- `tmp/`;
- backup, credential, cookie, token;
- generated evidence/build artifact không được repository quản lý.

## Báo cáo sau mỗi đợt

Báo rõ:

1. file sửa và lý do;
2. test/typecheck/build/CI đã chạy hoặc lý do không chạy;
3. branch, commit SHA, PR/merge SHA nếu có;
4. production run/target/version/smoke chỉ khi production thật sự được yêu cầu và thực hiện;
5. lỗi/rủi ro còn lại;
6. AI làm tiếp gì;
7. user cần làm gì.
