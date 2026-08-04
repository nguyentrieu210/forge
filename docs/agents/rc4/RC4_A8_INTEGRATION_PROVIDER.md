# RC4-A8 — Integration Provider Residual Closure

Date: **2026-08-04**  
Agent: **RC4-A8**  
Branch: `agent/rc4-08-integration-provider`  
Seed: exact `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL / non-UI**  
Status: **READY FOR REVIEW — source closure complete; live provider/physical recovery evidence remains dependency-bound**

## 1. Mission

Close the RC3 Integration Hub/provider release-confidence residuals without creating a second business authority or unsafe replay path.

Primary capability scope:

- `I01-002..004` credential/provider boundary;
- `I01-006` event subscription canonical controller wiring;
- `I01-013` dead-letter recovery contract;
- `I01-014` idempotency preservation;
- `I01-015` connector recovery/audit evidence;
- `I02-002` e-invoice provider transport seam.

Mandatory authority boundary remains unchanged: provider/integration code may produce transport evidence, but authoritative business mutation stays in Forge controllers/DocumentKernel. Finance remains authority for `E-Invoice Submission` and its statutory evidence fields.

## 2. Exact baseline audit

RC3 evidence on the seed keeps:

- `I01-014` at **RC**;
- `I01-001`, `I01-009..012` at **Wired**;
- `I01-002..008`, `I01-013`, `I01-015` at **Foundation**;
- `I02-002` e-invoice connector at **Foundation**.

The concrete residuals confirmed on exact seed were:

1. WS10 had a webhook-specific DLQ contract, but no typed shared inspect/quarantine/replay contract for the actual outbox/social/prepared-report queue messages.
2. `IntegrationSubscriptionController` existed, but `AggregateCoordinator` did not compose `registerIntegrationHubControllers(...)`, so `Integration Subscription` could fall through to generic metadata behavior.
3. Finance already owns canonical `E-Invoice Submission` status/evidence fields, but Integration had no provider-neutral submit/sign/status-sync adapter that returns only a canonical evidence patch.
4. `/internal/events` still does not fan out through the generic Integration Hub delivery runtime. Wiring that half-way without durable attempts, credential lifecycle and physical DLQ/replay would create an incomplete production path, so this pass deliberately does not do it.

## 3. Implemented source closure

### 3.1 Typed queue quarantine / replay contract

Added `server/packages/integration-hub/src/queue-recovery.ts`.

Supported message contracts:

- `outbox_domain_event` — preserves `tenant_id`, schema version and original `event_id`;
- `social_event` — preserves tenant, Facebook `event_id` and the exact raw webhook body bytes;
- `prepared_report` — preserves tenant and original `job_id`.

Safety invariants:

- deterministic `dead_letter_id` bound to queue kind + tenant + idempotency identity + SHA-256 payload hash;
- quarantine validation re-derives schema, tenant, identity and payload hash;
- operator inspection exposes metadata only, not raw queued payload;
- replay request contains actor + reason + exact payload hash, never arbitrary caller-supplied raw message;
- replay materialization is possible only after matching the immutable quarantine record and sequential replay count;
- tampered tenant/message/hash/identity/replay count fails closed.

This closes the **typed recovery contract** requested by RC4-A2/WS12. It does **not** claim physical queue/DLQ persistence or operator tooling exists yet.

### 3.2 Canonical e-invoice provider transport seam

Added `server/packages/integration-hub/src/einvoice-provider.ts`.

The transport contract:

- accepts an immutable snapshot of canonical Finance e-invoice authority;
- validates provider identity and HTTPS outbound allowlist;
- resolves credentials only through an injected `credential_ref` resolver;
- supports an injected signer/KMS/certificate seam without persisting signing material;
- derives deterministic submit/status-sync idempotency keys from tenant + canonical submission/source/version/operation/payload identity;
- blocks redirects instead of following provider-controlled redirects;
- applies existing bounded retry/dead-letter semantics;
- bounds request/response sizes;
- rejects provider evidence containing credential-like fields;
- returns a `CanonicalEInvoiceEvidencePatch` only — it never writes Finance, GL, tax, stock, payroll or provider state directly;
- evidence contains request/response hashes and safe provider references, not raw secrets or raw response bodies;
- includes a timestamped HMAC callback authenticity primitive with replay-skew rejection for providers using shared-secret callbacks.

The patch maps to canonical Finance evidence fields already enforced by migration `0091_vn_einvoice_compliance_evidence.sql`: `submission_status`, `payload_hash`, `response_evidence_json`, `external_reference`, `response_message`, `signature_reference`, `tax_authority_reference`.

No vendor-specific provider is fabricated in this pass; real provider format/auth/certificate semantics require approved provider fixtures/non-production evidence.

### 3.3 Canonical controller composition

Updated `server/apps/tenant-worker/src/aggregate-do.ts` to compose:

`registerIntegrationHubControllers(...) -> registerErpNextCoreControllers(...) -> Stock -> ERP core -> O2C -> GenericMetadataController fallback`.

`Integration Subscription` therefore uses its server controller invariants through the canonical DocumentKernel instead of falling through to generic metadata behavior.

### 3.4 Package exports

`@cloudforge/integration-hub` now exports:

- `./queue-recovery`;
- `./einvoice-provider`.

## 4. Regression evidence

Added repository regressions:

- `server/tests/integration-hub-queue-recovery.test.mjs`;
- `server/tests/integration-hub-einvoice-provider.test.mjs`;
- `server/tests/integration-hub-kernel-registration.test.mjs`.

### Executed in this session

The available shell has Node 22 / TypeScript 5.8 but cannot resolve `github.com`, so a full repository checkout/install/build cannot start. To avoid reporting a false global PASS, the new Integration Hub source was reconstructed in an isolated strict harness using the exact public contracts/signatures consumed from current source.

- strict TypeScript with `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`: **PASS** after fixing one real optional-property defect (`signature_reference: undefined`);
- exact queue recovery + e-invoice regression logic against compiled isolated modules: **9/9 PASS**;
- earlier runtime smoke after strict fix: **PASS**.

Covered runtime assertions include:

- tenant/schema/idempotency preservation across all three queue kinds;
- operator inspection does not expose quarantined payload;
- tamper and stale replay rejection;
- pretty-printed social webhook raw body is preserved byte-for-byte;
- deterministic e-invoice submit/status-sync identity;
- retry/redirect paths do not manufacture Finance status evidence;
- provider secrets/signature values do not appear in returned evidence;
- protected authority header override rejected;
- credential-like provider evidence rejected;
- valid callback HMAC accepted; forged signature and stale callback timestamp rejected.

### Not claimed

- full repository TypeScript/build/test: **NOT RUN** — no checkout/dependency tree and GitHub DNS unavailable in shell;
- `integration-hub-kernel-registration.test.mjs`: authored but **NOT RUN** in full compiled repo for the same reason;
- GitHub development CI: not assumed; repository policy uses Actions primarily for build/deploy;
- provider live/non-production call: **NOT RUN**;
- production provider/DNS/secret/customer-data mutation: **NONE**.

## 5. Capability maturity recommendation

No automatic RC promotion is recommended from source closure alone.

| Capability | Seed | A8 recommendation | Reason |
|---|---|---|---|
| `I01-002` API key | Foundation | **Foundation** | secret-ref/resolver boundary is safe; concrete tenant credential create/rotate/revoke/audit lifecycle remains WS11 dependency |
| `I01-003` OAuth | Foundation | **Foundation** | provider-specific Facebook evidence exists, but generic credential/provider lifecycle remains incomplete |
| `I01-004` Service account | Foundation | **Foundation** | safe resolver seam only; no concrete lifecycle/provider proof |
| `I01-006` Event subscription | Foundation | **Foundation** | canonical controller now wired, but generic `/internal/events -> delivery task -> queue -> attempt` runtime is not yet physically composed |
| `I01-013` Dead-letter | Foundation | **Foundation** | typed recovery contract now exists; durable physical quarantine/replay path remains WS12 dependency |
| `I01-014` Idempotency | RC | **RC retained** | A8 preserves original event/job/submission identities and adds deterministic provider identity; no reason to demote/promote |
| `I01-015` Connector audit | Foundation | **Foundation** | safe recovery/provider evidence improved; physical attempt persistence/operator audit remains incomplete |
| `I02-002` E-invoice connector | Foundation | **Foundation** | provider-neutral transport seam exists, but no named vendor/non-production provider conformance evidence yet |

## 6. Dependency Requests

### DR-RC4-A8-01 — durable queue recovery implementation

Owner: **RC4-A2 / WS12 SRE-provider recovery**.  
Consume the new typed `queue-recovery.ts` contract for physical quarantine storage, queue-specific dead-letter bindings, permissioned inspect tooling and controlled re-enqueue. Preserve tenant/schema/idempotency identity. Do not expose arbitrary raw-message resend.

### DR-RC4-A8-02 — canonical credential lifecycle

Owner: **RC4-A1 / WS11 IAM/privacy/security**.  
Provide tenant-bound API-key/OAuth/service-account credential create/use/rotate/revoke/audit semantics. A8 intentionally consumes `credential_ref`/resolver only and does not create parallel secret storage.

### DR-RC4-A8-03 — Finance evidence apply command

Owner: **RC4-A4 / WS01 Finance/VN statutory**.  
Define/confirm the canonical permissioned/idempotent command that applies an Integration-produced `CanonicalEInvoiceEvidencePatch` to `E-Invoice Submission` through DocumentKernel. Integration must not direct-write Finance documents or SQL tables.

### DR-RC4-A8-04 — provider conformance evidence

Owner: **approved Integration/provider environment**.  
Choose a real e-invoice provider and provide non-production endpoint/auth/signature/callback fixtures. Run submit -> retry -> accepted/rejected -> status-sync/correction evidence before considering `I02-002` RC.

## 7. Deliberately deferred runtime composition

Generic external fan-out is still not wired directly into tenant `/internal/events` in this pass. Correct future sequence is:

`DomainEvent -> active Integration Subscription reader -> immutable delivery task -> physical queue -> credential resolver -> provider executor -> durable attempt audit -> retry/quarantine -> controlled replay`.

Until DR-A8-01/02 are concretely available, adding only the first half would produce a source-wired but operationally unsafe path. The independent A8 contracts/tests are complete without taking WS11/WS12 authority.

## 8. Merge / deploy boundary

This is **non-UI CRITICAL** work.

- Branch commits and Draft PR are allowed.
- **Do not merge to `main` without explicit user approval.**
- **Do not deploy or mutate provider/DNS/secrets/customer data.**
- Source completion is not provider/live/production evidence and is not relabeled `Hardened`.
