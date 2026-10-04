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


## R7 certified source checkpoint — 2026-10-02

PR #994 on `codex/r7-frappe-platform-closure` has completed the pinned Frappe v16.19.0 platform denominator. Certified implementation head `ce64f77f8c2a1991a6d88ced76592d44aecd23d5` passed R7 GitHub Actions run `36984495200`: executable `r7:frappe:certify`, changed-authority TypeScript guard, runtime safety regression and Workerd Frappe facade regression. Canonical matrix: **12 SEMANTIC_PARITY / 15 INTENTIONAL_DIFFERENCE / 0 GAP / 1 OUT_OF_SCOPE / 0 UNRESOLVED**. R7-A may claim `FRAPPE_PLATFORM_CLOSED` for this pinned source/runtime contract. Production deploy/migration/provider/customer-data mutation remains separately authorized.

## R8-B source checkpoint — 2026-10-04

PR #996 remains open for business closure. The converged source adds historical budget
revision interval checks, chronological direct FIFO landed-cost corrections, prior/future
period-close lifecycle and insertion guards, atomic subcontract entitlement and leftover
returns, and explicit manufacturing operation-cost capitalization. Foreign non-party FX
balances fail closed until canonical dual-currency evidence exists.

Verification: server build, 279 Node tests, focused SQLite race/authority scripts, complete
136-migration tenant replay, R8 benchmark invariant and R7 certification all pass locally.
R8 business certification remains blocked: 11 modules + 18 flows are PARTIAL, with zero
UNRESOLVED. Source verification does not claim pinned ERPNext runtime parity or production
deployment. Existing R8-A benchmark identity and denominator are preserved.
