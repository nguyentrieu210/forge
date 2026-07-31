# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Default head tại snapshot này: `b9a5489903d746858f46a131561325b835b870c3`.
- Working branch handoff: `docs/forge-epic-control-20260801`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, PR, mergeability và CI; tài liệu chỉ khóa thứ tự làm việc.

## Quy trình bắt buộc khi tiếp tục

1. Đọc bốn file trên.
2. Kiểm default head mới nhất.
3. Kiểm exact head, final diff, mergeability và workflow của PR canonical.
4. Không coi title/body PR là bằng chứng code đã vào default.
5. Sau mỗi merge cập nhật lại bốn file trạng thái.

## Các merge mới đã xác minh

### Inventory Slice D

- PR #82 đã merge.
- Merge SHA: `a7e6ef65b2352f596e285ea34d8e6438dff11a95`.
- Read model và API báo cáo tồn vật lý đã vào default.
- Explorer UI và báo cáo WIP/shortage/variance/scrap/offcut/ageing còn là follow-up.

### Tenant release workflow

- PR #113 đã merge.
- Merge SHA: `0b29cbb3aed1850bb633fd49facf9d8242b2a9e1`.
- Workflow release tenant `alu` đã vào default.
- Không tuyên bố production DONE nếu chưa có exact run ID, Worker version và smoke result.

### Runtime workspace

- PR #114 đã merge.
- Merge SHA: `6db933aec8f211103ee2887e0cb364d346079cb2`.
- Workspace navigation/runtime shell và Gateway release workflow đã vào default.
- PR #81/#109 cần kiểm diff rồi retire nếu không còn giá trị unique.

### Sales-to-Production PR #115

- PR #115 đã merge.
- Merge SHA: `eab228aa72bbf54575ec573b4f7eadaa9a8060f7`.
- Final diff chỉ chứa workflow đồng bộ một lần và file trigger:
  - `.github/workflows/sync-sales-production-clean-once.yml`;
  - `server/scripts/.sync-sales-production-trigger`.
- Code Sales-to-Production chưa được chứng minh đã vào default.
- Workflow chỉ trigger trên push vào feature branch, nên merge #115 không được tính là hoàn thành nghiệp vụ.
- Phải dựng PR sạch mới từ current default, mang code thật vào final diff và xóa toàn bộ transport workflow/trigger.

### Observable production release

- PR #117 đã merge.
- Merge SHA: `b9a5489903d746858f46a131561325b835b870c3`.
- Release workflows đã có thêm trạng thái/evidence dễ đọc hơn.
- Đây là platform support, không thay đổi thứ tự epic.

## Hàng đợi nghiệp vụ canonical

1. **Sales-to-Production** — `BLOCKED / REBUILD`.
2. **Purchase authenticated QA** — PR #103, `ACTIVE / DRAFT`.
3. **Finance** — rebuild từ current default; PR #15 chỉ dùng tham khảo.
4. **Daily ledger** — chưa có PR.
5. **Warranty / Capacity** — chưa có PR.
6. **End-to-end acceptance** — chưa có PR.

Tối đa hai epic nghiệp vụ ACTIVE cùng lúc. Hiện Purchase QA có PR canonical còn sống; Sales-to-Production phải tạo lại nhánh sạch trước khi tính là ACTIVE.

## Chi tiết việc tiếp theo

### 1. Sales-to-Production

- Dựng branch từ current default.
- Cherry-pick hoặc tái áp phần code nghiệp vụ đã review, không dùng workflow/payload vận chuyển trong final diff.
- Phạm vi phải có Đơn bán → Production Request → Work Order → Cut/Paint → Delivery theo row identity.
- Chạy door formula regression, Sales production flow, Unicode pricing, server build, client typecheck và full exact-head CI.
- Chỉ merge khi final diff sạch và toàn bộ required checks xanh.

### 2. Purchase QA

- PR #103 head tại lần kiểm gần nhất: `94ccc11ff79b2d0cd9269abb5804009887b950a8`.
- Draft, mergeable tại lần kiểm gần nhất; exact-head workflows đang chạy.
- Phải PASS lifecycle PO → Receipt trên Desktop Chrome và Pixel 7, giữ FIFO disabled.
- Sau khi xanh: chuyển Ready, kiểm diff/review rồi merge.

### 3. Finance

- Không merge PR #15 hiện tại.
- Dựng lại từ current default.
- Bao gồm AR/AP aging, Payment Entry partial/unallocated, Payment Allocation, Party Statement, Debt Summary, Advance Balance và UI/report navigation.
- Migration/backfill phải append-only, có checksum, staging evidence và rollback.

### 4–6

Chi tiết nằm trong `NEXT_TASKS.md` và thứ tự không được đảo nếu chưa cập nhật `EPIC_STATUS.md`.

## Nền tảng đã có

- Sales MVP và Unicode pricing đã merge/release trước đó.
- Purchase core/FIFO safeguards đã merge nhưng FIFO vẫn disabled.
- Inventory Slice B/D và Manufacturing Slice C đã merge.
- RBAC, login/landing và runtime workspace đã merge.
- Production-first policy PR #108 đã merge.

## Safety

- Không sửa production secret hoặc DNS nếu chưa có lệnh riêng.
- Không bật FIFO.
- Không mutate dữ liệu khách hàng ngoài smoke an toàn có cleanup.
- Không commit `.env`, `server/work/`, `tmp`, backup hoặc generated evidence.
