# AI HANDOFF

Ngày cập nhật: **2026-07-31**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Base branch: `hotfix/alumdoor-print-list-delete`.
- Base head đã đồng bộ: `0488d9bb59de445b8d17b23da0c049a90ee16785`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- Draft PR: `#81`.
- Backup trước rebase: `backup/metaforge-misa-workspace-tabs-20260731` tại `826794574bcf17763450e4b7980d74564468121b`.
- GitHub là nguồn sự thật cho code, CI và release evidence.

## Yêu cầu đã chốt

Navigation theo mẫu khảo sát `misa-amis-ba.zip`:

1. sidebar là các phân hệ;
2. tab đầu là `Quy trình nghiệp vụ`, có shortcut mở DocType hoặc modal tạo mới;
3. tab thứ hai là `Báo cáo tổng quan`;
4. tab từ vị trí ba là nghiệp vụ/DocType;
5. module Meta: Quy trình → Tổng quan → DocType → Workflow → Print Format → Dashboard.

## Đã làm

- `client/apps/demo/src/DemoShell.tsx`
  - workspace metadata và tab kind `process | overview | doctype`;
  - sidebar sinh từ module;
  - route aliases giữ tab DocType active.
- `client/apps/demo/src/workspace-meta.tsx`
  - module Nghiệp vụ và Meta;
  - process flow, shortcut, modal tạo mới;
  - wrapper mobile scroll đúng cấu trúc.
- `client/apps/demo/src/App.tsx`
  - route mặc định `/view/process`;
  - create mode bằng `?new=1`;
  - Task mới dùng `NEW_TASK_DOC`, không dùng TASK-0001;
  - builder remount theo manage/new mode.
- `client/apps/demo/src/BuilderRoutes.tsx`
  - DocType create mode dùng `blankDocType()`.
- `client/apps/demo/src/workspace-navigation-selfcheck.ts`
  - khóa thứ tự tab, aliases và sáu tab Meta.
- `client/apps/demo/package.json`
  - nối selfcheck mới vào `pnpm test`.

## Forge skill review

- Đã nạp `forge-orchestrate`, `forge-build`, `forge-github-ci`, `forge-handoff`.
- Forge Skills pack `0.1.0`: `npm test` PASS, `npm run build` PASS.
- GitHub review ID `4830395339`.
- Bốn lỗi code đã sửa:
  - create Task mở dữ liệu cũ;
  - create Meta không có create mode;
  - process flow tràn mobile;
  - thiếu selfcheck.
- Nhánh cũ diverged/behind base 5 commit đã được backup và rebase lên base mới.

## Phạm vi

- UI mới hiện ở mock/demo `App.tsx`.
- `LiveApp.tsx` chưa nối module Meta vì chưa có route và permission builder thật.
- Không tạo menu live dẫn tới route giả.

## Verification còn lại

1. Lấy exact final head sau commit tài liệu này.
2. Đợi đủ sáu workflow trên exact SHA.
3. Sửa mọi lỗi lint/test/typecheck/build nếu có.
4. Chạy browser QA desktop/mobile/collapsed sidebar.
5. Chỉ chuyển PR khỏi draft khi G3/G4 có evidence PASS và PR conflict-free.

## Trạng thái production liên quan

- Sales hotfix đã release qua run `30646396613`, Worker version `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- PR Purchase/FIFO `#77` đã merge checksum lock, merge SHA `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.
- Authenticated Sales/Purchase business smoke vẫn cần session hợp lệ.

## Safety

- Không deploy Cloudflare trong PR UI.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không đụng dữ liệu tenant.
- Không bật FIFO.
- Không commit `.env`, `server/work/`, `tmp/`, backup hoặc generated evidence.
