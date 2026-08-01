# Scorecard Cổng 4 — nhánh build G03

Ngày tự chấm: 2026-08-01. Trạng thái: **kỹ thuật đạt; chờ chủ dự án duyệt Cổng 4 trước dòng code tính năng đầu tiên**.

| Yêu cầu | Kết quả | Bằng chứng |
|---|---|---|
| Cổng 3 đã được duyệt | ✅ | PR #153 đã squash-merge, commit `d4e89691`. |
| Nhánh không phải `main` | ✅ | `feat/erp-platform-wave1-g03-20260801`. |
| Nhánh xuất phát từ `origin/main` mới nhất | ✅ | HEAD ban đầu `d4e89691`. |
| Working tree sạch trước build | ✅ | Không có thay đổi runtime/tính năng. |
| Bộ gate hiện hữu hoạt động | ✅ | `pnpm.cmd run verify` exit 0 trong 160,3 giây. |
| Server/domain/Worker/client test-typecheck-build | ✅ | Toàn bộ chuỗi `server:check`, Worker tests, client typecheck/test/build hoàn tất. |
| Cảnh báo có được nhận diện | ✅ | Cảnh báo `pnpm.ps1` do ExecutionPolicy đã tránh bằng `pnpm.cmd`; cảnh báo npm config và `import.meta` trong CJS là baseline không chặn. |
| Không PWA/offline ngoài phạm vi | ✅ | Chưa thêm service worker, offline queue, Web Push hoặc `/api/sync`. |
| Bí mật/cấu hình local không bị commit | ✅ | Không tạo/sửa `.env.local` hay `.dev.vars`. |
| Chưa viết code trước Cổng 4 | ✅ | Nhánh mới chỉ cập nhật tracker/scorecard của quy trình. |

Sau khi được duyệt, Pha 5 bắt đầu với G03: app manifest/DocType/workflow → permission/scope/SoD/approval services → API methods → UI generic/override → tests. Mọi thay đổi bám Field Ledger và Meta đã duyệt.
