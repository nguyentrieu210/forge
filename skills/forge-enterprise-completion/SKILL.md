---
name: forge-enterprise-completion
description: Kim chỉ nam để đưa Forge từ ERP engine thành enterprise operating platform hoàn chỉnh, có độ phủ ERP/HCM/CRM/WMS/MRP/BPM/BI/compliance và lợi thế App Factory + Cloudflare SaaS + vertical apps.
---

# Forge Enterprise Completion Skill

## 1. Mục tiêu

Skill này dùng khi đánh giá, thiết kế, triển khai hoặc review bất kỳ hạng mục nào nhằm **hoàn thiện Forge như một enterprise platform**, không chỉ vá một màn hình hay thêm một DocType.

Đích sản phẩm:

> **ERP core sâu + Vietnam compliance + low-code App Factory + AI/automation + Cloudflare SaaS + vertical apps.**

Forge không được phát triển thành bản sao giao diện của MISA hoặc ERPNext. Hai hệ thống đó là benchmark về độ phủ và độ chín; Forge phải giữ lợi thế kiến trúc riêng: metadata-driven, multi-tenant Cloudflare, app packaging, generic runtime và verticalization nhanh.

## 2. Nguồn sự thật bắt buộc đọc trước khi làm

Không bắt đầu từ lịch sử chat hoặc tài liệu snapshot cũ.

Đọc theo thứ tự:

1. Exact `main`, branch, PR và diff trên GitHub.
2. `CURRENT_STATUS.md` — trạng thái đã xác minh gần nhất.
3. `NEXT_TASKS.md` — hàng đợi active.
4. `PROJECT_CONTEXT.md` — kiến trúc và ranh giới hiện hành.
5. `AI_HANDOFF.md` nếu task tiếp nối công việc cũ.
6. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` — mục tiêu chiến lược.
7. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` — capability checklist đầy đủ.
8. Tài liệu BRD/spec/test/source-lock liên quan trực tiếp đến capability đang làm.
9. `docs/ROADMAP.md` chỉ để hiểu hướng dài hạn, **không dùng để suy live state**.

Nếu các nguồn mâu thuẫn: **code + migration + tests + exact GitHub state thắng tài liệu**.

## 3. Luật kiến trúc không được phá

### 3.1 Authoritative backend

- CloudForge/document kernel là đường ghi chuẩn.
- Không bypass Durable Object/document kernel để ghi document/ledger chỉ vì làm nhanh hơn.
- D1 là authoritative store/query projection theo kiến trúc hiện hành; ledger/audit/outbox phải giữ invariant.
- Idempotency, OCC/version, tenant boundary và audit không được hy sinh để hoàn thành UI.

### 3.2 Metadata-first

- Runtime chung không hard-code schema app nếu metadata/manifest có thể diễn đạt được.
- Capability dùng lại giữa nhiều app phải hạ xuống platform/package chung.
- Logic ngành dọc chỉ ở app/vertical layer khi thực sự đặc thù ngành.
- Nếu một pattern lặp lại từ 2 app trở lên, xem xét nâng thành primitive của App Factory/runtime.

### 3.3 Permission server-side

- UI permission chỉ để UX.
- Server phải enforce role/DocPerm/owner/share/user-permission/tenant scope.
- Không tin tenant/user/role do client tự khai khi đã có trusted context.

### 3.4 Money, stock và legal rules

- Tiền dùng fixed-point/scaled integer hoặc decimal semantics đã chuẩn hóa; không tùy tiện dùng binary float cho authoritative calculation.
- Stock, GL, payment, payroll và các ledger khác phải có reversal/correction rõ ràng, không sửa lịch sử lặng lẽ.
- Legal/statutory rule phải effective-dated, versioned, source-bound, auditable và có regression theo version.

### 3.5 Production boundary

- **UI-only**: sau khi verify đúng blast radius, có thể merge và deploy theo fast-path của dự án.
- **Non-UI/backend/schema/migration/business rule**: mở branch + PR, verify, **dừng trước merge/deploy cho tới khi user duyệt rõ**.
- Không production migration, secret/DNS, customer-data mutation nếu chưa có yêu cầu rõ.

## 4. Benchmark đúng cách

Mỗi capability cần đối chiếu ít nhất một benchmark phù hợp:

