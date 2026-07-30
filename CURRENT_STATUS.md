# CURRENT STATUS

Ngày audit: **2026-07-30**, workspace `C:\Forge`.

## Git

- Branch: `hotfix/alumdoor-print-list-delete`
- HEAD xác nhận trước khi ghi nhận phê duyệt contract: `67923909a28a0eabf3ff09da5998e12a24420ab9` (`docs: hand off finalized allocation contract`).
- Contract thiết kế v1: commit `ed840e14d4e290d637454342accbdc42a553a7de`, file `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.
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

## Contract đã chốt — phân bổ nhập nhôm FIFO và nợ nhà máy

Contract authoritative nằm tại `server/docs/ALUMDOOR-PURCHASE-RECEIPT-ALLOCATION.md`.

- Ngày **2026-07-30**, người dùng dự án xác nhận **duyệt** phương án thiết kế v1 và cho phép bắt đầu implementation theo M1–M8.
- Phê duyệt này chỉ áp dụng cho implementation code/local test/staging theo gate; không đồng nghĩa với phê duyệt deploy production hoặc sửa production secrets.

Các quyết định đã chốt:

- Tách **obligation queue** chạy liên tục để FIFO và **settlement window** hữu hạn để tính dung sai; không lấy queue vô thời hạn làm mẫu số ±5%.
- Thêm `PurchaseAllocationCoordinator` theo `tenant + company + supplier`; mọi PO/Receipt/settlement mutation ảnh hưởng queue đi qua một coordinator, không lock riêng từng vật tư.
- D1 revision claim/trigger là lớp guard authoritative trong cùng batch với document, stock, procurement và allocation; mismatch abort toàn batch.
- `material_match_key` do server hash từ canonical snapshot v1 gồm item, chiều dài, barem kg/m, màu, dập, measurement profile và stock UOM; không tin key client gửi.
- FIFO được đánh giá tại thời điểm commit. Receipt lùi ngày dùng `posting_at` cho sổ nhưng không viết lại allocation cũ.
- Cancel Receipt chỉ ghi reversal cho chính Receipt đó; không auto-rebalance các Receipt mới hơn. PO cũ mở nợ lại và Receipt tiếp theo bù theo FIFO.
- PO đã submit có identity/qty bất biến; chỉ cancel khi net allocation bằng 0 và window chưa settled.
- Settlement close dùng integer boundary `ceil(min)`/`floor(max)`, reason và permission bắt buộc. Không reopen tuỳ ý; chỉ reverse settlement khi window kế tiếp chưa có activity.
- Kg cân thực tế authoritative ở Receipt line. Kg theo PO là projection versioned theo barem, residual dồn vào allocation cuối.
- Dữ liệu legacy được backfill qua `versions.snapshot_json`; dòng xác định duy nhất ghi resolved, dòng mơ hồ ghi `legacy_unresolved`, tuyệt đối không đoán row id.
- Progress table cũ chỉ còn compatibility projection sinh từ allocation plan; báo cáo và `received_percentage` chuyển sang ledger mới.

## Review sau khi chốt

- Điểm thiết kế: **9,2/10**.
- Điểm nghiệp vụ/audit: mạnh; đã cover nhiều PO, nhiều xe, FIFO, dung sai, reversal, backdated, manual override và legacy migration.
- Concurrency có hai lớp: supplier coordinator và D1 revision guard.
- Chưa đạt 10/10 vì chưa có bằng chứng implementation cho giới hạn D1 batch khi một xe sinh hàng trăm allocation rows, contention theo supplier, UX preview/settlement và dry-run backfill production.
- Trạng thái: **approved and ready for implementation**, chưa ready for production.
- Chưa sửa code nghiệp vụ trong đợt ghi nhận phê duyệt này; không chạy lại test/typecheck/build vì chỉ cập nhật tài liệu trạng thái.

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
- Contract allocation đã chốt và được duyệt nhưng code hiện hành vẫn tiến độ theo `purchase_order + item_code`; chưa có migration `0027`, coordinator, allocation ledger hoặc settlement actions.
- Chưa đo D1 batch/latency cho hàng trăm allocation rows và chưa chạy dry-run backfill trên production backup.
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
