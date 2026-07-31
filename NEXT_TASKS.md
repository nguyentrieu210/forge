# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — authenticated production smoke cho giá bán

Release đã hoàn tất trên Worker version `09ab6ce6-3998-4f76-8b45-c9005eeb1152`, target SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.

1. Hard refresh và đăng nhập `alu.kairo.vn`.
2. Mở Sales Order mới.
3. Chọn `Giá niêm yết`.
4. Chọn `TRỤC 114_1.8LY`.
5. Xác minh:
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - Thành tiền cập nhật đúng khi nhập số lượng;
   - không xuất hiện lỗi callback Item Price.
6. Lưu chứng từ thử để pricing authoritative giữ cùng rate.
7. Đổi sang Item/UOM khác và xác minh không lấy chéo giá.
8. Đổi bảng giá ở header khi dòng đã có Item và xác minh giá reload đúng.
9. Huỷ hoặc xoá chứng từ thử an toàn.
10. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — production smoke read-only

- Xác nhận `health=200`, `root=200`, `guest_boot=403` bằng workflow observation khi cần.
- Endpoint smoke không thay thế authenticated Sales/Purchase business smoke.

## P0 — authenticated functional smoke Purchase

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

- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