- **ERPNext/Frappe**: generic ERP depth, document lifecycle, stock/manufacturing/accounting long-tail, extensibility.
- **MISA AMIS**: Vietnam compliance, digital office, HR/payroll/local operations, productization cho doanh nghiệp Việt Nam.
- **Forge vertical hiện có**: Alumdoor/HRM/VN Accounting/Social Commerce/Website để tái sử dụng pattern tốt đã chứng minh.

Không copy tên màn hình rồi gọi là parity. Parity phải xét:

1. Happy path.
2. Cancel/amend/return/correction.
3. Partial fulfillment/payment/allocation.
4. Backdated transaction.
5. Permission/tenant boundary.
6. Currency/UOM/rounding.
7. Audit/history.
8. Import/export/report.
9. Mobile/large-data behavior nếu nghiệp vụ yêu cầu.
10. Failure/retry/idempotency.

## 5. Maturity model chung

Mọi capability chỉ dùng các mức sau:

- **Missing**: chưa có đường chạy thực tế.
- **Foundation**: có schema/API seam/metadata nhưng chưa đủ flow nghiệp vụ.
- **Wired**: end-to-end đã nối nhưng validation/evidence còn mỏng.
- **RC**: flow chính + invariants + targeted regression đã có; còn thiếu promotion/hardening/long-tail.
- **Hardened**: production-grade trong scope công bố, có failure/correction/security/reconciliation/evidence.

Không dùng số test để tự phong `Hardened`.

## 6. Risk class trước khi code

### FAST

UI presentation, copy, spacing, icon, metadata display không đổi authoritative behavior.

Yêu cầu tối thiểu:
- typecheck/build scope liên quan;
- screenshot/visual check nếu UI;
- không đổi schema/data/business invariant.

### STANDARD

Feature nghiệp vụ không tác động legal/ledger/migration hoặc thay đổi behavior có giới hạn.

Yêu cầu:
- unit/targeted integration;
- permission path;
- happy + failure path;
- backward compatibility theo scope.

### CRITICAL

Accounting, payroll statutory, inventory valuation, migration, tenant isolation, auth/security, financial/legal rule, production data transformation.

Yêu cầu:
- explicit invariants;
- migration replay nếu có schema;
- authoritative regression;
- correction/reversal path;
- tenant/permission isolation;
- source/legal evidence nếu statutory;
- reconciliation trước/sau;
- không merge/deploy khi chưa được duyệt.

## 7. Quy trình chuẩn cho mọi capability

### Bước 1 — Locate

Xác định capability ID trong `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`.

Nếu chưa có ID phù hợp, bổ sung capability map trước khi triển khai để tránh feature mồ côi.

### Bước 2 — Audit exact state

Tìm:
- metadata/schema hiện có;
- controller/service;
- API;
- UI renderer;
- permission;
- migrations;
- tests;
- app manifest/brief;
- production evidence nếu liên quan.

Phân loại maturity hiện tại.

### Bước 3 — Gap against target

Viết ngắn:
- user outcome;
- authoritative data;
- state machine;
- invariants;
- integrations;
- reports;
- exception/correction flows;
- benchmark gap.

### Bước 4 — Decide layer

Ưu tiên theo thứ tự:

1. Platform primitive nếu dùng chung.
2. ERP/domain package nếu là nghiệp vụ generic.
3. App package nếu thuộc một bounded domain.
4. Vertical-only logic nếu thực sự đặc thù ngành.

Không nhét business rule vào React component nếu backend/domain có thể sở hữu nó.

### Bước 5 — Contract first

Trước implementation, khóa:
- data contract;
- naming/state/status;
- permission contract;
- rounding/UOM/currency semantics;
- idempotency/correction semantics;
- API/manifest boundary;
- acceptance evidence.

### Bước 6 — Implement thin vertical slice

Một slice hoàn chỉnh tốt hơn năm màn hình rỗng.

Mỗi slice ưu tiên:

`create/input -> validate -> approve/submit -> ledger/side effect -> report/query -> correction/cancel -> audit`

### Bước 7 — Verify

Theo blast radius:
- compile/typecheck;
- targeted tests;
- migration replay;
- invariant tests;
- permission tests;
- tenant isolation;
- browser/E2E/screenshot cho UI;
- production release marker khi thật sự deploy.

### Bước 8 — Update evidence

Sau khi merge:
- cập nhật `CURRENT_STATUS.md` cho trạng thái đã xác minh;
- cập nhật `NEXT_TASKS.md` nếu queue thay đổi;
- capability map chỉ đổi maturity khi có evidence;
- không nhét SHA/branch tạm vào North Star.

