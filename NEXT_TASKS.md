# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

## Trạng thái hiện tại

**Không có task delivery đang active và không có pull request đang mở.**

Theo quyết định repo reset ngày 2026-08-03, toàn bộ PR còn mở đã được đóng. Các branch/PR/workstream cũ chỉ còn vai trò lịch sử và nguồn tham khảo kỹ thuật; chúng **không phải backlog tự động**.

## Quy tắc cho công việc mới

Khi user mở một yêu cầu mới:

1. đọc exact current `main` và tài liệu canonical hiện tại;
2. audit code, migration, test và production evidence liên quan;
3. tạo branch mới từ current `main` cho scope mới;
4. nếu lịch sử có code hữu ích thì phân loại `reuse / cherry-pick / superseded / reject` bằng exact diff;
5. không reopen PR cũ hoặc tiếp tục branch cũ như canonical trừ khi user yêu cầu rõ;
6. shared contract/backend/migration/ops vẫn theo release gate hiện hành; UI-only theo policy UI hiện hành.

## Historical capability references

Các chủ đề từng xuất hiện trong backlog cũ như VN Accounting hardening, statutory payroll evaluator, Stock Reconciliation Bulk, BOM Bulk, AppAction input tables, Daily Detailed Ledger, Matrix follow-up, WMS, Manufacturing/Plastic ERP, offline PWA hay Batch Print/QR **không còn là active queue**.

Chúng chỉ được khởi động lại khi có yêu cầu mới. Khi đó phải đánh giá lại từ current `main`, vì nhiều capability đã thay đổi hoặc đã được hội tụ sau khi các PR cũ được tạo.

## Canonical references

- Trạng thái repo: `CURRENT_STATUS.md`.
- Handoff facts/invariants: `AI_HANDOFF.md`.
- North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
- Capability map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.
- Historical workstream board: `docs/agents/AGENT_BOARD.md`.
- Historical PR archive: `docs/agents/LEGACY_PR_INBOX.md`.

Không tạo backlog mới từ suy đoán của tài liệu lịch sử. Chỉ task mới do user mở hoặc gap mới được audit từ current code mới trở thành công việc active.
