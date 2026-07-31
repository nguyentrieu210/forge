# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- GitHub là nguồn sự thật cho code, CI và trạng thái release.

## Mục tiêu hiện tại

Bổ sung điều hướng MetaForge theo hướng MISA: tab treo chọn phân hệ/nhóm Doctype-nghiệp vụ, sidebar chỉ hiển thị các mục thuộc phân hệ đang hoạt động.

## Thay đổi hiện có

- `client/apps/demo/src/DemoShell.tsx`
  - thêm `WorkspaceTabs`;
  - tab được sinh từ `NavItem.group`, không thêm manifest trùng;
  - active tab theo `activeKey`;
  - click tab điều hướng tới mục khả dụng đầu tiên;
  - lọc nav truyền vào `AppShell` theo group đang hoạt động;
  - giữ nguyên Command Palette trên toàn bộ nav;
  - fallback không đổi hành vi nếu chỉ có dưới hai group.
- `CURRENT_STATUS.md`: ghi trạng thái, quyết định kiến trúc và giới hạn verification.
- `NEXT_TASKS.md`: ưu tiên CI/UI validation và hướng nâng lên primitive dùng chung.

## Verification

- Chưa chạy local lint/test/typecheck/build vì không có checkout repository trong môi trường hiện tại.
- Cần mở draft PR và lấy kết quả CI trên exact final head.
- Nếu CI báo lỗi export, kiểm `Button` và `cn` từ `@metaforge/ui` trước.

## Safety state

- Không deploy Cloudflare.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated artifacts.
- FIFO rollout vẫn disabled; Purchase/FIFO là luồng độc lập.

## Việc tiếp theo

1. Mở draft PR từ `feat/metaforge-misa-workspace-tabs` vào `hotfix/alumdoor-print-list-delete`.
2. Kiểm exact PR head và toàn bộ CI.
3. Sửa lỗi typecheck/build nếu có.
4. Chạy browser QA cho desktop/mobile/collapsed sidebar.
5. Sau khi hành vi được duyệt, nâng API workspace tabs vào `@metaforge/shell` và sinh tab từ metadata runtime.
