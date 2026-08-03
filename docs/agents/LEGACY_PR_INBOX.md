# FORGE LEGACY PR ARCHIVE

Ngày sync: **2026-08-03**.

> Purpose: lưu dấu vết các PR/branch lịch sử để có thể audit/reuse có kiểm chứng.  
> Exact GitHub state luôn thắng file này.

## Current truth

- **Open PR: 0**.
- Không PR nào trong tài liệu này là active backlog.
- Không reopen/merge PR cũ chỉ vì thấy implementation hữu ích.
- Nếu task mới cần code cũ, compare với exact current `main`, rồi cherry-pick/rebuild phần còn đúng contract vào **branch/PR mới**.

## Historical disposition vocabulary

- `REFERENCE`: chỉ dùng để đọc lại ý tưởng/evidence.
- `CHERRY-PICK`: task mới có thể lấy một phần sau khi revalidate.
- `SUPERSEDED`: current implementation/workstream đã thay thế.
- `MERGED`: capability đã vào main qua một PR/commit khác.
- `REJECT`: không dùng vì sai contract/invariant/architecture.

Không còn trạng thái `AUDIT/REUSE` mang nghĩa “hãy tiếp tục PR đang mở”, vì review queue hiện đã được reset sạch.

## PRs closed in repository reset — 2026-08-03

Các PR sau từng là substantive/follow-up work nhưng đã được user quyết định đóng để mọi công việc sau bắt đầu mới:

| PR | Historical scope | Current disposition |
|---|---|---|
| #427 | repository/workflow cleanup | REFERENCE — closed unmerged |
| #424 | temporary Matrix validation | REFERENCE — closed unmerged |
| #423 | Matrix member-action input contract | REFERENCE — closed unmerged |
| #419 | Matrix named source/action bridge | REFERENCE — closed unmerged |
| #405 | admin reset login-rate-limit fix | REFERENCE — closed unmerged |
| #388 | Alumdoor Employee Lite private-field permissions | REFERENCE — closed unmerged |
| #370 | MetaForge enterprise UI grammar plan | REFERENCE — closed unmerged |
| #295 | Tiến Đạt FIFO delivery/payable operations | REFERENCE — closed unmerged |
| #286 | TT99 localization/tax controls | REFERENCE — closed unmerged |
| #278 | VN accounting integrity hardening | REFERENCE — closed unmerged |
| #267 | Bulk Stock Reconciliation | REFERENCE — closed unmerged |
| #216 | pricing matrix UI iteration | REFERENCE/SUPERSEDED by later Matrix foundation where applicable |
| #208 | Plastic ERP Production Run/shop-floor | REFERENCE — closed unmerged |
| #201 | manufacturing actual costing | REFERENCE — closed unmerged |
| #199 | Daily Detailed Ledger hardening | REFERENCE — closed unmerged |

Các PR khác đã đóng từ trước (ví dụ `#224`, `#248`, `#256`, `#257`, `#259`, `#269`, `#285` và các convergence iterations) tiếp tục là historical evidence theo GitHub history.

## Reuse rule for future tasks

Khi một task mới chạm domain đã từng có PR cũ:

1. search GitHub history theo domain/PR;
2. đọc exact diff và merge-base với current main;
3. xác định phần nào đã có trên main và phần nào thật sự còn thiếu;
4. không lấy migration number/version assumption cũ nếu current main đã tiến lên;
5. chỉ cherry-pick/reimplement phần còn đúng;
6. chạy lại tests/evidence trên current baseline;
7. mở PR mới.

History là thư viện tham khảo, không phải zombie backlog. Nhân loại đã phát minh version control để khỏi phải quên quá khứ, không phải để quá khứ tự giao việc cho hiện tại.
