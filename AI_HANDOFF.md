# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `3b99708e9a021efccc027f3cd54e0bb6676205d4`.
- Working branch: `chore/alu-production-smoke-reporting-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Đã hoàn tất

- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa mọi Purchase/FIFO write mode bằng approved checksum.
- PR `#84` merge SHA `3b99708e9a021efccc027f3cd54e0bb6676205d4` thêm branch trigger an toàn cho production observation.
- Đã tạo branch `ops/observe-alu-production-20260731-2322` để kích hoạt smoke-only workflow.
- FIFO rollout vẫn **disabled**.

## Mục tiêu nhánh hiện tại

Làm cho push-triggered production smoke tự công bố run ID, branch, HTTP codes và PASS/FAIL vào PR `#84`, vì connector hiện không liệt kê push-run theo commit.

## Thay đổi

- `.github/workflows/cloudflare-production-observation.yml`
  - cấp `issues: write` chỉ để đăng observation summary;
  - luôn ghi `state.txt`, kể cả khi endpoint fail;
  - comment kết quả vào PR `#84` với run URL và exact source SHA;
  - tiếp tục upload artifact ngoài repository;
  - không deploy, migrate, mutate D1, đọc production secret hoặc bật FIFO.

## Việc tiếp theo

1. Mở PR cho reporting change và kiểm exact-head CI.
2. Merge khi CI xanh.
3. Tạo fresh branch `ops/observe-alu-production-<stamp>` từ exact default.
4. Đọc bot comment trên PR `#84`, lấy run ID và xác nhận HTTP codes.
5. Fetch workflow jobs/artifact bằng exact run ID.
6. Cập nhật ba file trạng thái với final smoke evidence.

## Safety

- Không deploy Cloudflare.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không bật FIFO.
- Authenticated business smoke chưa PASS nếu không có session hợp lệ.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
