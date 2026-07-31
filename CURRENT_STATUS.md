# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Tồn kho/Sản xuất — Slice B/C đã hoàn thiện code

### Slice B — Physical inventory

- Branch: `feat/inventory-physical-stock-slice-b-20260731`.
- PR: `#49`.
- Authoritative metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`.
- Review: `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`.
- Score: **97/100**; Critical `0`; High `0` sau remediation.
- Đã triển khai canonical physical identity trên Stock Entry rows, gồm inventory mode/profile, màu, tình trạng, đời sản phẩm, kích thước, physical count và batch/serial/Aluminium Lot lineage.
- Warehouse role rules đã có cho nguyên vật liệu, WIP, thành phẩm, chờ kiểm, phế/đầu thừa và kho chung.
- Chuyển khỏi quarantine cần `quality_release_reference`; phục hồi scrap/offcut cần `recovery_reason`.
- Bundle phải submitted, đúng Item/kho/direction và tổng quantity phải khớp dòng chứng từ.
- Màu/chiều dài khai trên dòng phải khớp physical lot; stale `Aluminium Lot.warehouse` không được dùng thay stock-ledger batch balance.
- Existing append-only stock ledger vẫn là sổ quantity/value duy nhất; không tạo ledger vật lý thứ hai.
- Company-wide inventory coordinator dùng key `inventory:<tenant>:<company>` cho Stock Entry và Work Order submit/cancel, chặn race giữa các voucher khác tên cùng tiêu thụ stock hoặc production limit.
- Exact cancel dùng original ledger rows; transfer giữ batch/serial lineage.
- Tests: physical identity/roles, missing lineage, quarantine, second transfer, exact cancel, lot mismatch, concurrent issue và coordinator routing.
- Không có migration mới, tenant mutation, Cloudflare deploy hoặc secret change.

### Slice C — Manufacturing lifecycle

- Branch: `feat/manufacturing-bom-workorder-slice-c-20260731`.
- PR: `#50`, stacked trên Slice B cho tới khi PR #49 merge.
- Review: `server/docs/ALUMDOOR-MANUFACTURING-SLICE-C-REVIEW.md`.
- Score: **97/100**; Critical `0`; High `0` sau remediation.
- BOM đã có revision, Draft/Active/Retired, effective interval, output/row UOM conversion và quantity-basis semantics.
- Có duplicate revision, overlapping active interval, self-consumption và circular dependency guards.
- BOM checksum SHA-256 xác định; Work Order chọn revision hiệu lực và giữ immutable snapshot/checksum/BOM rows.
- Issue, consumption, scrap và offcut được gắn BOM row và checksum Work Order.
- Split-line cap và prior-progress cap chặn vượt định mức; output được chuẩn hóa về stock UOM.
- Offcut/scrap value giữ đúng một lần, được trừ khỏi finished-good valuation để bảo toàn tổng stock value.
- Submitted Work Order legacy không có snapshot/checksum vẫn chạy và cancel theo legacy physical-stock path.
- Slice C kế thừa company-wide inventory coordinator từ Slice B; coordinator Work Order riêng đã bỏ để tránh nested lock.
- Tests: effective revision, quantity basis, overlap/circular BOM, immutable snapshot, split-line cap, offcut value, cancel, race, issue line identity, stock UOM và legacy rollout.
- Không có migration mới, tenant mutation, Cloudflare deploy hoặc secret change.

### Merge gate B/C

- PR body là nguồn authoritative cho exact final head và workflow run/job IDs.
- Trước khi chuyển ready phải: behind `0`, mergeable, không unresolved review thread và exact-head `PR Validation`, `Inventory and Manufacturing CI`, `CI` cùng `UI Pull Request Validation` xanh.
- PR #49 phải merge trước PR #50; PR #50 chỉ retarget/rebase default sau khi B merge.
- Không merge hoặc deploy nếu chưa có explicit approval riêng.

## Purchase/FIFO — đã merge và phát hành production

### Merge

- Feature PR `#14`: `feat(purchase): complete Purchase Order and Receipt FIFO workflow`.
- Feature head cuối trước merge: `697fdf60fb48671ee6655f321700bc036b51b01f`.
- Squash merge SHA: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Phạm vi gồm FIFO allocation/unapplied, settlement close/reverse, manual override có permission/reason, backfill/cutover tooling, submit preview, allocation timeline, supplier debt drill-down và operator UI.
- FIFO activation **không được yêu cầu** và rollout vẫn **disabled**.