## 7A. Automatic multi-agent orchestration

Trước implementation, coordinator phải tự phân loại execution topology:

- `SINGLE`: một owner là an toàn/nhanh nhất;
- `PROGRAM`: cần nhiều worker agent có ownership tách được.

Không hỏi user xem "có cần agent không" nếu repo evidence đã đủ để quyết định.

### Khi mặc định chọn PROGRAM

Fan-out khi có ít nhất một strong trigger và các hotspot có thể tách sạch:

1. từ hai ownership hotspot độc lập trở lên có thể chạy song song;
2. task trải qua nhiều workstream/domain/package với authority khác nhau;
3. có shared foundation/contract rồi nhiều consumer độc lập;
4. có các lane audit/source-lock, implementation, integration, QA/convergence tách được;
5. platform-wide rebuild/convergence/hardening wave có nhiều slice thực sự độc lập;
6. các substream có risk/merge boundary khác nhau, ví dụ UI FAST song song backend STANDARD/CRITICAL.

Giữ `SINGLE` nếu phần lớn thay đổi nằm ở một hotspot, invariant cần chứng minh nguyên khối, hoặc coordination cost lớn hơn implementation.

### Khi chọn PROGRAM, coordinator tự làm

Không chờ user nhắc. Coordinator phải:

1. audit exact current `main`, branch/PR và source bắt buộc;
2. tạo program/control branch từ exact current `main`;
3. tạo technical/program spec, Agent Board, NO-STOP rule, dependency graph và acceptance gates;
4. source-lock/parity matrix nếu benchmark/reference bên ngoài là material;
5. định nghĩa từng worker: mission, owned hotspot, forbidden zone, risk, dependency, evidence, merge/deploy boundary;
6. tạo worker branches từ exact program baseline;
7. seed branch-local handoff + startup prompt cho từng worker;
8. verify topology trước implementation: worker không được mang code/handoff của owner khác;
9. cho worker chạy song song theo dependency graph;
10. coordinator theo dõi exact heads/diffs, route Dependency Request, chống duplicate primitive và quyết định convergence/merge order.

Số agent dùng **ít nhất cần thiết để ownership sạch**. Hướng dẫn mặc định:

- 1: single hotspot/tightly coupled slice;
- 2–4: cross-package feature hoặc domain hardening bình thường;
- 5–8: platform rebuild/convergence/enterprise wave;
- >8: chỉ khi capability graph thật sự có nhiều owner độc lập.

Agent count không phải KPI.

### NO-STOP mặc định

Worker tự audit và quyết định kỹ thuật thông thường theo Skill/North Star/repo evidence.

Worker chỉ dừng hỏi user khi:

1. cần quyết định nghiệp vụ không thể suy ra từ repo/spec;
2. cần đổi shared authoritative contract thuộc stream khác và không thể cô lập dependency;
3. cần destructive/production operation;
4. non-UI work đã sẵn sàng merge/deploy nhưng project policy yêu cầu user duyệt.

Blocker cục bộ không phải lý do dừng. Ghi `Dependency Request`, mô tả phần bị block rồi tiếp tục mọi phần độc lập.

UI-only vẫn theo fast path sau verify blast radius. Non-UI/shared contract/backend/schema/migration/business rule vẫn dừng trước merge/deploy theo production boundary.

