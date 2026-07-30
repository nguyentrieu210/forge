# CURRENT STATUS

Ngày audit: **2026-07-30**, workspace `C:\Forge`.

## Git

- Branch: `hotfix/alumdoor-print-list-delete`
- HEAD xác nhận trước khi phân tích yêu cầu phân bổ nhập nhôm: `c12ccee0a6bbd2a2766a45d8c515129c493d36d9` (`docs: prioritize alu production smoke test`).
- Commit code fixture bản in: `f5186c4ef6fb54d819bad95ee4eb17f2fd1a18e1` (`test(alumdoor): add purchase order print fixture`).
- Baseline chức năng Alumdoor đã kéo và kiểm chứng trước đó: `7bbf20f45ecebf329af7b349e02e61827dfe32fe`.
- Trước khi tạo bộ tài liệu ban đầu, Git status chỉ có hai thư mục untracked đã tồn tại: `server/work/` và `tmp/`.
- Hai thư mục trên là output/work/cache, được giữ nguyên và không đưa vào manifest bàn giao.

## Những gì chạy được

- Root/server/client TypeScript typecheck: **PASS** ở đợt audit trước.
- Build toàn monorepo: **PASS** ở đợt audit trước.
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

## Đợt tiếp tục — fixture bản in Purchase Order

- Thêm `server/tests/alumdoor-purchase-order-print.test.mjs`.
- Test đọc đúng `server/briefs/alumdoor-v2.json` và chạy qua renderer production `renderPrintFormat`, không tự dựng một renderer giả song song.
- Fixture có cả dòng nhôm và hàng thường, cố ý đảo thứ tự đầu vào để kiểm tra renderer sắp theo `idx`.
- Test khóa 13 cột, tổng độ rộng 100%, thứ tự `Dập` trước `Ghi chú`, không có `Số bó`, các ô căn giữa, A4 portrait, logo/header và không còn placeholder sau render.
- Test cũng khóa việc hàng thường không bị điền giả các trường kích thước, kg/m và số cây/lá.
- Chưa có check-run hiển thị qua GitHub connector cho commit fixture/tài liệu mới; cần đối chiếu GitHub Actions UI hoặc chạy lại local để có bằng chứng gate theo đúng HEAD.
- Visual pixel-level của browser preview và file PDF thật vẫn chưa được tự động hóa; fixture hiện khóa cấu trúc HTML dùng chung cho cả hai đường.

## Production deployment tenant `alu`

Ngày **2026-07-30**, người vận hành xác nhận đã chạy hoàn tất từ `C:\Forge\server`:

- Backup remote D1 cho tenant `alu` bằng `scripts/backup-tenant.mjs --execute`, output đặt ngoài repository tại `C:\ForgeBackups\alu`.
- Preflight tenant bằng `node scripts\deploy-tenant.mjs --tenant alu`.
- Live deploy bằng `node scripts\deploy-tenant.mjs --tenant alu --execute --confirm alu`.
- Theo xác nhận của người vận hành, toàn bộ lệnh hoàn tất; không có báo cáo migration pending hoặc deploy refusal.
- Trạng thái này là **operator-confirmed**. GitHub connector không có quyền đọc Cloudflare deployment/version hoặc log terminal local nên chưa xác minh độc lập deployment ID, timestamp, health hoặc traffic.
- Việc deploy Gateway `cloudforge-gateway` lên 100% production traffic chưa được xác nhận trong tài liệu này.

## Yêu cầu mới — phân bổ FIFO hàng nhôm về theo đơn mua

- Khách yêu cầu một lần nhập có thể bù nhiều đơn mua cùng nhà cung cấp/mã/quy cách theo thứ tự cũ trước: đặt 200 cây rồi 100 cây, nhập 230 cây thì tự phân bổ 200 cây cho đơn đầu và 30 cây cho đơn sau; tồn danh nghĩa của đơn sau là 70 cây.
- Mỗi lần nhập phải giữ lịch sử diễn giải bất biến: phiếu nhập nào, ngày nào, dòng nào đã trừ vào dòng đơn mua nào, bao nhiêu cây, kg barem và kg cân thực tế; huỷ chứng từ phải ghi bút toán đảo, không xoá dấu vết.
- Code hiện tại đã cộng dồn `purchase_order_progress_entries` và chặn nhận vượt theo `receipt_tolerance_pct`, nhưng kiểm theo từng Purchase Order và `item_code`; chưa tự phân bổ FIFO qua nhiều đơn và chưa bám tới `purchase_order_item.row_id`.
- `ProcurementEntry` hiện chỉ có Purchase Order, loại tiến độ, mã hàng, số lượng và ngày; chưa đủ nguồn dòng phiếu nhập/dòng đơn mua, kg barem, kg thực tế và phương pháp phân bổ để dựng lịch sử yêu cầu.
- Ví dụ khách chốt dung sai theo **pool gộp**: tổng đặt 300 cây, ±5% tương đương 285–315 cây; đã nhận 230 thì lần giao cuối hợp lệ trong khoảng 55–85 cây. Luật này khác kiểm dung sai độc lập từng đơn hiện tại và phải được mô hình hoá bằng một nhóm/pool có chủ đích, không tự gộp mọi đơn cùng mã vô thời hạn.
- Chưa sửa code trong đợt phân tích này. Thiết kế tiếp theo là sổ phân bổ receipt-to-PO-line bất biến, thuật toán FIFO, trạng thái đóng trong dung sai và báo cáo lịch sử/nợ nhà máy.

