# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `df2dffc3d3303841a76993b4b8acf8bf2e344e17`.
- Working branch: `docs/record-sales-unicode-release-rerun-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Sales Unicode Item Price — đã release production

### Feature

- PR `#91` đã squash-merge.
- Exact feature head: `c0d9df33a9fbde7540683107fd948c388a026682`.
- Merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Fix bao phủ Unicode NFC, exact-name probe failure fallback và cùng canonical matching cho preview/save/submit.
- Regression: `server/tests/sales-price-unicode-normalization.test.mjs`.
- Exact-head CI đã PASS:
  - CI `30647911536`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`;
  - Purchase Feature CI `30647908408`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`.

### Controlled production release mới nhất

- Release-preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Workflow target và fail-closed assertion khóa vào `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Execution PR `#98` đã đóng, **không merge**.
- Execution trigger head: `6352d5b65149aa22889128be4e8e767c362715af`.
- Release run: `30649182082` — SUCCESS.
- Release job: `91217965586` — SUCCESS.
- PR Validation: `30649182059` — SUCCESS.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Worker: `cloudforge-tenant-alu`.
- Production version ID: `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Deployment time: `2026-07-31T16:58:24.659Z`.
- Backup tenant: PASS.
- Recorded migrations: PASS.
- Tenant deploy: PASS.
- `/health=200`; guest boot `403`.
- FIFO rollout vẫn **disabled**.
- Không deploy Gateway, không sửa DNS hoặc production secrets.

### Release artifacts

- Backup artifact ID: `8800689182`.
- Backup artifact: `alu-pre-release-backup-30649182082`.
- Backup digest: `sha256:2764be993caf757abf9b2263ea28bccc06e74adbb477ed239cd0df4db8b9f244`.
- Backup expiry: `2026-08-14T16:57:33Z`.
- Release evidence artifact ID: `8800710784`.
- Release evidence artifact: `alu-production-release-30649182082`.
- Release digest: `sha256:16227979a15a4fa41b4ca1610cfe0e2db21b6c0806962c76fa93fd8035124835`.
- Release evidence expiry: `2026-08-30T16:58:26Z`.

## Production observation

- Read-only run `30648098602`, job `91214435446`.
- `health=200`, `root=200`, `guest_boot=403`, endpoint result PASS.
- Artifact ID `8800251206`, digest `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`.
- Job đỏ chỉ vì issue-comment API trả `403 Resource not accessible by integration`; production endpoint và artifact đều PASS.

## Purchase/FIFO

- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa mọi write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.

## Việc tiếp theo

1. Hard refresh `https://alu.kairo.vn` và chạy authenticated Sales smoke:
   - Sales Order mới;
   - `Giá niêm yết`;
   - `TRỤC 114_1.8LY`;
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - Thành tiền đúng theo số lượng;
   - save-time authoritative pricing giữ cùng rate.
2. Đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.
3. Huỷ hoặc xoá chứng từ thử an toàn; không ghi credential/cookie/dữ liệu khách hàng vào evidence.
4. Sửa production-observation reporting `403` rồi chạy lại read-only để toàn job conclusion `success`.
5. Authenticated Purchase smoke vẫn là gate riêng.
6. Production FIFO activation vẫn cần staging evidence, backup và explicit approval riêng.

## Safety

- Production Sales release đã hoàn tất qua controlled workflow có backup và evidence.
- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu khách hàng.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
