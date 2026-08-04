# R5-05 / R5-A5 — Integration + BI + Workplace + Logistics

Date: **2026-08-04**  
Branch: `agent/r5-05-integration-bi-workplace-logistics`  
Exact execution baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`  
Risk: **STANDARD / security-sensitive; shared scheduler and provider boundaries remain authority-sensitive**  
Status: **BLOCKED on one shared scheduler integration; independent R5-05 source audit complete**

## 1. Mission and execution decision

R5-05 is the launch-pack lane for the non-core surfaces needed by the R5 candidate:

- provider-neutral Integration Hub contracts;
- queue quarantine / DLQ / controlled replay source semantics;
- e-invoice and other provider seams only to the Forge source/runtime boundary;
- semantic dashboard / BI wiring already present;
- Workplace reminder/expiry integration into the canonical scheduler;
- Logistics / POS / Commerce residuals actually required by the selected pilot profile.

Exact GitHub state wins historical branch state. RC4 A8/A15/A16/A17 are already integrated into current `main`, and the RC4 post-integration candidate was validated before final merge. Therefore this lane does **not** replay those workers or manufacture a second authority. It audits the integrated tree, fixes only exact-main residuals inside R5-05 ownership, and routes shared-contract/provider dependencies to their owners.

No runtime/schema/migration/provider/customer-data mutation is made by this R5-05 branch so far. The only exact-main residual found that blocks a required R5-05 acceptance criterion is a shared scheduler seam whose ownership is intentionally outside this lane.

## 2. Exact integrated evidence inherited from RC4

Current main contains the reconciled RC4 worker outcomes:

- A8 Integration Provider reconciled onto integrated main through PR `#625`;
- A15 BI / Semantic / AI merged into main;
- A16 Workplace / DMS merged into main;
- A17 Logistics / POS / Commerce merged into main;
- post-integration final PR `#627` validated the combined tree before final merge.

The final integrated workflow explicitly reran:

- `integration-hub-einvoice-provider.test.mjs`;
- `integration-hub-kernel-registration.test.mjs`;
- `integration-hub-queue-recovery.test.mjs`;
- `semantic-dashboard.test.mjs`;
- `semantic-ai-dashboard.test.mjs`;
- `semantic-recommendation.test.mjs`;
- `rc4-a16-workplace-maintenance.test.mjs` plus WS15 notification/assignment/workplace regressions;
- `ws16-omnichannel-source-contract.test.mjs`.

The RC4 post-integration validation run recorded for the final candidate is `30878142334 = SUCCESS`. Provider/live state remained explicitly `unverified`; R5-05 does not reinterpret source evidence as provider or production evidence.

## 3. Integration Hub audit

### 3.1 Canonical source already on main

`server/packages/integration-hub/src/queue-recovery.ts` provides the typed recovery contract for:

- `outbox_domain_event`;
- `social_event`;
- `prepared_report`.

The contract preserves tenant, schema and original idempotency identity, binds quarantine records to a deterministic payload hash, keeps normal operator inspection metadata-only, and permits replay only from an immutable quarantine record with matching replay sequence.

`server/packages/integration-hub/src/einvoice-provider.ts` provides the provider-neutral e-invoice transport seam. The provider is allowed to return evidence only; it does not direct-write Finance, GL, stock, payroll or another business authority. Credential material is resolved through an injected reference, redirect behavior is bounded, idempotency is deterministic and callback authenticity has an explicit primitive.

`Integration Subscription` is already composed into the canonical DocumentKernel/controller registration path after the A7/A8 reconciliation. R5-05 does not add a second integration registry.

### 3.2 R5 disposition

**Source/runtime contract: READY for R5.**

Still not claimed in R5:

- physical durable DLQ/quarantine bindings and operator recovery execution;
- generic tenant event -> Integration Hub delivery-attempt runtime with durable attempt audit;
- generic API-key/OAuth/service-account lifecycle evidence;
- named e-invoice provider conformance;
- provider/live retry/callback evidence.

Those are provider/security/recovery boundaries and are routed to R6 or their shared owners rather than fabricated here.

## 4. BI / Semantic audit

The integrated semantic layer already contains:

- trusted dashboard/executive-cockpit composition over registered semantic insight IDs;
- deterministic layout/filter validation;
- tenant injection from trusted runtime context;
- permission-aware catalog discovery and all-widget preflight before reads;
- audited natural-language dashboard request parsing with no SQL/tenant/layout injection;
- evidence-bound advisory recommendation output sourced through `SemanticQueryExecutor`;
- explicit rejection of provider write/action authority.

R5-05 found no exact-main reason to reopen the RC4 A15 implementation. Provider/model execution, spend/privacy policy and UI/browser productization remain separate dependencies. The selected Alumdoor pilot does not require broad AI action/write capability, so globally Missing AI/BI features are not pulled into this lane.

R5 disposition: **READY for the current source boundary; provider/live and presentation proof remain outside this lane.**

## 5. Workplace audit — exact blocker

`server/packages/frappe-api/src/workplace-maintenance.ts` is present on exact main and exports `runWorkplaceScheduledNotifications(...)`.

It already handles:

- `Workplace Task.reminder_at`;
- `Managed Document.expiry_date`;
- Contract renewal notice and expiry;
- due/overdue `Contract Obligation`;
- tenant-local active System User filtering;
- canonical document read permission recheck before exposing document metadata;
- Notification Preference handling;
- deterministic notification IDs for retry idempotency.

