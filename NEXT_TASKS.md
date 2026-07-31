# NEXT TASKS

Ngày cập nhật: **2026-08-01**.

## P0 — authenticated Sales smoke sau app Worker release

Sales Unicode fix đã được deploy đúng Worker thực thi nghiệp vụ:

- feature merge SHA `a48524b93489c92296c57fc5f223e41d505de7aa`;
- Worker `cloudforge-app-alumdoor`;
- dispatch namespace `cloudforge-production`;
- execution PR `#104` đã đóng không merge;
- release run `30651057535`;
- release job `91224118455`;
- Version ID `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`;
- deployment time `2026-07-31T17:25:19.115Z`;
- build, focused regression, Wrangler dry-run, live deploy, provider identity/namespace và bindings: PASS.

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

## App Worker release evidence

- Workflow PR `#100`, merge SHA `1487dbd76f516c0d505120924012b262a5f19857`.
- Workflow fix PR `#102`, merge SHA `cbe60228fb10a3b51b52880fb178c164b63ff9f8`.
- Lượt fail trước deploy: run `30650655515`, job `91222799878`; không có Wrangler live deploy.
- Lượt thành công: run `30651057535`, job `91224118455`.
- Artifact ID `8801385744`.
- Artifact digest `sha256:0cf123014d3b4d0c1256f1d37b0e9b7a11882581e22c19c0da6a664b4f4b4e20`.
- Artifact expiry `2026-08-30T17:25:19Z`.

## P0 — tránh lặp lại sai release target

1. Mọi thay đổi dưới `server/apps-src/alumdoor-worker/**` phải release `cloudforge-app-alumdoor` vào `cloudforge-production`.
2. Không coi version `cloudforge-tenant-alu` hoặc Gateway `/health` là bằng chứng app Worker đã cập nhật.
3. Release evidence phải có:
   - exact code SHA;
   - app Worker name;
   - dispatch namespace;
   - Cloudflare Version ID;
   - provider script identity;
   - bindings `PLATFORM` và `AI`.
4. Execution PR phải đóng không merge.

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