### Tenant Worker production `alu`

- Release run: `30631386714`.
- Release job: `91158315099` (`Release alu production`).
- Exact code checkout/deploy: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Backup remote: **PASS**, kích thước `8,971,462` bytes, SHA-256 `fe41aa7e4eb42b1761107d21795897c91a85a4f4066c0411683541e325a55a24`.
- Backup artifact: `alu-pre-release-backup-30631386714`, artifact ID `8793480138`.
- Migration dry-run/live: **PASS**; D1 báo toàn bộ `32` migration đã được ghi nhận, không còn migration chờ áp dụng.
- Tenant deploy dry-run/live: **PASS**.
- Worker: `cloudforge-tenant-alu`.
- Tenant Worker version ID: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Deploy timestamp: `2026-07-31T12:40:34.352Z`.
- Production smoke: `/health` = `200`, unauthenticated boot = `403`.
- Release evidence artifact: `alu-production-release-30631386714`, artifact ID `8793494701`.
- Job tổng thể bị GitHub đánh `failure` chỉ vì hậu kiểm Cloudflare deployments REST trả `404`; backup, migration, deploy và smoke đều **PASS**.

### Gateway/frontend production

- Release PR `#57`: `release: deploy purchase UI to Gateway production`.
- Release merge SHA: `f50993ef7736a0321f6a0e8c308c5cb069497472`.
- Exact code checkout/build/deploy: `7b3dc06dbbecbb5370ddb48259aa1614aef2ff32`.
- Gateway run: `30631951946`.
- Job `91160176928` — **SUCCESS**.
- Gateway version ID: `6352386d-8385-4ea8-af31-15ac62e21943`.
- Production smoke: `/health` = `200`, `/` = `200`, unauthenticated boot = `403`.
- Evidence artifact: `gateway-production-release-30631951946`, artifact ID `8793729472`.

### Residual verification

- Chưa có functional browser evidence production cho toàn bộ Purchase UI desktop/mobile.
- Chưa có production business smoke đăng nhập cho PO → Receipt → cancel → settlement/manual override → supplier debt report.
- Endpoint smoke không thay thế UI/nghiệp vụ evidence.
- Không bật FIFO trước backfill checksum, `unresolved_count=0`, staging evidence, backup mới và explicit approval riêng.

## Bán hàng

- Hotfix PR `#53` đã squash-merge thành `48fa4d77eefb46384272550f8f6c0699ed054fa6`.
- `buildLinkFilters` hỗ trợ object/array/operator/dependent `eval:` filters và chặn prototype-key nguy hiểm.
- Sáu workflow exact-head đã **PASS**, gồm Chromium QA và cookie-auth smoke.
- Functional browser smoke production cho Item picker và multi-UOM vẫn là việc riêng.

## RBAC

- Slice A PR `#37`, Slice B PR `#45` và post-merge QA PR `#48` đã merge.
- Regression hậu merge: `server/tests/rbac-post-merge-qa.test.mjs`.
- Staging/browser QA bằng tài khoản và tenant thử thật vẫn là việc riêng.

## Production versions hiện hành

- Tenant Worker `cloudforge-tenant-alu`: `9ec0d1d3-c1fd-4263-ae35-4fae81c09968`.
- Gateway `cloudforge-gateway`: `6352386d-8385-4ea8-af31-15ac62e21943`.
- FIFO rollout: **disabled**.

## Release automation

- `.github/workflows/gateway-production-release.yml` là đường phát hành Gateway có exact target SHA, smoke và Wrangler version evidence.
- `.github/workflows/ci.yml` giữ tenant release path backup → migrate → deploy → smoke và đọc version từ Wrangler NDJSON.
- `.github/workflows/cloudflare-production-observation.yml` chỉ chạy thủ công để kiểm endpoint smoke.
- Không dùng Cloudflare deployments REST endpoint làm nguồn provider evidence cho Tenant Worker.

## Safety

- D1 migrations append-only.
- Không sửa production secrets trong đợt Slice B/C.
- Không deploy Slice B/C, không migrate/mutate tenant `alu` và không kích hoạt FIFO.
