# WS08 — BI Semantic Layer + Planning + AI Data

Status: **ACTIVE**  
Owner: **ChatGPT-WS08**  
Branch: `agent/ent-08-bi-semantic-ai`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Claim commit: `191e1c9de156898ea397c21b9bae5196b5b35b2a`  
PR: **#311** — `feat(semantic): add permission-aware BI semantic query foundation` (Draft checkpoint)  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Exact GitHub state wins this file. PR is a checkpoint, not a stop condition.

## Mission

Xây lớp metric/semantic/query có quyền làm nguồn tin cậy cho dashboard, planning, forecast và AI. AI không được tự đoán raw schema rồi tuyên bố doanh thu như một nhà tiên tri bảng tính.

## Own

Semantic metric definitions, dimensions/measures, permission-aware query, KPI/dashboard/pivot/report planning, drilldown/drill-through, scheduled report contracts, forecast/scenario planning, data feed/warehouse seam, AI query/data context/tool proposal layer.

## Exact-state audit — 2026-08-03

- Branch was reset cleanly onto `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` before implementation; only this WS08 handoff was branch-owned at claim time.
- Current `main` later advanced through `b63c9a7a07e63dd73f944f450618c0b92f10067c`. The 11 commits after the WS08 merge base are WS14 UI/PWA/mobile/docs only; no source-relevant changes touch semantic/query/permission/app-registry backend. WS08 therefore did not rewrite 40+ branch commits merely to make the graph prettier.
- `server/packages/query/src/index.ts` already provides tenant-bound report compilation, static server-owned views, app-report field/filter/order allowlists and prepared-report budgeting. It is report infrastructure, not a reusable semantic metric contract. App `sum/avg` currently uses SQLite `REAL`, so it cannot be the authoritative exact-money semantic path.
- `server/packages/frappe-api/src/router.ts` already enforces `action: "report"` and user-permission scope for app reports. WS08 reuses this permission seam; no second RBAC engine is introduced.
- `server/apps/query-worker/src/index.ts` already owns prepared-report queue/retry/result retrieval. WS08 does not create a competing report queue.
- `client/packages/views/src/report/ReportView.tsx` already renders report results and exports Excel/CSV. Shared renderer/presentation remains WS14-owned.
- `server/apps/tenant-worker/src/ai-assistant.ts` is read-only/context-bounded and audit-logs successful answers, but has no `AI -> semantic query` data path yet.
- `server/packages/app-registry/src/manifest.ts` owns AppReport/AppChart/app package contracts. First-class semantic manifest support belongs to WS09; WS08 provides a safe parser instead of editing that hotspot.
- `server/packages/frappe-api/src/desk-views.ts` covers Kanban/notifications, not BI saved filters. It is not counted as A01-012 evidence just because both are “views”.
- Legacy PR `#199` Daily Detailed Ledger: **REUSE as dependency/evidence only**. Its kernel/API/UI code remains WS00/WS01/WS14 territory; no cherry-pick into WS08.

## Implemented autonomous slices

### Slice 1 — Semantic model/query core

Files:
- `server/packages/semantic/src/index.ts`
- `server/packages/semantic/src/validation.ts`
- `server/packages/semantic/src/service.ts`

Contract/invariants:
1. Models declare trusted source, explicit grain, dimensions, metrics, value kind/scale/unit/exactness, additivity and required `report` permission.
2. Query caller selects semantic IDs only; it never supplies table/view/SQL expressions.
3. Tenant is bound from trusted context. App/DocType models bind exactly one DocType and must explicitly choose `draft`, `submitted` or `non_cancelled`; KPI code cannot silently count drafts.
4. Runtime + compiler both reject nested filter JSON, invalid operators, non-string LIKE, unsafe ordering, excessive IN lists and huge offsets.
5. Exact scaled values require `exact=true`; exact sums remain integer and are never coerced through SQLite `REAL`. Exact scaled AVG fails closed until a numerator/denominator ratio contract exists.
6. Currency metrics may reference only a declared dimension with `kind=currency`.
7. `D1SemanticQueryService` validates -> compiles -> authorizes -> touches D1, in that order. Permission denial prevents SQL preparation.

### Slice 2 — Permission-aware discovery

Files:
- `server/packages/semantic/src/catalog.ts`
- `server/packages/semantic/src/insight-catalog.ts`

- Safe model summaries omit SQL view/table/tenant/physical field names.
- Catalog listing rechecks the same report permission as execution; denied models/insights are not discoverable.
- Infrastructure/permission-service failures propagate instead of being disguised as an empty catalog.

### Slice 3 — Trusted KPI/chart/pivot/table + drill-through

File:
- `server/packages/semantic/src/insights.ts`

