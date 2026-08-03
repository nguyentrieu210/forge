# CF05 — AI Platform R2 Handoff

Status: **ACTIVE / REVIEW CANDIDATE FOR SLICES A-C**  
Branch: `cloudflare/cfmax-05-ai-platform-r2`  
Exact replay baseline: `main@c10e8d9ec5da740910c4b995e03ea9529fa726b4`  
Original seeded branch: `cloudflare/cfmax-05-ai-platform` (stale when R2 started)  
Risk: **STANDARD with CRITICAL privacy/tenant/action boundaries**  
Production provider/config/deploy: **NOT PERFORMED**

## Mission truth

Forge AI remains advisory. Model output is never permission and never becomes a canonical business mutation. This slice centralizes hosted inference policy while preserving the existing direct Workers AI path unless an operator explicitly configures an AI Gateway id.

## Exact AI call-site inventory

| Call site | Use | Provider today | Sensitivity | Boundary | R2 decision |
|---|---|---|---|---|---|
| `server/apps/tenant-worker/src/ai-assistant.ts` receipt image | OCR/extraction proposal | Workers AI | confidential document image | trusted tenant; server rereads catalogue; suggestion only | **MIGRATED** to `@cloudforge/ai-policy` |
| `server/apps/tenant-worker/src/ai-assistant.ts` context assistant | answer over current visible context | Workers AI | confidential tenant/user context | trusted tenant + audit user; advisory only | **MIGRATED**; selected model recorded in D1 business audit |
| `server/apps-src/alumdoor-worker/src/index.ts` | vertical OCR path | Workers AI | confidential operational image/data | vertical worker also owns deterministic business commands | **NEXT CONSUMER**; migrate inference only, do not move stock/cut authority |
| `client/packages/shell/src/ai/provider.ts` | generic shell assistant | browser OpenAI-compatible BYOK | potentially confidential screen context | outside server cost/privacy policy | **DEPENDENCY** on WS14/WS11: clearly retain as BYOK-local or route hosted mode through Forge service |

Repository audit also checked Workers AI model strings, `AI.run`, `chat/completions`, `api.openai.com` and Anthropic endpoint strings. No separate direct Anthropic endpoint was found on the audited baseline.

## Implemented foundation

### Shared provider-neutral seam

Added `server/packages/ai-policy` with current purposes:

- `receipt_ocr`
- `context_assistant`

Callers declare trusted tenant, optional trusted user, app, purpose, request class and sensitivity. The package owns provider/model policy, not business commands.

### Model/provider policy

- Workers AI model lists centralized per purpose.
- Output token budgets centrally clamped: OCR `2048`, assistant `700`.
- Fallback only for model retirement/unavailability.
- Rate/quota/spend-style refusal stops after the first attempted model; no surprise fallback spend.
- Arbitrary provider errors surface rather than being hidden.
- No external provider is silently selected.

### AI Gateway boundary

Gateway options are passed through the Workers AI binding only when `AI_GATEWAY_ID` is configured. This branch does **not** set that variable, use the implicit `default` gateway, create a gateway, mutate provider settings, touch secrets, or deploy.

Cloudflare references checked 2026-08-04:

- `https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/`
- `https://developers.cloudflare.com/ai-gateway/observability/custom-metadata/`
- `https://developers.cloudflare.com/ai-gateway/integrations/aig-workers-ai-binding/`

### Fixed metadata budget

Cloudflare currently retains at most five custom metadata entries per request. R2 allocates exactly five stable keys:

1. `tenant` — SHA-256-derived pseudonym;
2. `actor` — SHA-256-derived pseudonym;
3. `app` — sanitized app id;
4. `purpose` — policy purpose id;
5. `class` — interactive/extraction/batch class.

Raw tenant/user identifiers, prompts, document payloads and secrets never belong in Gateway metadata.

### Cache/log privacy

Current OCR and context-assistant requests are confidential:

- `skipCache: true`;
- `collectLog: false` for Gateway request logging;
- D1 `ai_logs` remains Forge business audit and records the selected model.

AI Gateway observability is never treated as the business audit ledger.

## Tests / validation

Focused CF05 gate covers:

- five-key metadata budget;
- tenant/user pseudonymization;
- confidential no-cache/no-Gateway-log behavior;
- output-token clamp;
- direct Workers AI compatibility when no Gateway id is configured;
- retirement fallback;
- no fallback on rate/quota refusal;
- trusted tenant requirement;
- existing assistant success/empty-answer behavior;
- selected model in business audit.

After `main` advanced by one unrelated UI-only commit, R2 was force-replayed from exact `main@c10e8d9...`. Focused run `30849639508` on replayed code head `4a487bb63c266e5e47185958e8ae1dace2b88115` passed locked dependency install, focused TypeScript, focused build, and both AI regression suites. The documentation-only evidence commit after that run must retain the same code tree; its gate is the final PR-head confirmation.

## Vectorize / AI Search decision

**DEFERRED.** Exact main does not yet expose a CF05-owned retrieval product path with proven ACL-change/delete freshness plus canonical permission recheck. Vectorize must remain a rebuildable derived index, never canonical data.

Required adoption shape:

`canonical object -> safe extraction/chunk -> tenant metadata -> vector candidate -> canonical fetch -> permission recheck -> disclose allowed fields`

Before adoption: tenant partition, source/version provenance, tombstones/delete, ACL propagation, embedding version, stale-index behavior and rebuild tests.

## Tool/action boundary

No action agent is added. Any future action must follow:

1. model receives allowlisted tool schema;
2. model returns structured proposal;
3. Forge validates schema + permission + current state;
4. normal approval applies to high-impact actions;
5. canonical command executes with idempotency/audit;
6. AI may claim success only after canonical command receipt.

No model-generated SQL/D1 mutation exists in this slice.

## Dependency Requests

### DR-CF05-01 — CF03 + CF08
Need canonical tenant/app/purpose usage dimensions and cost reconciliation sink. CF05 must not invent a second billing taxonomy. Blocks authoritative spend reporting/latency-cost comparison; does not block policy seam.

### DR-CF05-02 — WS11 + CF04
Need authoritative plan entitlement/quota and sensitive-data/provider policy. Blocks per-plan provider/model allowlists and final hard-quota semantics.

### DR-CF05-03 — WS14 + WS11
Need product/security decision for browser BYOK OpenAI-compatible provider. It bypasses Forge-hosted cost/server privacy policy; shared client ownership must decide hosted-vs-BYOK semantics.

### DR-CF05-04 — Alumdoor/WS17 + CF05
Need the Alumdoor OCR inference call moved onto the shared policy seam without touching deterministic stock/cut commands. Vertical business invariants remain vertical-owned.

## Adoption decisions

- Provider-neutral Forge AI policy seam: **REQUIRED**.
- AI Gateway for Forge-hosted inference: **RECOMMENDED / config-gated**.
- Gateway caching for current confidential paths: **REJECTED**.
- Gateway prompt logging for current confidential paths: **REJECTED**.
- Vectorize/AI Search now: **DEFERRED**.
- Direct model-driven business mutation: **REJECTED**.

## Completion record

Capabilities supported: `A02-004`, `A02-005`, `A02-025` foundation; OCR path inventoried.  
AI call sites: 4 material surfaces inventoried; 2 tenant-worker paths migrated.  
Cost evidence: dependency on CF03/CF08; no fabricated numbers.  
Production evidence: none; no provider/config/deploy change.  
Remaining gaps: Alumdoor consumer adapter, browser BYOK decision, plan/quota/cost integration.
