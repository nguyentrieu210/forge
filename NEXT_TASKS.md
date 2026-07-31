# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Bán hàng multi-UOM — release production đã hoàn thành

### Đã xong

- Feature PR `#25` đã squash-merge.
- Release SHA: `4500799f13de48ada1948ab583afcf2e52b4c2dd`.
- Exact Item Price theo `Bảng giá + Mặt hàng + ĐVT`.
- Tương thích Item Price legacy.
- Picker ĐVT theo Item/UOM Conversion.
- Nạp giá và tồn theo Item + Kho + ĐVT trên Báo giá/Đơn hàng.
- Từ chối giá thiếu/sai currency, rate âm/sai định dạng hoặc disabled.
- Test `alumdoor.sales.item_context` và test quyền metadata server-side.
- Exact-head unit, SQL, brief, client test, typecheck, build, Chromium QA và cookie-auth smoke đều PASS trước merge.
- Tenant `alu` đã backup, apply migration `0030_rbac_audit.sql`, deploy và smoke production.
- Tenant Worker version: `e15bc6ad-e343-49af-aa2f-c65d31c09fea`.
- Gateway/frontend đã build, stage, deploy và smoke production.
- Gateway version: `8f397962-b54c-409d-b494-06c22ca13bb2`.
- `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- FIFO rollout vẫn disabled; không sửa production secrets.

### P0 — Hotfix lọc mặt hàng trong child table

Production browser đã phát hiện picker `Mã hàng` vẫn hiện Item ngoài phạm vi bán dù metadata có `is_sales_item=1` và `disabled=0`.

- Branch: `hotfix/sales-child-item-filter-20260731`.
- Fix `buildLinkFilters` để nhận cả object form và array form.
- Regression riêng kiểm object filter bán hàng, `eval:` context và operator tuple.
- Chờ required CI trên exact final HEAD.
- Sau CI cần browser smoke trên Báo giá và Đơn hàng:
  - Item `is_sales_item=1`, `disabled=0` phải xuất hiện;
  - Item `is_sales_item=0` phải không xuất hiện;
  - Item `disabled=1` phải không xuất hiện;
  - tìm theo mã/tên vẫn giữ filter;
  - recent links không được làm lộ Item đã bị filter.
- Chưa merge hoặc deploy Gateway/frontend; cần yêu cầu rõ trước production release.

### P0 — Browser sales smoke sau release

Rủi ro này đã được chấp nhận để merge/deploy nhưng vẫn phải đóng bằng bằng chứng thật:

1. Chuẩn bị một Item có ít nhất hai ĐVT và hai Item Price khác nhau.
2. Chuẩn bị kho có tồn mẫu đủ để thấy cả trạng thái còn hàng và hết hàng.
3. Dùng tài khoản `Kinh doanh`:
   - tạo Báo giá/Đơn hàng thử;
   - đổi Item, ĐVT, Bảng giá và Kho;
   - xác minh giá không bị lấy chéo giữa ĐVT;
   - xác minh tồn quy đổi đúng ĐVT bán;
   - xác minh không tạo/sửa/xoá được `Price List` và `Item Price`.
4. Dùng tài khoản `Kế toán` xác minh vẫn quản lý được `Price List` và `Item Price`.
5. Smoke Item Price legacy:
   - không UOM vẫn dùng được;
   - có UOM chỉ dùng khi dòng khớp tuyệt đối.
6. Smoke các giá lỗi: thiếu currency, sai currency, rate âm, rate sai định dạng và disabled.
7. Ghi screenshot, thời điểm, actor role, document test và kết quả; không ghi dữ liệu khách hàng hoặc secret.
8. Xoá hoặc huỷ chứng từ test theo quy trình nghiệp vụ sau khi thu bằng chứng.

### P0 — Theo dõi sau release

- Kiểm log Gateway và tenant Worker cho 4xx/5xx mới liên quan `alumdoor.sales.item_context`.
- Kiểm phản hồi người dùng về giá sai ĐVT, tồn sai kho hoặc form không nạp lại khi đổi bối cảnh.
- Rollback nếu có login/API 5xx diện rộng, tenant binding sai, giá điền sai UOM, permission regression hoặc mất khả năng tạo chứng từ.
- Không bật reservation/ATP trong release này.

### P1 — Reservation/ATP

Thiết kế riêng sau khi sales smoke hoàn tất:

- reservation theo Sales Order;
- available-to-promise theo kho/ngày giao;
- release reservation khi cancel/amend;
- concurrency và chống oversell;
- UI phân biệt tồn hiện tại, đã giữ và khả dụng.

## RBAC — Slice A/B và post-merge QA đã hoàn thành

### Đã xong

- Slice A PR `#37` đã merge.
- Slice B PR `#45` đã merge thành `4341091b8a8dc0cea3de96510c34dc68a8b00ecb`.
- Post-merge QA PR `#48` đã merge thành `dfd8f0c737e452cd0183b67acde8a631871f7274`.
- Regression `server/tests/rbac-post-merge-qa.test.mjs` đã được giữ trên default.
- Exact-head `0c8c20093f561392ae3f6ad05f019bf980b5ed3f` đã PASS:
  - PR Validation run `30628567731`, job `91149404125`;
  - Sales Feature CI run `30628565369`, job `91149395506`;
  - Inventory and Manufacturing CI run `30628565336`, job `91149395103`;
  - UI Pull Request Validation run `30628565311`, job `91149394897`.