- First-class semantic insight definitions: `kpi`, `chart`, `pivot`, `table`.
- KPI/card/chart/pivot definitions reference registered model/member IDs only.
- Runtime scope filters are allowlisted per insight and validated as scalar semantic filters.
- Drill-through maps a selected semantic source dimension to an allowlisted target insight scope dimension; no SQL or UI route is embedded in the data contract.
- Drill source values are scalar only.

### Slice 4 — Strict external read contract

Files:
- `server/packages/semantic/src/request.ts`
- `server/packages/semantic/src/read-api.ts`

- HTTP/LLM body parser is strict allowlist JSON; unknown keys such as `tenant_id` or `raw_sql` fail closed.
- `SemanticReadApi` is router-independent and accepts trusted tenant separately from untrusted body.
- Surfaces: permission-aware model catalog, semantic query, insight execution and drill execution.
- Tenant worker can later mount this with a thin auth/router adapter rather than embedding BI logic in `index-core.ts`.

### Slice 5 — Safe app semantic model boundary

File:
- `server/packages/semantic/src/app-model.ts`

- App packages may define semantic models only over DocTypes owned by that app.
- Model id must be namespaced under app id.
- Physical fields must exist in the app-owned DocType schema; framework record fields are explicitly allowlisted.
- Apps cannot name SQL views/tables, another app's DocType, a foreign permission doctype or arbitrary source keys.
- Transaction state is explicit and permission is forced to the same DocType/report action.
- Entire app model set is validated in one registry, including duplicate model ids.

### Slice 6 — Scenario planning

File:
- `server/packages/semantic/src/planning.ts`

- Pure projection, never authoritative write.
- Adjustments: `set`, `delta`, `basis_points`.
- Exact values stay safe integers; basis-point calculation uses BigInt and explicit rounding (`half_away_from_zero`, `floor`, `ceil`, `truncate`).
- Every applied adjustment records before/after/operand/reason audit evidence.
- Scenario binds immutable `baselineVersion`.

### Slice 7 — Forecast provider seam

File:
- `server/packages/semantic/src/forecast.ts`

- Training data comes only through `SemanticQueryExecutor`, so permission/tenant enforcement happens before any forecasting provider sees data.
- Provider receives time series + value semantics only, not tenant id, SQL/view names or raw documents.
- Output carries `sourceVersion`, provider id, model version and generated timestamp.
- Exact source metric requires exact safe-integer forecast/interval output.
- Non-additive metrics fail closed until a derived-series contract exists.

### Slice 8 — AI semantic query tool

File:
- `server/packages/semantic/src/ai-query.ts`

- Strict proposal parser reuses external semantic query parser; hallucinated model/member/filter/order fails before tenant data access.
- AI cannot supply tenant, raw SQL, offset or nested filter objects.
- Flow: `AI proposal -> semantic registry -> audit begin -> semantic executor -> existing permission boundary -> query -> audit completion`.
- Audit intent must open before data read; if audit evidence cannot be created, no query runs.
- Permission denial is recorded as `denied`.
- AI tool intentionally has no unfiltered catalog method; discovery must use permission-aware catalog service.

### Slice 9 — Bounded semantic data feed seam

File:
- `server/packages/semantic/src/feed.ts`

- Snapshot exports use semantic executor only and include schema version, sourceVersion, generatedAt and semantic columns.
- Feed maxRows must leave one spare row inside model maxRows, allowing an extra-row probe to prove `truncated=true/false`; completeness is never guessed at a hard cap.
- Exact result metrics must remain safe integers.
- Incremental/CDC/connector delivery is intentionally left to WS10 rather than adding a rival change feed.

### Slice 10 — Owner-bound scheduled/subscribed report execution contract

File:
- `server/packages/semantic/src/subscription.ts`

- Schedule contract supports daily/weekly/monthly, IANA timezone and explicit local time.
- Monthly day is intentionally limited to 1..28 so short-month behavior is not ambiguous.
- Safe delivery today is only `in_app_owner`; arbitrary email/shared recipients are not allowed without a permission-sharing contract.
- Every run asks an executor factory for the exact tenant + subscription owner, so permissions are re-evaluated at run time rather than trusted from creation time.
- WS08 does not implement another scheduler/queue; WS12 should adapt this to existing job/prepared-report infrastructure.

## Capability maturity on branch

Maturity is source/evidence-based, not a victory sticker.

