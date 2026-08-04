---
name: forge-enterprise-completion
description: Operating skill cho Forge theo live phase: bảo vệ authoritative architecture, exact release evidence và pilot/GA progression trong khi tiếp tục tiến tới North Star enterprise platform.
---

# Forge Enterprise Operating Skill

## 0. Vai trò của Skill

Skill này là **operating doctrine theo phase**, không phải một checklist “xây nền cho đủ module”.

Nó dùng khi audit, thiết kế, triển khai, review, harden, pilot, release hoặc mở rộng Forge từ trạng thái hiện tại tới North Star.

Hai lớp sự thật phải luôn tách biệt:

- **North Star** = đích chiến lược dài hạn.
- **Live phase** = việc đúng phải làm ngay bây giờ.

Không được lấy backlog/wave dài hạn để lấn át gate hiện tại. Không được mở lại một completion wave đã đóng chỉ vì North Star vẫn còn capability chưa hoàn thiện.

Mục tiêu vận hành:

> **Đưa Forge tiến về Enterprise Operating Platform mà không phá authoritative contracts, certified release identity, dữ liệu thật, pilot progression hoặc production safety.**

---

## 1. Truth hierarchy bắt buộc

Không bắt đầu từ lịch sử chat hoặc snapshot cũ.

Đọc theo thứ tự:

1. Exact `main`, task branch, PR, diff, commit và workflow state trên GitHub.
2. `CURRENT_STATUS.md` — live verified state.
3. `NEXT_TASKS.md` — active queue và current gate.
4. Phase authority của chương trình đang active, ví dụ `docs/pilot/**`, release/certification evidence, migration contract hoặc program control doc.
5. Code + migration + tests + package/profile/runtime contracts liên quan trực tiếp.
6. `PROJECT_CONTEXT.md` — architectural authority; không được dùng checkpoint prose cũ để ghi đè live state mới hơn.
7. `AI_HANDOFF.md` nếu task tiếp nối workstream cụ thể.
8. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — strategic target, **không phải live queue**.
9. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — portfolio/capability denominator.
10. `docs/ROADMAP.md` — directional backlog, không suy live state.

Nếu mâu thuẫn:

`exact code/migration/tests/GitHub state > live status + active phase contract > architecture context > North Star > roadmap/history`.

North Star không được dùng để phủ định một pilot/release lock đang có hiệu lực.

---

## 2. Phase Resolver — bước đầu tiên trước mọi task

Trước khi quyết định “nên làm gì”, xác định Forge đang ở phase nào từ `CURRENT_STATUS.md`, `NEXT_TASKS.md` và phase authority.

Vocabulary chuẩn:

- `FOUNDATION` — đang dựng primitives/core authority.
- `INTEGRATION` — đang nối domain/cross-module và đóng regression.
- `CERTIFICATION` — đang khóa exact candidate và chứng minh release/data/security/recovery.
- `CONTROLLED_PILOT` — đã có certified baseline; đang đưa dữ liệu thật/người dùng thật/quy trình thật qua các gate có kiểm soát.
- `ACCEPTED_REFERENCE` — pilot đã được business accept; release trở thành production reference.
- `GA_EVOLUTION` — vận hành sản phẩm, hardening, mở rộng capability/vertical theo market evidence.

### Luật phase

1. **Active gate thắng static wave.**
2. Capability Missing/Foundation toàn cục không tự động trở thành task hiện tại.
3. Không reopen R5/R6 chỉ vì Pilot-01/02/03 còn việc.
4. Một gate downstream chỉ quay lại certification khi có thay đổi authority/identity thực sự làm stale evidence liên quan.
5. Khi phase thay đổi, execution priority phải tự đổi theo live state; không giữ kế hoạch của phase trước theo quán tính.

### Trạng thái hiện hành tại lần audit 2026-08-05

Repo đã đi qua R5 và R6; R6 là `PILOT-GO`. Alumdoor đang ở `CONTROLLED_PILOT`, với Pilot-00 locked và Pilot-01 source-ingested nhưng preview còn blocked bởi reconciliation/normalization.

