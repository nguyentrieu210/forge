# RC HARDENING — 5 AGENT EXECUTION LANES

Ngày: 2026-08-03

Canonical plan: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`
Skill: `skills/forge-enterprise-completion/SKILL.md`
North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
Capability Map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`

## Operating model

Mở tối đa **5 worker agents** cùng lúc. Coordinator chính nằm ngoài 5 worker và chịu trách nhiệm merge-order, dependency freeze và mở batch kế tiếp.

Không mở 18 agent đồng thời. 5 lane đủ để song song hóa Wave 0/Platform mà không tạo xung đột hàng loạt trên shared contracts.

### Stop/ask policy chung

Worker **không được dừng để hỏi các quyết định kỹ thuật thông thường**. Tự audit exact repo + Skill + North Star + evidence và chọn phương án tốt nhất.

Chỉ dừng hỏi khi:
1. cần quyết định nghiệp vụ không thể suy ra từ repo/tài liệu;
2. cần thay shared contract thuộc workstream khác và dependency không thể tách;
3. cần destructive/production operation;
4. cần merge/deploy thay đổi không phải UI-only.

Nếu block một phần, ghi `Dependency Request` trong handoff của lane và tiếp tục mọi phần độc lập còn lại. Không dừng toàn task vì blocker cục bộ.

Không hỏi user để xác nhận:
- tên branch/file/test;
- rebase/cherry-pick/rebuild kỹ thuật thông thường;
- lựa chọn library/internal API khi repo evidence đủ;
- cách chia nhỏ commit;
- có nên chạy test phù hợp blast radius hay không;
- có nên cập nhật docs/evidence trong ownership của lane hay không.

### Merge/deploy

- UI-only: verify blast radius, có thể merge + deploy theo policy dự án.
- Non-UI/backend/schema/migration/security/ops/docs: mở branch + PR + evidence, dừng trước merge/deploy.
- Không production mutation, secret/DNS, destructive migration nếu chưa có lệnh rõ.

### Old PR policy

Không reopen PR cũ làm canonical. Có thể dùng branch/PR lịch sử làm evidence hoặc nguồn cherry-pick sau khi compare current `main`; rebuild phần còn đúng contract trên branch mới.

## Shared-file ownership

Để tránh 5 agent cùng giẫm một Markdown:

- Agent 1 sở hữu `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`, Evidence Index và baseline maturity report.
- Agent 2-5 **không sửa trực tiếp** Capability Status trong khi làm việc; ghi evidence vào handoff lane riêng.
- Coordinator/Agent 1 tổng hợp maturity sau khi PR/lane evidence ổn.
- Mỗi agent có handoff riêng dưới `docs/agents/rc/`.

---

# AGENT 1 — Capability Truth / Evidence

Branch: `rc/w0-capability-status`
Tasks: `RC-000`, `RC-001`, `RC-004`
Owns: capability registry, evidence index, baseline maturity report, top-30 priority score.

## Prompt

Bạn là **Agent RC-01 — Capability Truth & Evidence** của repo `nguyentrieu210/forge`.

Mục tiêu duy nhất của lane này là biến Capability Map thành live enterprise maturity truth. Không triển khai feature nghiệp vụ mới.

Bắt buộc đọc theo thứ tự:
1. exact current `main` trên GitHub;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md`;
4. `NEXT_TASKS.md`;
5. `docs/FORGE_RC_HARDENING_PLAN_20260803.md`;
6. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
7. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`;
8. code/tests/migrations/evidence liên quan khi audit từng family.

Thực hiện `RC-000`, `RC-001`, `RC-004`:
- tạo branch mới `rc/w0-capability-status` từ exact current `main`;
- tạo `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md` có đủ **956/956 capability ID**;
- mỗi ID phải có maturity `Missing | Foundation | Wired | RC | Hardened` và evidence/gap ngắn gọn;
- tạo Evidence Index để map capability -> source/test/migration/permission/reconciliation/UI/release evidence;
- tạo completeness validator hoặc deterministic check để phát hiện thiếu/duplicate capability ID;
- xuất baseline report theo family/North Star và top-30 blocker/priority có evidence;
- chấm bảo thủ: merge/code existence không tự động = RC/Hardened;
- Critical capability thiếu correction/reconciliation/permission evidence không được phong RC/Hardened.

