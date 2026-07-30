# CURRENT STATUS

Ngày audit: **2026-07-30**, workspace `C:\Forge`.

## Git

- Branch: `hotfix/alumdoor-print-list-delete`
- Commit gần nhất: `e21a281811554d2d501dd50cf8dd6271337c7eb6`
- Subject: `fix(alumdoor): căn giữa nội dung thân bảng in`
- Trước khi tạo bộ tài liệu này, Git status chỉ có hai thư mục untracked đã tồn tại: `server/work/` và `tmp/`.
- Hai thư mục trên là output/work/cache, được giữ nguyên và không đưa vào manifest bàn giao.

## Những gì chạy được

- Root/server/client TypeScript typecheck: **PASS**.
- Build toàn monorepo: **PASS**.
- Runtime React, server Workers, app/package builds đều hoàn tất.
- Core Frappe-shaped CRUD/metadata/workflow/print/report/import/export routes có implementation trong `server/packages/frappe-api/src/router.ts`.
- Auth cookie/JWT, server permission, metadata rendering và app manifest flow có implementation thật, không phải mock.
- Alumdoor v2.0.34 có brief và app Worker thực tế tại `server/briefs/alumdoor-v2.json` và `server/apps-src/alumdoor-worker/`.

## Lệnh kiểm tra đã chạy

| Kiểm tra | Lệnh | Kết quả |
|---|---|---|
| Dependencies | Không chạy install; `node_modules` và lockfile đã có | Không cần cài lại |
| Typecheck | `pnpm.cmd run typecheck` | PASS |
| Lint frontend | `pnpm.cmd --filter metaforge run lint` | FAIL: 26 vi phạm/9 file |
| Test | `pnpm.cmd run test` | FAIL: server dừng tại 2 test Alumdoor |
| Build | `pnpm.cmd run build` | PASS |

PowerShell trên máy chặn shim `pnpm.ps1`; dùng `pnpm.cmd` hoạt động bình thường. Đây là policy môi trường, không phải lỗi code.

## Lint đang fail

Custom check `client/scripts/check-native-ui.mjs` báo 26 lỗi native element/inline style tại:

- `client/apps/demo/src/system/Settings.tsx` (1)
- `client/apps/runtime/src/storefront/Storefront.tsx` (5)
- `client/packages/builder/src/doctype/DocTypeBuilder.tsx` (5)
- `client/packages/controls/src/controls.tsx` (1; cần xác minh khả năng false positive từ comment)
- `client/packages/shell/src/AppShell.tsx` (2)
- `client/packages/views/src/action/ActionScreen.tsx` (2)
- `client/packages/views/src/assistant/AssistantBubble.tsx` (2)
- `client/packages/views/src/form/ChildGrid.tsx` (5)
- `client/packages/views/src/screen/ScreenView.tsx` (3)

Không tự động sửa vì thay hàng loạt component có thể làm thay đổi hành vi/visual.

## Test đang fail

`server/tests/alumdoor-item-model.test.mjs` có hai test lệch contract hiện tại:

1. `V2 purchase receipt exposes dimensions and area weight without mixing kg/m`
   - Test còn kỳ vọng brief version `2.0.7`.
   - Actual `server/briefs/alumdoor-v2.json` là `2.0.34`.
2. `V2 purchase order print matches the supplied ALUMDOOR A4 template`
   - Test còn tìm header/logo/text và các cột cũ (`qty_bundle`, `theoretical_kg`).
   - Generator hiện tại tại `server/scripts/build-alumdoor-v2-brief.mjs` dùng company-header asset/data URI và layout/cột mới.

Server suite dừng sau hai failure này nên SQL tests và client selfcheck trong root `test` chưa được chạy tiếp. Không nên kết luận toàn bộ test còn lại pass chỉ từ lần chạy này.

## Build

`pnpm.cmd run build` exit code 0. Có warning không chặn:

- Một số Vite chunk lớn hơn 500 KB; sample/kho app có bundle khoảng 1 MB.
- `NewFormContainer` vừa được import động vừa import tĩnh nên không tách chunk như dự kiến.

## Phần mock/demo/giới hạn

- `client/apps/demo`, `client/apps/sample-sales`, `client/apps/sample-wms` là demo/sample, không phải runtime production.
- `client/apps/runtime/src/main.tsx` dùng `DeskFallback` cho page/dashboard chưa có renderer chuyên biệt.
- `client/docs/implementation-traceability.md` ghi assign picker, attachment upload UI và inline tag là Partial.
- `ProcessContainer` tồn tại phía client nhưng process API chưa là contract hoàn chỉnh.
- AI UI có trạng thái “chưa cấu hình” trong traceability; cần binding/service tenant mới hoạt động đầy đủ.

## TODO/FIXME và code tạm

- Source scan không tìm thấy TODO/FIXME thực thi đáng kể trong core runtime/server; phần lớn match nằm trong tài liệu traceability hoặc test fixture.
- `client/docs/implementation-traceability.md` có nhiều test UI đánh dấu TODO.
- `client/docs/DEPLOY-WMS.md` ghi nginx patch là ephemeral/TODO; đây là luồng legacy WMS, không phải Gateway Workers Assets hiện tại.
- `server/work/` chứa generated release artifacts; không dùng như source.

## Lỗi/rủi ro đã biết

- Test Alumdoor stale là lỗi quan trọng nhất vì làm root test gate đỏ và che mất kết quả SQL/client tests.
- Lint gate đỏ 26 lỗi.
- Tài liệu trạng thái cũ như `server/STATUS.md` lệch migration/phiên bản hiện hành; cần tránh dùng làm nguồn sự thật.
- Bundle client lớn, ảnh hưởng tải trang nhưng chưa chặn build.
- Renderer chuyên biệt chưa phủ hết page/dashboard/process.
- Wrangler configs có binding/resource identifiers. Chúng không phải password nhưng vẫn là thông tin hạ tầng; chỉ chia sẻ trong phạm vi được phép.

## Deploy dự kiến

Không deploy trong audit này. Luồng dự kiến:

- Build/stage client: script `server/scripts/stage-client-bundle.mjs`.
- Gateway: Wrangler với `server/apps/gateway-worker/wrangler.jsonc`.
- Tenant: `server/scripts/deploy-tenant.mjs` sau migration/check và với secret đã cấu hình ngoài Git.
- Provision tenant mới: `server/scripts/provision-tenant.mjs`.

Phải đọc `server/README.md`, kiểm tra pending migration và đúng Cloudflare account trước khi chạy.