Canonical chi tiết: `docs/agents/AUTO_AGENT_ORCHESTRATION.md` và `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.

## 8. Definition of Done của một capability

Một capability chỉ được coi là hoàn tất khi phù hợp scope và có đủ:

- Business flow usable.
- Permission server-side.
- Validation/invariants.
- Audit/history.
- Error states rõ ràng.
- Cancel/reversal/correction khi nghiệp vụ cần.
- Import/export hoặc migration path nếu dữ liệu doanh nghiệp cần nhập.
- Report/query tối thiểu để kiểm soát kết quả.
- Tests theo risk class.
- UI desktop/mobile phù hợp actor thực tế nếu có UI.
- Không tạo duplicate source of truth.
- Tài liệu/status phản ánh đúng mức maturity.

Đối với finance/stock/payroll, thêm:
- reconciliation;
- exact rounding/scaling;
- posting period guard;
- backdated/correction semantics;
- immutable or traceable ledger behavior.

## 9. 12 trụ chiến lược bắt buộc

Mọi roadmap dài hạn phải quay về 12 trụ sau:

1. Full Finance + Vietnam Compliance Engine.
2. CRM / Revenue 360.
3. Procurement 360.
4. Inventory + WMS.
5. MRP II + QMS.
6. Full HCM + statutory payroll VN.
7. Project + Service + Field Service.
8. BI Semantic Layer + Planning.
9. BPM + Low-code App Factory.
10. Integration Hub + ecosystem connectors.
11. Enterprise Security + SaaS Control Plane + SRE.
12. Migration + Implementation + Customer Success tooling.

Vertical apps như Alumdoor phải xây trên 12 trụ này, đồng thời cung cấp feedback để nâng primitive chung.

## 10. Trình tự ưu tiên mặc định

Nếu user không chỉ định task cụ thể, ưu tiên theo dependency và giá trị tái sử dụng:

### Wave A — ERP Core 90%

- Finance/AR/AP/Cash/Bank.
- VN statutory foundation.
- CRM core.
- Procurement full flow.
- WMS core.
- Manufacturing/MRP core.
- HCM/payroll core.

### Wave B — Enterprise Depth

- Budget/Treasury/Consolidation.
- QMS/CMMS/EAM.
- Project/PSA.
- Helpdesk/Field Service.
- Logistics/distribution.
- Contracts/DMS.

### Wave C — Platform Moat

- App Factory no-code path.
- Workflow/Rule/Action/Report/Dashboard builders.
- BI semantic layer.
- AI assistant/agent with approval.
- Integration SDK/event platform.

### Wave D — Vietnam Ecosystem

- E-invoice.
- Bank feeds/payment.
- Tax/BHXH.
- E-sign.
- Zalo/social/marketplaces/shipping/payment gateways.

### Wave E — Industry Packs

- Alumdoor/manufacturing.
- Distribution.
- Retail/F&B.
- Construction.
- Logistics.
- Agriculture.
- Professional services.
- Các ngành khác chỉ mở khi có customer/market evidence.

## 11. Capability selection heuristic

Khi có nhiều việc ngang nhau, ưu tiên capability có:

1. Chặn flow end-to-end hiện có.
2. Tái sử dụng cho nhiều module/app.
3. Giảm rủi ro tài chính/pháp lý/dữ liệu.
4. Giúp migration/onboarding khách hàng dễ hơn.
5. Tạo doanh thu hoặc lợi thế vertical rõ ràng.
6. Có benchmark/evidence rõ để đóng scope.

Tránh ưu tiên feature chỉ vì dễ demo nhưng không cải thiện business completeness.

## 12. AI rules

AI trong Forge có thể:
- giải thích;
- tìm kiếm;
- phân tích;
- đề xuất;
- draft document/action;
- dự báo/anomaly/recommendation khi có data contract rõ.

AI không được:
- tự ghi ledger hoặc statutory filing mà không có deterministic validation/approval;
- vượt permission của user;
- bịa số liệu doanh nghiệp khi semantic/context data không có;
- biến prompt thành source of truth cho business rule.

Mục tiêu cuối của AI là:

`User intent -> semantic/context layer -> permission -> deterministic tool/action -> preview -> approval -> authoritative write`

## 13. Báo cáo tiến độ chuẩn

Khi review một domain, trả kết quả theo mẫu:

```text
Domain: <ID + tên>
Current maturity: Missing/Foundation/Wired/RC/Hardened
Target maturity: <mức>
Coverage: <x/y capability>
Blocking gaps: <3-7 gap quan trọng>
Dependencies: <domain IDs>
Risk: FAST/STANDARD/CRITICAL
Next slice: <một vertical slice có thể đóng>
Evidence required: <tests/migration/E2E/reconciliation>
```

Không dùng phần trăm cảm tính nếu chưa xác định mẫu số capability.

## 14. Nguyên tắc cuối

Forge hoàn thiện không phải khi sidebar có đủ tên module.

Forge hoàn thiện khi:

- doanh nghiệp chạy được quy trình xuyên phòng ban;
- số liệu cuối flow đối soát được;
- lỗi/cancel/backdate/correction không phá dữ liệu;
- compliance có nguồn và version;
- permission/tenant không thủng;
- app mới được sinh từ primitive chung thay vì fork core;
- triển khai/migrate/backup/restore có công cụ;
- production evidence đủ để biết chính xác thứ gì đang chạy.