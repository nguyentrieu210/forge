# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — authenticated functional smoke cho hotfix giá bán

1. Hard refresh và đăng nhập bằng tài khoản thử phù hợp.
2. Mở Sales Order mới.
3. Chọn `Giá niêm yết`.
4. Chọn `TRỤC 114_1.8LY`.
5. Xác minh:
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - Thành tiền cập nhật đúng theo số lượng;
   - không xuất hiện lỗi callback Unicode-UOM.
6. Đổi sang Item/UOM khác và xác minh không lấy chéo giá.
7. Đổi bảng giá ở header khi dòng đã có Item và xác minh giá reload đúng.
8. Lưu chứng từ thử để pricing authoritative giữ cùng rate.
9. Huỷ hoặc xoá chứng từ thử an toàn.
10. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — chạy production smoke read-only

1. Mở PR từ `chore/alu-production-smoke-trigger-20260731`.
2. Kiểm exact final head và required CI.
3. Merge khi CI xanh và PR conflict-free.
4. Tạo branch `ops/observe-alu-production-<stamp>` từ exact default head.
5. Xác nhận workflow `Cloudflare Production Smoke Observation`:
   - health `200`;
   - root `200`;
   - guest boot `403`;
   - job conclusion `success`;
   - artifact evidence tồn tại.
6. Cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `AI_HANDOFF.md` với run ID/artifact.

## P0 — authenticated functional smoke Purchase

Endpoint smoke không thay thế business smoke sau đăng nhập. Khi có credential/session hợp lệ, kiểm:

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
