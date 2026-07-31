# NEXT TASKS

Ngày cập nhật: **2026-07-31**.

## P0 — xác nhận MetaForge workspace tabs

1. Mở draft PR từ `feat/metaforge-misa-workspace-tabs` vào `hotfix/alumdoor-print-list-delete`.
2. Kiểm CI trên exact final head:
   - lint;
   - test;
   - typecheck;
   - build;
   - UI Pull Request Validation/browser QA nếu workflow được kích hoạt.
3. Sửa lỗi trực tiếp nếu TypeScript báo `Button`/`cn` export hoặc JSX typing không khớp phiên bản UI package.
4. Kiểm desktop, mobile drawer và sidebar collapsed:
   - tab active đúng theo route;
   - chuyển tab đi tới mục khả dụng đầu tiên;
   - sidebar chỉ hiện mục của phân hệ;
   - tab dài cuộn ngang, không đẩy vỡ topbar;
   - app chỉ có một group không bị thay đổi hành vi.

## P1 — nâng thành primitive dùng chung

Sau khi demo được duyệt:

1. Đưa khái niệm `WorkspaceTab`/`moduleKey` vào `client/packages/shell/src/AppShell.tsx` hoặc một component riêng trong `@metaforge/shell`.
2. Cho runtime app tạo tab từ metadata Workspace/Module/DocType thay vì hard-code.
3. Tách rõ:
   - tab treo: phân hệ/nghiệp vụ;
   - sidebar: DocType, báo cáo, thao tác thuộc phân hệ đang chọn.
4. Bổ sung selfcheck/unit test cho lọc nav, active tab và fallback không group.

## P2 — hoàn thiện trải nghiệm MISA

- Lưu tab phân hệ gần nhất theo app/user khi route không chỉ ra phân hệ.
- Hỗ trợ badge, icon và quyền truy cập ở cấp tab.
- Bổ sung overflow menu khi số tab vượt chiều rộng màn hình nhỏ.
- Đồng bộ Command Palette để vẫn tìm toàn bộ ứng dụng dù sidebar đang lọc theo tab.

## Luồng Purchase/FIFO độc lập

- FIFO rollout vẫn disabled.
- Tiếp tục kiểm GitHub/CI của PR Purchase trước khi staging readiness hoặc activation.
- Không bật FIFO production khi chưa có explicit approval.

## Không được làm

- Không deploy Cloudflare nếu chưa được yêu cầu rõ.
- Không sửa production secrets hoặc DNS.
- Không commit `server/work/`, `tmp/`, `.env`, backup hoặc generated reports.
- Không chỉnh migration đã áp dụng; forward-fix bằng migration mới.
