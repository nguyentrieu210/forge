# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Base: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- Draft PR: `#81`.
- GitHub là nguồn sự thật cho code và CI.

## Yêu cầu đã chốt

Thiết kế navigation theo cấu trúc quan sát trong `misa-amis-ba.zip`:

1. sidebar là các phân hệ;
2. tab đầu của mỗi phân hệ là `Quy trình nghiệp vụ`, có shortcut mở DocType hoặc modal tạo mới;
3. tab thứ hai là `Báo cáo tổng quan`;
4. từ tab thứ ba trở đi là các nghiệp vụ/DocType.

Phân hệ Meta phải có: Quy trình → Tổng quan → DocType → Workflow → Print Format → Dashboard.

## Đã làm

- `client/apps/demo/src/DemoShell.tsx`
  - thêm workspace/module/tab metadata;
  - phân loại `process | overview | doctype`;
  - hỗ trợ route alias để list/form/kanban cùng giữ một tab DocType active;
  - sidebar sinh từ module, tab nằm đầu vùng nội dung.
- `client/apps/demo/src/workspace-meta.tsx`
  - module Nghiệp vụ và Meta;
  - màn quy trình, shortcut, modal tạo mới;
  - báo cáo tổng quan Meta;
  - dùng design-system `Button`, không dùng native button.
- `client/apps/demo/src/App.tsx`
  - nối route và metadata;
  - route mặc định `/view/process`;
  - Command Palette giữ toàn bộ route.

## Quyết định phạm vi

- Prototype hiện chỉ áp dụng cho mock/demo `App.tsx`.
- Chưa nối `LiveApp.tsx` vì live chưa có route và permission builder Meta thật. Không tạo menu dẫn tới route giả.
- Việc nâng sang live nằm trong `NEXT_TASKS.md`.

## Verification

- Code commit trước tài liệu: `3104c6ac567d23b0a5fa7f7fd135ca62625a757b`.
- Head cũ `464b713af4d8a0403f766f354d04ebcaee32e6b8` đã PASS sáu workflow, nhưng chưa chứa implementation cuối.
- GitHub chưa trả workflow run cho exact code head mới tại thời điểm handoff.
- Đã kiểm gate `check-native-ui` và sửa native button mới.
- Chưa có local checkout/dependency cache để chạy lint/test/typecheck/build.

## Việc tiếp theo

1. Lấy exact final head sau commit tài liệu.
2. Chạy/kiểm đủ sáu workflow trên exact final head.
3. Sửa mọi lỗi lint/typecheck/build trước khi rời draft.
4. Chạy browser QA theo checklist trong `NEXT_TASKS.md`.
5. Sau khi prototype được duyệt mới thiết kế workspace metadata runtime cho LiveApp.

## Safety

- Không deploy Cloudflare.
- Không sửa production secrets/DNS.
- Không commit `.env`, `server/work/`, `tmp/` hoặc generated artifacts.
- Không đụng dữ liệu tenant và không bật FIFO.