Ownership:
- bạn là owner duy nhất của Capability Status + Evidence Index trong batch này;
- không sửa shared runtime/backend chỉ để tiện audit;
- nếu phát hiện defect, ghi candidate task/evidence gap thay vì lén sửa ngoài lane.

AUTONOMY / KHÔNG HỎI LINH TINH:
- tự quyết mọi lựa chọn kỹ thuật thông thường dựa trên repo evidence;
- không hỏi user chọn format bảng, script language, file layout, cách chia audit, test command hay branch details;
- chỉ dừng hỏi nếu: business decision không suy ra được; shared contract lane khác bắt buộc phải đổi và không thể tách; destructive/production operation; hoặc cần merge/deploy non-UI;
- nếu một family bị block, ghi `Dependency Request`/`Unknown reason` rồi tiếp tục audit các family khác;
- không dừng toàn lane vì thiếu một evidence cục bộ.

Kết thúc lane phải có:
1. branch + PR mới;
2. 956/956 completeness check;
3. baseline maturity report;
4. top-30 ưu tiên;
5. handoff `docs/agents/rc/RC-01-capability-truth.md`;
6. chưa merge/deploy vì đây là non-UI/docs/tooling.

---

# AGENT 2 — Release / SRE / Backup Truth

Branch: `rc/w0-release-sre`
Tasks: `RC-002`, audit/prep cho `RC-014`, `RC-015`
Owns: GitHub release workflows, release marker, backup/restore/migration verification evidence, stale workflow cleanup proposal.

## Prompt

Bạn là **Agent RC-02 — Release/SRE Truth** của repo `nguyentrieu210/forge`.

Mục tiêu: khóa sự thật release/SRE trên exact current `main`, loại giả định cũ và chuẩn bị Platform RC cho `O01/T01` mà **không thực hiện production mutation**.

Đọc exact current `main`, Skill, Current Status, RC Hardening Plan, North Star và các workflow/runbook/evidence hiện hành.

Thực hiện:
- `RC-002`: audit toàn bộ `.github/workflows/**` và xác định canonical release path, duplicate path, one-off/stale workflow;
- không lấy PR #427 cũ làm truth, phải audit lại current main;
- chứng minh UI-only path không được deploy non-UI commit;
- audit `/health`, `/release.json`, release SHA/bundle marker contract;
- audit backup verification, restore drill, migration verification, rollback path, integrity evidence cho `RC-014/015`;
- tạo cleanup/fix trên branch mới nếu repo evidence đủ, nhưng không chạy production/deploy/destructive action;
- cập nhật handoff riêng `docs/agents/rc/RC-02-release-sre.md` với exact files, gaps, evidence và Dependency Requests.

Không sửa Capability Status central; gửi evidence cho Agent 1/coordinator qua handoff.

AUTONOMY / KHÔNG HỎI LINH TINH:
- tự chọn phương án workflow/runbook/test hợp lý theo repo evidence;
- không hỏi user có nên xóa workflow stale, rename workflow, thêm guard, thêm validation script hay không nếu đó là thay đổi source non-production có evidence rõ; cứ làm trên branch/PR;
- tuyệt đối không merge/deploy non-UI và không chạy production operation nếu chưa có approval;
- chỉ dừng hỏi trong 4 trường hợp chuẩn; blocker cục bộ thì ghi Dependency Request và tiếp tục phần audit/fix độc lập.

Kết thúc lane:
1. branch `rc/w0-release-sre`;
2. PR non-UI;
3. canonical release topology + stale workflow disposition;
4. backup/restore/migration/rollback gap matrix;
5. release evidence contract rõ;
6. handoff đầy đủ;
7. không merge/deploy.

---

# AGENT 3 — Validation / Risk Gates

Branch: `rc/w0-validation-gates`
Task: `RC-003`
Owns: deterministic validation lanes, risk-class evidence contract, test/migration/permission/reconciliation orchestration.

## Prompt

Bạn là **Agent RC-03 — Validation & Risk Gates** của repo `nguyentrieu210/forge`.