## Test và lint đã được khôi phục

- Hai assertion Alumdoor đã được cập nhật trực tiếp theo contract v2.0.34 trong `server/tests/alumdoor-item-model.test.mjs`.
- Workaround tự sinh `.alumdoor-item-model.runtime.mjs` đã được bỏ; không còn file `alumdoor-item-model.source.mjs`.
- 26 vi phạm frontend đã được chuyển sang shared UI components. `check-native-ui` chỉ bỏ qua JSDoc/comment, không thêm allowlist rộng cho JSX thực.
- GitHub Actions tại `.github/workflows/ci.yml` chạy frozen install, lint, test, typecheck và build; không có deploy.

## Build

`pnpm.cmd run build` exit code 0 ở đợt audit trước. Có warning không chặn:

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

- GitHub connector chưa trả check-run cho HEAD hiện tại; không dùng trạng thái audit cũ để suy ra CI của commit mới.
- Tenant `alu` đã được operator xác nhận deploy, nhưng chưa có smoke-test production được ghi nhận cho login, CRUD, list/delete, print preview và PDF.
- Chưa xác nhận Gateway version nào đang nhận 100% production traffic.
- Tiến độ mua hiện gộp theo `item_code`; cùng mã nhưng khác chiều dài/màu/dập hoặc có hai dòng trong một đơn có thể bị đối chiếu nhầm nếu dùng nguyên mô hình này cho FIFO.
- Dung sai hiện chỉ chặn trần nhận tối đa; chưa có khái niệm tối thiểu khi đóng đơn, pool gộp, hoặc hành động đóng phần thiếu trong dung sai.
- Fixture mới chưa thay thế visual regression test trên Chromium và kiểm tra PDF tải xuống thực tế.
- Tài liệu trạng thái cũ như `server/STATUS.md` lệch migration/phiên bản hiện hành; cần tránh dùng làm nguồn sự thật.
- Bundle client lớn, ảnh hưởng tải trang nhưng chưa chặn build.
- Renderer chuyên biệt chưa phủ hết page/dashboard/process.
- Wrangler configs có binding/resource identifiers. Chúng không phải password nhưng vẫn là thông tin hạ tầng; chỉ chia sẻ trong phạm vi được phép.

## Deploy và rollback

- Build/stage client: script `server/scripts/stage-client-bundle.mjs`.
- Gateway: Wrangler với `server/apps/gateway-worker/wrangler.jsonc`.
- Tenant: `server/scripts/deploy-tenant.mjs` sau migration/check và với secret đã cấu hình ngoài Git.
- Backup tenant: `server/scripts/backup-tenant.mjs`; file SQL là plaintext và phải chuyển sang nơi lưu trữ mã hóa ngoài account.
- Provision tenant mới: `server/scripts/provision-tenant.mjs`.

Phải đọc `server/README.md`, kiểm tra pending migration và đúng Cloudflare account trước mỗi deployment tiếp theo.

## CI và Cloudflare Workers Builds

- GitHub Actions hosted runner đã chạy trọn bộ `install`, `test`, `typecheck` và `build`: **PASS** ngày 2026-07-30 cho trạng thái trước commit fixture mới.
- Worker `cloudforge-gateway` đã kết nối với repository `nguyentrieu210/forge` trên production branch `hotfix/alumdoor-print-list-delete`.
- Cloudflare build command: `pnpm --filter runtime run build && node server/scripts/stage-client-bundle.mjs`.
- Cloudflare deploy command được ghi nhận trước đó dùng `wrangler versions upload` để tạo version kiểm tra, chưa tự động promote thành production deployment.
- Non-production branch builds đang tắt; root directory là repository root `/`.
