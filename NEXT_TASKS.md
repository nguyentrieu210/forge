# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

## Trạng thái hiện tại

**Không có task delivery đang active ngoài việc cập nhật tài liệu/plan hiện tại.**

Theo quyết định repo reset ngày 2026-08-03, toàn bộ PR cũ đã được đóng. Các branch/PR/workstream cũ chỉ còn vai trò lịch sử và nguồn tham khảo kỹ thuật; chúng **không phải backlog tự động**.

## Chương trình mặc định tiếp theo

Khi bắt đầu vòng triển khai mới, dùng:

- `docs/FORGE_RC_HARDENING_PLAN_20260803.md`

Mục tiêu của vòng mới là đưa Forge từ **Wired -> RC -> Hardened**, không mở rộng feature breadth một cách tự phát.

Thứ tự mặc định:

1. Capability truth: audit đủ 956 capability ID và tạo maturity/evidence register.
2. Platform/SRE RC: authoritative write, IAM/tenant, validation lanes, release/backup/restore truth.
3. ERP Core RC: Finance/VN -> Inventory/WMS -> Procurement -> CRM/O2C -> HCM/Payroll -> Manufacturing/QMS.
4. Enterprise Depth: Project/Service, BI Semantic, Integration Hub, Workplace/DMS.
5. Platform moat: App Factory, generic enterprise UI patterns, deterministic AI tooling.
6. Alumdoor reference vertical 95% + production hardening/evidence.

Đây là **thứ tự ưu tiên**, không phải lệnh mở đồng loạt nhiều branch. Mỗi slice mới chỉ trở thành active task sau khi được khởi động từ exact current `main`.

## Quy tắc cho công việc mới

Khi mở một yêu cầu mới:

1. đọc exact current `main` và tài liệu canonical hiện tại;
2. chọn capability ID trong `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
3. audit code, migration, test và production evidence liên quan;
4. tạo branch mới từ current `main` cho scope mới;
5. nếu lịch sử có code hữu ích thì phân loại `reuse / cherry-pick / superseded / reject` bằng exact diff;
6. không reopen PR cũ hoặc tiếp tục branch cũ như canonical trừ khi user yêu cầu rõ;
7. shared contract/backend/migration/ops vẫn theo release gate hiện hành; UI-only theo policy UI hiện hành.

## Historical capability references

Các chủ đề từng xuất hiện trong backlog cũ như VN Accounting hardening, statutory payroll evaluator, Stock Reconciliation Bulk, BOM Bulk, AppAction input tables, Daily Detailed Ledger, Matrix follow-up, WMS, Manufacturing/Plastic ERP, offline PWA hay Batch Print/QR **không còn là active queue**.

Nếu một capability trong số đó được chọn ở RC Hardening Program, phải audit lại từ current `main`; chỉ reuse phần lịch sử còn đúng contract.

## Canonical references

- Trạng thái repo: `CURRENT_STATUS.md`.
- Handoff facts/invariants: `AI_HANDOFF.md`.
- RC hardening execution plan: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
- Capability map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.
- Historical workstream board: `docs/agents/AGENT_BOARD.md`.
- Historical PR archive: `docs/agents/LEGACY_PR_INBOX.md`.

Không tạo backlog mới từ suy đoán của tài liệu lịch sử. Gap mới phải được audit từ current code và gắn capability ID/evidence trước khi trở thành công việc active.
