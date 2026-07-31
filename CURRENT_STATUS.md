# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Bán hàng — hotfix tự điền đơn giá child grid đang ở PR #65

- Người dùng production xác nhận chọn `Bảng giá áp dụng` và mặt hàng nhưng ô `Đơn giá` trong child grid không tự điền.
- PR `#65`: `fix(sales): restore price autofill in child grids`.
- Branch: `hotfix/sales-price-autofill-20260731`.
- Code head đã kiểm: `eaff9931e9f02171d3d23e3d81b75743efa4ca04`.
- Nguyên nhân: preview `alumdoor.sales.item_context` và pricing authoritative phụ thuộc vào tên bản ghi Item Price. Dữ liệu cũ/import/đổi tên có thể có đủ `price_list + item_code + uom` nhưng tên không khớp key canonical, khiến preview trả `price_missing` và client xoá `rate`.
- Cách sửa:
  - giữ fast-path tên ba phần và legacy hai phần;
  - fallback bằng chính các field `price_list + item_code + uom`;
  - áp cùng quy tắc cho preview child grid và pricing lúc lưu/submit;
  - từ chối nhiều giá hoạt động cùng khớp thay vì chọn ngẫu nhiên;
  - giữ chẩn đoán giá disabled/malformed khi callback list không tồn tại.
- Regression mới: `server/tests/sales-price-field-lookup.test.mjs` kiểm tên record không canonical, duplicate active prices và authoritative pricing fallback.
- Exact code-head CI trên `eaff9931e9f02171d3d23e3d81b75743efa4ca04`:
  - PR Validation `30639117520`: **PASS**; Gateway/Tenant release **SKIPPED**.
  - CI `30639117471`: **PASS**.
  - Sales Feature CI `30639117554`: unit, SQL, brief, client tests, typecheck và build **PASS**.
  - Purchase Feature CI `30639117591`: **PASS**.
  - Inventory and Manufacturing CI `30639117483`: **PASS**.
  - UI Pull Request Validation `30639117562`: lint, tests, typecheck, build, Chromium QA và cookie-auth smoke **PASS**.
- PR hiện chưa merge và chưa deploy. Production vẫn dùng lookup cũ cho tới khi có approval merge/release riêng.
- Không migration hoặc mutate D1, không sửa production secrets, FIFO vẫn **disabled**.

## UI child table — recent links đã bỏ, wheel dropdown trong Dialog đã sửa đúng và phát hành production

### Phase 1 — PR #58

- PR `#58`: `fix(ui): remove recent links and restore child-grid scroll`.
- Exact final head trước merge: `d8e9abe99b2f1050af76eabf48d516a364ffe02a`.
- Squash merge SHA: `db1cac83438f1d99ad9689005a7dd6e6d7979068`.
- Link dropdown không còn đọc/ghi lịch sử lựa chọn client-side; key localStorage v2 cũ được dọn khi mở dropdown.
- Bổ sung relay wheel từ dropdown đã chạm biên về scroll ancestor của đúng child grid.
- Release PR `#61` merge thành `d3da59045ea836f0b7529cab07a4a7cfe656de2a`.
- Gateway run `30633258896`, job `91164460608`: build, deploy, smoke và provider evidence **PASS**.
- Gateway version khi đó: `7d0c77ee-588e-44cb-abff-1c217a754316`.
- Sau release, functional production evidence của người dùng cho thấy Link dropdown trong bảng child mở rộng vẫn không cuộn bằng mouse wheel; kéo scrollbar thumb bằng chuột vẫn hoạt động.
- Kết luận: PR `#58` hoàn thành việc bỏ recent links và boundary relay, nhưng **không giải quyết** Dialog scroll-lock đối với wheel trong chính dropdown.

### Phase 2 — PR #62, bản vá wheel thực tế

- PR `#62`: `fix(ui): restore mouse-wheel scrolling in dialog dropdowns`.
- Exact final head trước merge: `89e8f7a3f3707c04d9bbb33ef2e8420aa4b60935`.
- Squash merge SHA: `b3dd1d15a1b52de698d0874b29feae79efe7ed6c`.
- Nguyên nhân: Radix Dialog/RemoveScroll có thể `preventDefault` wheel ở capture phase vì Popover nằm trong portal ngoài Dialog. Handler cũ thấy event đã bị chặn rồi thoát và trông chờ browser default scroll, nên danh sách đứng yên.
- Cách sửa:
  - xác định phần tử cuộn thật bên trong dropdown;
  - nếu còn khoảng cuộn, `PopoverContent` tự `scrollBy` phần tử đó;
  - chỉ relay wheel về child grid khi dropdown đã chạm đầu/cuối;
  - vẫn tôn trọng `preventDefault` do callback `onWheel` của caller chủ động tạo ra.
- Thử nghiệm tự chuyển Popover sang `modal=true` đã bị loại bỏ sau khi targeted test chứng minh không giải quyết lỗi.
- Thêm runtime fixture dùng đúng `Dialog + LinkCombobox` với 40 lựa chọn.
- Thêm Playwright regression phát `mouse.wheel` và bắt buộc `scrollTop` của `[cmdk-list]` tăng trên desktop, tablet và mobile.

### Exact-head CI cho PR #62