Đây chỉ là snapshot giải thích tại thời điểm sửa Skill. **Mọi lần chạy sau phải resolve lại từ GitHub/live docs, không hard-code snapshot này thành sự thật vĩnh viễn.**

---

## 3. North Star vẫn giữ vai trò gì

North Star vẫn là strategic compass:

> **ERP core sâu + Vietnam compliance + App Factory + AI/automation + Cloudflare SaaS + vertical apps.**

Nhưng ở phase sau certification/pilot, North Star được dùng để:

- kiểm tra thay đổi có đi đúng kiến trúc dài hạn không;
- tránh shortcut tạo technical debt;
- quyết định primitive nào nên shared thay vì vertical-only;
- xếp backlog sau khi active gate đã an toàn;
- đánh giá product gap sau pilot evidence.

North Star **không** được dùng để:

- tự mở một platform-wide rebuild khi pilot đang có blocker cụ thể;
- thêm capability không phục vụ current gate chỉ vì capability map còn Missing;
- đổi certified package/profile/runtime mà không tính evidence invalidation;
- copy benchmark feature để tăng coverage hình thức.

---

## 4. Luật kiến trúc không được phá

### 4.1 Authoritative backend

- CloudForge/Document Kernel là đường ghi business chuẩn.
- Không bypass Durable Object/document lifecycle để ghi document/ledger chỉ vì làm nhanh hơn.
- D1 là authoritative tenant/query persistence theo migration governance hiện hành.
- Idempotency, OCC/version, tenant boundary, audit/outbox phải giữ invariant.

### 4.2 Metadata-first

- Generic runtime không hard-code vertical schema nếu metadata/manifest/contracts diễn đạt được.
- Capability dùng lại phải nằm ở platform/domain package phù hợp.
- Vertical chỉ giữ logic thật sự ngành dọc.
- Pattern lặp ở nhiều app phải được xem xét nâng thành primitive chung.

### 4.3 Permission server-side

- UI permission chỉ là UX.
- Server enforce role/DocPerm/owner/share/user-permission/tenant scope.
- Không tin tenant/user/role do client tự khai khi trusted context đã tồn tại.

### 4.4 Money, stock, payroll, legal

- Money dùng fixed-point/scaled integer hoặc decimal semantics chuẩn hóa.
- Stock, GL, payment, payroll và ledger khác phải có correction/reversal rõ ràng.
- Không sửa lịch sử authoritative lặng lẽ.
- Statutory rules phải effective-dated, versioned, source-bound, auditable và có deterministic regression.

### 4.5 Vertical authority

- Alumdoor và vertical khác consume shared Finance/CRM/Procurement/Stock/Manufacturing/HCM/Service authorities.
- Không tạo shadow ledger hoặc duplicate source-of-truth để “cho flow pass”.

---

## 5. Certified baseline và change doctrine

Khi đã có certified/deployed baseline, phải phân biệt:

- **historical certification truth**: candidate cũ đã PASS vẫn là sự thật lịch sử;
- **current deployed identity**: SHA/bundle/package/profile đang chạy;
- **new candidate**: bất kỳ product-source change nào tạo identity mới.

Một commit mới **không làm R6 cũ biến thành FAIL**. Nó chỉ có thể làm evidence cũ không còn đủ để chứng minh candidate mới.

### 5.1 Docs/control-plane only

Nếu prose/evidence/index thay đổi mà không đổi operational contract hoặc artifact:

- certified product identity không đổi;
- provenance check là đủ theo scope;
- không reopen release certification.

### 5.2 UI-only

UI presentation, copy, spacing, icon, layout, responsive hoặc visual composition không đổi authoritative behavior là `FAST`.

Nếu chỉ commit/merge mà **không deploy lên frozen pilot target**:

- deployed certified baseline không đổi;
- R6/Pilot lock không bị thay thế.

Nếu deploy UI mới lên frozen pilot target:

- source SHA/bundle identity mới xuất hiện;
- old R6 remains historical PASS;
- phải rerun **affected exact-release evidence** và relock software identity trước khi dùng candidate mới như pilot authority;
- không mặc định rerun toàn bộ 23/23 nếu Evidence Matrix không yêu cầu.

### 5.3 Runtime/app/package/profile change

Nếu đổi shared runtime, app behavior, package/profile contract hoặc release workflow:

- tạo candidate identity mới;
- audit blast radius theo authority;
- rerun evidence tối thiểu theo `docs/agents/r6/EVIDENCE_MATRIX.md` hoặc phase-equivalent matrix hiện hành;
- downstream pilot chỉ tiếp tục trên identity đã được accept/relock.

### 5.4 Schema/migration/ledger/security change

Đây thường là `CRITICAL` hoặc pilot-sensitive:

- append-only migration governance;
- replay/reconciliation;
- permission/tenant isolation;
- correction semantics;
- affected Golden Flow evidence;
- explicit production authorization nếu có mutation/deploy.

### 5.5 Real customer/pilot data

Preview, validation hoặc source ingest không phải production-write authorization.

Không được tự suy quyền thực hiện:

- real master/opening-data import;
- production migration;
- restore/PITR;
- DNS/route/secret/provider mutation;
- destructive queue/state operation;
- cutover.

---

## 6. Hai trục phân loại trước khi làm

Không dùng một nhãn risk để diễn đạt cả engineering risk lẫn release impact.

### 6.1 Engineering risk

#### FAST

Presentation/UX/local display không đổi authoritative behavior.

Minimum:
- typecheck/build scope;
- browser/screenshot/visual check;
- no schema/data/business invariant change.

#### STANDARD

Behavior nghiệp vụ có giới hạn nhưng không thuộc ledger/legal/migration/security critical path.

Minimum:
- targeted unit/integration;
- permission path;
- happy + failure path;
- backward compatibility.

#### CRITICAL

Accounting, payroll statutory, inventory valuation, migration, tenant isolation, auth/security, financial/legal rules hoặc production data transformation.

Minimum:
- explicit invariants;
- migration replay khi có schema;
- authoritative regression;
- correction/reversal;
- tenant/permission isolation;
- legal/source evidence nếu statutory;
- reconciliation trước/sau;
- dừng trước unauthorized production mutation/merge boundary.

### 6.2 Release impact

Ghi riêng một trong các mức:

- `NONE` — không đổi product artifact/operational contract hiện hành.
- `NEW_CANDIDATE` — source/artifact mới nhưng chưa thay frozen target.
- `PILOT_RELOCK` — muốn candidate mới trở thành authority của controlled pilot.
- `PRODUCTION_MUTATION` — có deploy/data/provider/destructive operation.

Ví dụ: một CSS change có thể là `FAST + NEW_CANDIDATE`; nếu deploy vào frozen pilot thì thành `FAST + PILOT_RELOCK`, không vì vậy biến thành CRITICAL business change.

---

## 7. Priority Engine theo phase

Nếu user không chỉ định task cụ thể, **không dùng Wave A/B/C/D/E như queue mặc định nữa**.

Ưu tiên theo thứ tự:

1. **Current gate blocker** — thứ đang chặn phase tiến lên.
2. **Regression/correctness** — lỗi đe dọa canonical authority, certified flow hoặc reconciliation.
3. **Pilot/operator usability** — vấn đề UI/UX/access làm actor thật không thể vận hành current flow.
4. **Evidence gap** — thiếu proof để accept gate hiện tại.
5. **Reusable primitive required by current gate** — chỉ nâng platform khi gate thực sự cần hoặc duplication đã chứng minh.
6. **Post-gate hardening** — performance, operability, supportability, migration/implementation tooling phục vụ production reference.
7. **Enterprise completeness backlog** — capability breadth theo North Star sau khi không cạnh tranh với gate đang active, hoặc khi user chủ động mở workstream đó.

### Điều cấm

- Không ưu tiên feature chỉ vì dễ demo.
- Không dùng capability percentage để lấn át blocker dữ liệu thật.
- Không mở vertical mới khi reference vertical hiện tại chưa đạt gate mà user đang theo đuổi, trừ khi user có market/customer reason rõ.
- Không “platform hóa” một pattern giả định chưa có consumer/evidence.

