# FORGE RC HARDENING EXECUTION PLAN — 2026-08-03

Status: **PROPOSED EXECUTION PLAN**  
Baseline: exact current `main` must be re-read before every implementation task.  
Execution policy: `skills/forge-enterprise-completion/SKILL.md`.  
Strategic target: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`.  
Capability denominator: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` (**956 capability IDs** at plan creation time).

## 1. Mục tiêu của giai đoạn tiếp theo

Forge đã vượt giai đoạn “thiếu module”. WS00–WS17 đã hội tụ ở repository level và kiến trúc nền đã đủ rộng. Giai đoạn tiếp theo không ưu tiên tăng số màn hình; mục tiêu là đưa nền hiện tại từ **Wired** lên **RC**, sau đó chọn các capability quan trọng để lên **Hardened**.

Đích của chương trình này:

1. Có maturity register cho toàn bộ capability map, không báo tiến độ bằng cảm tính.
2. Mọi capability được nâng cấp theo vertical slice end-to-end và có evidence đúng risk class.
3. Đóng các lỗ hổng platform/SRE/security trước khi mở rộng feature breadth.
4. Đưa ERP core và Vietnam compliance lên RC theo source of truth, correction/reversal/reconciliation.
5. Hoàn thiện App Factory/AI theo deterministic metadata/tool contract thay vì special case trong runtime.
6. Dùng Alumdoor làm reference vertical để chứng minh generic platform và production readiness.

## 2. Luật thực thi

### 2.1 Không resurrect PR cũ

- PR/branch lịch sử chỉ là evidence/reference.
- Không reopen PR cũ làm canonical task.
- Nếu code lịch sử còn giá trị, audit exact current `main` rồi cherry-pick/rebuild phần còn đúng contract vào branch mới.

### 2.2 Mỗi task phải gắn capability ID

Mỗi branch/PR mới phải ghi tối thiểu:

```text
Capabilities: <ID list>
Current maturity: Missing/Foundation/Wired/RC/Hardened
Target maturity: <target>
Risk: FAST/STANDARD/CRITICAL
Authoritative data/source of truth: <path/domain>
Evidence required: <tests/migration/permission/E2E/reconciliation/release>
```

### 2.3 Mỗi slice phải end-to-end

Ưu tiên:

`create/input -> validate -> approve/submit -> authoritative side effect -> report/query -> correction/cancel -> audit`

Không coi một DocType mới, một API mới hoặc một màn hình mới là DONE nếu business flow chưa đóng.

### 2.4 Merge/deploy boundary

- UI-only: verify đúng blast radius, có thể merge/deploy theo fast path hiện hành.
- Backend/schema/migration/business rule/security/accounting/stock/payroll: branch + PR + evidence, dừng trước merge/deploy cho tới khi có approval rõ.
- Không production data mutation, secret/DNS, migration destructive nếu chưa có yêu cầu rõ.

## 3. Capability maturity register

### 3.1 Tạo registry canonical

Tạo file mới ở wave đầu:

`docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`

Mỗi capability có một dòng:

| Field | Ý nghĩa |
|---|---|
| Capability ID | ID từ Capability Map |
| Domain/NS | family + North Star pillar |
| Current maturity | Missing/Foundation/Wired/RC/Hardened |
| Evidence source | code path / migration / test / release evidence |
| Permission evidence | server-side permission/tenant proof |
| Correction evidence | cancel/reversal/amend/retry nếu cần |
| Reconciliation evidence | finance/stock/payroll/data reconciliation nếu cần |
| UI evidence | browser/E2E/mobile nếu có UI |
| Production evidence | exact release marker nếu claim deployed |
| Blocking gap | gap ngắn nhất chặn mức tiếp theo |
| Next slice | slice nhỏ nhất có thể nâng maturity |

### 3.2 Quy tắc chấm maturity

- **Missing**: không có đường chạy thực tế.
- **Foundation**: có schema/API seam/metadata nhưng chưa đủ business flow.
- **Wired**: end-to-end đã nối nhưng evidence/invariant còn mỏng.
- **RC**: flow chính + invariants + targeted regression đã đủ, còn long-tail/promotion/hardening.
- **Hardened**: production-grade trong scope công bố, có failure/correction/security/reconciliation/evidence.

Không suy Hardened từ số lượng test hoặc từ việc đã merge.

