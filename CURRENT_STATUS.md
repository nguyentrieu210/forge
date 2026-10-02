# CURRENT STATUS

Ngày cập nhật: **2026-08-16**.

File này chỉ giữ checkpoint đã xác minh gần nhất. GitHub là nguồn sự thật cho exact `main`, PR, workflow run và merge; nếu SHA dưới đây không còn là HEAD thì phải resolve lại GitHub trước khi làm việc.

## Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Baseline dùng cho đợt documentation/repository cleanup này: `81b0b171cb6d0c7c22beb5e04e01ee4503a82aad`.
- Baseline trên là merge commit của PR `#879` — `refactor(sentrux): split ERPNext controller registry`.
- PR `#879` đã hội tụ nhiều structural refactor Sentrux trên ERPNext registry, tenant boundaries, views/runtime dependency depth và related hotspots.
- Không có open PR tại thời điểm khởi tạo đợt cleanup này.

## Architecture state

- Backend authority: CloudForge Workers + shared server packages.
- Canonical business mutation: Document Kernel / aggregate serialization path.
- Tenant persistence/query: D1 dưới migration governance; Durable Objects serialize authoritative mutation khi cần.
- Async/background: Queue/outbox/jobs; R2 cho file/artifact theo binding hiện hành.
- Frontend: MetaForge shared runtime + packages; Frappe-shaped adapter là compatibility boundary chính.
- Vertical: Alumdoor compose shared ERP/HCM/Stock/Sales/Manufacturing/Finance authorities, không tạo shadow ledger/domain authority.

## Documentation state

Đợt cleanup 2026-08-16 đặt lại documentation authority như sau:

1. `SENTRUX_MAP.md` — repo navigation + ownership map.
2. `CURRENT_STATUS.md` — checkpoint gần nhất.
3. `NEXT_TASKS.md` — active queue.
4. `PROJECT_CONTEXT.md` — stable authority/invariants.
5. `docs/README.md` — docs index + retention.
6. `docs/ARCHITECTURE.md` — canonical architecture document.

Root `ARCHITECTURE.md` cũ được hợp nhất vào `docs/ARCHITECTURE.md` để chỉ còn một architecture authority.

## Sentrux governance

- `.sentrux/rules.toml` là machine-readable constraint file.
- `SENTRUX_MAP.md` là human/agent navigation map, không phải bản sao score output.
- Quality score/depth/god-file counts là measurement động; không hard-code chúng thành architecture truth.
- Mọi refactor phải giữ hoặc cải thiện baseline bằng `sentrux gate`, đồng thời vẫn phải pass typecheck/test theo blast radius.

## Production boundary

Checkpoint source không phải bằng chứng production deployment. Mọi production mutation vẫn cần explicit authorization và exact release evidence theo policy/runbook hiện hành.


## R7 active source checkpoint — 2026-10-02

PR #994 continues on `codex/r7-frappe-platform-closure`. Exact prior verified head: `52b153dc0b4026056207c03d30d85f4dfb4706b0`, R7 CI run `36970460835` passed. The continuation adds migration identity/reconciliation, Website cache and owner portal APIs, durable webhook runtime and bounded Connected App lifecycle. Implementation head `bf5457ff295efaacdbda4e5578a23d5abe202e66` is verified by successful R7 GitHub Actions run `36972661090`: changed-authority TypeScript, 6 control tests, 60 runtime safety tests and Workerd Frappe facade regression. Canonical R7 matrix: 12 SEMANTIC_PARITY, 12 INTENTIONAL_DIFFERENCE, 3 GAP, 1 OUT_OF_SCOPE, 0 UNRESOLVED. Remaining detailed contracts live in the R7 matrix/backlog.
