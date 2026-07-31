# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại snapshot: `b9a5489903d746858f46a131561325b835b870c3`.
- Handoff branch: `docs/forge-epic-control-20260801`.
- Canonical queue: `EPIC_STATUS.md`.

## Trạng thái tổng thể

- Toàn hệ thống **chưa đạt end-to-end acceptance**.
- Kho vật lý, BOM/Work Order, Purchase core, Sales MVP, RBAC và runtime workspace đã có nền tảng đã merge.
- Các khoảng trống lớn còn lại: Sales-to-Production thật, Purchase authenticated QA, Finance đầy đủ, daily ledger, warranty/capacity và whole-process acceptance.

## Merge mới

| PR | Nội dung | Merge SHA | Kết luận |
|---|---|---|---|
| #82 | Inventory Slice D foundation | `a7e6ef65b2352f596e285ea34d8e6438dff11a95` | Backend/read model/API đã merge; UI/report follow-up còn thiếu |
| #113 | Protected release workflow cho tenant `alu` | `0b29cbb3aed1850bb633fd49facf9d8242b2a9e1` | Workflow đã merge; production evidence phải kiểm riêng |
| #114 | Runtime workspace production | `6db933aec8f211103ee2887e0cb364d346079cb2` | Navigation/runtime shell và Gateway workflow đã merge |
| #115 | Sales-to-Production transport sync | `eab228aa72bbf54575ec573b4f7eadaa9a8060f7` | Chỉ workflow + trigger; không tính code nghiệp vụ hoàn thành |
| #117 | Observable production release | `b9a5489903d746858f46a131561325b835b870c3` | Platform evidence support; không thay đổi hàng đợi nghiệp vụ |

## Hàng đợi hiện tại

### 1. Sales-to-Production — BLOCKED / REBUILD

- PR #115 đã merge sai phạm vi kết luận: final diff không có code nghiệp vụ.
- PR #107 là nhánh transport cũ, không dùng làm PR canonical.
- Cần nhánh sạch từ current default với source thật và full gate.

### 2. Purchase authenticated QA — ACTIVE / DRAFT

- PR: #103.
- Branch: `feat/purchase-authenticated-lifecycle-qa-20260731`.
- Exact head gần nhất: `94ccc11ff79b2d0cd9269abb5804009887b950a8`.
- GitHub từng báo mergeable; full exact-head workflows đang chạy tại lần kiểm gần nhất.
- Gate còn lại: Desktop Chrome + Pixel 7 lifecycle, full CI, Ready for review, final diff/review.

### 3. Finance — QUEUED / REBUILD

- PR #15 stale và không mergeable.
- Chỉ dùng code/test trong PR #15 làm nguồn tham khảo.
- Phải dựng lại từ current default và bổ sung Payment Entry/Allocation, statement, debt summary, advance balance và UI.

### 4. Daily ledger — QUEUED

- Chưa có PR canonical.
- Chưa có contract hoàn chỉnh cho snapshot cuối ngày, khóa sửa và adjustment document.

### 5. Warranty / Capacity — QUEUED

- Chưa có PR canonical.
- Chưa hoàn thiện defect/warranty lifecycle và production capacity/overtime scheduling.

### 6. End-to-end acceptance — QUEUED

- Chỉ chạy sau khi năm epic trên có code merged và release evidence.
- Journey bắt buộc: Sales Order → production → inventory → delivery → debt → daily ledger.

## Các nhánh không phải nguồn merge

- #107: Sales transport cũ.
- #81/#109: MetaForge prototype/rebase cũ; so với #114 rồi retire.
- #116: có khả năng đã bị #117 thay thế.
- #40: Finance backup.
- #36: tmp UI rebase.
- #35/#73/#74/#79: CI/hotfix cũ hoặc đã có bản thay thế.

Không đóng trước khi kiểm unique diff chưa nằm trên default.

## Production evidence đã có trước đó

### Alumdoor app Worker

- Feature merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Release run: `30651057535`.
- Worker: `cloudforge-app-alumdoor`.
- Namespace: `cloudforge-production`.
- Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.

### Tenant Worker evidence cũ

- Run: `30649182082`.
- Worker: `cloudforge-tenant-alu`.
- Version: `ed5852cf-94ef-4a02-b0b9-1e64020c2d0d`.

Evidence cũ không tự chứng minh các merge #82–#117 đã được release đúng exact SHA.

## Gate merge chung

Một PR chỉ được ghi `MERGE READY` khi:

- exact head được chốt;
- mergeable và không stale/conflict;
- required CI đều SUCCESS;
- không có unresolved review blocker;
- final diff chỉ chứa source/test/docs cần thiết;
- không còn workflow/payload/trigger tạm;
- release/rollback boundary đã ghi rõ.

## Safety

- Không sửa production secrets hoặc DNS nếu chưa có lệnh riêng.
- Không bật FIFO.
- Không mutate tenant data ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
