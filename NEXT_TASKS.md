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

### RBAC Slice B

- PR `#45` là nguồn authoritative cho exact HEAD, CI và review state.
- Chỉ merge sau gate hiện hành và explicit approval.
- Browser QA nghiệp vụ quyền thật vẫn là bước sau code gate.

### Purchase/FIFO

- PR `#14` vẫn phải được kiểm lại migration head trước mọi merge/deploy.
- FIFO tenant `alu` giữ disabled cho tới khi backfill/checksum, staging smoke và explicit activation approval hoàn tất.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không mutate production từ PR review thông thường.
- Mọi production release cần exact target SHA, backup, provider evidence và smoke.
