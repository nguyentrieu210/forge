# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Base branch: `hotfix/alumdoor-print-list-delete`.
- Base head đã đồng bộ: `0488d9bb59de445b8d17b23da0c049a90ee16785`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- Draft PR: `#81` — `feat(ui): add MISA-style module and Meta workspace navigation`.
- Backup trước khi rebase: `backup/metaforge-misa-workspace-tabs-20260731` tại `826794574bcf17763450e4b7980d74564468121b`.
- Không commit `.env`, secret, `server/work/`, `tmp/`, backup hoặc generated evidence.

## MetaForge UI — workspace theo MISA AMIS

Nguồn hành vi: bộ BA `misa-amis-ba.zip` người dùng cung cấp trong phiên làm việc; file khảo sát không được commit vào repository.

### Đã triển khai

- Sidebar trái chứa phân hệ `Nghiệp vụ` và `Meta`.
- Thanh tab ngang nằm đầu vùng nội dung.
- Thứ tự tab được khóa:
  1. `Quy trình nghiệp vụ`;
  2. `Báo cáo tổng quan`;
  3. các tab nghiệp vụ/DocType.
- Phân hệ Meta: Quy trình → Tổng quan → DocType → Workflow → Print Format → Dashboard.
- Một tab DocType bao phủ các route con list/form/kanban/tree/calendar/gantt/print mà không đổi tab active.
- Tab Quy trình có shortcut và modal tạo mới.
- Create mode dùng query `?new=1`, giữ nguyên tab active nhưng render draft mới.
- `Tạo công việc` render `NEW_TASK_DOC`, không còn mở `TASK-0001`.
- `DocType mới` khởi tạo bằng `blankDocType()`, không còn chỉnh `taskMeta` hiện hữu.
- Process flow dùng wrapper `overflow-x-auto` và inner `min-w-max` để không làm tràn viewport mobile.

### File code

- `client/apps/demo/src/DemoShell.tsx`
- `client/apps/demo/src/App.tsx`
- `client/apps/demo/src/workspace-meta.tsx`
- `client/apps/demo/src/BuilderRoutes.tsx`
- `client/apps/demo/src/BuilderRoutesLazy.tsx`
- `client/apps/demo/src/workspace-navigation-selfcheck.ts`
- `client/apps/demo/package.json`

### Review và verification

- Forge Skills pack `0.1.0`: `npm test` PASS, `npm run build` PASS.
- Review GitHub ID `4830395339` ghi sáu phát hiện G1–G4.
- Bốn phát hiện code đã được sửa: create Task, create Meta, mobile overflow và thiếu selfcheck.
- Selfcheck mới khóa thứ tự tab, route aliases và đủ sáu tab Meta; đã được nối vào `pnpm test`.
- Nhánh đã được rebase lên base head mới, không còn đè mất cập nhật Purchase/FIFO trong handoff.
- Chưa được phép tuyên bố G3/G4 PASS cho đến khi GitHub Actions xanh trên exact final head.
- Không có local checkout/dependency cache để chạy toàn bộ repository gate ngoài CI.

### Phạm vi có chủ ý

- Prototype hiện áp dụng cho mock/demo `App.tsx`.
- `LiveApp.tsx` chưa nối Meta vì live chưa có route và permission builder thật. Không tạo menu dẫn tới route giả.

## Bán hàng — hotfix tự điền giá đã release production

- Feature PR `#78` squash-merge SHA `60c604de69804b9daf9fb90bf9a5d6e86bb3af2d`.
- Release run `30646396613`, job `91208710455`: **SUCCESS**.
- Tenant Worker `cloudforge-tenant-alu`, version `7738ee39-bb39-4a38-bf8d-5e2e1834e572`.
- Backup, recorded migrations, deploy và production smoke: PASS.
- `/health = 200`; guest boot = `403`.
- Còn thiếu authenticated functional smoke cho `Giá niêm yết + TRỤC 114_1.8LY + Mét = 180000 VND` và kiểm không lấy chéo UOM.

## Purchase/FIFO

- PR `#63` đã release lifecycle correction lên tenant `alu`.
- PR `#75` đã merge readiness wrapper/runbook.
- PR `#77` đã merge checksum lock cho mọi staging/production write mode.
- Merge SHA PR `#77`: `a67d62377f1869d95906320636eabbd9bbd56ab7`.
- FIFO rollout vẫn **disabled**.

## Production smoke

Workflow `Cloudflare Production Smoke Observation` chỉ chạy read-only:

- health `200`;
- root `200`;
- guest boot `403`;
- evidence upload ngoài repository;
- không deploy, migrate, mutate tenant hoặc đọc production secrets.

## Safety

- Không deploy Cloudflare trong PR UI này.
- Không sửa production secrets hoặc DNS.
- Không migrate/mutate D1.
- Không đụng dữ liệu tenant.
- Không bật FIFO.
