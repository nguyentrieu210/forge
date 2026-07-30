# CURRENT STATUS

Ngày audit: **2026-07-30**, workspace `C:\Forge`.

## Git

- Branch: `hotfix/alumdoor-print-list-delete`
- HEAD xác nhận trước khi làm rõ mô hình hàng đợi mua liên tục: `30a5250bfa3df282f42121257297550553150b75` (`docs: define aluminium receipt allocation ledger`).
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

## Yêu cầu mới — hàng đợi phân bổ nhập nhôm liên tục

- Thực tế vận hành được làm rõ: một Purchase Order có thể mất cả tháng mới giao xong; cùng một vật tư có thể được đặt 3–4 lần trong tháng; một xe hàng có thể mang số lượng lớn và bù đồng thời rất nhiều đơn.
- Vì vậy không yêu cầu người dùng chọn `delivery_pool` trên từng PO hoặc Receipt. Hệ thống phải tự duy trì **hàng đợi nghĩa vụ mua đang mở** theo `company + supplier + khóa quy cách vật tư`; PO line mới đúng khóa tự gia nhập hàng đợi đang mở.
- Receipt line tự phân bổ FIFO qua tất cả PO line còn mở đúng khóa, theo `transaction_date → created_at → PO name → row idx`; một dòng Receipt có thể sinh nhiều allocation rows và một Receipt có thể chạm rất nhiều PO.
- Chu kỳ chỉ kết thúc khi người có quyền xác nhận “nhà máy giao cuối/đối soát xong”. Sau khi đóng, PO mới cùng quy cách mở chu kỳ kế tiếp; nhờ vậy không gộp vô hạn lịch sử cũ nhưng cũng không bắt nhân viên quản lý nhóm thủ công.
- Dung sai ±5% được tính trên tổng nghĩa vụ của chu kỳ đang mở. Ví dụ tổng đặt 300 cây, đã nhận 230 thì dải giao cuối là 55–85 cây. FIFO vẫn diễn giải danh nghĩa PO1 nhận 200 và PO2 nhận 30; phần thiếu/dư khi đóng là variance của chu kỳ, không sửa xoá lịch sử phân bổ.
- Nếu xe về vượt tổng nominal nhưng chưa vượt trần dung sai, phần vượt phải vào số dư `unapplied receipt/tolerance variance` của chu kỳ. PO line mới gia nhập trước khi chu kỳ đóng có thể được bù bằng số dư này qua allocation event mới; không được sửa ngược allocation cũ.
- Mỗi lần nhập phải giữ lịch sử bất biến: phiếu nhập, dòng nhập, dòng PO được trừ, số cây, kg barem, kg cân thực tế, thứ tự phân bổ và allocate/reverse. Huỷ chứng từ ghi dòng đảo, không delete.
- Code hiện tại đã cộng dồn `purchase_order_progress_entries` và chặn nhận vượt theo `receipt_tolerance_pct`, nhưng kiểm theo từng Purchase Order và `item_code`; chưa có hàng đợi FIFO xuyên nhiều PO, chưa bám `purchase_order_item.row_id`, chưa có số dư Receipt chưa áp và chưa có hành động đóng chu kỳ.
- `ProcurementEntry` hiện chỉ có Purchase Order, loại tiến độ, mã hàng, số lượng và ngày; chưa đủ nguồn dòng phiếu nhập/dòng đơn mua, kg barem, kg thực tế, allocation sequence và lifecycle của chu kỳ.
- Chưa sửa code trong đợt làm rõ này. Thiết kế tiếp theo là sổ receipt-to-PO-line allocation bất biến, obligation stream tự động, FIFO, số dư chưa áp, đóng trong dung sai và báo cáo lịch sử/nợ nhà máy.

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
- Dung sai hiện chỉ chặn trần nhận tối đa theo từng PO; chưa có chu kỳ nghĩa vụ tự động, mức tối thiểu khi đóng, số dư Receipt chưa áp hoặc hành động đối soát cuối.
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