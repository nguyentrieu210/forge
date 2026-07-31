# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## Bán hàng — hotfix lọc mặt hàng child table

### Đã hoàn thành

- PR `#53` đã squash-merge.
- Feature merge SHA: `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- `buildLinkFilters` hỗ trợ object-form và array-form metadata filters.
- Regression kiểm đúng `{"is_sales_item":1,"disabled":0}`, operator tuple, dependent `eval:` và prototype-key guards.
- Sáu workflow exact-head đều **PASS**: PR Validation, CI, Sales, Purchase, Inventory/Manufacturing và UI Pull Request Validation.
- Release PR `#54` đã squash-merge thành `671b72ca374ae0227ec8f52c09d65de83108e1a2`.
- Gateway release run `30630931291`, job `91156832579`: build, stage, deploy, smoke và provider evidence **PASS**.
- Gateway version production: `dc6eada4-e4a1-451a-a92f-66fe04050707`.
- Evidence artifact: `gateway-production-release-30630931291`, artifact ID `8793326579`.
- Không deploy tenant Worker, không migration/mutate D1, không sửa production secrets.
- FIFO vẫn disabled.

### P0 — Functional browser smoke sau deploy

Dùng dữ liệu và tài khoản production phù hợp, không ghi credential hoặc dữ liệu khách hàng vào evidence:

1. Mở Báo giá và Đơn hàng, thêm dòng mới trong child table.
2. Kiểm picker `Mã hàng` khi ô tìm kiếm trống:
   - Item `is_sales_item=1`, `disabled=0` phải xuất hiện;
   - Item `is_sales_item=0` phải không xuất hiện;
   - Item `disabled=1` phải không xuất hiện.
3. Gõ tìm theo cả mã và tên, xác minh filter không bị mất.
4. Kiểm recent links không hiển thị lại Item đã bị disabled hoặc mất quyền bán.
5. Hard refresh trình duyệt rồi kiểm lại để loại cache bundle/metadata cũ.
6. Kiểm ít nhất một dòng Báo giá và một dòng Đơn hàng chọn được Item hợp lệ, tự nạp ĐVT/giá/tồn như trước.
7. Ghi thời điểm, actor role, mã Item thử và kết quả đã redacted; không chụp token, cookie, secret hoặc dữ liệu khách hàng.
8. Nếu thất bại, ghi rõ trường hợp: empty search, typed search, recent links hay metadata cache; mở issue kèm evidence đã redacted.

## Bán hàng multi-UOM — browser acceptance còn lại

1. Item có ít nhất hai ĐVT và hai Item Price khác nhau.
2. Đổi Item, ĐVT, Bảng giá và Kho trên Báo giá/Đơn hàng.
3. Xác minh giá không bị lấy chéo giữa ĐVT.
4. Xác minh tồn quy đổi đúng ĐVT bán.
5. Smoke Item Price legacy và các giá lỗi: thiếu/sai currency, rate âm/sai định dạng, disabled.
6. Dùng role `Kinh doanh` và `Kế toán` để xác minh quyền Price List/Item Price.
7. Huỷ hoặc xoá chứng từ test theo quy trình nghiệp vụ sau khi thu evidence.

## Theo dõi production

- Theo dõi Gateway 4xx/5xx mới liên quan Link search và `alumdoor.sales.item_context`.
- Rollback nếu có login/API 5xx diện rộng, Link picker không tải được, permission regression hoặc mất khả năng tạo chứng từ.
- Không bật reservation/ATP trong release này.

## RBAC

- Chạy staging/browser QA riêng cho user lifecycle, role refresh, password/session revoke, audit log và tenant isolation.
- Không dùng dữ liệu khách hàng thật hoặc commit credential/evidence thô.
- Slice tiếp theo chỉ mở khi scope rõ và có gate riêng.

## Release automation cleanup

- Giữ `.github/workflows/gateway-production-release.yml` làm đường Gateway có exact SHA, smoke và Wrangler version evidence.
- Tenant evidence lấy từ Wrangler NDJSON.
- Rà phần release trùng lặp trong `.github/workflows/pr-validation.yml` bằng PR riêng; không phát hành production chỉ để thử workflow.

## Các luồng khác

- Inventory/manufacturing, purchase/FIFO và các PR đang mở không thay đổi trong đợt hotfix này.
- Trước khi tiếp tục, đọc PR body, exact-head CI, `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và kiểm default HEAD hiện hành.
- Không merge hoặc deploy luồng khác nếu chưa có yêu cầu rõ.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Mọi production release cần exact target SHA, provider evidence và smoke phù hợp phạm vi.