### 3.3 Chỉ số báo cáo sau Wave 0

Sau khi registry hoàn thành, mọi báo cáo tiến độ dùng số thật:

```text
Total capability: 956
Wired+: x/956
RC+: y/956
Hardened: z/956
Critical RC+: a/b
North Star pillar coverage: từng trụ riêng
```

Không dùng phần trăm tổng trước khi registry đủ mẫu số.

## 4. Wave 0 — Exact-state audit + evidence system

Mục tiêu: tạo sự thật đo được trước khi viết thêm feature.

### W0-01 Capability registry

- Parse 956 ID từ Capability Map.
- Audit exact current `main` theo family.
- Chấm maturity bảo thủ, evidence-driven.
- Không tự nâng mức nếu thiếu correction/permission/reconciliation.

**Exit:** 956/956 ID có maturity + evidence/gap hoặc explicit `Missing`.

### W0-02 Release/workflow truth

Audit `.github/workflows/**` trên current main:

- xác định canonical release workflow;
- loại duplicate/one-off workflow khi thật sự stale;
- không dựa vào PR #427 cũ;
- đảm bảo UI-only path không deploy non-UI commit;
- exact `/health` + `/release.json` vẫn là production proof.

Risk: **CRITICAL/OPS**.

### W0-03 Validation lanes

Thiết lập/chuẩn hóa validation theo blast radius:

- shared TypeScript build/typecheck;
- targeted domain regressions;
- migration replay cho CRITICAL;
- permission/tenant isolation;
- browser/E2E cho UI;
- accounting/stock/payroll reconciliation;
- release marker khi production deploy.

Không cần biến GitHub Actions thành một lễ hội CI kéo dài hàng giờ. Chỉ cần deterministic evidence đủ để promotion maturity.

### W0-04 Evidence index

Tạo một index liên kết capability -> source/tests/migrations/release evidence để tránh cùng một thứ bị audit lại mười lần.

**Wave 0 exit criteria:** Forge có baseline maturity thật và danh sách blockers được xếp hạng theo dependency/risk/value.

## 5. Wave 1 — Platform RC foundation

Ưu tiên vì mọi domain phía trên phụ thuộc vào lớp này.

### P1-01 Kernel / authoritative write

Target families:
- Document Kernel / OCC / idempotency / audit.
- trusted tenant context.
- no direct bypass writes.

Goal: platform write path đạt **RC/Hardened** trong scope generic.

### P1-02 Security / IAM / SaaS

Target:
- G01 Identity & Access.
- G02 Governance & Privacy.
- T01 SaaS Lifecycle.

Ưu tiên:
- server-side record/field/owner/share/scope enforcement;
- session/device revocation;
- privileged action audit;
- support access/impersonation control;
- tenant lifecycle guards.

### P1-03 SRE / release / backup / restore

Target:
- O01 SRE.
- tenant backup/restore/migration verification.

Ưu tiên:
- release marker;
- backup verification;
- restore drill;
- migration verification;
- rollback;
- integrity checks;
- rate limit/abuse protection;
- error/queue visibility.

### P1-04 Generic runtime/mobile contracts

Target:
- U01 responsive/installable PWA.
- offline/session/cache/OCC contracts.

Không làm offline write trước khi khóa contract tenant/session/version/conflict.

**Wave 1 exit:** L0 platform core có bằng chứng RC trên các đường ghi/permission/release quan trọng; domain agent không cần tự chế primitive riêng.

## 6. Wave 2 — ERP Core RC

Mỗi domain chạy độc lập khi không chạm shared contract. Shared dependency phải ghi Dependency Request nhưng không chặn phần độc lập.

### E2-01 Finance + VN compliance

Target families:
- F01–F04 trước;
- V01–V04 theo demand pháp lý;
- F05–F07 sau khi core posting/reconciliation ổn.

Bắt buộc:
- fixed-point/decimal semantics;
- hard/soft period guard;
- reversal/correction;
- backdated behavior;
- tenant/company/branch scope;
- AR/AP/payment reconciliation;
- statutory source/effective-date/version/hash/test fixtures.

Risk: **CRITICAL**.

### E2-02 Procurement 360

Target:
- P01 Procurement Core.
- P02 Supplier Management.

Flow RC ưu tiên:

