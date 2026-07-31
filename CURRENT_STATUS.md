# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `3b99708e9a021efccc027f3cd54e0bb6676205d4`.
- Working branch: `chore/alu-production-smoke-reporting-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` đã merge checksum lock; merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Production smoke

- PR `#84` đã merge branch-triggered read-only observation workflow; merge SHA `3b99708e9a021efccc027f3cd54e0bb6676205d4`.
- Branch `ops/observe-alu-production-20260731-2322` đã được tạo để kích hoạt workflow.
- Observation chỉ kiểm:
  - `/health = 200`;
  - `/ = 200`;
  - guest boot `= 403`;
  - artifact evidence ngoài repository.
- Connector hiện không liệt kê push-run theo commit, nên chưa thể gắn run ID/artifact chính xác từ lần trigger đầu.

## Reporting hardening hiện tại

Nhánh này làm workflow tự comment vào PR `#84`:

- run ID và run URL;
- exact source SHA/branch/event;
- health/root/guest boot codes;
- PASS/FAIL;
- vẫn upload artifact.

Quyền mới duy nhất là `issues: write` để đăng comment. Không có Cloudflare token, deploy, migration hoặc D1 mutation.

## Gate hiện tại

1. Exact-head CI cho reporting PR phải PASS.
2. Merge reporting workflow.
3. Tạo fresh observation branch.
4. Xác nhận bot comment, workflow job success và artifact tồn tại.
5. Authenticated Purchase business smoke vẫn là gate riêng.

## Safety

- Không deploy Cloudflare trong công việc này.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không bật FIFO.