---

## 8. Workflow chuẩn cho mọi task

### Bước 1 — Resolve phase

Xác định current phase, active gate, frozen/certified identity và mutation boundary.

### Bước 2 — Audit exact state

Tìm:
- exact main/branch/PR/diff;
- metadata/schema;
- controller/service/API;
- UI renderer;
- permission;
- migrations;
- tests;
- app/package/profile;
- release/pilot evidence;
- active phase contract.

### Bước 3 — Classify task

Ghi rõ:

- user outcome;
- engineering risk: FAST/STANDARD/CRITICAL;
- release impact: NONE/NEW_CANDIDATE/PILOT_RELOCK/PRODUCTION_MUTATION;
- authoritative data/contract touched;
- phase gate affected;
- evidence invalidation scope.

### Bước 4 — Decide layer

Ưu tiên:

1. Platform primitive nếu thật sự shared.
2. ERP/domain package nếu generic business behavior.
3. App package nếu bounded domain.
4. Vertical-only nếu ngành-specific.
5. UI presentation nếu chỉ UX/presentation.

Không nhét business rule vào React component nếu backend/domain nên sở hữu nó.

### Bước 5 — Contract before implementation

Nếu behavior thay đổi, khóa tối thiểu:

- data/state contract;
- permission;
- status/lifecycle;
- rounding/UOM/currency;
- idempotency/correction;
- API/manifest boundary;
- acceptance evidence.

UI-only không cần tạo business contract giả; chỉ cần xác nhận blast radius thật sự UI-only.

### Bước 6 — Implement smallest complete slice

Ưu tiên slice đủ đóng current gate hơn breadth.

Business slice điển hình:

`input -> validate -> approve/submit -> authoritative side effect -> readback/report -> correction/cancel -> audit`.

### Bước 7 — Verify theo blast radius

Có thể gồm:

- typecheck/build;
- targeted tests;
- browser/E2E/screenshot;
- migration replay;
- invariant/permission/tenant tests;
- reconciliation;
- package/profile identity;
- release marker/provider observation;
- pilot preview/dry-run evidence.

Không chạy broad certification vô điều kiện nếu change matrix chỉ yêu cầu subset nhỏ hơn.

### Bước 8 — Advance or preserve gate

Sau verify, xác định task:

- không ảnh hưởng gate;
- unblock một phần;
- đủ điều kiện chuyển gate;
- tạo candidate mới cần relock;
- hoặc bị block bởi business/source dependency.

Không tự tuyên bố phase advance khi acceptance contract chưa đủ.

### Bước 9 — Update evidence/status

Sau merge/acceptance phù hợp:

- `CURRENT_STATUS.md` chỉ phản ánh verified live state;
- `NEXT_TASKS.md` phản ánh active queue;
- phase authority cập nhật nếu gate/identity thay đổi;
- capability map chỉ nâng maturity bằng evidence;
- không nhét SHA tạm/branch tạm vào North Star.

---

## 9. Maturity model và gate model là hai thứ khác nhau

Capability maturity vẫn dùng:

- `Missing`
- `Foundation`
- `Wired`
- `RC`
- `Hardened`

Nhưng pilot/release acceptance không được suy trực tiếp từ maturity count.

Ví dụ:

- toàn repo vẫn có nhiều `Missing`, nhưng exact Alumdoor pilot candidate vẫn có thể `PILOT-GO` trong bounded scope;
- một capability `RC` không có nghĩa real opening data đã sẵn sàng;
- một `PREVIEW_PASS` không có nghĩa production write được phép.

Do đó luôn báo cáo riêng:

- **portfolio maturity**;
- **current phase gate**;
- **exact release/data evidence**.

---

## 10. Definition of Done theo phase

### Feature/capability DoD

Trong scope phải có đủ những gì nghiệp vụ cần:

