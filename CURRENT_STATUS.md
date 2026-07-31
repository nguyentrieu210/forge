# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `89e9a532c63a7a94ba3f3fc123b9ada3a1816303`.
- Working branch: `chore/alu-production-smoke-trigger-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated evidence.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` đã merge checksum lock cho mọi staging/production write mode.
- Merge SHA PR `#77`: `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Production smoke

Workflow hiện hữu `Cloudflare Production Smoke Observation` chỉ chạy read-only:

- `GET https://alu.kairo.vn/health` phải trả `200`;
- `GET https://alu.kairo.vn/` phải trả `200`;
- guest boot phải trả `403`;
- evidence được upload ngoài repository.

Nhánh hiện tại thêm trigger giới hạn cho `ops/observe-alu-production-*`, vì connector không có quyền gọi `workflow_dispatch` trực tiếp. Workflow không deploy, không migrate, không mutate tenant và không đọc production secrets.

## Gate hiện tại

1. Exact-head CI của PR smoke-trigger phải PASS.
2. Merge workflow trigger.
3. Tạo branch quan sát để chạy smoke-only workflow.
4. Ghi run ID, job conclusion và artifact ID.
5. Authenticated Purchase business smoke chưa được coi là PASS nếu không có phiên đăng nhập hợp lệ.

## Safety

- Không deploy Cloudflare trong công việc này.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không bật FIFO.
