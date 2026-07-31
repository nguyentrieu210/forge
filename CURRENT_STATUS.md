# CURRENT STATUS

Ngày cập nhật: **2026-07-31**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/metaforge-misa-workspace-tabs`.
- Base: `hotfix/alumdoor-print-list-delete`.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated evidence.

## MetaForge UI — MISA-style workspace tabs

### Đã triển khai

- `client/apps/demo/src/DemoShell.tsx`
  - suy ra các tab phân hệ trực tiếp từ `NavItem.group`;
  - hiển thị tab phân hệ/nghiệp vụ trên vùng đầu shell;
  - tab đang hoạt động bám theo `activeKey`;
  - bấm tab chuyển tới mục khả dụng đầu tiên của phân hệ;
  - sidebar chỉ còn các mục thuộc phân hệ đang chọn;
  - giữ tương thích ngược: nếu không có ít nhất hai group thì không hiện tab và sidebar hoạt động như cũ;
  - hỗ trợ cuộn ngang, `aria-label` và `aria-current`.

### Quyết định kiến trúc

- Không tạo thêm manifest module riêng ở bước này.
- `NavItem.group` tiếp tục là nguồn sự thật duy nhất cho cả tab phân hệ và nhóm điều hướng, tránh cấu hình trùng rồi lệch nhau.
- Phạm vi hiện tại nằm ở demo shell để kiểm chứng hành vi trước khi nâng API thành primitive dùng chung trong `@metaforge/shell`.

### Verification

- Chưa chạy local typecheck/build vì môi trường làm việc chỉ có GitHub connector, không có checkout repository và dependency cache.
- Cần dùng CI của draft PR để xác nhận exact head.
- Không deploy Cloudflare, không sửa production secrets/DNS và không đụng dữ liệu tenant.

## Purchase/FIFO hiện hành

- Purchase/FIFO lifecycle correction đã merge qua PR `#63`.
- Tenant production release hiện được ghi nhận ở tài liệu cũ với Worker version `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- FIFO rollout vẫn **disabled**.
- Nhánh/PR Purchase `#75` là luồng công việc độc lập; cần kiểm GitHub trực tiếp trước khi tiếp tục vì handoff cũ từng trỏ nhầm nhánh.
