# FORGE LEGACY PR ARCHIVE

Ngày sync: **2026-08-03**.

> Purpose: lưu dấu vết PR/branch lịch sử để audit/reuse có kiểm chứng. Exact GitHub state luôn thắng file này.

## Current truth

- Không PR nào trong tài liệu này là active backlog.
- Không hardcode tổng số open PR tại đây; review queue thay đổi theo RC program.
- Không reopen/merge PR cũ chỉ vì implementation trông hữu ích.
- Nếu task mới cần code cũ, compare với exact current `main`, rồi cherry-pick/rebuild phần còn đúng contract vào branch/PR mới.

## Historical disposition vocabulary

- `REFERENCE`: chỉ dùng đọc ý tưởng/evidence.
- `CHERRY-PICK`: task mới có thể lấy một phần sau khi revalidate.
- `SUPERSEDED`: current implementation/workstream đã thay thế delivery path cũ.
- `MERGED ELSEWHERE`: capability/delta tương đương đã vào main qua delivery khác.
- `REJECT`: không dùng vì sai contract/invariant/architecture.

## Repository-reset PRs — 2026-08-03

| PR | Historical scope | Current disposition |
|---|---|---|
| #427 | repository/workflow cleanup | **MERGED ELSEWHERE / SUPERSEDED by RC-02 #431** for stale workflow cleanup/hardening |
| #424 | temporary Matrix validation | REFERENCE — closed unmerged |
| #423 | Matrix member-action input contract | REFERENCE — closed unmerged |
| #419 | Matrix named source/action bridge | REFERENCE — closed unmerged |
| #405 | admin reset login-rate-limit fix | REFERENCE — closed unmerged; current auth/release truth must be read from main |
| #388 | Alumdoor Employee Lite private-field permissions | REFERENCE — closed unmerged |
| #370 | MetaForge enterprise UI grammar plan | REFERENCE — closed unmerged |
| #295 | Tiến Đạt FIFO delivery/payable operations | REFERENCE — closed unmerged |
| #286 | TT99 localization/tax controls | REFERENCE — closed unmerged |
| #278 | VN accounting integrity hardening | REFERENCE — closed unmerged |
| #267 | Bulk Stock Reconciliation | REFERENCE — closed unmerged |
| #216 | pricing matrix UI iteration | REFERENCE/SUPERSEDED where later Matrix foundation covers it |
| #208 | Plastic ERP Production Run/shop-floor | REFERENCE — closed unmerged |
| #201 | manufacturing actual costing | REFERENCE — closed unmerged |
| #199 | Daily Detailed Ledger hardening | REFERENCE — closed unmerged |

Other earlier cleanup/convergence PRs remain GitHub history only.

## RC Wave 0 superseded delivery paths

Current-main reconciliation intentionally replaced stale/conflicting RC branches rather than forcing merges:

| Old PR | Scope | Replacement |
|---|---|---|
| #430 | RC-04 Kernel/Auth | **SUPERSEDED by #435**, which was rebuilt on then-current main and merged |
| #432 | RC-05 IAM/Tenant/Offline contract | **SUPERSEDED by #436**, rebuilt after RC-04 and merged |

RC-01 `#434`, RC-02 `#431`, RC-03 `#433`, replacement RC-04 `#435`, and replacement RC-05 `#436` are current Wave-0 delivery evidence.

## Reuse rule for future tasks

When a new RC task touches a domain with historical PRs:

1. search GitHub history by capability/domain;
2. inspect exact diff and merge-base against current main;
3. identify what is already present versus genuinely missing;
4. do not reuse old migration numbers/version assumptions blindly;
5. cherry-pick/reimplement only the still-valid delta;
6. run current risk/evidence gates;
7. open a fresh RC PR.

History is an evidence library, not a zombie backlog. Version control is already complicated enough without letting dead branches assign work to the living.