- Browser QA và local tenant cookie-auth smoke PASS.
- Tenant/Gateway release jobs đều skipped; không deploy trong đợt QA này.

### P0 — RBAC staging QA chuyên biệt

Chỉ chạy trên staging hoặc tenant thử nghiệm được chỉ định rõ, không dùng dữ liệu khách hàng thật:

1. Tạo user mới cùng role grant và xác minh audit `user.create`.
2. Thay role và xác minh quyền đổi ngay trên phiên hiện tại.
3. Vô hiệu hóa user và xác minh phiên đang mở bị từ chối.
4. Reset password và xác minh session epoch làm phiên cũ hết hiệu lực.
5. Xác minh self-disable, self-demote và last-admin guard bằng tài khoản thử.
6. Đọc audit log thực, kiểm before/after, actor, source, trace và không có secret/hash/token.
7. Thêm/xóa User Permission trên hai tenant thử và xác minh không rò scope chéo tenant.
8. Ghi evidence đã redacted; không commit credential, cookie, token, raw database dump hoặc dữ liệu khách hàng.

### P1 — RBAC Slice C

Chỉ mở branch riêng sau khi staging QA được review hoặc có quyết định scope rõ:

- audit query/read model và UI xem lịch sử;
- UX quản trị user/role/scope hoàn chỉnh;
- pagination/filter/export redacted cho audit;
- session administration và revoke reason;
- staging/browser regression chuyên biệt;
- không deploy production nếu chưa có approval riêng.

## Release automation cleanup

- Giữ `.github/workflows/gateway-production-release.yml` làm đường Gateway có version evidence.
- Tenant version evidence lấy từ Wrangler NDJSON, không gọi endpoint deployments đã trả `404`.
- Rà lại `.github/workflows/pr-validation.yml` và bỏ phần release trùng lặp khi đã xác nhận workflow chuyên dụng ổn định.
- Mọi thay đổi release automation phải qua PR/test; không phát hành lại production chỉ để kiểm workflow.

## Các luồng đang mở

### Inventory/manufacturing

- PR `#27` là nguồn authoritative cho scope, exact HEAD, CI và merge readiness.
- Sau merge mới chạy live catalog audit read-only/redacted rồi lập remediation plan.
- Không commit raw audit report.

### Purchase/FIFO

- PR `#14` vẫn phải được kiểm lại migration head trước mọi merge/deploy.
- FIFO tenant `alu` giữ disabled cho tới khi backfill/checksum, staging smoke và explicit activation approval hoàn tất.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không mutate production từ PR review thông thường.
- Mọi production release cần exact target SHA, backup, provider evidence và smoke.
