# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Bán hàng multi-UOM — đã merge và phát hành production

### Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Feature PR `#25` — `feat(sales): multi-UOM pricing and stock availability` — đã squash-merge.
- Feature release SHA authoritative: `4500799f13de48ada1948ab583afcf2e52b4c2dd`.
- Release trigger PR `#47` đã squash-merge thành `62f53becf97baa7e1c22fcc9b8e2b9a501b76cf4`.
- Gateway evidence PR `#51` đã squash-merge thành `2d2a9406c9f03235e70834f75157a372182cdad1`.

### Phạm vi đã phát hành

- Item bán chỉ lấy mặt hàng đang hoạt động và được phép bán.
- ĐVT lấy từ UOM Conversion của Item.
- Giá xác định theo đúng `Bảng giá + Mặt hàng + ĐVT`.
- Item Price legacy không UOM vẫn tương thích; legacy có UOM chỉ dùng khi dòng bán khớp tuyệt đối.
- Preview giá từ chối giá thiếu tiền tệ, sai tiền tệ chứng từ, âm/sai định dạng hoặc disabled.
- Báo giá/Đơn hàng nạp tồn theo Item + Kho + ĐVT bán qua `alumdoor.sales.item_context`.
- Trạng thái hiển thị gồm `Còn N <ĐVT>`, `Hết hàng`, `Chưa chọn kho`, `Không quản lý tồn` và lỗi đọc tồn/giá.
- Preview tồn không giữ chỗ; Delivery Note submit vẫn authoritative chống âm kho.
- Quyền metadata server-side: `Kinh doanh` chỉ đọc `Price List`/`Item Price`; `Kế toán` được create/save.

### CI trước merge

Exact feature head trước merge: `eee2042f8eb4d1cd31ad2ef9ba18e36a3f94d9e6`.

- Sales Feature CI run `30625673488`, job `91140240483`: unit, SQL, brief, client test, typecheck và build **PASS**.
- PR Validation run `30625673658`, job `91140241362`: test, typecheck và build **PASS**.
- UI Pull Request Validation run `30625674078`, job `91140242486`: lint, test, typecheck, build, Chromium browser QA và cookie-auth smoke **PASS**.

### Tenant `alu` production

Release run `30626899280`, job `91144150418`, checkout đúng release SHA `4500799f...`.

- Backup remote D1: **PASS**.
- Backup artifact: `alu-pre-release-backup-30626899280`, artifact ID `8791727670`.
- Migration dry-run/live: **PASS**.
- Migration mới được apply: `0030_rbac_audit.sql`.
- Tenant deploy dry-run/live: **PASS**.
- Worker: `cloudforge-tenant-alu`.
- Tenant Worker version ID: `e15bc6ad-e343-49af-aa2f-c65d31c09fea`.
- Production smoke: `/health` = `200`, unauthenticated boot = `403`.
- FIFO rollout: **disabled**.
- Không sửa production secrets.

Run được GitHub đánh dấu failure chỉ vì bước gọi Cloudflare deployments REST endpoint trả `404` cho kiểu deployment qua dispatch namespace. Backup, migration, deploy và smoke đã hoàn tất trước lỗi này. Provider evidence authoritative được lấy từ `WRANGLER_OUTPUT_FILE_PATH`, không từ endpoint 404.

### Gateway/frontend production

Dedicated Gateway release run `30627670975`, job `91146562781`: **SUCCESS**.

- Build MetaForge: **PASS**.
- Stage client bundle: **PASS**.
- Deploy `cloudforge-gateway`: **PASS**.
- Gateway version ID: `8f397962-b54c-409d-b494-06c22ca13bb2`.
- Targets gồm `alu.kairo.vn` và các custom domain hiện hành.
- Production smoke: `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- Evidence artifact: `gateway-production-release-30627670975`, artifact ID `8792060684`.

### Residual risk đã chấp nhận

Chưa chạy browser sales smoke bằng dữ liệu và tài khoản production/staging thật cho toàn bộ chuỗi:

- đổi Item, ĐVT, Bảng giá và Kho trên Báo giá/Đơn hàng;
- một Item có hai ĐVT và hai Item Price;
- các trường hợp Item Price legacy;
- giá thiếu/sai currency, rate âm/sai định dạng và disabled;
- tài khoản thật `Kinh doanh` và `Kế toán`.

Rủi ro này đã được ghi nhận trước merge/deploy. Không được diễn giải release thành bằng chứng rằng browser sales smoke đã hoàn tất.

## Release automation hiện hành

- `.github/workflows/pr-validation.yml` giữ gate PR và tenant release path.
- `.github/workflows/gateway-production-release.yml` là workflow chuyên dụng cho Gateway/frontend.
- `.github/release/alu-production.trigger` khóa tenant release target.
- `.github/release/gateway-production.trigger` khóa Gateway release target.
- Tenant provider evidence phải lấy từ Wrangler NDJSON; không dùng endpoint deployments đã trả `404`.

## Các luồng khác

- Inventory/manufacturing: PR `#27`; PR body và exact-head CI của PR là nguồn authoritative.
- RBAC Slice B: PR `#45`; PR body và exact-head CI của PR là nguồn authoritative.
- Purchase/FIFO: PR `#14`; phải kiểm migration head và rollout gate trước mọi bước tiếp theo.
- FIFO tenant `alu` vẫn **disabled**.

## An toàn repository và production

- Không commit `.env`, `.dev.vars`, secret, token, private key hoặc session secret.
- Không commit `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.
- D1 migrations append-only; không sửa migration đã chạy.
- Mọi production release phải có exact target SHA, backup, deploy evidence và smoke.
