# WS15 — Digital Workplace / DMS / Contract / Collaboration

Status: **READY FOR REVIEW / MERGE GATE**  
Owner: **GPT-5.6 Thinking / WS15**  
Branch: `agent/ent-15-workplace-dms-collab`  
PR: **#314**  
Product baseline: **Forge 0.2.0**  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Latest audited main: `b63c9a7a07e63dd73f944f450618c0b92f10067c`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Phủ lớp vận hành văn phòng thường bị ERP bỏ quên: task/meeting/request/announcement, document & contract lifecycle, collaboration, search và notification; tái sử dụng generic runtime, permission service, workflow, file/R2 và search thay vì dựng một frontend/domain kernel cạnh tranh.

## Owned implementation

### 1. Collaboration correctness

- `D1CollaborationService.listTimeline()` chỉ trả assignment `Open` cho `docinfo.assignments`; `Cancelled/Closed` vẫn nằm trong DB làm audit history.
- Migration `0049_ws15_collaboration_integrity.sql`:
  - assignee/share target phải là tenant-local active `System User` cho quan hệ đang hoạt động;
  - một user chỉ có một Open assignment trên cùng document;
  - partial unique index khóa race duplicate;
  - historical Cancelled/Closed assignment vẫn được giữ khi user sau đó bị disable;
  - no-op UPDATE preflight ép toàn bộ active assignment/share cũ đi qua guard mới, nên ghost/disabled/duplicate live state làm migration fail-closed thay vì được grandfather;
  - không tự ý hủy/chọn một duplicate để “sửa hộ” dữ liệu nghiệp vụ.
- Upstream Frappe `assign_to.py` được dùng làm behavior evidence: duplicate Open bị chặn và assignee cần quyền đọc. Forge hiện đã đóng duplicate/identity; auto-share/read-access cho assignee vẫn là gap riêng được ghi bên dưới.

### 2. Notification authorization + preference

`server/packages/frappe-api/src/notification-runner.ts` giờ coi rule là **routing**, không phải ACL:

1. rule match;
2. recipient phải là active System User;
3. recipient phải `canReadDocument()` bằng chính `MetadataPermissionService` đang bảo vệ document reads;
4. `Notification Preference` exact event hoặc `*` được áp dụng;
5. mới ghi `notification_log`.

Một notification không còn có thể làm rò subject + doctype + document name tới user không mở được document. Email transport chưa có vẫn bị ghi `skipped`, không giả delivery success. Preference lookup lỗi giữ default-on để không nuốt alert vận hành; document authorization lỗi luôn fail-closed.

### 3. First-party metadata app `workplace`

App-as-data, không có WS14 React riêng:

- roles: `Workplace User`, `Workplace Manager`, `Document Manager`, `Contract Manager`;
- generic experiences: `calendar:Workplace Task`, approval inbox cho Internal Request / Managed Document / Contract / Contract Amendment;
- reports: công việc theo trạng thái, danh sách hạn hợp đồng, nghĩa vụ hợp đồng;
- generic list/form/workflow/files/search/share runtime tiếp tục là authority.

#### Digital Workplace

- `Workplace Task`: personal/team scope, assignee, status, priority, dates, reminder/recurrence contract, work report/evidence.
- `Workplace Meeting`: calendar fields, organizer/participants, agenda, minutes, action summary.
- `Internal Request`: owner-scoped request + manager approval workflow; requester phải khớp canonical owner ở DB.
- `Workplace Announcement`: announcement/internal-news content with publish window; secure default manager/share only để Draft không lộ cho toàn tenant.

Owner-scoped DocPerm được tách thành hai row: doctype-level `create` + stored-record `read/write if_owner`; kernel kiểm create trước khi document có owner nên gộp hai quyền vào một `if_owner` row sẽ làm user không tạo được record.

#### DMS

- `Document Folder`: hierarchical folder contract (`parent_document_folder`).
- `Managed Document`: metadata, current file, effective/expiry, retention, approval, OCR/e-sign evidence seams.
- `Document Template`.
- `Retention Policy` with legal hold / archive-retention bounds.
- Direct DMS read chỉ Document Manager/System Manager; ordinary users dùng exact document share. Không có tenant-wide broad read.

#### Contract Lifecycle Management

Một `Contract` unified schema với `contract_type = Customer | Supplier | Employee | Service`, tránh bốn lifecycle copy-paste:

- effective/end date;
- renewal flags/notice/status;
- terms/SLA/value/currency;
- source/signed file + signature evidence seams;
- four-eyes approval (`allow_self_approval=false`).

Thêm `Contract Obligation` và `Contract Amendment`; obligation owner phải active System User; amendment chỉ được trỏ tới active submitted Contract.

### 4. Domain/storage integrity

Forward-only migrations:

- `0049_ws15_collaboration_integrity.sql`
- `0050_ws15_workplace_domain_integrity.sql`
- `0051_ws15_workplace_update_integrity.sql`
- `0052_ws15_workplace_actor_integrity.sql`

Guards bao gồm:

- meeting/task/announcement temporal ordering;
- retention/archive bounds;
- document effective/expiry ordering;
- contract effective/end, non-negative value/renewal notice, no self-parent;
- obligation/amendment tenant-local contract references;
- active assignee/obligation owner identities;
- internal-request requester == document owner;
- notification-preference user == document owner + active user;
- one active preference per `(tenant,user,event)`.

Known parallel migration reservations audited: WS06 owns `0043-0047`, WS01 owns `0048`; no main/open-PR evidence found reserving `0049-0052` at implementation time. Exact migration ordering must be rechecked at merge gate because parallel streams continue moving.

## Capability maturity

### D01 — Digital Workplace

| ID | Capability | Maturity / evidence |
|---|---|---|
| D01-001 | Personal task | **Wired** — Task metadata, owner permissions, date guards |
| D01-002 | Team task | **Foundation** — scope/assignee/team + share; team-membership auto-grant not implemented |
| D01-003 | Kanban | **Existing Wired** — generic per-user/private Kanban service; no WS15-specific board hardcode |
| D01-004 | Calendar | **Wired** — canonical `calendar:Workplace Task` generic experience |
| D01-005 | Meeting | **Wired** — meeting metadata + date guards |
| D01-006 | Meeting minutes | **Wired** — minutes/action summary on Meeting |
| D01-007 | Internal request | **Wired/Hardened boundary** — owner guard + workflow + no self approval |
| D01-008 | Announcement | **Foundation** — secure manager/share model; audience-wide publish projection pending |
| D01-009 | Internal news | **Foundation** — same publication model as Announcement |
| D01-010 | Employee directory | **Dependency** — privacy-aware HR projection required, no broad Employee read added |
| D01-011 | Discussion | **Existing Wired** — comments/context panel |
| D01-012 | Approval inbox | **Existing Wired** + WS15 workflows |
| D01-013 | Reminder | **Foundation** — data contract only; scheduler pending |
| D01-014 | Delegation | **Existing Wired** — organization-security delegation used by approval inbox |
| D01-015 | Recurring work | **Foundation** — recurrence contract only; scheduler/Auto Repeat integration pending |
| D01-016 | Work report | **Wired** — report/evidence fields on Task |

### D02 — Document Management

| ID | Capability | Maturity / evidence |
|---|---|---|
| D02-001 | File manager | **Existing/Wired foundation** — R2/file upload/download + Managed Document Attach |
| D02-002 | Folder | **Foundation** — hierarchical Document Folder contract; dedicated tree UX not claimed |
| D02-003 | Document metadata | **Wired** |
| D02-004 | Document version | **Existing/Wired foundation** — kernel versions + file references; dedicated DMS revision UX pending |
| D02-005 | OCR | **Dependency/Foundation** — read-only OCR evidence seam, no generic OCR worker yet |
| D02-006 | Full-text search | **Wired metadata/search** — permission-rechecked global search; extracted body text depends on OCR |
| D02-007 | Document permission | **Hardened boundary** — manager direct, exact share, permission-aware search/notification |
| D02-008 | Document approval | **Wired** — four-eyes workflow |
| D02-009 | Document template | **Foundation** — template registry/file; template-instantiation action pending |
| D02-010 | Retention policy | **Foundation+integrity** — policy + bounds; enforcement scheduler pending |
| D02-011 | Archive | **Foundation** — archive policy/date; scheduled archival pending |
| D02-012 | Document expiry | **Foundation+integrity** — expiry date guarded; scheduled alert/action pending |
| D02-013 | Digital signature | **Dependency/Foundation** — evidence fields only, provider pending |

### D03 — Contract Lifecycle Management

| ID | Capability | Maturity / evidence |
|---|---|---|
| D03-001..004 | Customer/Supplier/Employee/Service Contract | **Wired** — unified `contract_type` |
| D03-005 | Effective date | **Wired+guarded** |
| D03-006 | Expiry date | **Wired+guarded**, scheduled alert pending |
| D03-007 | Renewal | **Foundation** — auto-renew/notice/status + report, scheduler pending |
| D03-008 | Terms | **Wired** |
| D03-009 | Obligation | **Wired+guarded** |
| D03-010 | SLA | **Foundation** — SLA terms stored, active SLA monitor pending |
| D03-011 | Contract value | **Wired+guarded** |
| D03-012 | Amendment | **Wired+guarded** — active-contract reference + approval |
| D03-013 | E-signature | **Dependency/Foundation** — provider/evidence transport pending |

No row above is promoted to Hardened merely vì một field tồn tại.

## Security decisions

- Global search remains candidate-only; every hit is re-read through permission authority.
- Notification rules never grant document access.
- DMS/Contract ordinary access is explicit-share, not tenant-wide read.
- Draft Announcement is not exposed to ordinary Workplace User because current Role Policy row rules only constrain Link dimensions and cannot safely express `status=Published` for a Data/Select field.
- Notification Preference is self-owned; manager cannot silently mute another user's alert.
- Four-eyes approval stays `allow_self_approval=false` for request/document/contract/amendment.
- CSV/export/print permissions remain separate existing server gates.

