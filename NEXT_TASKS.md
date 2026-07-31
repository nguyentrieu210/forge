# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Functional production smoke cho hotfix tự điền đơn giá

Hotfix đã merge và release tenant production:

- Feature PR `#65` squash-merge SHA `db2d5abd8273a5a6c266ba7343554ebeac27618c`.
- Release preparation PR `#67` merge SHA `87b9410a0a1499100aeafce75b018117fda81ab6`.
- Execution PR `#68` đã đóng không merge sau release.
- Release run `30640747900`, job `91189756848`: backup, migration, deploy, smoke và Wrangler evidence **PASS**.
- Tenant Worker production version: `7542bba4-dc20-4794-8c92-9d26af349531`.
- `/health` = `200`, unauthenticated boot = `403`.
- Không deploy Gateway, không sửa secrets, FIFO vẫn **disabled**.

Kiểm bằng tài khoản production phù hợp và dữ liệu thử có thể huỷ/xoá an toàn:

1. Hard refresh, mở Báo giá hoặc Đơn hàng mới.
2. Chọn `Bảng giá áp dụng`, sau đó chọn Item có Item Price đúng `Bảng giá + Mã hàng + ĐVT`.
3. Xác minh `ĐVT`, `Đơn giá`, `Thành tiền` và trạng thái giá tự cập nhật trong child grid.
4. Đổi sang ĐVT thứ hai và xác minh không lấy chéo giá của ĐVT trước.
5. Đổi bảng giá ở header khi dòng đã có Item; giá dòng phải được tải lại.
6. Kiểm bản ghi Item Price có tên legacy hoặc không canonical vẫn tự điền theo field.
7. Kiểm giá disabled, sai currency, thiếu currency và duplicate active prices không trở thành rate dùng được; giao diện phải hiện chẩn đoán phù hợp.
8. Lưu chứng từ thử để xác minh server authoritative trả cùng giá preview.
9. Huỷ hoặc xoá chứng từ thử theo quy trình nghiệp vụ.
10. Nếu lỗi, ghi rõ Item, Price List, UOM, currency và thông báo trạng thái đã redacted; không ghi credential/cookie hoặc dữ liệu khách hàng thật vào evidence.

## P0 — Functional production smoke cho Link dropdown trong child table

Bản vá wheel đúng đã merge và phát hành:

- Feature PR `#62` merge SHA `b3dd1d15a1b52de698d0874b29feae79efe7ed6c`.
- Release PR `#64` merge SHA `eaf6b32709abc731bd37285501676ed1ec6267af`.
- Gateway run `30635980509`, job `91173574419`: build, stage, deploy, smoke và provider evidence **PASS**.
- Gateway production version: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Targeted Playwright trên desktop/tablet/mobile đã phát `mouse.wheel` và xác minh `scrollTop` của dropdown tăng.

Kiểm trực tiếp sau hard refresh bằng tài khoản production phù hợp, không ghi credential/cookie/dữ liệu khách hàng vào evidence:

1. Mở Báo giá hoặc Đơn hàng và mở bảng child lớn.
2. Mở dropdown `Mã hàng` có danh sách dài.
3. Đặt con trỏ trên text hoặc icon của một lựa chọn rồi dùng con lăn:
   - danh sách dropdown phải cuộn dọc;
   - không cần kéo thumb scrollbar bằng chuột.
4. Cuộn tới cuối và tiếp tục lăn xuống:
   - dropdown không cuộn quá biên;
   - vùng child grid phía sau tiếp tục cuộn nếu còn khoảng cuộn.
5. Lặp lại ở đầu danh sách theo hướng ngược lại.
6. Kiểm thêm dropdown UOM và Warehouse trong bảng lớn.
7. Đóng bảng lớn, kiểm dropdown ở bảng gọn vẫn chọn và cuộn bình thường.
8. Xác minh không còn nhóm `Lựa chọn gần đây` sau khi chọn, đóng và mở lại dropdown.
9. Xác minh Item picker vẫn giữ filter bán hàng và tìm được theo mã/tên.
10. Nếu thất bại, ghi rõ viewport, loại dropdown, vị trí con trỏ, hướng wheel và ảnh/video đã redacted.

## Purchase/FIFO — functional browser QA còn lại

- PR `#14` đã squash-merge thành `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Tenant Worker production hiện hành: `7542bba4-dc20-4794-8c92-9d26af349531`.
- FIFO rollout vẫn **disabled**; deploy code không phải approval kích hoạt FIFO.

Dùng dữ liệu thử phù hợp:

1. Desktop/mobile: mở Purchase Order/Purchase Receipt, kiểm submit preview và allocation timeline.
2. Kiểm settlement close/reverse, reason bắt buộc, capability/permission và confirmation scope.
3. Kiểm manual FIFO override, validation reason và audit append-only.
4. Kiểm supplier debt drill-down, filters, summaries và CSV export.
5. Smoke PO → Receipt → cancel → settlement/reverse bằng chứng từ test có thể dọn/hủy an toàn.

### Blocker trước khi kích hoạt FIFO production

1. Chạy staging migration và backfill dry-run trên bản sao dữ liệu phù hợp.
2. Review resolved/unresolved report và PO-level checksum.
3. `unresolved_count` phải bằng `0`; không đoán hoặc tự sửa row ID.
4. Chạy staging smoke đầy đủ PO → Receipt → cancel → settlement/manual override → report.
5. Xác minh supplier contention/D1 latency ở tải gần production.
6. Tạo production backup mới ngay trước activation.
7. Chỉ activation khi có explicit approval riêng.

## Bán hàng — functional browser acceptance còn lại

1. Item picker chỉ hiện Item `is_sales_item=1`, `disabled=0` khi tìm trống và tìm theo mã/tên.
2. Multi-UOM: kiểm giá/tồn theo Item + Kho + ĐVT, không lấy chéo UOM.
3. Kiểm Price List/Item Price với role `Kinh doanh` và `Kế toán`.
4. Huỷ hoặc xoá chứng từ test theo quy trình nghiệp vụ sau khi thu evidence.

## Theo dõi production

- Theo dõi Gateway/Tenant 4xx/5xx mới, lỗi lấy `alumdoor.sales.item_context`, lỗi pricing khi lưu và lỗi mở/chọn Link dropdown.
- Rollback khi có API 5xx diện rộng, pricing sai có thể ghi chứng từ, permission regression hoặc mất dữ liệu CRUD.
- Endpoint smoke đã đạt nhưng không thay thế functional browser smoke có đăng nhập.

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