- `A01-001` Metric definition: **Wired candidate / NOT PROMOTED** — reusable contract implemented, production registration pending.
- `A01-002` Dimension definition: **Wired candidate / NOT PROMOTED**.
- `A01-003` Measure definition: **Wired candidate / NOT PROMOTED**.
- `A01-004` Permission-aware semantic query: **Wired candidate / NOT PROMOTED** — service boundary implemented; tenant-worker adapter + executable verification pending.
- `A01-005` KPI card semantic contract: **Foundation** via SemanticInsight.
- `A01-006` Chart builder semantic source contract: **Foundation**; builder UI remains WS09/WS14.
- `A01-007` Pivot semantic source contract: **Foundation**; builder/render remains dependency.
- `A01-008` Query report: existing Forge report infrastructure + semantic read contract = **Foundation/Wired mixed**, not promoted globally.
- `A01-009` Dashboard: **Foundation dependency** via insight catalog; dashboard builder/layout not WS08-owned.
- `A01-010` Drill-down: **Foundation** through semantic scoped re-query.
- `A01-011` Drill-through: **Foundation** through cross-insight bindings.
- `A01-012` Saved filter/view: **Missing** as BI-specific persistence; Desk Kanban is not evidence.
- `A01-013` Scheduled report: **Foundation** execution/schedule contract; scheduler integration pending WS12.
- `A01-014` Report subscription: **Foundation** owner-bound execution contract; delivery integration pending WS12/WS15.
- `A01-015` Excel export: existing client report exporter provides **existing Wired evidence outside WS08 changes**.
- `A01-016` PDF export: **not proven for semantic reports**; generic print is not counted as semantic-report PDF evidence.
- `A01-017` Forecast: **Foundation** provider/provenance/exactness seam.
- `A01-018` Scenario planning: **Foundation** deterministic projection/audit contract.
- `A01-019` Executive cockpit: **Missing/Dependency** on WS09 dashboard composition + WS14 presentation.
- `A01-020` Data warehouse feed: **Foundation** bounded snapshot seam; incremental/CDC pending WS10.
- `A02-004` Natural-language report query: **Foundation** semantic proposal/tool path; model invocation/router wiring pending.
- `A02-005` Natural-language filter: **Foundation** through strict proposal filters.
- `A02-006` Natural-language dashboard request: **Missing/Dependency** on first-class dashboard builder contract.
- `A02-012` Forecasting: **Foundation** through forecast provider seam.
- `A02-013` Anomaly detection: **Missing**; intentionally after trusted metric runtime is wired.
- `A02-015` Recommendation and domain recommendations: **Missing/domain-dependent**, no generic business truth invented in WS08.
- `A02-021..024` write/action proposal/tool/preview/approval: **Dependency on WS09 AppAction/BPM + domain deterministic tools**; WS08 does not grant AI authoritative writes.
- `A02-025` AI audit log: existing context assistant path is **Wired**; semantic AI adds mandatory audit sink contract but production wiring is pending.

## Verification evidence

Regression files added on this branch:
- `server/tests/semantic-layer.test.mjs`
- `server/tests/semantic-service.test.mjs`
- `server/tests/semantic-catalog.test.mjs`
- `server/tests/semantic-insights.test.mjs`
- `server/tests/semantic-insight-catalog.test.mjs`
- `server/tests/semantic-request.test.mjs`
- `server/tests/semantic-read-api.test.mjs`
- `server/tests/semantic-app-model.test.mjs`
- `server/tests/semantic-planning.test.mjs`
- `server/tests/semantic-forecast.test.mjs`
- `server/tests/semantic-ai-query.test.mjs`
- `server/tests/semantic-feed.test.mjs`
- `server/tests/semantic-subscription.test.mjs`

Covered by source-level regressions:
- tenant injection and parameterization;
- exact scaled-value rules;
- explicit DocType transaction state;
- safe runtime filter values/operator/order/offset budgets;
- authorization before D1;
- permission-aware catalog discovery;
- KPI/pivot/chart member validation and semantic drill-through;
- app semantic model ownership boundary;
- deterministic planning rounding/audit;
- permission-aware forecast source + provenance;
- strict AI proposal + audit-before-read;
- bounded feed truncation proof;
- owner-bound subscription permission re-evaluation.

Executable status:
- **NOT RUN / NOT CLAIMED**: server TypeScript build and Node regressions. Current connector environment has no Forge checkout/dependency tree; shell cannot resolve GitHub checkout. Per autonomous protocol this is recorded, not used as a stop condition and not misrepresented as PASS.
- No development CI is fabricated; current repo policy uses GitHub Actions for build/deploy rather than normal development CI.
- No migration, production data mutation, secret/DNS change or deploy occurred.

## Risk

**STANDARD with security/data-contract sensitivity; CRITICAL touchpoints are delegated, not modified.**

This branch introduces read/query/planning contracts and no authoritative writes. Permission, tenant isolation and exact numeric semantics are fail-closed. Finance/ledger source definitions remain blocked on domain evidence instead of being guessed.

## Dependency requests

