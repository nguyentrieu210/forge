---
name: forge-enterprise-completion
description: Kim chỉ nam để phát triển Forge như một enterprise operating platform metadata-driven, multi-tenant trên Cloudflare, với CloudForge + MetaForge + Frappe-compatible API + App Factory + shared domain authorities + vertical apps.
---

# Forge Enterprise Completion Skill

## 1. Mục tiêu

Skill này dùng khi đánh giá, thiết kế, triển khai hoặc review bất kỳ hạng mục nào của Forge ở cấp platform/domain/vertical.

Đích sản phẩm:

> **ERP core sâu + Vietnam compliance + App Factory + AI/automation + Cloudflare SaaS + vertical apps.**

Forge không phải bản sao giao diện của ERPNext/MISA. Các hệ thống đó là benchmark về độ phủ và độ chín; Forge giữ lợi thế riêng: metadata-driven, multi-tenant Cloudflare, Frappe-compatible API, generic runtime, app packaging và verticalization nhanh.

## 2. Nguồn sự thật bắt buộc đọc trước khi làm

Không bắt đầu từ lịch sử chat, branch name hoặc tài liệu snapshot cũ.

Đọc theo thứ tự:

1. Exact GitHub `main`, branch, PR, commit và diff liên quan.
2. `SENTRUX_MAP.md` — topology, ownership, entrypoint và dependency boundary hiện hành.
3. `.sentrux/rules.toml` — architecture guardrails đang được CI enforce.
4. `CURRENT_STATUS.md` — checkpoint đã xác minh gần nhất.
5. `NEXT_TASKS.md` — queue active.
6. `PROJECT_CONTEXT.md` — authority/invariant ổn định.
7. `AI_HANDOFF.md` nếu task tiếp nối công việc cũ.
8. `docs/ARCHITECTURE.md` — kiến trúc canonical.
9. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` và `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` khi task liên quan roadmap/capability maturity.
10. BRD/spec/source-lock/test/runbook/evidence liên quan trực tiếp đến capability đang làm.

`docs/ROADMAP.md`, release notes, RC/R5/R6 records và docs/agents cũ chỉ là historical context, không dùng để suy live state.

Nếu mâu thuẫn: **exact code + migration + tests + current GitHub state thắng prose**. Với topology/ownership, exact tree/import graph thắng `SENTRUX_MAP.md`; nếu topology đổi, cập nhật map trong cùng PR.

## 3. Sentrux governance bắt buộc

Sentrux là sensor kiến trúc, không phải mục tiêu điểm số độc lập.

### 3.1 Trước khi sửa cấu trúc

- đọc `SENTRUX_MAP.md` để biết owner và dependency spine;
- đọc `.sentrux/rules.toml` để biết blocker hiện hành;
- với refactor/material cross-package change, lấy baseline bằng `sentrux gate --save .` hoặc exact CI equivalent;
- không tự ghi đè `.sentrux/rules.toml` trong workflow/check tạm.

### 3.2 Sau khi sửa

Chạy theo blast radius:

```bash
sentrux check .
sentrux gate .
```

Nếu cần diagnostics sâu, có thể dùng rule strict tạm ở workspace/CI, nhưng strict diagnostics **không được thay thế committed rules** và không được biến known debt thành blocker giả.

### 3.3 Luật tăng độ chặt

- Chỉ nâng `min_quality`, `no_god_files`, cycle/depth/CC/layer/boundary rule khi exact current branch đã chứng minh pass.
- Không hạ rule chỉ để merge một regression mới.
- Known legacy debt phải ghi rõ và tách khỏi blocker hiện hành.
- Điểm quality không được dùng để biện minh cho thay đổi làm sai behavior, permission, ledger, migration hoặc contract.
- Một thay đổi topology/ownership material phải cập nhật `SENTRUX_MAP.md` cùng PR.

## 4. Luật kiến trúc không được phá

### 4.1 Authoritative backend

- CloudForge/Document Kernel là đường ghi business-document chuẩn.
- Không bypass document kernel/aggregate authority để ghi ledger hoặc document chỉ vì làm nhanh.
- D1/DO/query projections phải tuân authority hiện hành; audit/outbox/idempotency/OCC/tenant boundary không được hy sinh.

### 4.2 Metadata-first

- Runtime chung không hard-code schema app nếu metadata/manifest có thể diễn đạt.
- Capability dùng lại giữa nhiều app phải đi vào platform/domain package chung.
- Vertical chỉ giữ logic thực sự đặc thù ngành.
- Pattern lặp ở >=2 app phải được đánh giá để nâng thành primitive của App Factory/runtime.

### 4.3 Permission server-side

- Client visibility chỉ là UX.
- Server enforce tenant, role, DocPerm, owner/share/user-permission và trusted identity context.
- Không tin tenant/user/role do client tự khai khi đã có trusted context.

### 4.4 Money, stock và legal rules

- Tiền dùng decimal/fixed-point semantics chuẩn hóa; không dùng binary float cho authoritative calculation.
- Stock/GL/payment/payroll và ledger khác phải có correction/reversal traceable.
- Statutory/legal rule phải effective-dated, versioned, source-bound, auditable và có regression theo version.

### 4.5 Dependency direction

- Shared server package không phụ thuộc client runtime.
- Shared platform/domain package không phụ thuộc vertical implementation.
- Frontend consume server behavior qua API/contracts; known legacy cross-boundary edge phải được coi là debt cần xử lý có chủ đích, không nhân rộng.
- Không import root barrel nếu leaf/subpath đã tồn tại và root barrel làm tăng dependency depth/coupling.

## 5. Benchmark đúng cách

Benchmark phù hợp theo capability:

- **ERPNext/Frappe**: generic ERP depth, document lifecycle, stock/manufacturing/accounting, extensibility.
- **MISA AMIS**: Vietnam compliance, HR/payroll/local operations, productization doanh nghiệp Việt Nam.
- **Forge vertical hiện có**: tái sử dụng pattern đã chứng minh thay vì fork core.

Parity phải xét happy path, correction/cancel/return, partial flow, backdate, permission/tenant, currency/UOM/rounding, audit, import/export/report, failure/retry/idempotency và mobile/large-data khi relevant.

## 6. Maturity model

Chỉ dùng:

- **Missing** — chưa có đường chạy thực tế.
- **Foundation** — có schema/API seam/metadata nhưng chưa đủ flow.
- **Wired** — end-to-end đã nối, evidence/hardening còn mỏng.
- **RC** — flow chính + invariants + targeted regression đã có.
- **Hardened** — production-grade trong scope công bố, có failure/correction/security/reconciliation/evidence.

Không dùng số test hoặc số điểm Sentrux để tự phong `Hardened`.

## 7. Risk class

### FAST

Presentation-only: copy, spacing, icon, metadata display, UI composition không đổi authoritative behavior.

Tối thiểu: targeted typecheck/build/test + browser/visual evidence khi material.

### STANDARD

Business feature có blast radius giới hạn, không chạm statutory/ledger/migration/tenant security.

Tối thiểu: contract/invariant, targeted unit/integration, permission, happy + failure path, compatibility.

### CRITICAL

Accounting, payroll statutory, inventory valuation, migration, tenant isolation, auth/security, legal/financial rule, production data transformation.

Bắt buộc: explicit invariants, migration replay nếu có, authoritative regression, correction/reversal, tenant/permission isolation, source/legal evidence khi statutory và reconciliation.

## 8. Quy trình chuẩn

### Bước 1 — Locate

- xác định owner bằng `SENTRUX_MAP.md` + exact tree/import graph;
- xác định capability ID nếu thuộc capability map;
- xác định canonical source/generator thay vì sửa generated output.

### Bước 2 — Audit exact state

Tìm metadata/schema, controller/service, API, UI renderer, permissions, migrations, tests, manifest/brief, Sentrux boundary và production evidence nếu relevant.

### Bước 3 — Gap against target

Ghi ngắn: user outcome, authoritative data, state machine, invariants, integrations, reports, exception/correction flow, benchmark gap.

### Bước 4 — Decide layer

Ưu tiên:

1. platform primitive dùng chung;
2. ERP/domain package generic;
3. app package bounded domain;
4. vertical-only logic thực sự đặc thù.

Không nhét business rule vào React component nếu server/domain có thể sở hữu.

### Bước 5 — Contract first

Khóa data contract, naming/state/status, permission, rounding/UOM/currency, idempotency/correction, API/manifest boundary và acceptance evidence.

### Bước 6 — Implement thin vertical slice

Ưu tiên một slice khép kín:

`input -> validate -> submit/approve -> authoritative side effect -> query/report -> cancel/correction -> audit`

### Bước 7 — Verify behavior + structure

Theo risk/blast radius:

- compile/typecheck;
- targeted tests;
- migration replay;
- invariant/permission/tenant tests;
- browser/E2E/screenshot nếu có UI;
- `sentrux check .`;
- `sentrux gate .` cho structural/refactor work.

Không accept một refactor chỉ vì Sentrux tăng điểm nếu behavior/tests/contracts regress.

### Bước 8 — Update authority/evidence

Sau khi thay đổi được accept:

- cập nhật `CURRENT_STATUS.md` nếu live checkpoint thay đổi;
- cập nhật `NEXT_TASKS.md` nếu queue thay đổi;
- cập nhật capability maturity chỉ khi có evidence;
- cập nhật `SENTRUX_MAP.md` nếu topology/ownership đổi;
- siết `.sentrux/rules.toml` chỉ khi exact branch pass rule mới;
- không nhét SHA/branch tạm vào North Star.

## 9. Automatic multi-agent orchestration

Tự phân loại:

- `SINGLE`: một hotspot/owner, tightly coupled slice.
- `PROGRAM`: có >=2 ownership hotspot độc lập hoặc nhiều workstream có thể fan-out sạch.

Khi `PROGRAM`:

1. exact baseline trước;
2. control branch;
3. dependency graph + acceptance gates;
4. mỗi worker có owned hotspot + forbidden zone;
5. không để hai worker cùng sửa một authority nếu chưa có coordinator contract;
6. route Dependency Request thay vì duplicate primitive;
7. convergence theo dependency order;
8. báo rõ agent, branch, PR, status, blocker.

Status chuẩn: `BOOTSTRAPPED`, `RUNNING`, `BLOCKED`, `READY`, `CONVERGING`, `DONE`, `SUPERSEDED/CLOSED`.

Không gọi `RUNNING` chỉ vì branch/PR tồn tại.

NO-STOP: chỉ dừng hỏi user khi cần quyết định nghiệp vụ không suy được, destructive/production operation, hoặc merge/deploy boundary yêu cầu explicit authorization.

## 10. Definition of Done

Một capability chỉ DONE khi phù hợp scope và có:

- business flow usable;
- server-side permission;
- validation/invariants;
- audit/history;
- error states;
- cancel/reversal/correction khi cần;
- import/export/migration path khi cần;
- report/query kiểm soát kết quả;
- tests theo risk;
- UI phù hợp actor nếu có;
- không duplicate source of truth;
- docs/status đúng maturity;
- Sentrux committed rules pass;
- không structural regression so với baseline khi task là refactor/architecture work.

Finance/stock/payroll thêm reconciliation, exact rounding/scaling, posting period guard, backdated/correction semantics và immutable/traceable ledger behavior.

## 11. Production boundary

Merge source không đồng nghĩa production deploy.

- **UI-only FAST**: có thể đi fast-path sau verify đúng blast radius theo policy hiện hành.
- **Backend/schema/migration/business rule/shared authoritative contract**: branch + PR + verify, dừng trước merge/deploy nếu chưa có explicit authorization.
- Không production migration, restore/PITR, secrets/DNS/provider mutation, customer-data write/cutover hoặc destructive queue/state operation nếu chưa được yêu cầu rõ.

## 12. Báo cáo tiến độ

Với domain/capability:

```text
Domain: <ID + tên>
Current maturity: Missing/Foundation/Wired/RC/Hardened
Target maturity: <mức>
Blocking gaps: <3-7 gap>
Owner/topology: <SENTRUX_MAP path/package>
Risk: FAST/STANDARD/CRITICAL
Sentrux: <baseline/current/blocking rule nếu relevant>
Next slice: <vertical slice>
Evidence required: <tests/migration/E2E/reconciliation>
```

Với `SINGLE`/`PROGRAM`, nối thêm execution topology thực tế: agent count, exact branch, PR, status và blocker.

## 13. Nguyên tắc cuối

Forge hoàn thiện không phải khi sidebar có đủ module hoặc Sentrux đạt một con số đẹp.

Forge hoàn thiện khi doanh nghiệp chạy được flow xuyên phòng ban, số liệu đối soát được, correction không phá dữ liệu, compliance có nguồn/version, tenant/permission không thủng, app mới compose từ primitive chung, topology có governance và production evidence cho biết chính xác thứ gì đang chạy.
