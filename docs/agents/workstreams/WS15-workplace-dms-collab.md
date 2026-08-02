# WS15 — Digital Workplace / DMS / Contract / Collaboration

Status: **CLAIMED**  
Owner: **GPT-5.6 Thinking / WS15**  
Branch: `agent/ent-15-workplace-dms-collab`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Previous seeded head before sync: `687fb0e49198ea3546b8836359175a8569d6c510`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Phủ lớp vận hành văn phòng thường bị ERP bỏ quên: task/meeting/request/announcement, document & contract lifecycle, collaboration, search và notification.

## Own

personal/team task, Kanban/calendar/meeting/minutes/internal request/news/approval inbox, DMS folders/version/OCR/full-text/retention/archive, contract lifecycle/renewal/amendment/obligation, comments/mentions/assign/follow/share/tags/checklists, search/favorites/recent, notification preference/template/delivery log domain.

## Phase A audit

Audit collaboration API hiện có và traceability Partial, file/R2, comments/assignment/share/tags, search/command palette, notification paths, website/portal overlaps and missing digital-office flows. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit plan

1. Map capability IDs cho collaboration, DMS/search, notification, contract lifecycle và workplace flows.
2. Trace exact server routes/packages, migrations, R2/file paths, permissions và tests trên current `main`.
3. Trace MetaForge collaboration/search/notification surfaces nhưng không sửa shared renderer thuộc WS14.
4. Audit open/recent legacy PR theo domain và ghi disposition bằng exact diff.
5. Chọn một vertical slice STANDARD độc lập khỏi shared hotspots để implement end-to-end, kèm permission/failure/audit evidence.

## Phase B priority

Collaboration completeness -> notification contract -> DMS/search -> contract lifecycle -> workplace task/meeting/request.

## Dependencies

WS14 shared UI, WS11 permission/privacy, WS10 external email/SMS/Zalo delivery, WS09 workflow/approval, WS00 contracts.

## Guard

DMS access phải permission-aware; search không leak record; retention/archive không phá audit/legal data.

## Legacy PR disposition

- Pending exact GitHub audit.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, document/access lifecycle, search/notification security, tests, legacy PR disposition, blockers, PR.
