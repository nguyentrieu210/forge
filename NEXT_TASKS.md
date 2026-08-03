# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

## Trạng thái hiện tại

**Không có task delivery đang active ngoài việc cập nhật tài liệu/plan hiện tại.**

Theo quyết định repo reset ngày 2026-08-03, toàn bộ PR cũ đã được đóng. Các branch/PR/workstream cũ chỉ còn vai trò lịch sử và nguồn tham khảo kỹ thuật; chúng **không phải backlog tự động**.

## Chương trình mặc định tiếp theo

Canonical execution blueprint:

- `docs/FORGE_RC_HARDENING_PLAN_20260803.md`
- Agent lanes/prompts: `docs/agents/RC_AGENT_LANES_20260803.md`

Blueprint này là nguồn điều phối mặc định cho vòng triển khai mới. Nó định nghĩa:

- maturity register đủ 956 capability ID;
- evidence index + validation lanes;
- priority scoring;
- dependency graph;
- branch/PR convention;
- tối đa 5 execution lane song song;
- Wave 0 -> Wave 5;
- task series RC-000 -> RC-054;
- Definition of Done và maturity promotion gate;
- Finance/Stock/Payroll/Security/Migration evidence cho CRITICAL;
- Alumdoor current-main reference acceptance + production proof.

Mục tiêu của vòng mới là đưa Forge từ **Wired -> RC -> Hardened**, không mở rộng feature breadth một cách tự phát.

Thứ tự mặc định:

1. **Capability Truth**: audit đủ 956 capability ID, tạo Status Registry + Evidence Index + baseline report.
2. **Platform/Security/SRE RC**: authoritative write, IAM/tenant, validation lanes, release/backup/restore truth, offline contract.
3. **Finance + Inventory Authorities**: period/posting/reconciliation, backdate/repost/valuation trước khi domain phía trên mở rộng.
4. **ERP Core RC**: Procurement, CRM/O2C, HCM/Payroll, Manufacturing/QMS theo dependency freeze.
5. **Enterprise Depth**: Project/Service, BI Semantic, Integration Hub, Workplace/DMS.
6. **Platform Moat**: App Factory, generic enterprise UI primitives, deterministic AI tool path.
7. **Alumdoor 95%**: current-main business chain + desktop/mobile + reconciliation + exact production evidence.

Đây là **thứ tự ưu tiên**, không phải lệnh mở đồng loạt nhiều branch. Coordinator chỉ mở batch mới khi prerequisite/authority contract đã đủ rõ.

## Task mở đầu mặc định

Mở tối đa **5 worker agent** theo `docs/agents/RC_AGENT_LANES_20260803.md`; coordinator chính nằm ngoài 5 worker.

Batch đầu:

1. Agent 1: `RC-000`, `RC-001`, `RC-004` — Capability Truth/Evidence.
2. Agent 2: `RC-002` + audit `RC-014/015` — Release/SRE.
3. Agent 3: `RC-003` — Validation/Risk Gates.
4. Agent 4: `RC-010`, `RC-012` — Kernel/OCC/Auth.
5. Agent 5: `RC-011`, `RC-013` + contract phần đầu `RC-016` — IAM/Tenant/Offline contract.

Không mở agent thứ 6. Khi một lane xong, tái sử dụng slot cho batch kế tiếp theo dependency graph.

Sau Platform authority freeze:

- Finance/Inventory: `RC-020..025`.
- Sau đó mới chạy Procurement/CRM/HCM/Manufacturing song song: `RC-030..038`.

## Quy tắc cho công việc mới

Khi mở một yêu cầu mới:

1. đọc exact current `main` và tài liệu canonical hiện tại;
2. chọn capability ID trong `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
3. đọc `docs/FORGE_RC_HARDENING_PLAN_20260803.md` để xác định wave/dependency/risk/evidence;
4. audit code, migration, test và production evidence liên quan;
5. tạo branch mới từ current `main` theo dạng `rc/<wave>-<domain>-<slice>`;
6. nếu lịch sử có code hữu ích thì phân loại `reuse / cherry-pick / superseded / reject` bằng exact diff;
7. không reopen PR cũ hoặc tiếp tục branch cũ như canonical trừ khi user yêu cầu rõ;
8. shared contract/backend/migration/ops vẫn theo release gate hiện hành; UI-only theo policy UI hiện hành.

## Historical capability references

Các chủ đề từng xuất hiện trong backlog cũ như VN Accounting hardening, statutory payroll evaluator, Stock Reconciliation Bulk, BOM Bulk, AppAction input tables, Daily Detailed Ledger, Matrix follow-up, WMS, Manufacturing/Plastic ERP, offline PWA hay Batch Print/QR **không còn là active queue**.

Chúng chỉ được dùng làm historical evidence khi một task RC mới audit exact current main và chứng minh code/contract cũ còn giá trị.

## Canonical references

- Trạng thái repo: `CURRENT_STATUS.md`.
- Execution blueprint: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- Agent lanes/prompts: `docs/agents/RC_AGENT_LANES_20260803.md`.
- Handoff facts/invariants: `AI_HANDOFF.md`.
- North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.
- Capability map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.
- Historical workstream board: `docs/agents/AGENT_BOARD.md`.
- Historical PR archive: `docs/agents/LEGACY_PR_INBOX.md`.

Không tạo backlog mới từ suy đoán của tài liệu lịch sử. Chỉ task RC mới được khởi động từ current code mới trở thành công việc active.
