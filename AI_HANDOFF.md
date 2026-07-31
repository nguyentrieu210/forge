# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `51f462c7e76dd2c669c5721bcd625fdb1453a008`.
- Working branch: `docs/sales-price-unicode-release-status-v2-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Sales Unicode Item Price — đã merge và release production

### Feature

- PR `#91` — `fix(sales): normalize Unicode Item Price lookup` — đã squash-merge.
- Exact feature head: `c0d9df33a9fbde7540683107fd948c388a026682`.
- Merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Fix bao phủ:
  - chuẩn hóa Price List, Item, UOM, Currency và Warehouse về Unicode NFC;
  - legacy Item Price lookup trước;
  - exact-name probe lỗi khác `404` không chặn field fallback;
  - preview và authoritative save/submit dùng cùng canonical matching.
- Regression: `server/tests/sales-price-unicode-normalization.test.mjs`.
- Exact-head CI đã PASS:
  - CI `30647911536`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`;
  - Purchase Feature CI `30647908408`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`.

### Controlled production release

- Release-preparation PR `#93` merge SHA `077d9944b1cfc1f436da87472f070ee2bd864b44`.
- Workflow target và fail-closed assertion khóa vào exact feature merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Execution PR `#95` đã đóng, **không merge**.
- Release run: `30648518868`.
- Release job: `91215801064` — SUCCESS.
- Target SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Worker: `cloudforge-tenant-alu`.
- Production version ID: `09ab6ce6-3998-4f76-8b45-c9005eeb1152`.
- Deployment time: `2026-07-31T16:49:07.992Z`.
- Backup tenant: PASS.
- Recorded migrations: PASS.
- Tenant deploy: PASS.
- `/health=200`; guest boot `403`.
- FIFO rollout vẫn **disabled**.
- Không deploy Gateway, không sửa DNS hoặc production secrets.

## Production observation đã chạy

- PR `#88` merge SHA `0488d9bb59de445b8d17b23da0c049a90ee16785` thêm artifact/reporting.
- PR `#89` merge SHA `44839abb848284747aef92ab73f67699691cae44` thêm PR trigger read-only.
- Observation PR `#92` đã đóng, **không merge**.
- Run ID: `30648098602`.
- Job ID: `91214435446`.
- Observation source SHA: `eadaac669d98c19b92121a0bd8d2b04010d43572`.
- Kết quả endpoint:
  - `health=200`;
  - `root=200`;
  - `guest_boot=403`;
  - `result=pass`.
- `/health` trả `{"ok":true,"service":"gateway-worker"}`.
- Artifact ID: `8800251206`.
- Artifact name: `alu-production-observation-30648098602`.
- Artifact digest: `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`.
- Artifact hết hạn: `2026-08-14T16:41:00Z`.
- Evidence đã được ghi vào PR `#84` bằng connector GitHub.

## Reporting issue còn lại

- Endpoint smoke step: PASS.
- Artifact upload: PASS.
- Workflow conclusion bị `failure` vì bước tự comment nhận `403 Resource not accessible by integration`.
- Đây là lỗi reporting permission, không phải lỗi production endpoint.
- Cần bỏ issue-comment API khỏi workflow hoặc làm bước reporting non-fatal, dùng `$GITHUB_STEP_SUMMARY` và artifact làm evidence.

## Purchase/FIFO

- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa mọi write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.

## Việc tiếp theo

1. Hard refresh và chạy authenticated Sales smoke:
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
5. Authenticated Purchase smoke vẫn là gate riêng; endpoint guest smoke không thay thế business acceptance.
6. Production FIFO activation vẫn cần staging evidence, backup và explicit approval riêng.

## Safety

- Production Sales release đã hoàn tất qua controlled workflow có backup và evidence.
- Không sửa production secrets hoặc DNS.
- Không mutate Item Price hay dữ liệu khách hàng.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
