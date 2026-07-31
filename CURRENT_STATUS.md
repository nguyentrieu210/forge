# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `chore/alu-production-smoke-trigger-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated evidence.

## Bán hàng — hotfix tự điền giá đã release production

- Lỗi: Item Price legacy hợp lệ có thể bị bỏ qua khi probe tên exact chứa UOM Unicode như `Mét` trả lỗi khác `404`.
- Feature PR `#78` squash-merge SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Exact feature head `0da6bf6dbdba9b81f5f3195e7ec54b93c4ef51f6`; sáu workflow đều PASS:
  - CI `30645713937`;
  - PR Validation `30645714000`;
  - Sales Feature CI `30645713973`;
  - Purchase Feature CI `30645714032`;
  - Inventory and Manufacturing CI `30645713952`;
  - UI Pull Request Validation `30645713926`.
- Release preparation PR `#80` merge SHA `89e9a532c63a7a94ba3f3fc123b9ada3a1816303`.
- Execution PR `#83` đã đóng không merge sau release.
- Release run `30646396613`, job `91208710455`: **SUCCESS**.
- Target SHA: `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- Deployment time: `2026-07-31T16:17:08.332Z`.
- Backup, recorded migrations, deploy và production smoke: PASS.
- `/health = 200`; guest boot = `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.
- Còn thiếu authenticated functional smoke cho `Giá niêm yết + TRỤC 114_1.8LY + Mét = 180000 VND` và kiểm không lấy chéo UOM.

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
5. Authenticated Purchase và Sales business smoke chưa được coi là PASS nếu không có phiên đăng nhập hợp lệ.

## Safety

- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1 ngoài controlled release workflow đã hoàn tất.
- Không bật FIFO.
