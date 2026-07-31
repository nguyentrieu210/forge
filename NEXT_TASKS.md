# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — PR #58: Link dropdown và child-grid scroll

### Trạng thái

- Branch: `hotfix/child-grid-dropdown-scroll-20260731`.
- PR: `#58` — `fix(ui): remove recent links and restore child-grid scroll`.
- Code head trước handoff docs: `7e84c94f65374a071aa8be44ab14f943f72c5a7f`.
- Chưa merge, chưa deploy.

### Gate trước merge

1. Kiểm exact final HEAD sau cập nhật `CURRENT_STATUS.md` và `NEXT_TASKS.md`.
2. Required workflows phải PASS trên exact final HEAD:
   - PR Validation;
   - CI;
   - Sales Feature CI;
   - Purchase Feature CI;
   - Inventory and Manufacturing CI;
   - UI Pull Request Validation.
3. Đọc failed step/log thật nếu có; không đoán lỗi từ tên workflow.
4. Xác minh PR vẫn mergeable và không bị default branch tiến lên gây conflict.
5. Không merge nếu chưa có yêu cầu rõ của người dùng.

### Browser QA cần có

Trên form có child table, ưu tiên Báo giá và Đơn hàng:

1. Mở Link dropdown trong một dòng child.
2. Xác minh không còn heading hoặc nhóm `Lựa chọn gần đây` khi ô tìm kiếm trống.
3. Chọn một bản ghi, đóng/mở lại dropdown và xác minh lựa chọn vừa dùng không được lưu thành nhóm gần đây.
4. Với danh sách dropdown dài:
   - wheel vẫn cuộn danh sách khi danh sách còn khoảng cuộn;
   - ở đầu/cuối danh sách, wheel tiếp tục cuộn vùng child grid tương ứng;
   - wheel trên icon hoặc text trong option cho cùng kết quả.
5. Kiểm cả bảng child gọn trong form và bảng lớn nếu màn nghiệp vụ hỗ trợ mở rộng.
6. Kiểm scroll ngang bằng trackpad hoặc Shift+wheel khi bảng rộng.
7. Xác minh dropdown vẫn chọn được Item, UOM, Warehouse và không mất filter/quyền.
8. Ghi evidence đã redacted; không ghi cookie, token, secret hoặc dữ liệu khách hàng.

### Sau merge

- Gateway/frontend release phải là PR riêng, khóa exact merge SHA và có build, deploy, `/health`, `/`, guest boot cùng Wrangler version evidence.
- Không deploy tenant Worker vì phạm vi này chỉ là client/UI.
- Không migration hoặc mutate D1.

## Bán hàng production còn phải smoke

- Picker chỉ hiện Item `is_sales_item=1`, `disabled=0` khi tìm trống và khi gõ mã/tên.
- Một Item có hai ĐVT và hai Item Price khác nhau phải nạp đúng giá theo ĐVT.
- Đổi Item, ĐVT, Bảng giá và Kho phải nạp lại giá/tồn, không giữ preview cũ.
- Role `Kinh doanh` và `Kế toán` phải giữ đúng quyền Price List/Item Price.

## Các luồng khác

- Inventory/manufacturing, purchase/FIFO, RBAC và release automation không thay đổi trong PR `#58`.
- Trước khi tiếp tục bất kỳ luồng nào, đọc `AI_HANDOFF.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, PR body và exact-head CI.
- FIFO giữ disabled cho tới khi có rollout gate và approval riêng.

## Safety

- Không commit `.env`, `.dev.vars`, token, secret, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only.
- Không merge/deploy production nếu chưa có yêu cầu rõ và evidence phù hợp phạm vi.
