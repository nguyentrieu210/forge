# NEXT TASKS

Ngày cập nhật: **2026-08-16**.

Đây là active queue ngắn. Lịch sử implementation/convergence nằm trong Git/PR và retained evidence; không kéo các board/prompt/handoff cũ trở lại làm live plan.

## 1. Repository hygiene

Đợt hiện hành:

- hợp nhất documentation authority;
- xóa duplicate/stale coordination docs có final provenance thay thế;
- xóa temporary Sentrux trigger/probe/experiment artifacts đã hoàn thành;
- thêm `SENTRUX_MAP.md` để agent định vị ownership trước khi sửa;
- thêm `.sentrux/rules.toml` để bắt đầu codify architecture constraints;
- giữ release/audit/source-lock evidence khi chưa chứng minh được là disposable.

Không xóa file chỉ vì tên cũ. Chỉ xóa khi vai trò của nó đã được current authority, final evidence hoặc Git/PR history thay thế rõ ràng.

## 2. Sentrux convergence tiếp theo

Sau hygiene PR:

1. scan exact current `main`;
2. lưu gate baseline;
3. dùng `SENTRUX_MAP.md` để chọn đúng owner/hotspot;
4. ưu tiên root cause còn tệ nhất thay vì tối ưu một metric cô lập;
5. mỗi candidate phải không regression quality và phải pass compile/test của blast radius;
6. chỉ siết `.sentrux/rules.toml` khi current `main` đã pass rule mới.

Không dùng workflow experiment một lần như permanent architecture. Candidate thất bại phải bị remove sau khi rút được evidence.

## 3. Documentation maintenance

Khi topology/authority đổi:

- cập nhật `SENTRUX_MAP.md` và `docs/ARCHITECTURE.md` trong cùng PR;
- cập nhật `CURRENT_STATUS.md` chỉ khi checkpoint materially thay đổi;
- giữ `NEXT_TASKS.md` ngắn, không biến thành changelog;
- không tạo thêm architecture/status file song song ở root, `client/` hoặc `server/` nếu canonical doc đã tồn tại;
- program prompts/open-order/handoffs phải bị xóa sau convergence trừ khi chúng là final audit evidence.

## 4. Product work

Mọi product/domain work mới phải bắt đầu từ exact current `main`, xác định authority trong `SENTRUX_MAP.md`, rồi đọc BRD/spec/evidence đúng scope. Không tái sử dụng stale branch baseline hoặc stale agent board.

## 5. Production boundary

Release/deploy/migration/provider/customer-data work chỉ thực hiện khi user authorize rõ. Source cleanup hoặc Sentrux improvement không tự mở quyền production mutation.
