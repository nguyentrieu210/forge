# CURRENT STATUS

Ngày audit: **2026-07-30**, workspace `C:\Forge`.

## Git

- Branch: `hotfix/alumdoor-print-list-delete`
- Baseline đã kéo và kiểm chứng: `7bbf20f45ecebf329af7b349e02e61827dfe32fe`
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
| Dependencies | `pnpm.cmd install --frozen-lockfile` | PASS sau khi bổ sung `html2canvas`/`jspdf` vào lockfile |
| Typecheck | `pnpm.cmd run typecheck` | PASS |
| Lint frontend | `pnpm.cmd --filter metaforge run lint` | PASS: 0 vi phạm native UI, 0 lỗi hook order |
| Test | `pnpm.cmd run test` | PASS: server, SQL/migration và 87 nhóm frontend selfcheck |
| Build | `pnpm.cmd run build` | PASS |

PowerShell trên máy chặn shim `pnpm.ps1`; dùng `pnpm.cmd` hoạt động bình thường. Đây là policy môi trường, không phải lỗi code.

## Test và lint đã được khôi phục

- Hai assertion Alumdoor đã được cập nhật trực tiếp theo contract v2.0.34 trong `server/tests/alumdoor-item-model.test.mjs`.
- Workaround tự sinh `.alumdoor-item-model.runtime.mjs` đã được bỏ; không còn file `alumdoor-item-model.source.mjs`.
- 26 vi phạm frontend đã được chuyển sang shared UI components. `check-native-ui` chỉ bỏ qua JSDoc/comment, không thêm allowlist rộng cho JSX thực.
- GitHub Actions tại `.github/workflows/ci.yml` chạy frozen install, lint, test, typecheck và build; không có deploy.

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

- CI cần được theo dõi trên GitHub sau khi push để xác nhận runner hosted thực thi trọn vẹn, không chỉ local.
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

## CI và Cloudflare Workers Builds

- GitHub Actions hosted runner đã chạy trọn bộ `install`, `test`, `typecheck` và `build`: **PASS** ngày 2026-07-30.
- Worker `cloudforge-gateway` đã kết nối với repository `nguyentrieu210/forge` trên production branch `hotfix/alumdoor-print-list-delete`.
- Cloudflare build command: `pnpm --filter runtime run build && node server/scripts/stage-client-bundle.mjs`.
- Cloudflare deploy command hiện dùng `wrangler versions upload` để tạo version kiểm tra, chưa tự động promote thành production deployment.
- Non-production branch builds đang tắt; root directory là repository root `/`.