- usable flow;
- server-side permission;
- invariants/validation;
- audit/history;
- error states;
- correction/cancel/reversal nếu áp dụng;
- report/query;
- import/migration path khi cần;
- tests theo risk;
- phù hợp desktop/mobile actor;
- không duplicate authority.

### Pilot gate DoD

Không dùng feature DoD thay pilot acceptance. Pilot gate phải theo phase contract cụ thể, ví dụ:

- exact software/package/profile identity;
- source/cutoff/data mapping;
- zero unexplained reconciliation variance nếu contract yêu cầu;
- named access/role readiness;
- representative transaction evidence;
- correction/idempotency;
- recovery freshness;
- business acceptance ở cutover gate.

### Enterprise/GA DoD

North Star completion vẫn xét breadth/depth, nhưng chỉ sau khi production references chứng minh:

- cross-department workflows;
- reconciled outcomes;
- operational hardening;
- implementation/migration repeatability;
- supportability;
- reusable App Factory/platform primitives.

---

## 11. Benchmark doctrine

Benchmarks vẫn dùng để chống tự đánh giá quá cao:

- ERPNext/Frappe — ERP depth, lifecycle, extensibility.
- MISA AMIS — Vietnam compliance/productization/local operations.
- Forge reference verticals — proven reusable patterns.

Nhưng benchmark không được tự tạo queue ngoài phase.

Parity review khi material nên xét:

1. happy path;
2. cancel/amend/return/correction;
3. partial fulfillment/payment/allocation;
4. backdated transaction;
5. permission/tenant;
6. currency/UOM/rounding;
7. audit/history;
8. import/export/report;
9. mobile/large-data behavior;
10. failure/retry/idempotency.

---

## 12. Automatic execution topology

Trước implementation, coordinator tự chọn:

- `SINGLE` — một ownership hotspot/tightly coupled slice;
- `PROGRAM` — nhiều owner độc lập có thể chạy song song.

Không hỏi user về quyết định kỹ thuật thông thường nếu repo evidence đủ.

### Chọn PROGRAM khi

- có >=2 ownership hotspot độc lập;
- cross-package/workstream authority rõ;
- shared contract + nhiều consumer độc lập;
- audit/source-lock, implementation, QA/convergence có thể tách;
- phase gate có nhiều lane thật sự song song.

Không fan-out chỉ để tăng số agent.

### PROGRAM coordinator phải

1. audit exact main/live phase;
2. khóa control baseline;
3. định nghĩa Agent Board/dependency/acceptance;
4. gán owned hotspot + forbidden zone;
5. tách worker branch từ đúng baseline;
6. chống duplicate primitive/shared-contract conflict;
7. route Dependency Request;
8. convergence theo authority/evidence;
9. không để worker tự merge/deploy vượt production boundary.

Status chuẩn:

- `BOOTSTRAPPED`
- `RUNNING`
- `BLOCKED`
- `READY`
- `CONVERGING`
- `DONE`
- `SUPERSEDED/CLOSED`

Báo cáo PROGRAM tối thiểu:

```text
Execution topology: PROGRAM
Current phase: <phase>
Active gate: <gate>
Control branch: <branch>@<sha>
Worker agents: <N>
Active worker branches: <N>

| Agent | Branch | PR | Mission | Status | Depends/blocker |
|---|---|---|---|---|---|
```

Với SINGLE:

```text
Execution topology: SINGLE
Current phase: <phase>
Active gate: <gate>
Branch: <branch>@<sha>
Status: <status>
```

