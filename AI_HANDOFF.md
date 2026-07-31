# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `89e9a532c63a7a94ba3f3fc123b9ada3a1816303`.
- Working branch: `chore/alu-production-smoke-trigger-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Trạng thái vừa hoàn tất

- PR `#77` đã squash-merge thành `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- Purchase/FIFO staging backfill hiện bắt buộc checksum đã review cho mọi write mode.
- FIFO rollout vẫn **disabled**.

## Mục tiêu nhánh hiện tại

Cho phép chạy workflow quan sát production read-only mà không cần dispatch thủ công và không đi qua release/deploy workflow.

## Thay đổi

- `.github/workflows/cloudflare-production-observation.yml`
  - giữ `workflow_dispatch`;
  - thêm push trigger chỉ cho `ops/observe-alu-production-*`;
  - chỉ kiểm `https://alu.kairo.vn/health`, `/`, và guest boot;
  - ghi source SHA vào evidence;
  - không backup, migrate, deploy, mutate D1 hoặc dùng production secret.

## Việc tiếp theo

1. Mở PR và kiểm exact-head CI.
2. Khi xanh, merge workflow trigger.
3. Tạo branch `ops/observe-alu-production-<stamp>` từ exact default để kích hoạt smoke-only run.
4. Xác nhận `health=200`, `root=200`, `guest_boot=403` và artifact evidence.
5. Authenticated business smoke vẫn cần credential/session hợp lệ; không giả lập bằng guest endpoint.

## Safety

- Không deploy Cloudflare.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
