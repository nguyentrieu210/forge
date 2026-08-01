# Forge — nền ERP tương thích Frappe chạy trên Cloudflare

Monorepo hợp nhất CloudForge backend và MetaForge frontend để xây nền ERP meta-driven: tương thích hành vi Frappe ở boundary cần thiết, chạy trên Cloudflare và hỗ trợ đóng gói/cài app nghiệp vụ.

| Thư mục | Vai trò |
|---|---|
| [`server/`](server/) | Kernel/backend: Workers for Platforms, Durable Objects, D1 tenant, Queues/R2, ERP domain và Frappe-shaped API |
| [`client/`](client/) | MetaForge Desk React: metadata-driven UI, form/list/report/builder và app surfaces |

## Trạng thái vận hành

**README không phải live status.** Agent và người phát triển phải dùng các file canonical sau:

1. [`RUNBOOK.md`](RUNBOOK.md) — quy tắc vận hành.
2. [`CURRENT_STATUS.md`](CURRENT_STATUS.md) — snapshot trạng thái hiện tại đã xác minh.
3. [`NEXT_TASKS.md`](NEXT_TASKS.md) — hàng đợi công việc active.
4. [`AI_HANDOFF.md`](AI_HANDOFF.md) — handoff kỹ thuật cô đọng.

GitHub là nguồn sự thật cho exact branch head, pull request, CI, merge và release evidence. Không suy trạng thái hiện tại từ bảng tiến độ cũ, lịch sử chat hoặc tên branch được ghi trong tài liệu lịch sử.

## Kiến trúc chính

Forge dùng CloudForge làm authoritative backend/kernel và MetaForge làm Desk/client. Boundary phía client hướng theo Frappe-shaped contracts để tận dụng mô hình DocType, document lifecycle, permission, metadata và builder mà không phụ thuộc vào Frappe Python runtime.

Tài liệu nền:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/API_SURFACE.md`](docs/API_SURFACE.md)
- [`docs/APP_FACTORY.md`](docs/APP_FACTORY.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — **strategic only, NOT LIVE STATUS**
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — evidence theo checkpoint, không thay thế CI hiện tại

## Công xưởng app

Forge hỗ trợ authoring app/brief và cài app qua metadata/compiler/runtime thay vì phải tạo một frontend riêng cho từng app. Contract, mặc định an toàn và hướng dẫn authoring nằm trong [`docs/APP_FACTORY.md`](docs/APP_FACTORY.md).

## Chạy local

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
```

Các package server/client có script riêng trong workspace tương ứng. Chạy gate theo phạm vi thay đổi và kiểm tra workflow GitHub trước khi kết luận PASS.

## Production boundary

Không tự hiểu yêu cầu sửa code là authorization deploy production. Cloudflare/production deploy, production migration, production secret/DNS và customer-data mutation chỉ thực hiện khi user yêu cầu rõ theo [`RUNBOOK.md`](RUNBOOK.md) và [`DELIVERY_POLICY.md`](DELIVERY_POLICY.md).

## Nguồn đối chiếu

Frappe/ERPNext upstream được khóa phiên bản/SHA tại [`server/source-lock.json`](server/source-lock.json) cho các bài đối chiếu compatibility. Forge là implementation riêng; không dùng README để suy ra compatibility hoặc release status mới nhất.