`Purchase Request -> RFQ -> Quote Compare -> Approval -> PO -> Receipt -> Invoice -> Payment -> Return/Correction`

Three-way match, partial receipt/invoice/payment, supplier debt và landed cost phải dùng authority hiện hữu, không tạo ledger cạnh tranh.

### E2-03 Inventory + WMS

Target:
- W01 Inventory Core.
- W02 WMS.

Ưu tiên:
- stock reconciliation/cycle count;
- backdated/repost;
- valuation adjustment;
- batch/serial/expiry;
- reservation/ATP;
- bin/putaway/pick/pack;
- barcode/QR/mobile scanner.

Mọi stock correction phải đối soát stock ledger và finance khi tích hợp.

### E2-04 CRM / Order-to-Cash

Target:
- C01 CRM Core.
- C03 O2C trước C02/C04 breadth.

Flow RC:

`Lead/Customer -> Opportunity -> Quotation -> Sales Order -> Delivery -> Invoice -> Payment -> Return/Credit -> Warranty/Service`

### E2-05 HCM + Payroll VN

Target:
- H01–H05 trước;
- V03 statutory payroll;
- H06 talent sau core payroll.

Bắt buộc:
- effective-dated payroll rules;
- immutable used-rule evidence;
- deterministic PIT/BHXH formula schema;
- attendance/leave/OT source freeze;
- correction/rerun;
- payroll GL reconciliation.

Risk: **CRITICAL**.

### E2-06 Manufacturing + QMS

Target:
- M01–M04.
- Q01.

Flow RC:

`Demand -> BOM/Routing -> Plan/MRP -> Work Order -> Material -> Job Card -> FG/Scrap -> Cost/Variance -> Traceability -> Quality/Correction`

Ưu tiên đóng rework/subcontracting/costing/traceability thay vì thêm thêm màn hình quản lý.

**Wave 2 exit:** các flow ERP core được dùng thực tế theo end-to-end DoD, không chỉ “có module”.

## 7. Wave 3 — Enterprise depth

Sau khi ERP core đạt RC đủ để làm source cho các lớp phía trên.

### D3-01 Project + Service + Field Service

- J01 Project/PSA.
- S01 Helpdesk.
- S02 Field Service.

### D3-02 BI semantic + planning

- A01 semantic metric/dimension/measure.
- permission-aware query.
- drill-down/report/export.
- executive cockpit/forecast/scenario sau trusted semantic layer.

### D3-03 Integration Hub

- I01 foundation trước I02 provider breadth.
- queue/retry/DLQ/idempotency/audit phải RC trước khi thêm nhiều connector.

Provider priority theo demand thật:
1. e-invoice/tax/BHXH;
2. bank/payment;
3. shipping/e-sign;
4. email/SMS/Zalo/social;
5. marketplace/workspace connectors.

### D3-04 Digital workplace / DMS / contracts

- D01–D03.
- N01–N03.

Ưu tiên approval/search/notification/file/contract lifecycle có permission và retention trước các feature trang trí.

## 8. Wave 4 — Platform moat: App Factory + AI

### M4-01 App Factory RC

Target B01/B02:
- workflow/action/rule/form/list/report/dashboard/print/permission builders;
- app version/install/upgrade/rollback;
- preview/test/package export/import.

Rule: pattern lặp lại từ 2 app trở lên phải được đánh giá để nâng thành primitive generic.

### M4-02 Generic enterprise UI patterns

Matrix, bulk transaction, input-table, approval inbox, command/search, report/dashboard phải đi qua metadata contract; shared runtime không hard-code business doctype nếu metadata biểu diễn được.

### M4-03 AI deterministic tool path

Target A02:

`intent -> semantic/context -> permission -> deterministic tool -> preview -> approval -> authoritative write`

AI không trực tiếp ghi ledger/statutory state và không vượt quyền user.

## 9. Wave 5 — Alumdoor reference vertical 95%

Alumdoor không được dùng để vá core. Nó phải chứng minh Forge.

Target VP01:
- profile/dimension/barem;
- sales-to-production;
- material reservation/cutting;
- supplier delivery/debt/FIFO;
- catch-weight/physical stock;
- production completion;
- delivery/invoice/receivables;
- warranty/defect;
- daily detailed ledger/reconciliation;
- mobile sales/receivables/delivery.

