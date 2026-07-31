# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `df2dffc3d3303841a76993b4b8acf8bf2e344e17`.
- Working branch: `docs/record-sales-unicode-release-rerun-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — Unicode Item Price đã release production

### Feature

- PR `#91` đã squash-merge.
- Exact feature head: `c0d9df33a9fbde7540683107fd948c388a026682`.
- Merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Exact-head CI đều PASS:
  - CI `30647911536`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`;
  - Purchase Feature CI `30647908408`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`.
- Fix bao phủ Unicode NFC, exact-probe failure fallback và cùng canonical matching cho preview/save/submit.

### Production release mới nhất

- Release-preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Controlled release workflow khóa `TARGET_SHA=a48524b93489c92296c57fc5f223e41d505de7aa`.
- Execution PR `#98` đã đóng, không merge.
- Execution trigger head: `6352d5b65149aa22889128be4e8e767c362715af`.
- Release run `30649182082`: SUCCESS.
- Release job `91217965586`: SUCCESS.
- PR Validation `30649182059`: SUCCESS.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Deployment time: `2026-07-31T16:58:24.659Z`.
- Backup tenant: PASS.
- Recorded migrations: PASS.
- Tenant deploy: PASS.
- `/health=200`; guest boot `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.

### Artifacts

- Backup artifact ID `8800689182`, size `721872` bytes.
- Backup digest `sha256:2764be993caf757abf9b2263ea28bccc06e74adbb477ed239cd0df4db8b9f244`.
- Backup expiry `2026-08-14T16:57:33Z`.
- Release artifact ID `8800710784`, size `4746` bytes.
- Release digest `sha256:16227979a15a4fa41b4ca1610cfe0e2db21b6c0806962c76fa93fd8035124835`.
- Release artifact expiry `2026-08-30T16:58:26Z`.

### Functional acceptance còn lại

- Cần authenticated smoke trực tiếp để xác minh child grid tự điền `180000 VND`, Thành tiền và save-time authoritative pricing.
- Cần đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.

## Production observation — 2026-07-31

- Read-only run `30648098602`, job `91214435446`.
- `health=200`, `root=200`, `guest_boot=403`, endpoint result PASS.
- Artifact ID `8800251206`.
- Artifact digest `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`.
- Workflow conclusion đỏ do bước issue-comment nhận GitHub API `403`; endpoint smoke và artifact upload đều PASS.

## Gate hiện tại

1. Hard refresh và authenticated Sales smoke: Item, UOM `Mét`, rate `180000 VND`, amount và save-time pricing.
2. Đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.
3. Authenticated Purchase smoke vẫn chưa hoàn tất.
4. Sửa observation reporting `403` rồi chạy lại để toàn job conclusion xanh.
5. FIFO activation vẫn cần staging readiness, backup và explicit approval riêng.

## Safety

- Production Sales release đã hoàn tất qua controlled workflow có backup và evidence.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
