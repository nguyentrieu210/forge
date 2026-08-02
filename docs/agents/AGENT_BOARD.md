# FORGE ENTERPRISE PARALLEL AGENT BOARD

> Canonical coordination branch: `coord/enterprise-parallel-20260803`
>
> Base snapshot: `main@b15378be7c036204f92a6e4c289038aa84d6f286`
>
> North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
> Skill: `skills/forge-enterprise-completion/SKILL.md`
> Capability map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`

## Status vocabulary

- `READY`: branch exists, chưa có agent nhận.
- `CLAIMED`: agent đã nhận và phải ghi alias + commit đầu tiên trong workstream file của nhánh.
- `ACTIVE`: audit/implementation đang chạy.
- `BLOCKED`: chờ contract/branch khác.
- `REVIEW`: đã có PR hoặc handoff đủ review.
- `DONE`: merged + evidence đã cập nhật.
- `SUPERSEDED`: bỏ vì scope chuyển sang nhánh khác.

## Ownership rule

Worker agent **không sửa file của workstream khác** chỉ để đi nhanh. Nếu cần primitive/shared contract thuộc nhánh khác, ghi `Dependency request` trong workstream file của mình và báo coordinator. Shared hotspot chỉ có một owner tại một thời điểm.

Worker agent không sửa trực tiếp file board này. Coordinator cập nhật board bằng exact GitHub state để tránh 18 con agent cùng tranh một file Markdown, vì apparently distributed systems cần được phát minh lại ngay trong Git.

## Workstreams

| ID | Branch | Status | Owner | Risk | Primary ownership | Depends on |
|---|---|---|---|---|---|---|
| WS00 | `agent/ent-00-architecture-kernel` | READY | — | CRITICAL | platform architecture, contracts, kernel/data model, tech-stack/perf/cost audit | — |
| WS01 | `agent/ent-01-finance-vn` | READY | — | CRITICAL | finance, AR/AP, treasury, VN accounting/statutory | WS00, WS11 |
| WS02 | `agent/ent-02-crm-revenue` | READY | — | STANDARD | CRM 360, revenue ops, sales lifecycle beyond existing O2C | WS00, WS09 |
| WS03 | `agent/ent-03-procurement` | READY | — | STANDARD/CRITICAL | source-to-pay, supplier, RFQ, 3-way match | WS00, WS01 |
| WS04 | `agent/ent-04-inventory-wms` | READY | — | CRITICAL | inventory valuation, stock correction/repost, WMS | WS00, WS01 |
| WS05 | `agent/ent-05-manufacturing-qms` | READY | — | CRITICAL | MRP II, manufacturing costing, QMS | WS00, WS04 |
| WS06 | `agent/ent-06-hcm-payroll` | READY | — | CRITICAL | HCM depth, payroll VN statutory evaluator | WS00, WS01, WS11 |
| WS07 | `agent/ent-07-project-service-field` | READY | — | STANDARD | project/PSA, helpdesk, field service, warranty/service | WS00, WS14 |
| WS08 | `agent/ent-08-bi-semantic-ai` | READY | — | STANDARD/CRITICAL | semantic metrics, BI, planning, permission-aware AI data access | WS00, WS11 |
| WS09 | `agent/ent-09-bpm-app-factory` | READY | — | CRITICAL | workflow/BPM, metadata compiler, App Factory/builders | WS00, WS11 |
| WS10 | `agent/ent-10-integration-hub` | READY | — | CRITICAL | API/event/connector SDK, queues, retry/DLQ, ecosystem seams | WS00, WS11, WS12 |
| WS11 | `agent/ent-11-security-iam-saas` | READY | — | CRITICAL | auth/IAM/permission, SSO/MFA, governance, SaaS control plane | WS00 |
| WS12 | `agent/ent-12-sre-release-data-safety` | READY | — | CRITICAL | observability, backup/PITR/DR, release/rollback, migration safety, cost/perf | WS00 |
| WS13 | `agent/ent-13-migration-implementation` | READY | — | CRITICAL | import/migration adapters, onboarding, reconciliation, implementation tooling | WS00, domain branches |
| WS14 | `agent/ent-14-frontend-runtime-mobile` | READY | — | STANDARD | MetaForge runtime, UX architecture, mobile/offline/a11y/performance | WS00, WS09, WS11 |
| WS15 | `agent/ent-15-workplace-dms-collab` | READY | — | STANDARD | digital workplace, DMS/CLM, collaboration/search/notifications | WS00, WS14 |
| WS16 | `agent/ent-16-logistics-pos-commerce` | READY | — | STANDARD/CRITICAL | logistics, POS, retail, omnichannel/social commerce | WS00, WS04, WS01 |
| WS17 | `agent/ent-17-alumdoor-reference-vertical` | READY | — | STANDARD/CRITICAL | Alumdoor as reference vertical, extract generic primitives, keep vertical clean | WS01, WS03, WS04, WS05, WS09 |

## Parallel execution phases

### Phase A — 360° audit, bắt đầu ngay trên tất cả nhánh

Mỗi agent phải:
1. đọc Skill/North Star/Capability Map;
2. audit exact code + migrations + tests trong scope;
3. map capability IDs -> maturity + evidence;
4. ghi architecture/gap/contract proposal trong workstream file;
5. không tự phong `Hardened` nếu thiếu evidence.

Phase A được chạy đồng thời toàn bộ 18 nhánh.

### Phase B — implementation độc lập

Agent có thể code ngay trong vùng ownership riêng nếu không đổi shared contract. Nếu cần đổi shared contract, dependency phải được WS00/WS09/WS11 hoặc owner tương ứng chốt trước.

### Phase C — integration order

Ưu tiên merge theo dependency, không theo ai code xong trước:
1. WS00, WS11, WS12.
2. WS09, WS10, WS14.
3. WS01, WS03, WS04, WS06.
4. WS02, WS05, WS07, WS08, WS13, WS15, WS16.
5. WS17 sau khi các primitive generic mà Alumdoor cần đã ổn định.

Đây là default. Một PR độc lập không đụng shared contract có thể merge sớm hơn sau review.

## Hotspots cần tránh conflict

- `server/packages/document-kernel/**`: WS00.
- auth/session/permission/control-plane security: WS11.
- `server/packages/app-registry/**`, compiler/builder contracts: WS09.
- release/deploy/backup/observability scripts: WS12.
- shared React runtime/core/views/shell design architecture: WS14.
- generic ledger primitive thay đổi: WS00 + WS01 phải thống nhất trước.
- migrations: mỗi domain dùng migration mới, không sửa migration đã chạy; trước khi tạo số mới phải kiểm exact `main`.
- generated Alumdoor brief: sửa generator trước, không patch JSON sinh tự động một mình.

## Coordinator update format

Mỗi lần sync board, coordinator ghi cho stream thay đổi:

`status | owner | branch head | PR | blockers | dependency requests | last evidence`

Board không phải live truth nếu chưa sync. Exact branch/PR/code trên GitHub luôn thắng board stale.