# FORGE ENTERPRISE AGENT BOARD

> Canonical location: `main/docs/agents/AGENT_BOARD.md`  
> Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**  
> North Star: `docs/FORGE_ENTERPRISE_NORTH_STAR.md`  
> Capability map: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`

Ngày sync: **2026-08-03**.

## Current board state

**IDLE / PHASE CLOSED.**

- WS00–WS17 convergence đã hoàn tất ở repository level.
- GitHub hiện có **0 open PR** sau repo reset ngày 2026-08-03.
- Không branch nào trong bảng dưới đây được coi là task đang chạy chỉ vì branch còn tồn tại.
- Các branch `agent/ent-*` là historical ownership/reference branches.
- Khi user mở việc mới, coordinator/agent phải đọc exact current `main` và tạo branch/PR mới phù hợp với task đó, trừ khi user yêu cầu reuse một branch lịch sử cụ thể.

`Exact GitHub state > current docs > historical handoff.`

## Status vocabulary

- `IDLE`: không có task active; branch chỉ là history/reference.
- `ACTIVE`: chỉ dùng khi một task mới đã được mở rõ và đang triển khai.
- `BLOCKED`: task mới đang chạy nhưng chờ dependency thực sự.
- `REVIEW`: task mới có PR đang review.
- `DONE`: task/phase đã merge hoặc được user xác nhận đóng theo scope.
- `SUPERSEDED`: implementation bị thay thế.

## Ownership map

| ID | Historical branch | Current status | Primary ownership |
|---|---|---|---|
| WS00 | `agent/ent-00-architecture-kernel` | IDLE | platform architecture, contracts, kernel/data model |
| WS01 | `agent/ent-01-finance-vn` | IDLE | finance, AR/AP, treasury, VN accounting/statutory |
| WS02 | `agent/ent-02-crm-revenue` | IDLE | CRM 360, revenue ops, sales lifecycle |
| WS03 | `agent/ent-03-procurement` | IDLE | source-to-pay, supplier, RFQ, 3-way match |
| WS04 | `agent/ent-04-inventory-wms` | IDLE | inventory valuation, WMS, reconciliation |
| WS05 | `agent/ent-05-manufacturing-qms` | IDLE | MRP II, manufacturing costing, QMS |
| WS06 | `agent/ent-06-hcm-payroll` | IDLE | HCM, payroll, statutory payroll rules |
| WS07 | `agent/ent-07-project-service-field` | IDLE | project/PSA, helpdesk, field service, warranty |
| WS08 | `agent/ent-08-bi-semantic-ai` | IDLE | semantic metrics, BI, planning, permission-aware AI |
| WS09 | `agent/ent-09-bpm-app-factory` | IDLE | workflow/BPM, metadata compiler, App Factory |
| WS10 | `agent/ent-10-integration-hub` | IDLE | API/event/connectors, queues, retry/DLQ |
| WS11 | `agent/ent-11-security-iam-saas` | IDLE | auth/IAM/permission, SaaS governance |
| WS12 | `agent/ent-12-sre-release-data-safety` | IDLE | observability, backup/DR, release/migration safety |
| WS13 | `agent/ent-13-migration-implementation` | IDLE | import/migration/onboarding/reconciliation tooling |
| WS14 | `agent/ent-14-frontend-runtime-mobile` | IDLE | MetaForge runtime, mobile/offline/a11y/performance |
| WS15 | `agent/ent-15-workplace-dms-collab` | IDLE | workplace, DMS/CLM, collaboration/search/notifications |
| WS16 | `agent/ent-16-logistics-pos-commerce` | IDLE | logistics, POS, retail, omnichannel/social commerce |
| WS17 | `agent/ent-17-alumdoor-reference-vertical` | IDLE | Alumdoor reference vertical and generic extraction |

## New-task rule

Một workstream chỉ chuyển từ `IDLE` sang `ACTIVE` khi có yêu cầu mới rõ ràng. Khi đó:

1. đọc Skill/North Star/Capability Map nếu liên quan;
2. audit exact current `main`;
3. audit branch/PR lịch sử trong scope chỉ như nguồn tham khảo;
4. tạo branch mới từ current main;
5. ghi dependency request nếu thật sự cần shared contract thuộc owner khác;
6. không tự phục hồi backlog/PR cũ chỉ vì tài liệu lịch sử từng ghi `READY`, `ACTIVE` hoặc `KEEP`.

## Shared ownership boundaries

- `server/packages/document-kernel/**`: WS00.
- auth/session/permission/control-plane security: WS11.
- app-registry/compiler/builder contracts: WS09.
- release/deploy/backup/observability: WS12.
- shared React runtime/core/views/shell: WS14.
- generic ledger primitive: WS00 + WS01.
- migrations: append-only; kiểm exact current main trước khi chọn số mới.
- Alumdoor generated metadata: sửa generator/source trước, không patch generated output đơn lẻ.

## Historical references

- Phase convergence: `docs/agents/WS00_17_CONVERGENCE_20260803.md`.
- Closed legacy PR archive: `docs/agents/LEGACY_PR_INBOX.md`.
- Current repo state: `CURRENT_STATUS.md`.
- Active backlog: `NEXT_TASKS.md` (hiện không có task active).