However, exact current `server/apps/tenant-worker/src/index-core.ts` still has the canonical `runMaintenance()` return shape:

- `outbox`;
- `hooks`;
- `auto_repeat`;
- `reservations`;
- `alumdoor`.

It does **not** import or invoke `runWorkplaceScheduledNotifications(...)` and does not return a `workplace` result. Therefore the A16 domain engine is verified but not yet registered in the one scheduler authority.

This is the concrete R5-05 acceptance gap: **scheduler integration with no duplicate scheduler is not closed on exact main**.

The A16 handoff explicitly classified `server/apps/tenant-worker/src/index-core.ts` as a shared scheduler orchestration hotspot and left this seam to the shared maintenance owner. R5-05 therefore does not patch the shared authority unilaterally. See `DR-R5-A5-01`.

## 6. Logistics / POS / Commerce audit

RC4 A17 already hardened the Social Commerce API route-class permission boundaries on main:

- Social summary/pages/events/carts reads require Social Commerce scope before tenant reads;
- keyword-rule mutation is manager scope;
- fulfillment projection is manager/stock scope;
- COD reconciliation is manager/accounts scope;
- cart conversion remains on the canonical Sales Order authority;
- shipment remains a projection of canonical Delivery Note;
- Finance and Stock authorities are not forked.

The current Alumdoor pilot profile intent is centered on canonical sales, procurement, inventory, manufacturing, finance/payment, warranty/service and daily operating reports. Broad social-commerce/POS/offline capability is optional rather than a pilot release prerequisite.

R5 disposition:

- current integrated permission/source boundary: **READY**;
- POS partial payment/COD allocation: Finance-owned dependency if enabled;
- generic stock reservation / atomic POS return quantity: Inventory/kernel-owned dependency if enabled;
- dedicated POS offline/mobile execution: WS14 dependency if enabled;
- no broad optional commerce wave is opened by R5-05.

## 7. Capability Profile interaction

R5-01 owns the server-authoritative package/capability profile contract. At R5-05 execution time, `agent/r5-01-package-capability-profile` is still identical to current main and has no new canonical profile contract to consume.

R5-05 therefore does not invent local/client flags for jobs, integrations, Workplace or Commerce. When R5-01 publishes the profile contract, this lane must prove that disabled optional capabilities do not execute normal tenant-facing actions/jobs/integrations while package installation and historical data remain intact.

This is recorded as `DR-R5-A5-02`; it does not justify blocking the independent source audit.

## 8. Dependency Requests

Canonical requests are recorded in `docs/agents/r5/R5_A5_DEPENDENCY_REQUESTS.md`.

Key status:

- `DR-R5-A5-01` — **BLOCKING R5-05**: wire Workplace scheduled notifications into the one shared tenant maintenance path.
- `DR-R5-A5-02` — **WAITING**: consume R5-01 capability-profile activation contract when available.
- `DR-R5-A5-03` — **NON-BLOCKING unless profile enables task recurrence**: map Workplace recurrence onto canonical Auto Repeat instead of creating a second recurrence engine.
- `DR-R5-A5-04` — **R6/provider evidence**: physical DLQ/replay and provider/live proofs.
- `DR-R5-A5-05` — **conditional Finance dependency**: canonical e-invoice evidence apply command if e-invoice is enabled for the selected pilot.

## 9. Source-vs-provider truth

Machine-readable matrix: `docs/agents/r5/R5_A5_SOURCE_PROVIDER_MATRIX.json`.

R5 must preserve these distinctions:

- source present != provider observed;
- branch/merge present != production deployed;
- provider response != permission to mutate business authority;
- typed replay contract != physical DLQ/recovery proof;
- semantic/provider advisory output != authoritative business write;
- Workplace alert engine != scheduler registration.

## 10. Verification and verdict

### Verified by exact-state audit

- R5-05 branch was created from exact `main@30346e08eabb7074f8623eeedae09efec25da072`.
- No stale RC4 branch is replayed.
- A8/A15/A16/A17 source and regression artifacts are already integrated on main.
- RC4 final integrated workflow contains the required Integration/BI/Workplace/Commerce regression commands and the final candidate run is recorded successful.
- Exact current tenant maintenance source still lacks the Workplace runner call.
- R5-01 profile branch has not yet published a consumable delta.

### Not claimed

- no fresh repository-wide TypeScript PASS from this connector session;
- no provider/live call;
- no physical DLQ/replay execution;
- no Cloudflare mutation;
- no production deployment;
- no schema/migration/customer-data mutation;
- no capability maturity promotion from source audit alone.

### Verdict

**R5-05 = BLOCKED on `DR-R5-A5-01`; all independent source-convergence audit work is complete.**

The correct next action is for the shared maintenance owner to integrate the verified Workplace runner into `runMaintenance()` on the canonical candidate, then rerun the Workplace + maintenance exact-head regressions. R5-05 can then consume the R5-01 profile contract when it exists and move to READY without reopening RC4 implementation waves.

## 11. Merge / deploy boundary

This R5-05 branch currently contains evidence/governance only, but the lane's blocking repair is non-UI backend shared-runtime work. Per Forge policy:

- open PR and preserve this exact audit/Dependency Request;
- do **not** merge the non-UI R5-05 lane to main without explicit authorization;
- do **not** deploy or mutate provider/DNS/secrets/customer data;
- provider/live evidence stays in R6.
