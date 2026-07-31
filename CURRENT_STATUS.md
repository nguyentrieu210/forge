# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Purchase/FIFO — lifecycle correction và browser QA đã merge, Tenant production đã release

### Merge và phạm vi

- PR `#63`: `feat(purchase): finish FIFO QA, cutover and activation gates`.
- Exact final head: `733ba52aca3ee5563252c7e41e635ad431afdc2b`.
- Squash merge SHA: `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Source thật đã được materialize; không còn payload base64 hoặc workflow apply/materialize one-shot.
- Migration append-only `0032_purchase_reversed_window_corrections.sql` cho phép chỉ entry `reverse` ghi vào settlement window `Reversed`; obligation mới vẫn chỉ được ghi khi `Open`.
- Lifecycle `close → reverse → cancel` được hỗ trợ và có regression xác nhận quantity/weight trở về `0`, window giữ `Reversed`.
- Browser harness chạy actual `AllocationTimelineDialog` trong package `runtime`.
- Playwright desktop/mobile đã PASS 6/6 cho settlement reason/actions, manual override validation và supplier debt filters/reset/CSV.

### Exact-head CI

Trên `733ba52aca3ee5563252c7e41e635ad431afdc2b`:

- Purchase Feature CI `30642237953`: **PASS**.
- CI `30642237968`: **PASS**.
- PR Validation `30642238103`: **PASS**.
- Inventory and Manufacturing CI `30642238048`: **PASS**.
- Sales Feature CI `30642237985`: **PASS**.
- UI Pull Request Validation `30642237974`, job `91194797008`: lint, tests, typecheck, build, Alumdoor browser QA, Purchase browser QA và local cookie-auth smoke **PASS**.

### Tenant production release

- Release preparation PR `#70` squash-merge thành `160ac81f28da3de6d96fc64741d257eccb0903a9`, khóa workflow vào exact target SHA `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Execution PR `#72` chỉ kích hoạt release, đã đóng **không merge**.
- Release run `30643069110`.
- Release job `91197586569` (`Release alu production`) — **SUCCESS**.
- Backup tenant: **PASS**; artifact `alu-pre-release-backup-30643069110`, ID `8798262944`.
- Recorded migrations dry-run/live: **PASS**, gồm migration `0032`.
- Tenant deploy: **PASS**.
- Production smoke: `/health` = `200`, unauthenticated boot = `403`.
- Tenant Worker: `cloudforge-tenant-alu`.
- Production version ID: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- Deployment time: `2026-07-31T15:30:24.210Z`.
- Release evidence artifact: `alu-production-release-30643069110`, ID `8798283613`.
- CI run `30643069110` và PR Validation `30643069140`: **PASS**.
- Không deploy Gateway vì PR `#63` chỉ thêm browser harness/workflow phía client, không đổi production UI bundle.
- Không sửa production secrets hoặc DNS.
- FIFO rollout vẫn **disabled**; release code/migration không phải approval activation.

### Gate còn lại trước FIFO activation

- Chưa có staging backfill/checksum evidence trên bản sao dữ liệu phù hợp.
- `unresolved_count=0` chưa được chứng minh trên staging/production-shaped copy.
- Chưa chạy authenticated business smoke đầy đủ PO → Receipt → cancel → settlement/reverse → manual override → supplier debt report trên dữ liệu thử kiểm soát.
- Cần production backup mới ngay trước activation và explicit approval riêng.

## Bán hàng — hotfix tự điền đơn giá child grid đã phát hành production

- Lỗi production: chọn `Bảng giá áp dụng` và mặt hàng nhưng ô `Đơn giá` trong child grid có thể không tự điền.
- Nguyên nhân: preview `alumdoor.sales.item_context` và pricing authoritative phụ thuộc vào tên bản ghi Item Price. Dữ liệu cũ/import/đổi tên có thể có đủ `price_list + item_code + uom` nhưng tên không khớp key canonical, khiến preview trả `price_missing` và client xoá `rate`.
- PR `#65`: `fix(sales): restore price autofill in child grids`.
- Exact final head trước merge: `9a1a2b2cf33ac71216a49d6b13e33ffb046765e7`.
- Squash merge SHA: `db2d5abd8273a5a6c266ba7343554ebeac27618c`.
- Cách sửa:
  - giữ fast-path tên ba phần và legacy hai phần;
  - fallback bằng chính các field `price_list + item_code + uom`;
  - áp cùng quy tắc cho preview child grid và pricing lúc lưu/submit;
  - từ chối nhiều giá hoạt động cùng khớp thay vì chọn ngẫu nhiên;
  - giữ chẩn đoán giá disabled/malformed khi callback list không tồn tại.
- Regression: `server/tests/sales-price-field-lookup.test.mjs` kiểm tên record không canonical, duplicate active prices và authoritative pricing fallback.
- Exact final-head CI của PR `#65`:
  - PR Validation `30639484698`: **PASS**; Gateway/Tenant release **SKIPPED**.
  - CI `30639485165`: **PASS**.
  - Sales Feature CI `30639485448`: unit, SQL, brief, client tests, typecheck và build **PASS**.
  - Purchase Feature CI `30639484434`: **PASS**.
  - Inventory and Manufacturing CI `30639485204`: **PASS**.
  - UI Pull Request Validation `30639485828`: lint, tests, typecheck, build, Chromium QA và cookie-auth smoke **PASS**.

### Tenant production release

- Release preparation PR `#67` squash-merge thành `87b9410a0a1499100aeafce75b018117fda81ab6`, khóa workflow vào exact target SHA `db2d5abd8273a5a6c266ba7343554ebeac27618c`.
- Execution PR `#68` chỉ đổi `.github/release/alu-production.trigger`, đã đóng **không merge** sau khi release hoàn tất.
- Release run: `30640747900`.
- Release job: `91189756848` (`Release alu production`) — **SUCCESS**.
- Backup tenant: **PASS**.
- Recorded migrations dry-run/live: **PASS**.
- Tenant deploy: **PASS**.
- Production smoke: `/health` = `200`, unauthenticated boot = `403`.
- Tenant Worker version khi đó: `7542bba4-dc20-4794-8c92-9d26af349531`; đã được thay bởi Purchase correction release nêu trên.
- Deployment time: `2026-07-31T14:57:41.354Z`.
- CI run `30640747900` và PR Validation `30640747905`: **PASS**.
- Không deploy Gateway vì hotfix không đổi frontend.
- Không mutate Item Price, không sửa production secrets, FIFO vẫn **disabled**.
- Còn thiếu functional production smoke có đăng nhập để xác minh giá tự điền bằng dữ liệu thử thực tế.

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

## Bán hàng — lọc mặt hàng và multi-UOM

- Hotfix lọc Item PR `#53` squash-merge thành `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- `buildLinkFilters` hỗ trợ object-form, array-form, operator tuple và dependent `eval:` filters; chặn prototype-key nguy hiểm.
- Sales multi-UOM và Item picker vẫn cần functional production smoke bằng dữ liệu thử đã kiểm soát.

## Production versions hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
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
