# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Bán hàng — lọc mặt hàng trong child table đã phát hành production

### Lỗi và nguyên nhân

Production từng hiển thị Item không được phép bán hoặc đã disabled trong ô `Mã hàng` của child table Báo giá/Đơn hàng dù metadata đã khai `{"is_sales_item":1,"disabled":0}`.

Nguyên nhân nằm ở MetaForge core: `buildLinkFilters` chỉ đọc `link_filters` dạng JSON array, nên object-form filter hợp lệ bị bỏ qua và Link search chạy không có điều kiện.

### Merge

- Hotfix PR `#53`: `fix(sales): filter sellable items in child grids`.
- Exact feature head trước merge: `c6e136a47283f973d9c5d4150884b91036ab6fae`.
- Squash merge SHA: `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- Fix hỗ trợ object form, array form, operator tuple và dependent `eval:` filters; chặn các khóa prototype nguy hiểm.
- Regression mới chạy trong client selfcheck với đúng filter bán hàng đang dùng.

### Exact-head CI

Trên `c6e136a47283f973d9c5d4150884b91036ab6fae`:

- PR Validation run `30630332229`, job `91154938153`: tests, typecheck, build **PASS**.
- CI run `30630332276`, job `91154938420`: tests, typecheck, build **PASS**.
- Sales Feature CI run `30630331930`, job `91154937868`: server unit, SQL, brief, client regression, typecheck, build **PASS**.
- Purchase Feature CI run `30630331847`, job `91154937227`: server unit, SQL, client regression, typecheck, build **PASS**.
- Inventory and Manufacturing CI run `30630332239`, job `91154938438`: focused tests, redacted audit, SQL, authoritative brief validation, lint, repository tests, typecheck, build **PASS**.
- UI Pull Request Validation run `30630332351`, job `91154938570`: lint, tests, typecheck, build, Chromium browser QA và local cookie-auth smoke **PASS**.
- Production release jobs trong PR gate đều **SKIPPED**.

### Gateway/frontend production

- Release PR `#54`: `release: deploy sales item-filter hotfix to Gateway`.
- Release PR squash merge SHA: `671b72ca374ae0227ec8f52c09d65de83108e1a2`.
- Exact code SHA được checkout/deploy: `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- Gateway production run: `30630931291`.
- Job: `91156832579` — `Build and deploy Gateway` — **SUCCESS**.
- Build và stage frontend: **PASS**.
- Wrangler deploy `cloudforge-gateway`: **PASS**.
- Gateway version ID: `dc6eada4-e4a1-451a-a92f-66fe04050707`.
- Production smoke: `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- Provider evidence từ Wrangler NDJSON: **PASS**.
- Evidence artifact: `gateway-production-release-30630931291`, artifact ID `8793326579`.
- Không deploy tenant Worker, không migration, không mutate D1, không sửa production secrets.
- FIFO rollout vẫn **disabled**.

### Residual verification

Endpoint smoke và CI đã hoàn tất, nhưng chưa có functional browser evidence sau deploy bằng dữ liệu production thật để xác nhận picker:

- Item `is_sales_item=1`, `disabled=0` xuất hiện;
- Item `is_sales_item=0` không xuất hiện;
- Item `disabled=1` không xuất hiện;
- filter vẫn giữ khi tìm theo mã/tên;
- recent links không làm lộ Item đã bị loại.

Không được diễn giải endpoint smoke thành bằng chứng rằng functional picker smoke đã hoàn tất.

## Bán hàng multi-UOM hiện hành

- Giá theo đúng `Bảng giá + Mặt hàng + ĐVT`.
- ĐVT lấy từ Item/UOM Conversion.
- Báo giá/Đơn hàng đọc giá và tồn theo Item + Kho + ĐVT qua `alumdoor.sales.item_context`.
- Preview tồn không giữ chỗ; Delivery Note submit vẫn authoritative chống âm kho.
- Tenant Worker production hiện hành: `cloudforge-tenant-alu`, version `e15bc6ad-e343-49af-aa2f-c65d31c09fea`.
- Gateway production hiện hành sau hotfix: version `dc6eada4-e4a1-451a-a92f-66fe04050707`.

## RBAC

- Slice A PR `#37`, Slice B PR `#45` và post-merge QA PR `#48` đã merge.
- Regression hậu merge giữ tại `server/tests/rbac-post-merge-qa.test.mjs`.
- Staging/browser QA bằng tài khoản và tenant thử thật vẫn là việc riêng; không có production mutation RBAC trong đợt hotfix này.

## Release automation

- `.github/workflows/gateway-production-release.yml` là đường phát hành Gateway có exact target SHA, smoke và Wrangler version evidence.
- `.github/release/gateway-production.trigger` là trigger Gateway production.
- `.github/workflows/pr-validation.yml` giữ PR gates và tenant release path.
- Tenant provider evidence phải lấy từ Wrangler NDJSON, không dựa vào deployments REST endpoint từng trả `404`.

## Các luồng khác

- Inventory/manufacturing, purchase/FIFO và các PR đang mở không bị sửa trong đợt hotfix này.
- PR body, exact-head CI và trạng thái GitHub hiện hành của từng luồng là nguồn authoritative trước mọi merge/deploy tiếp theo.
- Không merge hoặc deploy luồng khác nếu chưa có yêu cầu rõ.
