# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — Merge, release và smoke hotfix tự điền đơn giá

PR `#65` sửa child grid không tự điền giá khi Item Price có field đúng nhưng tên record không canonical.

### Trước merge

1. Xác minh PR vẫn mergeable và base không tiến thêm thay đổi xung đột.
2. Kiểm exact final head sau hai commit handoff; không dùng kết quả CI của code head cũ để merge head mới.
3. Cả sáu workflow phải PASS; Gateway/Tenant release jobs trong PR phải SKIPPED.
4. Squash-merge chỉ khi người dùng yêu cầu rõ.

### Khi được yêu cầu release

1. Hotfix sửa cả `alumdoor.sales.item_context` và pricing authoritative trong tenant runtime, nên release cần Tenant Worker `alu`; chỉ release Gateway nếu có thay đổi frontend riêng.
2. Dùng exact merged SHA, backup production D1 theo workflow chuẩn trước tenant deploy, chạy migration dry-run/live dù dự kiến không có migration mới, deploy và smoke `/health` + guest boot.
3. Không sửa production secrets, không kích hoạt FIFO và không mutate dữ liệu Item Price trong release.

### Functional production smoke sau deploy

1. Hard refresh, mở Báo giá hoặc Đơn hàng mới.
2. Chọn `Bảng giá áp dụng`, sau đó chọn Item có Item Price đúng `Bảng giá + Mã hàng + ĐVT`.
3. Xác minh `ĐVT`, `Đơn giá`, `Thành tiền` và trạng thái giá tự cập nhật trong child grid.
4. Đổi sang ĐVT thứ hai và xác minh không lấy chéo giá của ĐVT trước.
5. Đổi bảng giá ở header khi dòng đã có Item; giá dòng phải được tải lại.
6. Kiểm bản ghi Item Price có tên legacy hoặc không canonical vẫn tự điền theo field.
7. Kiểm giá disabled, sai currency, thiếu currency và duplicate active prices không trở thành rate dùng được; giao diện phải hiện chẩn đoán phù hợp.
8. Lưu chứng từ thử để xác minh server authoritative trả cùng giá preview; sau đó huỷ/xoá chứng từ thử theo quy trình.

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
- Tenant Worker production version: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
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

- Theo dõi Gateway 4xx/5xx mới, lỗi mở/chọn Link dropdown, focus trap hoặc keyboard navigation regression.
- Rollback khi có login/API 5xx diện rộng, Link dropdown không mở/chọn được, permission regression hoặc mất dữ liệu CRUD.
- Endpoint smoke đã đạt nhưng không thay thế functional browser smoke có đăng nhập.

## RBAC

- Chạy staging/browser QA riêng cho user lifecycle, role refresh, password/session revoke, audit log và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.

## Release automation

- Giữ `.github/workflows/gateway-production-release.yml` làm đường Gateway có exact SHA, smoke và provider evidence.
- Ở tenant release kế tiếp, xác minh `.github/workflows/ci.yml` tạo summary/version từ Wrangler NDJSON.
- `cloudflare-production-observation.yml` chỉ dùng manual smoke; không dùng để suy ra version/deployment ID.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Mọi production activation cần backup, rollback plan, exact evidence và approval riêng.