### Dependency request DR-WS08-01
- Target stream: **WS09**
- Need: first-class optional app manifest/compiler field for semantic models (and later semantic insights).
- Why generic: installed apps must be able to ship trusted BI semantics as metadata instead of hardcoding app schemas in shared runtime.
- Contract proposed: WS09 passes app id + app-owned DocTypes/fieldnames into `parseAppSemanticModels`; normalized server-side model definitions are retained for semantic registry composition. App manifests may not name SQL views/tables or foreign DocTypes. Client-facing catalog must expose safe summaries only, never physical fields.
- Blocking: **yes** for production app semantic registration / App Factory BI; **no** for independent WS08 contracts.
- Temporary workaround: none; do not hardcode app semantics into tenant-worker.

### Dependency request DR-WS08-02
- Target stream: **WS01 + WS00**
- Need: authoritative Daily Detailed Ledger source/grain/version/exact numeric contract after PR #199 disposition is finalized.
- Why generic: P1 Daily Ledger is a trusted finance metric source and must not be recreated as a BI-side ledger/projection.
- Contract proposed: stable read projection or immutable snapshot contract with tenant scope, exact debit/credit storage semantics, posting/account/company/branch dimensions, permission doctype and source fingerprint/version.
- Blocking: **yes** for trusted Daily Ledger semantic model; **no** for other WS08 work.
- Temporary workaround: none; branch test fixtures are illustrative contracts, not production model registration.

### Dependency request DR-WS08-03
- Target stream: **WS10**
- Need: incremental/CDC/connector delivery for semantic warehouse feeds.
- Why generic: queue/retry/DLQ/idempotent external delivery belongs to Integration Hub, not a second BI event system.
- Contract proposed: consume WS08 `SemanticSnapshotFeedBatch`/future cursor batches preserving tenant, schemaVersion, sourceVersion, idempotency and exact values; WS10 owns connector retry/DLQ.
- Blocking: **yes** for `A01-020` beyond bounded snapshot Foundation.
- Temporary workaround: bounded semantic snapshot only.

### Dependency request DR-WS08-04
- Target stream: **WS12 + WS15**
- Need: scheduler/prepared-report execution and in-app delivery for semantic subscriptions.
- Why generic: WS12 owns job/retry/observability; WS15 owns collaboration/notifications. Query worker already has prepared-report queue; creating another queue in WS08 would duplicate infrastructure.
- Contract proposed: scheduler selects due `SemanticReportSubscription`; run uses `SemanticSubscriptionExecutionService` with executor bound to subscription owner; permission is rechecked every run; output is delivered only to owner initially. Shared/email recipients require a separate permission-sharing contract.
- Blocking: **yes** for `A01-013/014` end-to-end.
- Temporary workaround: execution contract only, no fake scheduler.

### Dependency request DR-WS08-05
- Target stream: **WS09 + WS14**
- Need: dashboard/executive-cockpit composition + renderer over permission-filtered SemanticInsight summaries.
- Why generic: dashboard builder is App Factory and presentation is shared frontend runtime.
- Contract proposed: builder references insight IDs and safe scope dimensions; it never stores SQL/view/physical field names. Runtime receives only permission-filtered insight catalog and result columns.
- Blocking: **yes** for `A01-006/007/009/019` full UI maturity; **no** for semantic contracts.
- Temporary workaround: existing report UI for query results only.

## Legacy PR disposition

- PR **#199** Daily Detailed Ledger hardening: **REUSE as dependency/evidence only**, no cherry-pick into WS08 because implementation zones belong to WS00/WS01/WS14.
- No other substantive legacy PR found that should become canonical WS08 implementation.

## AI boundary

Canonical target:

`user intent -> permission-filtered semantic catalog -> strict semantic proposal -> permission-aware semantic query/tool -> deterministic result -> explanation/proposal -> preview + approval for any write`

AI does not:
- receive raw schema as a substitute for semantic definitions;
- choose tenant id;
- bypass report/user permission;
- write ledger/statutory records;
- turn forecast/anomaly/recommendation into authoritative business truth without deterministic domain validation.

## Remaining independent WS08 work

1. Self-review all branch source/tests for TypeScript/API consistency and fix defects found.
2. Add BI-specific private saved-view contract if it can remain independent of WS09/WS15 persistence.
3. Add anomaly provider seam only if it can reuse the same trusted semantic series contract without inventing domain thresholds.
4. Re-audit current main before final handoff; source-relevant drift must be incorporated, WS14-only drift may remain documented.
5. Update PR #311 body/head/evidence after autonomous closure.

## Handoff snapshot

Workstream: WS08  
Branch: `agent/ent-08-bi-semantic-ai`  
Status: ACTIVE  
PR: #311 Draft checkpoint  
Migration: none  
Production deploy: none  
Executable validation: NOT RUN / NOT CLAIMED  
Dependency requests: DR-WS08-01..05  
Legacy PR: #199 REUSE as dependency/evidence only  
Merge/deploy: **NO** — backend/data contract changes require explicit user approval; continue autonomous work until only dependency/merge gates remain.
