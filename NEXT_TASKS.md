# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — authenticated Sales smoke sau release

Sales Unicode hotfix đang ở production:

- feature merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`;
- execution PR `#98` đã đóng không merge;
- release run `30649182082`;
- release job `91217965586`;
- Worker version `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`;
- deployment time `2026-07-31T16:58:24.659Z`;
- backup, recorded migrations, deploy, `/health=200` và guest boot `403`: PASS;
- FIFO rollout vẫn disabled.

Việc cần làm ngay:

1. Mở `https://alu.kairo.vn` và hard refresh.
2. Đăng nhập bằng tài khoản thử phù hợp.
3. Mở Sales Order mới.
4. Chọn `Giá niêm yết`.
5. Chọn `TRỤC 114_1.8LY`.
6. Xác minh:
   - ĐVT `Mét`;
   - Đơn giá `180000 VND`;
   - Thành tiền đúng theo số lượng;
   - không có lỗi callback Unicode-UOM.
7. Đổi Item/UOM khác và xác minh không lấy chéo giá.
8. Đổi bảng giá ở header và xác minh rate reload đúng.
9. Lưu thử để pricing authoritative giữ cùng rate.
10. Huỷ hoặc xoá chứng từ thử an toàn.
11. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## Release evidence mới nhất

- Backup artifact ID `8800689182`.
- Backup digest `sha256:2764be993caf757abf9b2263ea28bccc06e74adbb477ed239cd0df4db8b9f244`.
- Backup expiry `2026-08-14T16:57:33Z`.
- Release artifact ID `8800710784`.
- Release digest `sha256:16227979a15a4fa41b4ca1610cfe0e2db21b6c0806962c76fa93fd8035124835`.
- Release artifact expiry `2026-08-30T16:58:26Z`.

## P0 — sửa production observation reporting

Endpoint smoke read-only đã PASS nhưng job cũ đỏ do Actions token không được comment PR.

1. Bỏ issue-comment API khỏi workflow hoặc làm reporting non-fatal.
2. Dùng `$GITHUB_STEP_SUMMARY` và artifact làm evidence mặc định.
3. Giữ `permissions: contents: read` tối thiểu.
4. Chạy lại observation PR read-only.
5. Xác nhận `health=200`, `root=200`, `guest_boot=403`, smoke và artifact PASS, toàn job conclusion `success`.
6. Observation PR phải đóng không merge.

Evidence hiện tại:

- run `30648098602`;
- job `91214435446`;
- artifact `8800251206`;
- digest `sha256:667a9f2a760ff5074ae4d97df4193e53cc45db1d96e237ffc39fe4f934abae7d`.

## P0 — authenticated functional smoke Purchase

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

- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
