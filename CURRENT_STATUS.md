# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head sau release preparation: `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Working branch: `docs/sales-price-unicode-release-status-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — Unicode Item Price hotfix đã release production

- Functional evidence ban đầu: Sales Order trên `alu.kairo.vn` hiện `TRỤC 114_1.8LY` và ĐVT `Mét` nhưng `Đơn giá` trống.
- Root cause được xử lý:
  - text import có thể hiển thị giống nhau nhưng khác dạng Unicode canonical;
  - exact Item Price probe trả lỗi khác `404` từng chặn field fallback;
  - preview và authoritative pricing chưa dùng cùng canonical matching.
- Feature PR `#91` squash-merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Exact feature head `c0d9df33a9fbde7540683107fd948c388a026682`; sáu workflow đều PASS:
  - CI `30647911536`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`;
  - Purchase Feature CI `30647908408`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`.
- Release preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Execution PR `#95` đã đóng không merge sau release.
- Release run `30648518868`: **SUCCESS**.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `09ab6ce6-3998-4f76-8b45-c9005eeb1152`.
- Deployment time: `2026-07-31T16:49:07.992Z`.
- Backup tenant: PASS.
- Recorded migrations: PASS.
- Tenant deploy: PASS.
- `/health = 200`; guest boot = `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.
- Còn lại: authenticated functional smoke trực tiếp để xác minh child grid tự điền `180000 VND`, Thành tiền và save-time pricing.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` đã merge checksum lock cho mọi staging/production write mode.
- Merge SHA PR `#77`: `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Production smoke

Workflow `Cloudflare Production Smoke Observation` chỉ chạy read-only:

- `GET https://alu.kairo.vn/health` phải trả `200`;
- `GET https://alu.kairo.vn/` phải trả `200`;
- guest boot phải trả `403`;
- evidence được upload ngoài repository.

## Gate hiện tại

1. Người dùng hard refresh `alu.kairo.vn`.
2. Mở Sales Order mới, chọn `Giá niêm yết`, `TRỤC 114_1.8LY`, ĐVT `Mét`.
3. Xác minh Đơn giá `180000 VND` và Thành tiền cập nhật theo số lượng.
4. Lưu thử để pricing authoritative giữ cùng rate.
5. Đổi Item/UOM khác và xác minh không lấy chéo giá.

## Safety

- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu nghiệp vụ ngoài chứng từ test do người dùng kiểm soát.
- Không bật FIFO.
