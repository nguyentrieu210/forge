# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Base: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- Draft PR: `#81` — `feat(ui): add MISA-style workspace tabs for MetaForge`.
- GitHub là nguồn sự thật cho code, CI và trạng thái release.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## MetaForge UI — workspace theo MISA AMIS

Nguồn tham chiếu hành vi trong phiên làm việc: file người dùng cung cấp `misa-amis-ba.zip`, đặc biệt `00_MISA_AMIS_Observed_Menu_Map.md` và các ghi chép module Kho/Mua hàng/Tổng quan. File khảo sát không được commit vào repository.

### Cấu trúc đã triển khai

- Sidebar trái chứa **phân hệ**: hiện có `Nghiệp vụ` và `Meta`.
- Thanh ngang nằm đầu vùng nội dung của phân hệ.
- Thứ tự tab bắt buộc:
  1. `Quy trình nghiệp vụ`;
  2. `Báo cáo tổng quan`;
  3. từ đây trở đi là tab nghiệp vụ/DocType.
- Một tab DocType có thể bao phủ nhiều route con như list, form, kanban, lịch, cây hoặc in; chuyển route con không làm đổi tab đang hoạt động.

### File code

- `client/apps/demo/src/DemoShell.tsx`
  - thêm metadata `WorkspaceMeta`, `WorkspaceModuleMeta`, `WorkspaceTabMeta`;
  - phân loại tab `process | overview | doctype`;
  - hỗ trợ `activeKeys` để gom các route con vào cùng tab DocType;
  - sidebar sinh từ module metadata, không còn dùng group sidebar làm tab;
  - tab ngang cuộn được và có `aria-current`.
- `client/apps/demo/src/workspace-meta.tsx`
  - khai báo module `Nghiệp vụ` và `Meta`;
  - màn Quy trình có sơ đồ bước, shortcut tới DocType/builder và modal tạo mới;
  - màn Tổng quan Meta có các thẻ DocType, Workflow, Print Format và Dashboard;
  - toàn bộ thao tác dùng `Button` của design system, không dùng native `<button>`.
- `client/apps/demo/src/App.tsx`
  - nối metadata vào `DemoShell`;
  - route mặc định mở `Quy trình nghiệp vụ`;
  - module Meta có chuỗi tab: Quy trình → Tổng quan → DocType → Workflow → Print Format → Dashboard;
  - Command Palette vẫn truy cập được toàn bộ route demo.

### Phạm vi có chủ ý

- Thay đổi hiện áp dụng cho mock/demo `App.tsx` để chốt UI và hành vi.
- `LiveApp.tsx` vẫn dùng navigation runtime cũ. Chưa đưa Meta tĩnh vào live vì live chưa có route builder Meta thật; thêm menu trước khi có route/quyền tương ứng sẽ tạo liên kết hỏng.
- Bước tiếp theo của live phải sinh workspace từ application catalog/manifest và khai báo route, permission cho builder trước.

## Verification

- Exact implementation commit: `3104c6ac567d23b0a5fa7f7fd135ca62625a757b`.
- Các commit sau implementation chỉ cập nhật `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `AI_HANDOFF.md`.
- Sáu workflow trên head cũ `464b713af4d8a0403f766f354d04ebcaee32e6b8` đều **PASS**, nhưng không đại diện cho implementation cuối.
- Tại thời điểm cập nhật, GitHub chưa trả workflow run nào cho final branch head; không được tuyên bố final CI xanh.
- Đã đọc gate `client/scripts/check-native-ui.mjs` và thay toàn bộ native button mới bằng component `Button`.
- Chưa chạy local lint/test/typecheck/build vì môi trường hiện tại không có repository checkout và dependency cache.

## Safety

- Không deploy Cloudflare.
- Không sửa production secrets hoặc DNS.
- Không đụng dữ liệu tenant.
- FIFO rollout vẫn **disabled**; luồng Purchase/FIFO độc lập với PR này.
