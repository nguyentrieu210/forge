# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — hoàn tất production smoke read-only

1. Mở PR từ `chore/alu-production-smoke-reporting-20260731`.
2. Kiểm exact final head và required CI.
3. Merge khi CI xanh và conflict-free.
4. Tạo fresh branch `ops/observe-alu-production-<stamp>` từ exact default head.
5. Đọc observation comment trên PR `#84` và xác nhận:
   - run ID/run URL;
   - exact source SHA;
   - health `200`;
   - root `200`;
   - guest boot `403`;
   - result `pass`.
6. Fetch workflow jobs và artifact bằng exact run ID.
7. Cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` với final evidence.

## P0 — authenticated functional smoke

Endpoint observation không thay thế business smoke sau đăng nhập. Khi có credential/session hợp lệ, kiểm:

- đăng nhập và boot tenant;
- mở module Mua hàng;
- Purchase Order create/save/submit;
- Purchase Receipt preview/save/submit/cancel;
- item picker, UOM, giá và dropdown;
- desktop/mobile;
- không bật FIFO trong lúc smoke.

## Purchase/FIFO activation gates

- Chọn staging tenant hoặc production-shaped sanitized copy.
- Read-only readiness, `unresolved_count=0`, review checksum/counts.
- Staging execute dùng exact approved checksum và rollout giữ `enabled=0`.
- Functional acceptance, contention/latency evidence, fresh production backup.
- Production activation chỉ sau explicit approval riêng.

## Không được làm

- Không deploy Cloudflare chỉ để chạy smoke.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1 trong observation workflow.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
