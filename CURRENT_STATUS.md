# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head hiện tại: `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Working branch: `docs/record-alu-production-observation-20260731`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — Unicode Item Price follow-up

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

## Bán hàng — release preparation mới

- PR `#93` đã merge thành `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Controlled release workflow đã khóa `TARGET_SHA=a48524b93489c92296c57fc5f223e41d505de7aa`.
- Fail-closed assertion dùng cùng exact target SHA.
- PR `#93` không deploy production.
- Execution chỉ được phép từ branch `release/execute-alu-production-20260731`.
- Chưa có release run, job, backup, deployment time hoặc Worker-version evidence cho follow-up này.

## Bán hàng — production release trước

- Feature PR `#78` merge SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Release run `30646396613`, job `91208710455`: SUCCESS.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- Deployment time: `2026-07-31T16:17:08.332Z`.
- Backup, recorded migrations, deploy và endpoint smoke: PASS.
- Follow-up PR `#91` chưa được xác nhận đã release production.

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

1. Chỉ execute controlled release cho Sales target `a48524b93489c92296c57fc5f223e41d505de7aa` khi có yêu cầu release rõ.
2. Thu đầy đủ backup, migrations, deploy, endpoint smoke và Worker evidence từ exact run.
3. Authenticated Sales smoke sau release: Item, UOM `Mét`, rate `180000 VND`, amount và save-time authoritative pricing.
4. Authenticated Purchase smoke vẫn chưa hoàn tất.
5. Sửa observation reporting 403 rồi chạy lại để job conclusion xanh.
6. FIFO activation vẫn cần staging readiness, backup và explicit approval riêng.

## Safety

- Production observation không deploy Cloudflare.
- Không backup, migrate hoặc mutate D1 trong observation.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
