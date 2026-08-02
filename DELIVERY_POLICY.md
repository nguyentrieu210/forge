# DELIVERY POLICY

Ngày cập nhật: **2026-08-02**.

`RUNBOOK.md` là quy tắc vận hành canonical. File này chỉ mô tả ranh giới giao hàng và phát hành.

## Luồng giao hàng mặc định

Với thay đổi code sản phẩm, luồng mặc định là:

`branch -> code -> focused validation -> test/typecheck/build phù hợp -> pull request -> exact-head required CI -> merge khi được phép`

Không được tự thêm bước deploy production vào authorization mặc định.

**Merge và production deploy là hai ranh giới riêng.** Yêu cầu sửa/xây code không tự động cấp quyền deploy Cloudflare, chạy migration production hoặc thay production state.

## UI-only hotfix one-click lane

Dùng cho thay đổi giao diện cực nhỏ cần phát hành nhanh lên `alu.kairo.vn`, không có thay đổi backend, schema, metadata nghiệp vụ, dependency hoặc migration.

Luồng vận hành:

`branch hotfix/ui-* -> sửa client -> bấm ALU UI Hotfix - One Click Deploy -> hard scope guard -> build -> stage -> production deploy -> exact-SHA smoke -> PR reconcile`

Workflow canonical: `.github/workflows/hotfix-ui-one-click.yml`.

Fast lane chỉ chạy khi toàn bộ điều kiện sau đúng:

- branch có prefix `hotfix/ui-`;
- current `main` là ancestor của exact target SHA, branch stale bị chặn;
- có ít nhất một thay đổi dưới `client/**`;
- ngoài `client/**` chỉ cho phép `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md`;
- tối đa 10 file và 300 dòng text thay đổi;
- không thay package/dependency manifest;
- không thay `server/**`, migration, brief/app metadata, workflow, secret, DNS hoặc production data.

Quick lane **chỉ phát hành Gateway/client bundle**. Không chạy tenant backup/migration, tenant Worker hoặc Alumdoor app Worker.

Để giảm thời gian production path, quick lane chỉ bắt buộc frontend build, staged-bundle check, Gateway deploy và exact-release smoke. `lint`, `test`, `typecheck` và Wrangler `dry-run` không chạy trong quick production path; chúng được deferred sang PR reconcile/normal CI. Không được ghi các gate deferred là PASS nếu chưa có evidence.

Production có thể chạy exact hotfix SHA trước khi branch được merge vào `main`; workflow best-effort tạo hoặc ghi chú PR reconcile sau deploy. Hotfix chỉ closure hoàn chỉnh khi exact production SHA đã được reconcile về `main` qua PR hợp lệ.

Mục tiêu là thao tác con người dưới 30 giây. Không cam kết workflow hoàn tất trong 30 giây vì GitHub runner, dependency install, frontend build và Cloudflare có thời gian thực thi riêng.

Không dùng lane này cho thay đổi nghiệp vụ, dữ liệu hoặc backend chỉ vì muốn chạy nhanh.

## Production chỉ khi có lệnh rõ

Chỉ deploy production khi user yêu cầu rõ trong đợt làm việc hiện tại. Khi được yêu cầu, release vẫn phải:

1. xác định đúng production target và exact SHA;
2. dùng dedicated trusted production workflow;
3. có backup/recovery trước migration hoặc thay đổi dữ liệu;
4. ghi lại run ID, target identity và deployment/version ID;
5. smoke đúng hành trình bị ảnh hưởng;
6. rollback hoặc forward-fix nếu smoke fail.

Quick UI lane là ngoại lệ về thứ tự validation, không phải ngoại lệ về production authorization hay scope safety.

## Hành động cần lệnh riêng

Không tự động:

- deploy Cloudflare/production;
- sửa hoặc đọc giá trị production secret;
- đổi DNS/domain/billing/account ownership;
- xoá Cloudflare resource;
- chạy migration production;
- bật rollout/FIFO production;
- mutate dữ liệu khách hàng;
- thay production data/schema chỉ để lấy UI evidence.

## CI và evidence

- GitHub là nguồn sự thật cho code, SHA, PR và CI.
- Chỉ kết luận PASS cho exact head có evidence tương ứng.
- Quick UI lane có thể deploy trước full PR CI trong giới hạn scope nêu trên; các gate deferred vẫn phải được chạy trong reconciliation PR trước khi closure.
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

Frontend của `alu.kairo.vn` được build bởi package `metaforge`, stage vào `server/apps/gateway-worker/public` và phát hành qua Gateway production workflow `.github/workflows/release-gateway.yml`.

Không deploy backend Worker để thay cho frontend release.

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
