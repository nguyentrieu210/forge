# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Purchase/FIFO — code correction và Tenant release đã hoàn tất

- PR `#63` squash-merge SHA `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Migration `0032_purchase_reversed_window_corrections.sql` đã áp dụng production qua recorded migration runner.
- Chromium Purchase QA đã PASS 6/6 desktop/mobile; exact final-head workflows đều PASS.
- Release preparation PR `#70` merge SHA `160ac81f28da3de6d96fc64741d257eccb0903a9`.
- Execution PR `#72` đã đóng không merge.
- Release run `30643069110`, job `91197586569`: backup, migration, deploy, smoke và Wrangler evidence **PASS**.
- Tenant Worker production version: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- `/health` = `200`, unauthenticated boot = `403`.
- Backup artifact ID `8798262944`; release evidence artifact ID `8798283613`.
- Không deploy Gateway, không sửa DNS/secrets, FIFO vẫn **disabled**.

### P0 — blocker trước khi kích hoạt FIFO production

1. Chuẩn bị staging tenant hoặc bản sao dữ liệu phù hợp; không dùng dữ liệu khách hàng thô làm artifact.
2. Chạy migration/backfill dry-run và review resolved/unresolved report.
3. Review PO-level checksum; `unresolved_count` bắt buộc bằng `0`.
4. Chạy backfill execute trên staging và xác minh ledger counts/checksum, rollout state vẫn `enabled=0`.
5. Chạy authenticated business smoke PO → Receipt → cancel → settlement/reverse → manual override → supplier debt report.
6. Xác minh supplier contention và D1 latency ở tải gần production.
7. Tạo production backup mới ngay trước activation và chuẩn bị rollback plan.
8. Chỉ activation khi có explicit approval riêng kèm exact checksum; approval deploy code không phải approval bật FIFO.

### P0 — functional production acceptance Purchase

1. Hard refresh, mở Purchase Order/Purchase Receipt bằng tài khoản thử phù hợp.
2. Kiểm submit preview và allocation timeline trên desktop/mobile.
3. Kiểm settlement close/reverse, reason bắt buộc, capability/permission và confirmation scope.
4. Kiểm manual FIFO override, validation reason và audit append-only.
5. Kiểm supplier debt drill-down, filters, summaries và CSV export.
6. Smoke PO → Receipt → cancel → settlement/reverse bằng chứng từ test có thể dọn/hủy an toàn.
7. Không ghi credential, cookie, token hoặc dữ liệu khách hàng thật vào evidence.

## P0 — Functional production smoke cho hotfix tự điền đơn giá

Hotfix đã merge và release tenant production; Tenant Worker hiện đã được thay bởi Purchase correction release nhưng vẫn chứa hotfix giá:

- Feature PR `#65` squash-merge SHA `db2d5abd8273a5a6c266ba7343554ebeac27618c`.
- Release run `30640747900`, job `91189756848`: backup, migration, deploy, smoke và Wrangler evidence **PASS**.

Kiểm bằng tài khoản production phù hợp và dữ liệu thử có thể huỷ/xoá an toàn:

1. Hard refresh, mở Báo giá hoặc Đơn hàng mới.
2. Chọn `Bảng giá áp dụng`, sau đó chọn Item có Item Price đúng `Bảng giá + Mã hàng + ĐVT`.
3. Xác minh `ĐVT`, `Đơn giá`, `Thành tiền` và trạng thái giá tự cập nhật trong child grid.
4. Đổi sang ĐVT thứ hai và xác minh không lấy chéo giá của ĐVT trước.
5. Đổi bảng giá ở header khi dòng đã có Item; giá dòng phải được tải lại.
6. Kiểm bản ghi Item Price có tên legacy hoặc không canonical vẫn tự điền theo field.
7. Kiểm giá disabled, sai currency, thiếu currency và duplicate active prices không trở thành rate dùng được.
8. Lưu chứng từ thử để xác minh server authoritative trả cùng giá preview.
9. Huỷ hoặc xoá chứng từ thử theo quy trình nghiệp vụ.
10. Không ghi credential/cookie hoặc dữ liệu khách hàng thật vào evidence.

## P0 — Functional production smoke cho Link dropdown trong child table

- Feature PR `#62` merge SHA `b3dd1d15a1b52de698d0874b29feae79efe7ed6c`.
- Gateway run `30635980509`, job `91173574419`: build, stage, deploy, smoke và provider evidence **PASS**.
- Gateway production version: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.

Kiểm trực tiếp sau hard refresh bằng tài khoản production phù hợp:

1. Mở Báo giá hoặc Đơn hàng và mở bảng child lớn.
2. Mở dropdown `Mã hàng` có danh sách dài; wheel phải cuộn chính danh sách.
3. Khi dropdown chạm đầu/cuối, wheel phải tiếp tục cuộn vùng child grid nếu còn khoảng cuộn.
4. Kiểm thêm dropdown UOM và Warehouse trong bảng lớn.
5. Đóng bảng lớn, kiểm dropdown ở bảng gọn vẫn chọn và cuộn bình thường.
6. Xác minh không còn nhóm `Lựa chọn gần đây`.
7. Xác minh Item picker vẫn giữ filter bán hàng và tìm được theo mã/tên.
8. Không ghi credential/cookie/dữ liệu khách hàng vào evidence.

## Bán hàng — functional browser acceptance còn lại

1. Item picker chỉ hiện Item `is_sales_item=1`, `disabled=0` khi tìm trống và tìm theo mã/tên.
2. Multi-UOM: kiểm giá/tồn theo Item + Kho + ĐVT, không lấy chéo UOM.
3. Kiểm Price List/Item Price với role `Kinh doanh` và `Kế toán`.
4. Huỷ hoặc xoá chứng từ test theo quy trình nghiệp vụ sau khi thu evidence.

## Theo dõi production

- Theo dõi Gateway/Tenant 4xx/5xx mới, Purchase allocation/settlement/supplier debt, lỗi `alumdoor.sales.item_context`, pricing và Link dropdown.
- Rollback khi có API 5xx diện rộng, pricing sai có thể ghi chứng từ, permission regression, mất dữ liệu CRUD hoặc lỗi Purchase làm sai ledger.
- Endpoint smoke, component harness và local cookie-auth smoke không thay thế functional production smoke có đăng nhập.

## RBAC

- Chạy staging/browser QA riêng cho user lifecycle, role refresh, password/session revoke, audit log và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.

## Release automation

- Giữ `.github/workflows/gateway-production-release.yml` làm đường Gateway có exact SHA, smoke và provider evidence.
- Tenant release dùng `.github/workflows/ci.yml`: backup → migrate → deploy → smoke → Wrangler version evidence.
- Execution PR chỉ dùng để kích hoạt release và phải đóng không merge sau khi hoàn tất.
- `cloudflare-production-observation.yml` chỉ dùng manual smoke; không dùng để suy ra version/deployment ID.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Mọi production activation cần backup, rollback plan, exact evidence và approval riêng.
