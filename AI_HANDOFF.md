# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head khi mở nhánh: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Working branch: `docs/record-alu-production-observation-20260731`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Sales Unicode Item Price

- PR `#91` — `fix(sales): normalize Unicode Item Price lookup` — đã squash-merge.
- Exact feature head: `c0d9df33a9fbde7540683107fd948c388a026682`.
- Merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Exact-head CI đã PASS:
  - CI `30647911536`;
  - PR Validation `30647908313`;
  - Sales Feature CI `30647908363`;
  - Purchase Feature CI `30647908408`;
  - Inventory and Manufacturing CI `30647910730`;
  - UI Pull Request Validation `30647910724`.
- Follow-up này chưa có controlled production release evidence sau merge.
- Hotfix production trước đó vẫn ở Worker version `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.

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
- Bản sửa để bỏ API comment và dùng job summary đã bị tool safety layer chặn; chưa được commit.

## Purchase/FIFO

- PR `#77` merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7` khóa mọi write mode bằng approved checksum.
- FIFO rollout vẫn **disabled**.

## Việc tiếp theo

1. Chuẩn bị controlled release cho Sales PR `#91` vào tenant `alu` theo exact merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`; không tự deploy nếu không có yêu cầu release rõ.
2. Sau release, chạy authenticated Sales smoke cho `Giá niêm yết + TRỤC 114_1.8LY + Mét = 180000 VND`.
3. Sửa observation reporting để không gọi issue-comment API bằng Actions token, rồi chạy lại để workflow conclusion `success`.
4. Authenticated Purchase smoke vẫn là gate riêng; endpoint guest smoke không thay thế business acceptance.
5. Production FIFO activation vẫn cần staging evidence, backup và explicit approval riêng.

## Safety

- Không deploy Cloudflare trong đợt observation này.
- Không backup, migrate hoặc mutate D1.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
