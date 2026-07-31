# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — hoàn thiện Inventory Slice D PR #82

Stack nền đã chốt:

- Inventory Slice B PR `#49` merge SHA `5e607be97f4ee21e668ad95421e44abbe5d6ff2d`;
- Manufacturing Slice C PR `#50` merge SHA `a4a966dbe57e3d25ec1b3644e91252d9731faaff`;
- Slice D đã retarget lên default;
- code head đã xác minh `97ad28d32925eed436e083c3e5b2724d9bc899e3`;
- PR Validation, CI, Inventory/Manufacturing CI và UI Validation đều PASS;
- PR vẫn draft, chưa merge.

Việc cần làm tiếp:

1. Gắn `D1PhysicalStockLedgerReader` và `PhysicalStockReportService` vào tenant report endpoint.
2. Server phải inject authenticated tenant; không nhận tenant scope do client tự chọn.
3. Áp company, warehouse, warehouse-role, lineage và export permission scope.
4. Thêm endpoint regression cho tenant isolation, permission denial, malformed source rows và row cap.
5. Làm physical-stock explorer với filters Item, warehouse/role, inventory mode/profile, màu, tình trạng, đời, kích thước, batch và serial.
6. Làm lineage drill-down tới voucher, revision, row và exact reversal source.
7. Làm quarantine/release và Work Order progress view.
8. Làm báo cáo WIP, material shortage, planned-vs-actual variance, scrap/offcut recovery, ageing và condition.
9. Thêm runtime harness và Playwright desktop/mobile.
10. Chỉ chuyển PR khỏi draft khi endpoint, UI, reports và exact-head CI đều hoàn tất.
11. Không merge #82 chỉ vì foundation CI xanh.

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

Việc cần làm:

1. Mở `https://alu.kairo.vn` và hard refresh.
2. Đăng nhập bằng tài khoản thử phù hợp.
3. Mở Sales Order mới và chọn `Giá niêm yết`.
4. Chọn `TRỤC 114_1.8LY`.
5. Xác minh ĐVT `Mét`, đơn giá `180000 VND`, Thành tiền và save-time authoritative pricing.
6. Đổi Item/UOM/bảng giá và xác minh không lấy chéo hoặc giữ giá cũ.
7. Huỷ hoặc xoá chứng từ thử an toàn.
8. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

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

- Không deploy Cloudflare nếu chưa có yêu cầu release rõ.
- Không migration, backfill hoặc mutate tenant trong Slice D.
- Không sửa production secrets hoặc DNS.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
