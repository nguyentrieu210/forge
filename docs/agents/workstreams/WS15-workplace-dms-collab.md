# WS15 — Digital Workplace / DMS / Contract / Collaboration

Status: **ACTIVE**  
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

### Capability IDs

- Digital workplace: `D01-001`..`D01-016`; directly traced today: `D01-003` Kanban, `D01-011` Discussion, `D01-012` Approval inbox, assignment/team-work context around `D01-001/002`.
- DMS: `D02-001`..`D02-013`; file/R2 attachment path exists, but folder/version/OCR/retention/archive remain separate completeness work.
- Contract lifecycle: `D03-001`..`D03-013`; no legacy WS15 branch was found that can be adopted as the canonical CLM implementation.

### Current exact implementation trace

- `client/packages/adapter-frappe/src/frappe-adapter.ts` already calls comments, assign/unassign, upload, tags, shares, connections and permission-aware global search.
- `client/packages/views/src/container/ContextContainer.tsx` already wires those operations with user/site-scoped query keys. The old `client/docs/implementation-traceability.md` Partial/Todo notes for this area are stale.
- `server/packages/frappe-model/src/services.ts` persists comments, assignment history, shares, tags, viewers and search candidates.
- `server/packages/frappe-api/src/router.ts` re-checks document permission before share/assignment/tag/comment/search operations; global-search candidates are not treated as an authorization decision.
- `server/packages/frappe-api/src/desk-views.ts` provides private/user-scoped Kanban and recipient-scoped notification log/read state.
- `server/packages/frappe-model/src/notification-rules.ts` validates rule conditions at save time and records unsupported Email delivery as skipped instead of falsely claiming delivery.
- `server/packages/auth/src/user-store.ts` has tenant-scoped user/role lookup suitable for future mention/notification recipient resolution.
- `server/packages/frappe-model/src/permission.ts` exposes `canReadDocument`, so future mention/notification delivery can fail closed without inventing a second permission engine.

### First STANDARD slice — assignment lifecycle correctness

Finding: `removeAssignment()` intentionally keeps the assignment row and sets `status='Cancelled'` for audit, while `listTimeline()` previously returned all assignment rows. Because `getdoc` exposes `timeline.assignments` as the form's current `docinfo.assignments`, a successful remove followed by refetch could still show the cancelled assignee.

Implemented on this branch:

- `D1CollaborationService.listTimeline()` now selects only `status='Open'` assignment rows for current document context.
- Cancelled/closed rows are not deleted; history remains stored for audit/later history surfaces.
- Added `server/tests/ws15-collaboration-assignment-lifecycle.test.mjs` regression coverage that fails if the current-context SQL stops applying the Open lifecycle predicate.

Risk class: **STANDARD** — backend collaboration semantics, no schema migration and no shared WS14 renderer edit.

## Phase B priority

1. Collaboration completeness: active assignment semantics fixed; next audit duplicate assignment/assignee accessibility and discussion mentions.
2. Notification contract: user preference + template/delivery-log semantics, keeping external Email/SMS/Zalo transport in WS10.
3. DMS/search: folder/version/OCR/full-text/retention/archive and permission-aware retrieval.
4. Contract lifecycle: renewal/amendment/obligation/SLA/e-sign boundaries.
5. Workplace task/meeting/request/announcement flows.

## Dependencies

WS14 shared UI, WS11 permission/privacy, WS10 external email/SMS/Zalo delivery, WS09 workflow/approval, WS00 contracts.

## Guard

DMS access phải permission-aware; search không leak record; retention/archive không phá audit/legal data. Notification/mention recipients must be checked against effective document read permission before a document identifier or title can enter their inbox.

## Legacy PR disposition

- Search across collaboration/DMS/notification/share/assign/contract terms found no substantive legacy PR that owns a reusable canonical WS15 implementation.
- PR #153 is Wave-1 design/history, not current WS15 implementation: **superseded as implementation source; retain as historical context only**.
- Other hits were RBAC/HRM/metadata/shared-surface work outside WS15 ownership: **reject for wholesale reuse; inspect only when an exact dependency appears**.

## Verification / handoff

- Branch was reset to exact current baseline before claim; after claim it was `behind 0` and only WS15-owned commits ahead.
- Exact diff after first implementation slice: `services.ts` +4/-1 plus one focused 66-line regression test and this handoff document.
- No local test claim: repository clone/runtime was unavailable in this session, so GitHub PR CI is the executable verification authority for this slice.
- Do **not** merge or deploy without explicit approval because this changes backend collaboration behavior.