## Dependency Requests

### DR-WS15-01 -> WS12 — central verification gate

WS15 intentionally reverted its `server/package.json` edit after confirming PR #320 owns that shared hotspot. Please add after WS15 lands:

- `python3 scripts/test-ws15-collaboration-integrity.py` to `test:sql`;
- `python3 scripts/test-ws15-workplace-domain.py` to `test:sql`;
- `node scripts/pack-app.mjs apps-src/workplace --check` to `app:check`.

WS15 regression files themselves are complete and independent.

### DR-WS15-02 -> WS00 / WS12 — scheduled domain job registration

Reminder, recurring work, document expiry/retention/archive, contract expiry/renewal and obligation-overdue transitions need one shared periodic-maintenance registration seam. WS00 currently changes tenant-worker coordination and WS12 owns jobs/release safety, so WS15 does not add another scheduler path in `tenant-worker/index-core.ts`.

### DR-WS15-03 -> WS08 — generic permission-safe OCR/extraction

Need a generic document OCR/extraction contract that consumes permission-authorized file content and returns bounded evidence (`text`, confidence/source/model/version), not the current receipt-specific AI path. WS15 already owns DMS fields/status; it must not create a second AI provider stack.

### DR-WS15-04 -> WS10 / WS11 — external delivery + e-sign provider

- email/SMS/Zalo/external notification transport belongs to Integration Hub;
- e-sign provider callback/signing credential needs integration delivery + secret/vault lifecycle;
- WS15 stores only domain/evidence state and keeps unsupported Email truthfully skipped.

### DR-WS15-05 -> WS06 / WS11 — privacy-aware employee directory

D01-010 must consume a safe Employee directory projection. WS15 will not grant broad read to HR Employee records merely to produce an address book.

## Remaining owned gap, not hidden as dependency

`frappe.desk.form.assign_to.add` still validates writer permission but does not yet reproduce upstream Frappe's complete assignee-access behavior: an assignee with no direct/share read can be assigned a document they cannot open. Storage now prevents ghost/disabled/duplicate assignees, so this is a **functional access gap, not a silent identity/data-integrity gap**. Do not auto-share in SQL because that would bypass Forge's explicit `share` permission boundary. A later WS15 router slice must either preflight recipient `canReadDocument` or grant read only through an authorized share operation.

## Legacy PR disposition

- No substantive legacy PR owns a canonical reusable WS15 implementation.
- PR #153: **SUPERSEDED as implementation source**, retain only as Wave-1 historical design context.
- RBAC/HRM/metadata/shared-renderer PRs: **REJECT wholesale reuse**, consume only exact dependency evidence from their owning stream.

## Verification

Authored regressions:

- `server/tests/ws15-collaboration-assignment-lifecycle.test.mjs`
- `server/tests/ws15-notification-delivery.test.mjs`
- `server/tests/ws15-workplace-metadata.test.mjs`
- `server/scripts/test-ws15-collaboration-integrity.py`
- `server/scripts/test-ws15-workplace-domain.py`

Execution evidence:

- latest 0049 collaboration migration semantics, including legacy duplicate/ghost/share preflight: **ISOLATED SQLITE PASS** (`WS15_COLLABORATION_INTEGRITY_LATEST_ISOLATED_PASS`);
- latest 0050-0052 workplace/DMS/CLM temporal/reference/owner/preference semantics: **ISOLATED SQLITE PASS** (`WS15_WORKPLACE_DOMAIN_0050_0052_ISOLATED_PASS`);
- exact repository checkout: **NOT AVAILABLE**; shell `git ls-remote https://github.com/nguyentrieu210/Forge.git HEAD` failed `Could not resolve host: github.com`;
- full `npm test` / TypeScript build / Worker tests: **NOT RUN**;
- exact `pack-app apps-src/workplace --check`: **NOT RUN**;
- GitHub development status checks: none observed on the WS15 head under the current build/deploy-oriented Actions policy.

Missing checkout/CI is recorded as `NOT RUN`, not used as a reason to stop independent implementation.

## Main drift / ownership audit

Latest audited `main@b63c9a7` is 11 commits ahead of WS15's merge-base. Every intervening commit found in the exact commit list is WS14 frontend/PWA/mobile/docs; none overlaps the 30 WS15-owned diff files. `server/package.json` was deliberately removed from the WS15 diff after PR #320 confirmed WS12 ownership of that shared release/test hotspot.

Exact-main re-sync and migration-number collision check remain mandatory immediately before merge because parallel backend PRs are still active.

## Release gate

Current scope includes forward D1 migrations and notification authorization semantics, so release risk is **CRITICAL** even though no production operation has been executed.

- production migration: **NOT RUN**;
- customer-data mutation: **NONE**;
- secret/DNS change: **NONE**;
- merge: **NOT DONE**;
- deploy: **NOT DONE**.

PR #314 is a checkpoint, not an implementation stop. Independent WS15 work for the current DoD is complete; the next prohibited operation is merge/deploy of this non-UI change and therefore requires explicit approval.
