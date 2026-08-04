# R5-05 / R5-A5 — Dependency Requests

Date: **2026-08-04**  
Execution baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`  
Lane: Integration + BI + Workplace + Logistics

## DR-R5-A5-01 — Register Workplace alerts in canonical tenant maintenance

Owner: **R5-00 Integration Control -> current owner of `server/apps/tenant-worker/src/index-core.ts` shared maintenance authority**  
Need: Integrate the already-verified `runWorkplaceScheduledNotifications(env.DB, tenantId, now)` into the existing `runMaintenance()` function. Reuse the same scheduler clock and return its bounded result as `workplace`; do not add another cron, queue, scheduler or notification store.  
Why blocked: Exact current main contains the A16 Workplace runner but `runMaintenance()` still invokes only outbox, app-hook sweep, Auto Repeat, stock reservation expiry and Alumdoor maintenance. A16 explicitly left this shared hotspot to the maintenance owner. R5-05 cannot close the required “scheduler integration with no duplicate scheduler” evidence without crossing shared authority.  
Can continue independently: **yes** — Integration Hub, BI/Semantic, Commerce and provider/source-boundary audit is complete.  
Temporary compatibility path: none. A separate R5-05 cron or direct notification loop would create a second scheduler authority and is rejected.  
Acceptance evidence:
- exact candidate imports and invokes `runWorkplaceScheduledNotifications()` exactly once from the canonical tenant maintenance path;
- `/internal/maintenance` and scheduled entrypoint still converge through the same `runMaintenance()` implementation;
- result exposes Workplace counters without changing alert authorization semantics;
- `rc4-a16-workplace-maintenance.test.mjs` remains green;
- new/updated maintenance integration regression proves one scheduler path, deterministic retry behavior and no duplicate notifications;
- exact-head validation records the candidate SHA.

Status: **BLOCKING R5-05**.

---

## DR-R5-A5-02 — Capability-profile activation contract for secondary domains

Owner: **R5-01 Package + Capability Profile**  
Need: Publish the canonical server-authoritative profile resolver/apply/read contract that R5-05 can consume for jobs, integrations, navigation/actions and optional secondary-domain capability activation.  
Why blocked: At R5-05 execution time `agent/r5-01-package-capability-profile` has no delta from current main. R5-05 must not invent client-only feature flags or a second profile store.  
Can continue independently: **yes** — source convergence does not depend on the profile implementation.  
Temporary compatibility path: treat existing installed-package behavior as unchanged; do not silently broaden or disable capability execution.  
Acceptance evidence:
- R5-01 exact contract/version is available;
- R5-05 representative integration/job/Workplace/Commerce surfaces resolve activation through that contract;
- disabled optional capability is non-executable through normal tenant-facing path while package/data remain installed;
- re-enable restores the surface without reinstall;
- tenant isolation and required-capability constraints pass.

Status: **WAITING / non-blocking for independent R5-05 source audit**.

---

## DR-R5-A5-03 — Workplace recurrence adapter to canonical Auto Repeat

Owner: **shared App Factory / Auto Repeat owner, coordinated by R5-00**  
Need: Map Workplace Task recurrence values onto the existing persisted Auto Repeat authority rather than introducing a second recurrence engine. Generated occurrences must reset terminal/evidence lifecycle fields and use the normal command/permission path.  
Why blocked: A16 intentionally did not write directly into Auto Repeat storage; this is a shared App Factory/runtime contract.  
Can continue independently: **yes**.  
Temporary compatibility path: recurrence remains unavailable/unchanged unless the selected profile explicitly requires it.  
Acceptance evidence:
- deterministic mapping for supported Daily/Weekly/Monthly semantics;
- create/disable/re-enable lifecycle uses canonical Auto Repeat;
- generated task cannot inherit stale `Done`/cancel/evidence fields;
- owner permissions are re-evaluated;
- no second scheduler table/cron is introduced.

Status: **NON-BLOCKING unless selected pilot profile enables Workplace recurrence**.

---

## DR-R5-A5-04 — Provider/live recovery and conformance proof

Owner: **R6 Provider/Recovery certification lanes**  
Need: Produce approved non-production/live evidence for the provider and physical recovery boundaries that R5 intentionally leaves source-only.  
Why blocked: Provider resources, credentials and durable queue topology are external environment state; source presence cannot prove them. R5 must not mutate production/provider state just to close a checklist.  
Can continue independently: **yes**.  
Temporary compatibility path: preserve `unverified` provider state and fail closed where a live provider is required.  
Acceptance evidence as applicable:
- physical quarantine/DLQ storage and controlled re-enqueue preserve tenant/schema/idempotency/payload identity;
- retry/quarantine/replay operational evidence;
- named e-invoice provider auth/signature/callback conformance;
- external notification/provider proof without false delivery claims;
- AI Gateway/provider spend/privacy/audit evidence if adopted;
- no provider or AI output directly mutates business authority.

Status: **DEFERRED TO R6; not an R5 source-convergence blocker**.

---

## DR-R5-A5-05 — Canonical Finance apply path for e-invoice evidence

Owner: **R5-02 Finance + HCM Reconciliation / Finance authority**  
Need: Confirm or provide the canonical permissioned/idempotent DocumentKernel command that applies an Integration-produced `CanonicalEInvoiceEvidencePatch` to the Finance-owned `E-Invoice Submission`.  
Why blocked: Integration Hub may produce transport evidence but must not direct-write Finance documents, GL or tax authority state.  
Can continue independently: **yes**.  
Temporary compatibility path: leave provider integration inactive if the selected pilot does not enable e-invoice; do not direct-write evidence tables.  
Acceptance evidence:
- Finance owns status transition/application;
- duplicate provider callback/status sync is idempotent;
- correction/retry preserves source/version/payload hash provenance;
- permission/tenant negative tests pass;
- Integration package contains no direct Finance persistence bypass.

Status: **CONDITIONAL; blocking only if e-invoice is enabled in the selected R5/pilot profile**.