### Alumdoor acceptance

1. Business flow chạy end-to-end trên generic authorities.
2. Không vertical fork shared runtime.
3. Desktop + mobile actor flows có evidence.
4. Stock/money reconciliation khớp.
5. Production exact release SHA + bundle marker verified.
6. Backup/restore/release evidence hiện hành.

**Wave 5 exit:** VP01 đạt 95% trong scope nghiệp vụ đã chọn và các primitive generic đã được phản hồi ngược vào Forge.

## 10. Thứ tự triển khai đề xuất

Không mở 18 nhánh chỉ để trông bận rộn. Mở theo dependency và khả năng tạo evidence.

### Batch A — bắt đầu ngay

1. `capability-status` — audit 956 IDs + evidence register.
2. `release-sre-cleanup` — workflow/release/backup/restore truth.
3. `validation-gates` — exact test/migration/permission/reconciliation lanes.
4. `finance-core-rc` — F01/F02/F03/F04 + period/reconciliation.
5. `inventory-core-rc` — W01 correction/repost/reconciliation.

### Batch B — sau khi Platform/Finance/Inventory contracts ổn

6. `procurement-rc`.
7. `crm-o2c-rc`.
8. `hcm-payroll-rc`.
9. `manufacturing-qms-rc`.
10. `mobile-offline-contract`.

### Batch C — enterprise depth

11. `project-service-rc`.
12. `bi-semantic-rc`.
13. `integration-hub-rc`.
14. `workplace-dms-rc`.
15. `app-factory-rc`.

### Batch D — moat + vertical proof

16. `ai-tooling-rc`.
17. `enterprise-ui-patterns`.
18. `alumdoor-reference-95`.
19. `production-hardening`.

## 11. Branch / PR convention cho giai đoạn mới

Mọi task mới tạo từ exact current `main`.

Gợi ý:

```text
audit/capability-status-<date>
fix/rc-<domain>-<slice>-<date>
feat/rc-<domain>-<slice>-<date>
ui/rc-<surface>-<slice>-<date>
ops/rc-<release-or-sre>-<date>
```

Không dùng branch lịch sử làm base chỉ vì nó đã có code gần giống.

## 12. Definition of Done cho một RC slice

Một slice chỉ được promote lên RC khi có đủ theo scope:

- business flow usable;
- authoritative source of truth rõ;
- server-side permission/tenant enforcement;
- validation/invariants;
- retry/idempotency nếu có distributed action;
- cancel/reversal/correction khi cần;
- audit/history;
- report/query để kiểm soát kết quả;
- targeted tests theo risk class;
- migration replay nếu có schema;
- reconciliation nếu finance/stock/payroll;
- browser/mobile evidence nếu có UI;
- không tạo duplicate authority;
- status/capability registry được cập nhật.

`Hardened` yêu cầu thêm production-grade failure handling, operational evidence, long-tail và production release proof trong scope công bố.

## 13. Báo cáo tiến độ chuẩn từ giai đoạn này

Mỗi lần review dùng format:

```text
Domain: <ID + tên>
Current maturity: <level>
Target maturity: <level>
Coverage: <x/y capability>
RC+: <x/y>
Hardened: <x/y>
Blocking gaps: <3-7 gap>
Dependencies: <IDs/domains>
Risk: <FAST/STANDARD/CRITICAL>
Next slice: <one vertical slice>
Evidence required: <list>
```

## 14. Quy tắc dừng

Chỉ dừng để hỏi khi:

1. cần quyết định nghiệp vụ không thể suy từ repo/tài liệu;
2. cần thay shared contract thuộc workstream khác và không thể tách dependency;
3. cần destructive/production operation;
4. cần merge/deploy non-UI.

Nếu chỉ bị block cục bộ: ghi Dependency Request và tiếp tục phần độc lập.

## 15. Kết luận thực thi

Giai đoạn tiếp theo của Forge là **RC Hardening Program**, không phải Feature Expansion Program.

Thứ tự chuẩn:

`Capability truth -> Platform/SRE RC -> ERP Core RC -> Enterprise Depth -> App Factory/AI moat -> Alumdoor 95% -> Hardened production proof`

Khi làm đúng thứ tự này, mỗi commit mới sẽ làm tăng enterprise completeness có đo được thay vì chỉ làm repository to hơn.