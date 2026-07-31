# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `cbe60228fb10a3b51b52880fb178c164b63ff9f8`.
- Working branch: `docs/record-alumdoor-app-worker-release-20260801`.
- Không commit `.env`, secret, `server/work/`, `tmp`, backup hoặc generated evidence.

## Bán hàng — Unicode Item Price đã release đúng app Worker

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

### Release-target correction

- Logic tự điền giá nằm trong `server/apps-src/alumdoor-worker/src/sales-item-context.ts`.
- Worker thực thi logic đó là `cloudforge-app-alumdoor` trong dispatch namespace `cloudforge-production`.
- Release tenant Worker `cloudforge-tenant-alu` trước đó không cập nhật app Worker này.
- Dashboard evidence của chủ dự án phát hiện app Worker vẫn cũ; đây là nguyên nhân deployment trước không làm thay đổi ô giá.

### App Worker production release

- Release workflow PR `#100` merge SHA `1487dbd76f516c0d505120924012b262a5f19857`.
- Workflow-order fix PR `#102` merge SHA `cbe60228fb10a3b51b52880fb178c164b63ff9f8`.
- PR `#102` exact-head CI `30650781602`: SUCCESS.
- PR `#102` PR Validation `30650779877`: SUCCESS.
- Lượt execution đầu, PR `#101` / run `30650655515`, dừng trước deploy vì chưa build `server/dist`.
- Lượt execution thành công: PR `#104`, đã đóng và không merge.
- Execution head: `ee1b652af810f91cba1e042eb34b7a6c37c199a9`.
- Release run `30651057535`: SUCCESS.
- Release job `91224118455`: SUCCESS.
- Build server: PASS.
- Focused Unicode pricing regression: PASS.
- Wrangler dry-run: PASS.
- Live deploy: PASS.
- Cloudflare script/namespace verification: PASS.
- Bindings `PLATFORM` và `AI`: PASS.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Production Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Deployment time: `2026-07-31T17:25:19.115Z`.

### App Worker release artifact

- Artifact ID: `8801385744`.
- Name: `alumdoor-app-production-release-30651057535`.
- Size: `114195` bytes.
- Digest: `sha256:0cf123014d3b4d0c1256f1d37b0e9b7a11882581e22c19c0da6a664b4f4b4e20`.
- Expiry: `2026-08-30T17:25:19Z`.

### Tenant Worker release trước đó

- Run `30649182082`, job `91217965586`: SUCCESS.
- Tenant Worker `cloudforge-tenant-alu`, version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Backup, recorded migrations, deploy, `/health=200` và guest boot `403`: PASS.
- Release này là nền tảng tenant, không thay thế app Worker release.

### Functional acceptance còn lại

- Cần authenticated smoke trực tiếp để xác minh child grid tự điền `180000 VND`, Thành tiền và save-time authoritative pricing.
- Cần đổi Item/UOM/bảng giá để xác minh không lấy chéo hoặc giữ giá cũ.

## Inventory / Manufacturing

- PR `#49` đã merge canonical physical stock identity và warehouse roles.
- PR `#50` đã merge versioned BOM và immutable Work Order snapshot.
- Các thay đổi này chạy song song trên default; app Worker release không sửa dữ liệu kho hoặc sản xuất.

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

- App Worker Sales release đã hoàn tất qua controlled workflow và Cloudflare provider verification.
- Không sửa production secrets hoặc DNS.
- Không thay đổi D1, KV hoặc dữ liệu nghiệp vụ trong app Worker release.
- Không bật FIFO.
