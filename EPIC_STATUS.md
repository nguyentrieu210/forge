# FORGE EPIC STATUS

Ngày cập nhật: **2026-08-01**.

## Snapshot GitHub

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại thời điểm lập hàng đợi: `b9a5489903d746858f46a131561325b835b870c3`.
- Branch điều phối: `docs/forge-epic-control-20260801`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI.
- Tài liệu này khóa thứ tự epic; trạng thái PR sống phải được kiểm lại trước mỗi lần làm.

## Quy tắc điều phối

1. Mỗi epic chỉ có một PR canonical.
2. Tối đa hai epic nghiệp vụ được ACTIVE cùng lúc.
3. PR chỉ là `MERGE READY` khi exact-head required CI xanh, mergeable, không còn review blocker và final diff không chứa workflow/payload/trigger tạm.
4. Merge workflow vận chuyển không đồng nghĩa code nghiệp vụ đã merge.
5. Sau mỗi merge phải cập nhật `EPIC_STATUS.md`, `CURRENT_STATUS.md`, `NEXT_TASKS.md` và `AI_HANDOFF.md`.

## Hàng đợi canonical

| Thứ tự | Epic | PR/nhánh canonical | Trạng thái | Điều kiện chuyển bước |
|---|---|---|---|---|
| 1 | Sales-to-Production | Chưa có PR sạch sau merge #115 | `BLOCKED / REBUILD` | Dựng nhánh từ current default; mang code nghiệp vụ thật; test exact-head; không giữ workflow/trigger tạm |
| 2 | Purchase authenticated QA | PR #103, `feat/purchase-authenticated-lifecycle-qa-20260731` | `ACTIVE / DRAFT` | Desktop + Pixel 7 lifecycle xanh; full exact-head CI xanh; chuyển Ready; merge |
| 3 | Finance | PR #15 chỉ là nguồn tham khảo | `QUEUED / REBUILD` | Dựng lại từ default; hoàn thiện allocation, statements, balances và UI |
| 4 | Daily ledger | Chưa có PR | `QUEUED` | Chốt immutable daily snapshot, adjustment workflow, quyền sửa sau khóa ngày và đối chiếu |
| 5 | Warranty / Capacity | Chưa có PR | `QUEUED` | Chốt lỗi/bảo hành/accounting effect; lịch sản xuất, công suất và overtime |
| 6 | End-to-end acceptance | Chưa có PR | `QUEUED` | Authenticated journey Đơn bán → sản xuất → kho → giao → công nợ → daily ledger PASS |

## Merge mới đã xác minh

### Inventory Slice D

- PR #82 đã merge.
- Merge SHA: `a7e6ef65b2352f596e285ea34d8e6438dff11a95`.
- Read model và API tồn vật lý đã vào default.
- Explorer UI và báo cáo WIP/shortage/variance/scrap/offcut/ageing vẫn là follow-up.

### Tenant release workflow

- PR #113 đã merge.
- Merge SHA: `0b29cbb3aed1850bb633fd49facf9d8242b2a9e1`.
- Workflow release tenant `alu` đã vào default.
- Chưa ghi `DONE production` nếu chưa có run ID, Worker version và smoke result của exact merged SHA.

### Runtime workspace

- PR #114 đã merge.
- Merge SHA: `6db933aec8f211103ee2887e0cb364d346079cb2`.
- Workspace navigation/runtime shell và Gateway release workflow đã vào default.

### Sales-to-Production transport merge

- PR #115 đã merge.
- Merge SHA: `eab228aa72bbf54575ec573b4f7eadaa9a8060f7`.
- Final diff chỉ có:
  - `.github/workflows/sync-sales-production-clean-once.yml`;
  - `server/scripts/.sync-sales-production-trigger`.
- PR #115 **không chứng minh code Sales-to-Production đã vào default**.
- Workflow chỉ trigger trên push vào feature branch, nên bản merge trên default không được coi là hoàn thành nghiệp vụ.

### Observable production release

- PR #117 đã merge.
- Merge SHA: `b9a5489903d746858f46a131561325b835b870c3`.
- Release workflows đã được bổ sung khả năng xuất trạng thái/evidence dễ đọc hơn.
- Đây là platform support, không thay đổi thứ tự hàng đợi nghiệp vụ.

## PR cần retire sau khi kiểm diff

- #107: Sales transport cũ.
- #81/#109: MetaForge prototype/rebase cũ; so với #114 rồi retire nếu không còn giá trị unique.
- #116: có khả năng đã bị #117 thay thế.
- #40: Finance backup, không phải nhánh merge.
- #36: tmp UI rebase.
- #35/#73/#74/#79: CI/hotfix cũ hoặc đã có bản thay thế.

Không đóng hàng loạt trước khi kiểm unique diff chưa nằm trên default.

## Definition of Done toàn hệ thống

- Sáu epic đều `DONE`.
- Không còn PR nghiệp vụ canonical mở.
- Exact merged SHA có CI và release evidence tương ứng.
- Production smoke có target identity, run ID, version/deployment ID và kết quả.
- Authenticated end-to-end acceptance PASS.
- Critical/High blocker bằng 0.
- FIFO chỉ đổi trạng thái khi có lệnh riêng và đủ backup/checksum/rollback.

## Safety

- Không sửa production secret hoặc DNS nếu chưa có lệnh riêng.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
