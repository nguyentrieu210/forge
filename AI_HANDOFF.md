# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `cbe60228fb10a3b51b52880fb178c164b63ff9f8`.
- Working branch: `docs/record-alumdoor-app-worker-release-20260801`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Sales Unicode Item Price — feature đã merge

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

## Đính chính release target

- Logic preview đơn giá nằm trong `server/apps-src/alumdoor-worker` và chạy ở app Worker `cloudforge-app-alumdoor`.
- Các release trước chỉ deploy tenant Worker `cloudforge-tenant-alu`; chúng không cập nhật app Worker chứa `sales-item-context.ts`.
- Cloudflare Dashboard evidence của chủ dự án đã phát hiện `cloudforge-app-alumdoor` vẫn là deployment cũ.
- Không được dùng `/health` của Gateway hoặc version tenant Worker làm bằng chứng rằng app Worker đã được cập nhật.

## Controlled Alumdoor app Worker release — SUCCESS

### Release workflow

- PR `#100` thêm `.github/workflows/release-alumdoor-app.yml`.
- PR `#100` merge SHA: `1487dbd76f516c0d505120924012b262a5f19857`.
- Workflow khóa vào:
  - target SHA `a48524b93489c92296c57fc5f223e41d505de7aa`;
  - Worker `cloudforge-app-alumdoor`;
  - dispatch namespace `cloudforge-production`.
- PR `#102` sửa thứ tự build trước regression.
- PR `#102` merge SHA: `cbe60228fb10a3b51b52880fb178c164b63ff9f8`.
- Exact-head workflow-fix gates:
  - CI `30650781602`: SUCCESS;
  - PR Validation `30650779877`: SUCCESS.

### Execution history

- Execution PR `#101` / run `30650655515` thất bại **trước deploy** do thiếu `server/dist`; Wrangler dry-run và live deploy đều bị skip.
- Execution PR `#104` đã đóng, **không merge**.
- Execution trigger head: `ee1b652af810f91cba1e042eb34b7a6c37c199a9`.
- Release run: `30651057535` — SUCCESS.
- Release job: `91224118455` — SUCCESS.
- Build server artifacts: PASS.
- Focused Unicode pricing regression: PASS.
- Strict Wrangler dry-run: PASS.
- Live dispatch-namespace deploy: PASS.
- Cloudflare script identity + namespace verification: PASS.
- Required bindings `PLATFORM` và `AI`: PASS.

### Provider evidence

- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Cloudflare Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Deployment time: `2026-07-31T17:25:19.115Z`.
- Evidence artifact ID: `8801385744`.
- Artifact name: `alumdoor-app-production-release-30651057535`.
- Artifact digest: `sha256:0cf123014d3b4d0c1256f1d37b0e9b7a11882581e22c19c0da6a664b4f4b4e20`.
- Artifact expiry: `2026-08-30T17:25:19Z`.
- Không sửa DNS, secrets, D1, KV hoặc dữ liệu nghiệp vụ.

## Tenant Worker release trước đó

- Release run `30649182082`, job `91217965586`: SUCCESS.
- Worker `cloudforge-tenant-alu`, version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.
- Backup, recorded migrations, tenant deploy, `/health=200` và guest boot `403`: PASS.
- Đây là release nền tảng tenant, **không phải** bằng chứng app Worker Alumdoor đã cập nhật.

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

- App Worker Sales release đã hoàn tất qua controlled workflow và provider verification.
- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu khách hàng.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