Canonical detail: `docs/agents/AUTO_AGENT_ORCHESTRATION.md` và `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.

---

## 13. NO-STOP và authorization boundary

Worker tự audit và chọn phương án kỹ thuật tốt nhất theo Skill/North Star/repo evidence.

Chỉ dừng hỏi khi:

1. cần quyết định nghiệp vụ không thể suy ra từ repo/spec/source owner;
2. cần thay shared authoritative contract thuộc workstream khác và dependency không thể cô lập;
3. cần destructive/production operation;
4. cần merge/deploy non-UI mà policy hiện hành yêu cầu explicit approval.

Nếu bị block cục bộ:

- ghi `Dependency Request`;
- nêu exact blocker/evidence cần;
- tiếp tục mọi phần độc lập còn lại.

### Merge/deploy boundary

- UI-only: fast path sau verify blast radius, **nhưng frozen pilot identity/relock rule vẫn áp dụng nếu deploy thay artifact đang được pilot dùng**.
- Non-UI/backend/schema/migration/business rule: branch + PR + verify; dừng trước merge/deploy nếu policy yêu cầu user approval.
- Production/customer-data/provider/destructive operation: luôn theo explicit authorization contract hiện hành.

---

## 14. AI rules

AI trong Forge có thể:

- giải thích/tìm kiếm/phân tích;
- draft/đề xuất;
- anomaly/recommendation;
- gọi deterministic tool có permission và approval.

AI không được:

- tự ghi ledger/statutory filing không qua deterministic validation/approval;
- vượt permission;
- bịa business numbers khi semantic/context data thiếu;
- biến prompt thành source-of-truth của business/legal rule.

Target pattern:

`intent -> semantic/context -> permission -> deterministic action -> preview -> approval -> authoritative write`.

---

## 15. Reporting contract mới

Mọi audit/task quan trọng phải trả tối thiểu:

```text
Phase: <FOUNDATION/INTEGRATION/CERTIFICATION/CONTROLLED_PILOT/ACCEPTED_REFERENCE/GA_EVOLUTION>
Active gate: <gate>
Exact baseline: <sha/package/profile nếu material>
Task: <scope>
Engineering risk: FAST/STANDARD/CRITICAL
Release impact: NONE/NEW_CANDIDATE/PILOT_RELOCK/PRODUCTION_MUTATION
Authorities touched: <list>
Gate impact: <none/unblock/relock/advance>
Evidence required: <targeted list>
Dependency Request: <none hoặc exact blocker>
Next executable slice: <slice>
```

Nếu review capability/domain, thêm:

```text
Current maturity: <...>
Target maturity: <...>
Coverage: <x/y nếu denominator có thật>
Blocking gaps: <3-7>
```

Không dùng phần trăm cảm tính.

---

## 16. Portfolio direction sau khi gate cho phép

12 North Star pillars vẫn là portfolio map:

1. Finance + Vietnam Compliance.
2. CRM / Revenue 360.
3. Procurement 360.
4. Inventory + WMS.
5. MRP II + QMS.
6. HCM + statutory payroll VN.
7. Project + Service + Field Service.
8. BI Semantic Layer + Planning.
9. BPM + Low-code App Factory.
10. Integration Hub + ecosystem.
11. Enterprise Security + SaaS Control Plane + SRE.
12. Migration + Implementation + Customer Success.

Nhưng thứ tự thực thi không còn cố định là Wave A -> B -> C -> D -> E.

Sau controlled pilot, ưu tiên được tái tính bằng:

- production/pilot evidence;
- customer pain;
- repeated implementation cost;
- shared primitive leverage;
- compliance/reconciliation risk;
- revenue/market pull;
- operational support burden.

Một reference vertical sâu và vận hành thật có giá trị hơn việc mở nhiều module/vertical nông.

---

## 17. Nguyên tắc cuối

Forge không hoàn thiện khi có nhiều menu hoặc nhiều test.

Forge tiến đúng khi tại **phase hiện tại**:

- active gate được đóng bằng evidence thật;
- authoritative data/ledger/permission không bị phá;
- certified baseline được bảo vệ hoặc relock có kiểm soát;
- UI có thể tiến hóa mà không bị nhầm với business-authority change;
- pilot/data/cutover không bị bypass;
- reusable patterns được nâng đúng layer;
- North Star vẫn định hướng backlog sau gate;
- mỗi phase chuyển tiếp bằng proof, không bằng cảm tính.

> **Build foundation khi phase cần foundation. Certify khi phase cần certification. Pilot bằng dữ liệu và actor thật khi đã có certified baseline. Sau pilot, dùng evidence thị trường và vận hành để quyết định phần enterprise nào đáng mở tiếp.**
