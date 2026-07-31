# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `51f462c7e76dd2c669c5721bcd625fdb1453a008`.
- Working branch: `docs/sales-price-unicode-release-status-v2-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — Unicode Item Price follow-up đã release production

### Feature

- Functional evidence ban đầu: Sales Order trên `alu.kairo.vn` hiện `TRỤC 114_1.8LY` và ĐVT `Mét` nhưng `Đơn giá` trống.
- Root cause được xử lý:
  - text import có thể hiển thị giống nhau nhưng khác dạng Unicode canonical;
  - exact Item Price probe trả lỗi khác `404` từng chặn field fallback;
  - preview và authoritative pricing chưa dùng cùng canonical matching.
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

### Production release

- Release-preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Controlled release workflow khóa `TARGET_SHA=a48524b93489c92296c57fc5f223e41d505de7aa` và fail-closed assertion dùng cùng SHA.
- Execution PR `#95` đã đóng, không merge.
- Release run `30648518868`: SUCCESS.
- Release job `91215801064`: SUCCESS.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `09ab6ce6-3998-4f76-8b45-c9005eeb1152`.
- Deployment time: `2026-07-31T16:49:07.992Z`.
- Backup tenant: PASS.
- Recorded migrations: PASS.
- Tenant deploy: PASS.
- `/health=200`; guest boot `403`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO rollout vẫn **disabled**.
- Còn lại: authenticated functional smoke trực tiếp để xác minh child grid tự điền `180000 VND`, Thành tiền và save-time pricing.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.

## Production observation — 2026-07-31

### Trigger và phạm vi

- PR `#88` merge SHA `0488d9bb59de445b8d17b23da0c049a90ee16785`.
- PR `#89` merge SHA `44839abb848284747aef92ab73f67699691cae44`.
- Observation PR `#92` đã đóng và không merge.
- Workflow chỉ thực hiện GET tới `/health`, `/` và guest boot; không deploy hoặc mutation.

### Evidence

- Run ID: `30648098602`.
- Job ID: `91214435446`.
- Source SHA thực thi: `eadaac669d98c19b92121a0bd8d2b04010d43572`.
- Observed at: `2026-07-31T16:41:00Z`.
- `health=200`.
- `root=200`.
- `guest_boot=403`.
- `result=pass`.
- Health payload: `{"ok":true,"service":"gateway-worker"}`.
- Guest boot trả expected login-required `PermissionError`.
- Artifact ID: `8800251206`.
- Artifact name: `alu-production-observation-30648098602`.
- Artifact size: `1144` bytes.
- Artifact digest: `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`.
- Artifact expiry: `2026-08-14T16:41:00Z`.
- Evidence summary đã được comment vào PR `#84`.

### Workflow conclusion nuance

- `Smoke production endpoints`: PASS.
- `Upload observation evidence`: PASS.
- `Publish observation summary`: FAIL với GitHub API `403 Resource not accessible by integration`.
- Vì vậy toàn job conclusion là `failure`, nhưng production endpoint result và artifact đều PASS.
- Reporting permission cần được sửa riêng; không được diễn giải lỗi này thành production outage.

## Gate hiện tại

1. Hard refresh và authenticated Sales smoke: Item, UOM `Mét`, rate `180000 VND`, amount và save-time authoritative pricing.
2. Đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.
3. Authenticated Purchase smoke vẫn chưa hoàn tất.
4. Sửa observation reporting `403` rồi chạy lại để toàn job conclusion xanh.
5. FIFO activation vẫn cần staging readiness, backup và explicit approval riêng.

## Safety

- Production Sales release đã hoàn tất qua controlled workflow có backup và evidence.
- Production observation không deploy Cloudflare.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
