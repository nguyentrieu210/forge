# CURRENT STATUS

Ngày cập nhật: **2026-07-31**. Workspace vận hành chuẩn: `C:\Forge`.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Working branch: `feat/inventory-physical-stock-slice-b-20260731`.
- Pull request: `#49` — physical inventory Slice B.
- GitHub là nguồn sự thật cho code, PR, CI và release evidence.
- Không commit `.env`, `.dev.vars`, secret, `server/work/`, `tmp/`, backup SQL hoặc generated artifacts.

## Inventory Slice B — physical stock

### Phạm vi đã hoàn thành

- Server-built physical identity snapshot theo inventory mode/profile, màu, tình trạng, đời, kích thước và physical count.
- Batch/serial/Aluminium Lot lineage với exact bundle quantity/direction/warehouse checks.
- Warehouse roles: `RAW_MATERIAL`, `WIP`, `FINISHED_GOODS`, `QUARANTINE`, `SCRAP_OFFCUT`, `GENERAL`.
- Guards cho receipt, transfer, issue/manufacture, quarantine release và scrap/offcut recovery.
- Existing `stock_ledger_entries` tiếp tục là quantity/value ledger append-only duy nhất.
- Transfer và cancel giữ exact original ledger lineage/value.
- Company-wide Durable Object key `inventory:<tenant>:<company>` cho mọi Stock Entry và Work Order submit/cancel.
- Regression cover identity mismatch, stale Aluminium Lot warehouse, second transfer, quarantine/recovery evidence và concurrent issue.

### Review

- `server/docs/ALUMDOOR-INVENTORY-SLICE-B-REVIEW.md`.
- Score: **97/100**.
- Critical: `0`.
- High: `0` sau remediation.

### Đồng bộ default

- Default SHA: `4cbcd2a3a8f742da7dd1b7e0c5b29899af4cfce0`.
- Trước sync: branch ahead `25`, behind `12`, diverged.
- Sync merge commit: `59c364a1b8443713921efad84b710b07ce9823a9`.
- PR #49 sau sync: conflict-free và `mergeable=true`.
- Default mới nhất được giữ làm tree baseline; chỉ code/test/review Slice B được phủ lại.
- Tài liệu branch cũ không được phép ghi đè trạng thái production hiện hành.

### CI code head

Trên `59c364a1b8443713921efad84b710b07ce9823a9`:

- PR Validation `30644981424`: **PASS**.
- Sales Feature CI `30644945918`: **PASS**.
- Inventory and Manufacturing CI `30644945877`: **PASS**.
- CI `30644945928`: **PASS**.
- Purchase Feature CI `30644945921`: **PASS**.
- UI Pull Request Validation `30644945919`: đang chạy browser/auth gates tại thời điểm commit tài liệu.

Các commit tài liệu sau code head tạo exact final head mới. Merge evidence phải lấy từ CI trên final head, không tái sử dụng run cũ.

### Gate còn lại

- Toàn bộ required workflows PASS trên exact final head.
- PR body cập nhật final SHA/run IDs.
- Chuyển PR khỏi draft sau khi mergeable và review threads sạch.
- Merge chỉ khi có yêu cầu rõ ràng.
- Live tenant catalog audit read-only và remediation plan.
- Staging receive/transfer/issue/quarantine/scrap/cancel journeys.
- Production load/latency observation cho company-wide inventory lock.
- Physical-stock UI/report/read model trong Slice D.

## Purchase/FIFO production

- PR `#63` squash-merge SHA `ac0c2241b2dc16abfd16b4b3e70943d8bbff8476`.
- Migration `0032_purchase_reversed_window_corrections.sql` đã release production.
- Release run `30643069110`, job `91197586569`: backup, migration, deploy, smoke và Wrangler evidence **PASS**.
- Tenant Worker production version: `88c508a7-f3f7-4844-9c8b-85a02bc362f3`.
- FIFO rollout vẫn **disabled**.
- Chưa có staging backfill/checksum evidence và `unresolved_count=0`.

## Sales và UI production

- Sales price autofill PR `#65` đã merge/release; functional production smoke có đăng nhập vẫn còn thiếu.
- Item picker filter PR `#53` đã merge.
- Dialog dropdown wheel PR `#62` đã merge và Gateway release thành công.
- Gateway production version: `b0d0ce5b-408c-47ab-a734-fa55ba4d9c00`.
- Functional production smoke cho price autofill, multi-UOM và child-grid dropdown vẫn là việc riêng.

## RBAC

- Slice A PR `#37`, Slice B PR `#45` và post-merge QA PR `#48` đã merge.
- Regression hậu merge giữ tại `server/tests/rbac-post-merge-qa.test.mjs`.
- Staging/browser QA bằng tài khoản và tenant thử thật vẫn còn thiếu.

## Safety

- Không deploy Cloudflare trong đợt Inventory Slice B này.
- Không tenant migration/mutation.
- Không sửa production secrets hoặc DNS.
- D1 migrations append-only.
- FIFO không được kích hoạt nếu thiếu backup, checksum, staging evidence và approval riêng.
