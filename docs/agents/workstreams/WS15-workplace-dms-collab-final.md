# WS15 — Final autonomous handoff

Status: **DEFINITION OF DONE REACHED — MERGE/DEPLOY GATE**  
Branch: `agent/ent-15-workplace-dms-collab`  
PR: **#314 (draft)**  
Risk: **CRITICAL backend**  
Latest audited main: `7bf50efbc891e6cfe5f1a302e059c49c6e82a893`

## Delivered

### Collaboration

- Current document context returns only Open assignments; Closed/Cancelled remain audit history.
- Migration `0049` enforces tenant-local active System User targets for active assignments/shares, one Open assignment per user/document, race-safe unique index and fail-closed legacy preflight.
- Assignment access now uses the same `MetadataPermissionService` as document reads.
- If the assignee cannot read the document, the assigner must independently hold `share`; a narrow Read share and assignment are committed atomically in one D1 batch.
- Existing write/share grants are preserved; assignment never downgrades access.

### Notification

- Rule matching is routing, not ACL.
- Recipient must be active System User and pass `canReadDocument()` before subject/document identity reaches the inbox.
- Per-user `Notification Preference` supports exact-event override and wildcard `*` default.
- Unsupported Email remains truthfully skipped; no fake external delivery success.

### Digital Workplace app

First-party metadata app `apps-src/workplace` reuses generic Forge runtime rather than adding a bespoke WS14 frontend.

- Personal/team Task + calendar experience.
- Meeting + minutes/action summary.
- Internal Request + four-eyes approval.
- Announcement/internal-news authoring with secure manager/share default.
- Notification Preference.
- Owner-scoped create/read/write semantics are split correctly for the kernel: doctype-level create row plus stored-record `if_owner` row.
- Task/Meeting owners may share their own records for teammate/attendee access; Internal Request owners may not broadcast requests.
- Requester and Meeting organizer are storage-bound to canonical authenticated owner.

### DMS

- Hierarchical Document Folder contract.
- Managed Document metadata/file/effective-expiry/approval/retention/OCR/e-sign evidence seams.
- Document Template and Retention Policy.
- Direct DMS read is Document Manager/System Manager; ordinary access is explicit document share.
- OCR lifecycle/status/output are system-owned.
- Digital-signature status/reference/signer/time are system-owned.

### Contract lifecycle

- Unified `Contract` with `contract_type = Customer | Supplier | Employee | Service`.
- Effective/end date, renewal fields, terms, SLA, value/currency, source/signed file.
- Contract Obligation and Contract Amendment.
- Four-eyes approval; self approval disabled.
- Signature status is system-owned and defaults to `Not Required` until a signing flow provides evidence.

### Storage integrity

Forward-only migrations:

- `0049_ws15_collaboration_integrity.sql`
- `0050_ws15_workplace_domain_integrity.sql`
- `0051_ws15_workplace_update_integrity.sql`
- `0052_ws15_workplace_actor_integrity.sql`
- `0053_ws15_evidence_state_integrity.sql`

They guard identity, duplicate active relationships, temporal ordering, retention/archive bounds, contract references/value/dates, owner impersonation, notification preference ownership, active assignees/obligation owners, and evidence-backed OCR/signature states.

`0053` specifically refuses:
- OCR `Ready` without extracted text;
- Managed Document `Signed` without provider reference + signer + timestamp;
- Contract `Signed` without signed file or provider reference.

### Regression/gates

Authored tests:

- `tests/ws15-collaboration-assignment-lifecycle.test.mjs`
- `tests/ws15-assignment-access.test.mjs`
- `tests/ws15-notification-delivery.test.mjs`
- `tests/ws15-workplace-metadata.test.mjs`
- `scripts/test-ws15-collaboration-integrity.py`
- `scripts/test-ws15-workplace-domain.py`
- `scripts/test-ws15-evidence-state.py`

Central `server/package.json` is based on post-WS10/post-WS12 main and now includes:
- all three WS15 Python migration regressions in `test:sql`;
- `apps-src/workplace --check` in `app:check`.

## Execution evidence

- `0049` latest collaboration semantics, including legacy duplicate/ghost/share preflight: **ISOLATED SQLITE PASS**.
- `0050`–`0052` core workplace/DMS/CLM semantics: **prior full isolated PASS**; later Meeting organizer impersonation/disabled-owner delta separately **ISOLATED SQLITE PASS**.
- `0053` OCR/signature evidence semantics: **ISOLATED SQLITE PASS**.
- Exact repository checkout from shell: **NOT AVAILABLE** (`github.com` DNS resolution failure).
- Full `npm test`, TypeScript build, Worker tests and exact app pack execution in this environment: **NOT RUN**.
- GitHub PR head: no status checks/workflow runs observed; 0 submitted reviews; 0 review threads.

No missing CI result is treated as success.

## Capability boundary / dependencies

Independent WS15 work is complete. Remaining capabilities require shared services owned elsewhere:

1. **WS00 / release-maintenance seam**: periodic jobs for reminders, recurring work, document expiry/retention/archive, contract expiry/renewal and overdue obligations.
2. **WS08**: generic permission-safe OCR/extraction engine. WS15 owns evidence/state contract, not a second AI provider stack.
3. **WS10 / WS11**: physical external delivery and e-sign provider + credential/vault lifecycle. Integration Hub foundation exists; production transport is not claimed.
4. **WS06 / WS11**: privacy-safe Employee directory projection. WS15 intentionally does not grant broad Employee access.
5. Published Announcement audience projection remains secure-default manager/share until a row-safe published feed/projection exists; Draft is never exposed merely to make the feature appear complete.

## Final merge-readiness audit

At latest audit:

- `main@7bf50efbc891e6cfe5f1a302e059c49c6e82a893` includes WS00 kernel, WS10 Integration Hub and WS12 release gates.
- no migration filename collision found for `0049`–`0053` on main;
- PR #314 reports mergeable according to GitHub;
- branch still contains historical divergence from parallel workstreams, so exact-main/migration collision must be rechecked immediately before merge;
- no production migration, customer-data mutation, secret/DNS operation, merge or deploy has been performed.

## Gate

Implementation may continue through ordinary technical work without approval, and that work is now exhausted. The next operation is **merge/deploy of a non-UI CRITICAL change**, which is explicitly gated by project policy and requires user approval.