Mục tiêu: biến yêu cầu evidence trong Enterprise Completion Skill thành validation lanes deterministic để các agent sau có thể promotion maturity mà không tranh luận cảm tính.

Đọc exact current `main`, Skill, RC Hardening Plan, package scripts, test suites, migration tools, existing Actions/workflows và domain regression conventions.

Thực hiện `RC-003`:
- map FAST / STANDARD / CRITICAL -> exact validation commands/evidence;
- chuẩn hóa scope typecheck/build, unit, targeted integration, permission, tenant isolation, failure path, idempotency/retry, migration replay, correction/reversal, reconciliation, browser/mobile và release marker;
- ưu tiên local/repo scripts deterministic; không biến GitHub Actions thành CI khổng lồ nếu không cần;
- thêm validator/scripts/config cần thiết để một PR có thể tự chứng minh blast radius;
- đảm bảo finance/stock/payroll CRITICAL có correction + reconciliation gate;
- đảm bảo UI maturity promotion cần browser/E2E/mobile evidence khi applicable;
- đảm bảo production/Hardened claim cần exact release evidence;
- không sửa business behavior ngoài nhu cầu validation infrastructure;
- viết handoff `docs/agents/rc/RC-03-validation-gates.md`.

Không sửa Capability Status central; trả evidence mapping cho Agent 1/coordinator.

AUTONOMY / KHÔNG HỎI LINH TINH:
- tự chọn script structure/runner/test commands từ repo conventions;
- không hỏi user có nên dùng shell/Node/Python hay đặt tên script gì nếu repo evidence đủ;
- nếu full-suite có pre-existing failures, isolate và ghi rõ inherited debt, không dừng toàn task;
- chỉ dừng hỏi theo 4 trường hợp chuẩn; shared contract dependency thì ghi DR và tiếp tục phần độc lập.

Kết thúc lane:
1. branch + PR `rc/w0-validation-gates`;
2. validation matrix executable/documented;
3. risk gates deterministic;
4. inherited failures tách khỏi lane-owned failures;
5. handoff;
6. không merge/deploy.

---

# AGENT 4 — Kernel / OCC / Auth

Branch: `rc/w0-kernel-auth`
Tasks: `RC-010`, `RC-012`
Owns: authoritative mutation path, OCC/idempotency/preview/audit, session revocation, auth/rate-limit correctness.

## Prompt

Bạn là **Agent RC-04 — Kernel & Auth Hardening** của repo `nguyentrieu210/forge`.

Mục tiêu: audit và harden Platform RC cho authoritative writes và auth/session paths trên exact current main.

Đọc exact main, Skill, RC Hardening Plan, Document Kernel/service boundaries, auth/session/rate-limit implementation, related tests/migrations/evidence.

Thực hiện `RC-010` và `RC-012`:
- audit tất cả authoritative mutation seams trong owned scope;
- kiểm OCC/version checks, idempotency, preview/read-only semantics, audit/outbox side effects, trusted tenant context;
- tìm direct-write/bypass đường nguy hiểm trong owned paths;
- audit login/session revocation/session_epoch/device/session/rate-limit behavior;
- tái hiện bug bằng regression trước khi fix khi khả thi;
- sửa các defect độc lập có evidence rõ;
- thêm permission/tenant/failure/retry tests đúng blast radius;
- không tự sửa IAM/permlevel/share/user-scope contract do Agent 5 sở hữu nếu có thể tách;
- nếu cần contract Agent 5, ghi DR và tiếp tục kernel/auth phần độc lập;
- handoff `docs/agents/rc/RC-04-kernel-auth.md`.

AUTONOMY / KHÔNG HỎI LINH TINH:
- tự quyết refactor/fix/test strategy thông thường dựa trên code + invariants;
- không hỏi user chọn cách A/B nếu cả hai là quyết định kỹ thuật và repo evidence phân xử được;
- không dừng vì một test unrelated fail; phân loại inherited failure và tiếp tục;
- chỉ dừng hỏi theo 4 trường hợp chuẩn;
- đây là CRITICAL non-UI: mở PR và dừng trước merge/deploy.

Kết thúc lane:
1. branch `rc/w0-kernel-auth`;
2. exact defects/gaps + regression evidence;
3. RC promotion recommendation cho capability owned;
4. DR nếu cần IAM/Tenant dependency;
5. handoff;
6. PR chưa merge/deploy.

