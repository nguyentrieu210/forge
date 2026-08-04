# RC4-A16 — Workplace / DMS / Collaboration

Status: **IMPLEMENTATION IN PROGRESS — SHARED MAINTENANCE WIRING PENDING**  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Branch: `agent/rc4-16-workplace-dms-collab`  
Risk: **STANDARD backend**

## Mission

Close digital-workplace, DMS/CLM, collaboration, enterprise-search and notification residuals with reusable platform patterns rather than one-off screens.

Required sources audited: enterprise completion skill, `CURRENT_STATUS.md`, `NEXT_TASKS.md`, North Star, capability map/status, WS15 workstream and WS15 final handoff.

## Exact-state findings

WS15 is already present in the current RC4 baseline. The existing implementation already owns:

- permission-safe assignment/share and collaboration timeline;
- permission-rechecked global search candidates;
- in-app notification rules + per-user preferences;
- first-party metadata app `workplace`;
- DMS/CLM lifecycle and storage-integrity guards;
- generic `Auto Repeat` runner;
- the shared tenant `runMaintenance()` seam driven by the jobs Worker.

Therefore A16 does **not** rebuild auth, search, events, app runtime, notification storage or a second scheduler.

The capability registry still shows the real residuals:

- `D01-013` Reminder — Foundation;
- `D01-015` Recurring work — Foundation;
- `D02-012` Document expiry — Foundation;
- `D03-006` Contract expiry — Wired but scheduled alert residual remains;
- `D03-007` Renewal — Foundation;
- `N02-008` Scheduled reminder — Foundation;
- OCR/e-sign/external channel/employee-directory/search-depth residuals remain shared-provider/platform dependencies.

## A16 implementation

### Permission-safe scheduled workplace alert engine

Added `server/packages/frappe-api/src/workplace-maintenance.ts` and exported it from `frappe-api`.

It provides a bounded runner for the **existing** maintenance scheduler and handles:

1. `Workplace Task.reminder_at`;
2. `Managed Document.expiry_date`;
3. Contract renewal notice derived from `end_date - renewal_notice_days`;
4. Contract end-date alert;
5. due/overdue `Contract Obligation`.

Security/integrity properties:

- owner/assignee/obligation-owner/read-share are only candidate recipients;
- every recipient must still be an active tenant-local `System User`;
- every recipient is re-read through the canonical `MetadataPermissionService.canReadDocument()` before document title/name is delivered;
- `Notification Preference` exact event overrides wildcard `*`; muted or disabled in-app alerts are skipped;
- deterministic event/notification IDs make repeated maintenance sweeps idempotent through the existing `notification_log` uniqueness boundary;
- malformed/stale individual recipients fail independently instead of suppressing other authorized recipients;
- external email/SMS/Zalo/push are not faked as delivered.

Stable preference event keys:

- `workplace.task.reminder`
- `workplace.document.expiry`
- `workplace.contract.renewal`
- `workplace.contract.expiry`
- `workplace.contract.obligation_due`

### Focused regression gate

Added:

- `server/tests/rc4-a16-workplace-maintenance.test.mjs`
- `.github/workflows/rc4-a16-validation.yml`

The PR gate checks:

- focused TypeScript for the A16 path and canonical permission/auth dependencies;
- `apps-src/workplace --check`;
- A16 due-date/reminder decisions;
- existing WS15 notification authorization;
- assignment access;
- collaboration assignment lifecycle;
- workplace metadata regression.

## Capability truth after this commit

No maturity is promoted yet merely because the engine exists.

- `D01-013` / `N02-008`: **Foundation+** — runnable engine exists, but shared maintenance registration is still pending.
- `D02-012`: **Foundation+** — scheduled expiry engine exists, registration pending.
- `D03-006`: remains **Wired** — expiry lifecycle existed; scheduled alert is implemented but not registered yet.
- `D03-007`: **Foundation+** — renewal notice decision and alert engine exist; renewal transaction itself is not invented.
- `D01-015`: remains **Foundation** — existing task recurrence fields must be reconciled with canonical Auto Repeat rather than creating a second recurrence engine.

## Dependency Requests

### DR-RC4-A16-01 -> RC4 A2 / shared maintenance owner

`server/apps/tenant-worker/src/index-core.ts` is the shared scheduler orchestration contract and is being treated as an owned shared hotspot, not an A16-local file.

Wire `runWorkplaceScheduledNotifications(env.DB, tenantId, now)` into the existing `runMaintenance()` path and expose its result in the maintenance response/health evidence. Do not add another cron, queue or scheduler.

A16 deliberately leaves this as a one-seam integration request instead of editing the shared orchestration contract in parallel.

### DR-RC4-A16-02 -> RC4 A7 / App Factory + Auto Repeat owner

`Workplace Task.recurrence` currently stores `Không/Hàng ngày/Hàng tuần/Hàng tháng`, while platform `Auto Repeat` owns persisted schedules and canonical scheduled creation.

Need one canonical adapter that:

- maps workplace recurrence to `Daily/Weekly/Monthly` Auto Repeat;
- creates/stops the schedule through the platform-owned Auto Repeat contract;
- resets task lifecycle fields on the generated occurrence instead of blindly copying `Done`, work report/evidence or stale dates;
- preserves owner permission and normal command validation.

A16 will not write directly into `auto_repeat` or create a competing recurrence scheduler.

### Existing cross-workstream dependencies retained

- RC4 A8 / Integration Hub: OCR/extraction provider, e-sign provider, email/SMS/Zalo/push transport.
- RC4 A1 + HR/privacy owner: privacy-safe employee-directory projection for `D01-010`.
- Shared search/platform owner: true FTS/fuzzy/AI search residuals; A16 will not fork the current permission-aware `D1SearchStore`.
- Shared frontend runtime A6: any dedicated folder tree / published-announcement audience UX must reuse generic experiences and permission semantics.

## Verification state

- Source audit against exact branch: **DONE**.
- Focused regression + workflow authored: **DONE**.
- GitHub Actions exact PR-head run: **PENDING PR**.
- Full server build/test: **NOT CLAIMED**.
- Production migration: **NONE**.
- Customer-data mutation: **NONE**.
- Secret/DNS change: **NONE**.
- Merge/deploy: **NOT DONE**.

This branch contains backend behavior. Per project policy, after verification it must stop before merge/deploy until the user explicitly approves.
