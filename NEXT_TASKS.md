# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — controlled release Sales Unicode fix

PR `#91` đã merge thành `a48524b93489c92296c57fc5f223e41d505de7aa`; sáu workflow exact-head đều PASS.

Khi có yêu cầu release production rõ:

1. Khóa release target vào exact merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`.
2. Chạy controlled tenant release:
   - backup tenant;
   - recorded migrations;
   - deploy `cloudforge-tenant-alu`;
   - `/health = 200`;
   - guest boot `= 403`;
   - ghi Worker version và deployment time.
3. Không deploy Gateway nếu target chỉ là tenant Worker.
4. Không sửa secrets hoặc DNS.

## P0 — authenticated Sales smoke sau release

1. Hard refresh và đăng nhập bằng tài khoản thử phù hợp.
2. Mở Sales Order mới.
3. Chọn `Giá niêm yết`.
4. Chọn `TRỤC 114_1.8LY`.
5. Xác minh:
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - Thành tiền đúng theo số lượng;
   - không có lỗi callback Unicode-UOM.
6. Đổi Item/UOM khác và xác minh không lấy chéo giá.
7. Đổi bảng giá ở header và xác minh rate reload đúng.
8. Lưu thử để pricing authoritative giữ cùng rate.
9. Huỷ hoặc xoá chứng từ thử an toàn.
10. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — sửa production observation reporting

Endpoint smoke ngày `2026-07-31` đã PASS và artifact tồn tại, nhưng job đỏ do Actions token không được comment PR.

1. Bỏ issue-comment API khỏi workflow hoặc làm reporting non-fatal.
2. Dùng `$GITHUB_STEP_SUMMARY` và artifact làm evidence mặc định.
3. Giữ `permissions: contents: read` tối thiểu.
4. Chạy lại observation PR read-only.
5. Bắt buộc xác nhận:
   - `health=200`;
   - `root=200`;
   - `guest_boot=403`;
   - smoke step PASS;
   - artifact upload PASS;
   - toàn job conclusion `success`.
6. Observation PR phải đóng không merge.

Evidence hiện tại:

- run `30648098602`;
- job `91214435446`;
- artifact `8800251206`;
- digest `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`;
- artifact hết hạn `2026-08-14T16:41:00Z`.

## P0 — authenticated functional smoke Purchase

Endpoint observation không thay thế business smoke sau đăng nhập:

- đăng nhập và boot tenant;
- mở module Mua hàng;
- Purchase Order create/save/submit;
- Purchase Receipt preview/save/submit/cancel;
- item picker, UOM, giá và dropdown;
- desktop/mobile;
- FIFO phải tiếp tục disabled.

## Purchase/FIFO activation gates

- Chọn staging tenant hoặc production-shaped sanitized copy.
- Read-only readiness, `unresolved_count=0`, review checksum/counts.
- Staging execute dùng exact approved checksum và rollout giữ `enabled=0`.
- Functional acceptance, contention/latency evidence, fresh production backup.
- Production activation chỉ sau explicit approval riêng.

## Không được làm

- Không tự deploy Cloudflare khi chưa có yêu cầu release rõ.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
