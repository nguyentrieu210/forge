# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Purchase/FIFO — đã merge và phát hành production

### Merge

- Feature PR `#14`: `feat(purchase): complete Purchase Order and Receipt FIFO workflow`.
- Feature head cuối trước merge: `697fdf60fb48671ee6655f321700bc036b51b01f`.
- Squash merge SHA: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Phạm vi gồm FIFO allocation/unapplied, settlement close/reverse, manual override có permission/reason, backfill/cutover tooling, submit preview, allocation timeline, supplier debt drill-down và operator UI.
- Người vận hành duyệt merge/deploy ngay và chấp nhận rủi ro browser Playwright của luồng Purchase chưa hoàn tất tại thời điểm release đầu.
- FIFO activation chưa được phê duyệt riêng và rollout vẫn **disabled**.

### Tenant Worker production `alu`

- Execution PR `#55` chỉ dùng kích hoạt release, đã đóng và **không merge**.
- Release run: `30631386714`.
- Release job: `91158315099` (`Release alu production`).
- Exact code checkout/deploy: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Backup remote: **PASS**, kích thước `8,971,462` bytes, SHA-256 `fe41aa7e4eb42b1761107d21795897c91a85a4f4066c0411683541e325a55a24`.
- Backup artifact: `alu-pre-release-backup-30631386714`, artifact ID `8793480138`.
- Migration dry-run/live: **PASS**; D1 báo toàn bộ `32` migration của release đó đã được ghi nhận.
- Tenant deploy dry-run/live: **PASS**.
- Worker: `cloudforge-tenant-alu`.
- Tenant Worker version ID từ Wrangler NDJSON: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Deploy timestamp từ Wrangler: `2026-07-31T12:40:34.352Z`.
- Production smoke: `/health` = `200`, unauthenticated boot = `403`.
- Release evidence artifact: `alu-production-release-30631386714`, artifact ID `8793494701`.
- Job tổng thể bị GitHub đánh `failure` chỉ vì bước hậu kiểm gọi Cloudflare deployments REST endpoint trả `404`; backup, migration, deploy và smoke đều **PASS**.
- `.github/workflows/ci.yml` đã được sửa tại `d8959d559b5ee651e17ce5f12e1f9475e25404e1` để lấy provider evidence trực tiếp từ Wrangler NDJSON.

### Gateway/frontend production

- Release PR `#57`: `release: deploy purchase UI to Gateway production`.
- Release merge SHA: `f50993ef7736a0321f6a0e8c308c5cb069497472`.
- Exact code checkout/build/deploy: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Gateway run: `30631951946`.
- Job: `91160176928` (`Build and deploy Gateway`) — **SUCCESS**.
- Build MetaForge và stage frontend: **PASS**.
- Wrangler deploy `cloudforge-gateway`: **PASS**.
- Gateway version ID: `6352386d-8385-4ea8-af31-15ac62e21943`.
- Production smoke: `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- Provider evidence từ Wrangler NDJSON: **PASS**.
- Evidence artifact: `gateway-production-release-30631951946`, artifact ID `8793729472`.

### Release cleanup

- Đã xóa workflow tenant one-shot `.github/workflows/release-alu-purchase-20260731.yml`.
- Đã xóa hai trigger tạm `alu-purchase-production.trigger` và `alu-purchase-observe.trigger`.
- `cloudflare-production-observation.yml` được thu gọn thành manual smoke-only workflow; không còn gọi deployments REST endpoint đã trả `404`.
- Các PR execution cũ `#11`, `#52`, `#55` đã đóng và không merge.

### Residual production verification

- Chromium component/browser QA cho Purchase đã được bổ sung và **PASS** trên desktop/mobile trong PR `#63`.
- Chưa thực hiện authenticated production business smoke PO → Receipt → cancel → settlement/manual override → supplier debt report bằng chứng từ thử đã kiểm soát.
- Endpoint smoke và component harness không thay thế staging/business smoke trên dữ liệu gần production.
- Không bật FIFO production trước backfill checksum, `unresolved_count=0`, staging evidence, backup mới và explicit approval riêng.

## PR #63 — Purchase lifecycle correction và browser QA hoàn tất

- PR: `#63` — `feat(purchase): finish FIFO QA, cutover and activation gates`.
- Nhánh: `feat/purchase-fifo-production-completion-20260731`, base `hotfix/alumdoor-print-list-delete`.
- Source commit đã materialize: `2b8219f8325dd41e4c9cd833f48f85a0d5b87d55`.
- Không còn payload base64, workflow apply/materialize one-shot hoặc generated source artifact trong branch.
- Migration append-only `0032_purchase_reversed_window_corrections.sql` cho phép chỉ entry `reverse` được ghi vào settlement window trạng thái `Reversed`; obligation mới vẫn chỉ được ghi khi `Open`.
- Cancel Receipt được phép sau lifecycle `close → reverse`, với regression test xác nhận quantity/weight trở về `0` và window giữ trạng thái `Reversed`.
- Browser harness chạy actual `AllocationTimelineDialog` trong package `runtime`; Playwright kiểm desktop `1440x1000` và mobile `390x844`.
- Browser cases đã **PASS 6/6**: settlement reason/actions, manual override validation, supplier debt filters/reset/CSV.
- UI run `30641219079`, job `91191344929`: lint, tests, typecheck, build, Alumdoor browser QA, Purchase browser QA và local cookie-auth smoke đều **SUCCESS**.
- Browser/auth evidence artifacts: `8797591671` và `8797601615`.
- Các exact-head run khác đều **SUCCESS**:
  - CI `30641219106`;
  - PR Validation `30641219090`;
  - Purchase Feature CI `30641219083`;
  - Inventory and Manufacturing CI `30641219256`;
  - Sales Feature CI `30641219075`.
- PR mergeable và source đã sẵn sàng cho vòng CI cuối sau cập nhật tài liệu.
- Không deploy Cloudflare, không sửa production secrets và không kích hoạt FIFO trong PR này.

## Bán hàng — lọc mặt hàng child table đã phát hành production

- Hotfix PR `#53` đã squash-merge thành `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- `buildLinkFilters` hỗ trợ object-form, array-form, operator tuple và dependent `eval:` filters; chặn prototype-key nguy hiểm.
- Sáu workflow exact-head đã **PASS**, gồm Chromium QA và local cookie-auth smoke.
- Gateway release trước đó run `30630931291`, version `dc6eada4-e4a1-451a-a92f-66fe04050707`; phiên bản này đã được thay bởi Gateway Purchase release nêu trên.
- Functional browser smoke production cho Item picker và multi-UOM vẫn là việc riêng.

## Production versions hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Gateway `cloudforge-gateway`: `6352386d-8385-4ea8-af31-15ac62e21943`.
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