Trên `89e8f7a3f3707c04d9bbb33ef2e8420aa4b60935`:

- PR Validation run `30635559900`, job `91172155959`: tests, typecheck và build **PASS**; Gateway/Tenant release jobs **SKIPPED**.
- CI run `30635537827`: tests, typecheck và build **PASS**.
- Sales Feature CI run `30635536148`: server unit, SQL, brief, client selfchecks, typecheck và build **PASS**.
- Purchase Feature CI run `30635537538`: server unit, SQL, client tests, typecheck và build **PASS**.
- Inventory and Manufacturing CI run `30635536207`: focused tests, redacted audit, SQL, authoritative brief validation, lint, repository tests, typecheck và build **PASS**.
- UI Pull Request Validation run `30635538108`, job `91172095844`: lint, tests, typecheck, build, targeted Dialog dropdown wheel Playwright trên ba viewport, Chromium browser QA và local cookie-auth smoke **PASS**.
- Browser evidence artifact: `alumdoor-login-landing-evidence-30635538108`, artifact ID `8795217072`.
- Auth evidence artifact: `alumdoor-auth-session-evidence-30635538108`, artifact ID `8795226210`.

### Gateway/frontend production hiện hành

- Release PR `#64`: `release: deploy dialog dropdown wheel hotfix`.
- Release PR squash merge SHA: `eaf6b32709abc731bd37285501676ed1ec6267af`.
- Exact code checkout/build/deploy: `b3dd1d15a1b52de698d0874b29feae79efe7ed6c`.
- Gateway release run: `30635980509`.
- Job: `91173574419` (`Build and deploy Gateway`) — **SUCCESS**.
- Build MetaForge và stage frontend: **PASS**.
- Wrangler deploy `cloudforge-gateway`: **PASS**.
- Gateway version ID: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Production smoke: `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- Provider evidence từ Wrangler NDJSON: **PASS**.
- Evidence artifact: `gateway-production-release-30635980509`, artifact ID `8795369194`.
- Không deploy tenant Worker, không migration/mutate D1, không sửa production secrets.
- FIFO rollout vẫn **disabled**.

### Residual verification

Targeted Playwright đã chứng minh wheel làm dropdown list thay đổi `scrollTop`. Vẫn cần functional production smoke có đăng nhập sau hard refresh:

- không còn nhóm `Lựa chọn gần đây`;
- wheel cuộn được chính danh sách dropdown trong bảng child mở rộng;
- khi dropdown chạm đầu/cuối, wheel tiếp tục cuộn vùng child grid;
- kiểm cả bảng gọn và bảng mở rộng;
- Item, UOM, Warehouse vẫn chọn được và giữ đúng filter/quyền.

## Purchase/FIFO — đã merge và phát hành production

- Feature PR `#14` squash-merge thành `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- FIFO activation không được yêu cầu và rollout vẫn **disabled**.
- Tenant release run `30631386714`; exact code `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Backup, migration, tenant deploy và endpoint smoke **PASS**.
- Tenant Worker `cloudforge-tenant-alu` version `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Backup artifact `alu-pre-release-backup-30631386714`, ID `8793480138`.
- Release artifact `alu-production-release-30631386714`, ID `8793494701`.
- Gateway purchase release run `30631951946`, job `91160176928`, version `6352386d-8385-4ea8-af31-15ac62e21943`; phiên bản này đã được thay bởi các UI hotfix nêu trên.
- Chưa có functional browser evidence production đầy đủ cho Purchase UI trên desktop/mobile.
- Không bật FIFO trước backfill checksum, `unresolved_count=0`, staging evidence, backup mới và explicit approval riêng.

## Bán hàng — lọc mặt hàng và multi-UOM

- Hotfix lọc Item PR `#53` squash-merge thành `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- `buildLinkFilters` hỗ trợ object-form, array-form, operator tuple và dependent `eval:` filters; chặn prototype-key nguy hiểm.
- Sales multi-UOM và Item picker vẫn cần functional production smoke bằng dữ liệu thử đã kiểm soát.

## Production versions hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Gateway `cloudforge-gateway`: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- FIFO rollout: **disabled**.

## RBAC

- Slice A PR `#37`, Slice B PR `#45` và post-merge QA PR `#48` đã merge.
- Regression hậu merge giữ tại `server/tests/rbac-post-merge-qa.test.mjs`.
- Staging/browser QA bằng tài khoản và tenant thử thật vẫn là việc riêng.

## Release automation

- `.github/workflows/gateway-production-release.yml` là đường phát hành Gateway có exact target SHA, smoke và Wrangler version evidence.
- `.github/release/gateway-production.trigger` là trigger Gateway production.
- `.github/workflows/ci.yml` giữ tenant release path backup → migrate → deploy → smoke và đọc version từ Wrangler NDJSON.
- `.github/workflows/cloudflare-production-observation.yml` chỉ chạy thủ công để kiểm endpoint smoke.
- Không dùng Cloudflare deployments REST endpoint làm nguồn provider evidence cho Tenant Worker.

## Safety

- D1 migrations append-only.
- Không sửa production secrets trong đợt này.
- Không kích hoạt FIFO, không thay DNS và không commit backup SQL/evidence thô.