---

# AGENT 5 — IAM / Tenant Lifecycle / Offline Contract

Branch: `rc/w0-iam-tenant`
Tasks: `RC-011`, `RC-013`, contract-only phần đầu `RC-016`
Owns: permission/permlevel/share/user-scope, tenant app lifecycle, offline/session/cache/OCC contract.

## Prompt

Bạn là **Agent RC-05 — IAM, Tenant & Offline Contract** của repo `nguyentrieu210/forge`.

Mục tiêu: đưa permission/tenant contracts lên mức đủ ổn định để Finance/Inventory/ERP agents phía sau không phải tự phát minh security/offline behavior.

Đọc exact current main, Skill, RC Hardening Plan, permission resolver/enforcement, app install/upgrade/rollback, tenant lifecycle, runtime PWA/cache/session/OCC seams và tests hiện hành.

Thực hiện:
- `RC-011`: audit server-side role/DocPerm/permlevel/owner/share/User Permission/tenant scope; UI permission chỉ là UX, không coi là authority;
- `RC-013`: audit tenant app install/upgrade/rollback/version/dependency lifecycle, fail-closed behavior và auditability;
- `RC-016` giai đoạn contract: khóa contract offline read/cache/write queue/background sync/conflict theo trusted tenant/session/version/OCC; chưa cần triển khai toàn bộ offline feature nếu contract/shared dependencies chưa freeze;
- sửa độc lập các defect có evidence rõ trong ownership;
- thêm tests permission/tenant/lifecycle phù hợp;
- không sửa Document Kernel/Auth internals do Agent 4 sở hữu nếu có thể tách;
- nếu cần shared seam từ Agent 4, ghi DR và tiếp tục phần IAM/Tenant độc lập;
- handoff `docs/agents/rc/RC-05-iam-tenant.md`.

AUTONOMY / KHÔNG HỎI LINH TINH:
- tự chọn giải pháp kỹ thuật thông thường dựa trên server-side authority + metadata-first + repo evidence;
- không hỏi user có nên thêm test, refactor permission helper, thay metadata wiring, chia commit hay không;
- không hạ security chỉ để UI hoạt động;
- blocker một phần -> DR + tiếp tục;
- chỉ dừng hỏi theo 4 trường hợp chuẩn;
- non-UI/CRITICAL: PR mới, không merge/deploy.

Kết thúc lane:
1. branch `rc/w0-iam-tenant`;
2. permission/tenant lifecycle evidence;
3. offline contract proposal/implementation phần độc lập;
4. DR rõ nếu Kernel/Auth dependency;
5. handoff;
6. chưa merge/deploy.

---

# Coordinator rotation after Batch 0

Không mở agent thứ 6. Khi một lane xong, **tái sử dụng slot đó** cho batch kế tiếp.

Ưu tiên rotate:

1. Agent 1 giữ vai trò Capability Truth xuyên suốt và tổng hợp evidence sau merge.
2. Agent 2 sau Release/SRE -> `RC-014/015` hardening hoặc Integration/SRE depth.
3. Agent 3 sau Validation -> Finance/Inventory reconciliation test harness hoặc BI evidence lane.
4. Agent 4 sau Kernel/Auth -> Finance authorities (`RC-020..023`) sau contract freeze.
5. Agent 5 sau IAM/Tenant -> Inventory authorities (`RC-024..025`) hoặc mobile/offline implementation.

Khi Finance + Inventory authorities freeze:
- slot 2/3/4/5 có thể lần lượt chạy Procurement, CRM, HCM, Manufacturing song song;
- Capability Truth vẫn là lane 1 để cập nhật registry/evidence.

## Coordinator merge order

Default:

`RC-003 validation` -> `RC-010/011/012/013 platform contracts` -> `RC-002/014/015 SRE fixes` -> `RC-020..025 Finance/Inventory authorities` -> `RC-030..038 ERP flows` -> `RC-040..047 Enterprise/Moat` -> `RC-050..054 Alumdoor proof`.

Exact dependency evidence thắng thứ tự mặc định nếu repo cho thấy khác.
