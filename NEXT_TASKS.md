# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — chốt và release hotfix giá bán Unicode

1. Mở PR từ `hotfix/sales-price-unicode-normalization-20260731` vào `hotfix/alumdoor-print-list-delete`.
2. Kiểm exact final head, mergeability và required workflows:
   - CI;
   - PR Validation;
   - Sales Feature CI;
   - Purchase Feature CI;
   - Inventory and Manufacturing CI;
   - UI Pull Request Validation.
3. Chỉ merge khi toàn bộ workflow PASS trên cùng exact head.
4. Sau merge, cập nhật release target vào exact merge SHA.
5. Chạy controlled release tenant `alu`:
   - backup tenant;
   - recorded migrations;
   - deploy `cloudforge-tenant-alu`;
   - `/health = 200`;
   - guest boot `= 403`;
   - ghi Worker version và deployment time.
6. Sau deploy, hard refresh và functional smoke:
   - Sales Order mới;
   - `Giá niêm yết`;
   - `TRỤC 114_1.8LY`;
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - nhập số lượng và kiểm Thành tiền;
   - lưu thử để pricing authoritative giữ cùng rate;
   - huỷ/xoá chứng từ thử an toàn.
7. Kiểm Item/UOM khác để bảo đảm không lấy chéo giá.
8. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — production smoke read-only

- Xác nhận `health=200`, `root=200`, `guest_boot=403` bằng workflow observation.
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
