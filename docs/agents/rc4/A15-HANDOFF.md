# RC4-A15 — BI / Semantic / AI

Status: IMPLEMENTED / PR PENDING
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-15-bi-semantic-ai
Risk: STANDARD with CRITICAL sensitivity at permission/data-boundary seams

Mission: close semantic metrics, analytics/BI, planning and permission-aware AI residuals. Prefer deterministic semantic definitions, governed measures, drill-through lineage, tenant/permission filtering and evidence over cosmetic dashboards.

Read: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS08-bi-semantic-ai.md.

Do not bypass A1 IAM or A9 kernel/query authority. Do not create a parallel financial metric truth; Finance metrics must reconcile with A4. Provider/AI Gateway concerns coordinate with A8/A2.

## Exact-state audit

- Exact baseline is clean current `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`; this branch was only the A15 handoff before implementation.
- `server/packages/semantic/src/index.ts`, semantic service/catalog/insight/read/planning/forecast/feed/subscription/AI-query paths are already on `main`; A15 does not rebuild them.
- Current capability status still groups `A01-005..014` as Foundation and records `A01-019` Missing; `A02-006`, `A02-013`, `A02-015`, `A02-018..024` are recorded Missing.
- Exact source is more advanced than that prose for two residuals: `server/packages/semantic/src/saved-view.ts` + `server/tests/semantic-saved-view.test.mjs` already implement owner-private saved semantic views, and `server/packages/semantic/src/anomaly.ts` + `server/tests/semantic-anomaly.test.mjs` already implement permission-visible anomaly provider orchestration. A15 therefore does not duplicate those primitives.
- Existing `SemanticInsightRegistry` owns trusted KPI/chart/pivot/table definitions and drill-through, but there was no first-class dashboard/executive-cockpit composition contract on exact main.
- Repository search found no `SemanticDashboardRegistry`/dashboard semantic service and no generic evidence-bound recommendation service on exact main.

## Implemented slices

### Slice 1 — Trusted semantic dashboard / executive cockpit composition

Files:
- `server/packages/semantic/src/dashboard.ts`
- `server/tests/semantic-dashboard.test.mjs`

Contracts/invariants:
1. Dashboard definitions reference registered semantic insight IDs only; no SQL, table/view, physical field, route or tenant identifier is part of the dashboard contract.
2. Deterministic 12-column layout rejects invalid bounds and overlapping widgets instead of relying on renderer-specific collision behavior.
3. Global dashboard filters bind only to each target insight's declared `scopeDimensions`; arbitrary hidden dimensions cannot be injected at runtime.
4. Runtime filter operators/values reuse semantic filter validation and tenant is injected only from trusted caller context when materializing widget queries.
5. Permission-aware dashboard discovery hides the whole dashboard if any widget model is denied, avoiding executive-cockpit composition leakage.
6. Dashboard execution preflights every referenced model permission before the first widget read, preventing partial reads if a later widget would be denied; the semantic executor still rechecks permission/row scope per query.
7. `kind=executive_cockpit` is a semantic composition contract only; A15 does not hard-code an executive UI into shared React runtime.

### Slice 2 — Audited natural-language dashboard request boundary

Files:
- `server/packages/semantic/src/ai-dashboard.ts`
- `server/tests/semantic-ai-dashboard.test.mjs`

Contracts/invariants:
1. AI proposal may select only a registered dashboard plus allowlisted global filters.
2. Unknown keys such as `tenant_id`, `raw_sql`, arbitrary layout or ad-hoc insight/query fields fail closed.
3. Dashboard/filter IDs and operators resolve against trusted dashboard metadata before any audit/data access.
4. Mandatory audit intent opens before dashboard permission checks or data reads; audit failure means no read occurs.
5. Permission denial is recorded as `denied`; success records widget count and aggregate returned row count.
6. AI never gains a write/action contract through this tool.

### Slice 3 — Evidence-bound generic advisory recommendation seam

Files:
- `server/packages/semantic/src/recommendation.ts`
- `server/tests/semantic-recommendation.test.mjs`

Contracts/invariants:
1. Recommendation source rows come only through `SemanticQueryExecutor`, preserving trusted tenant, permission and row-scope enforcement before provider invocation.
2. Provider input contains semantic model/member metadata plus permission-visible rows only; tenant id, SQL/view names and physical fields are not exposed.
3. Exact semantic metrics must remain safe integers before provider handoff; malformed row count/source rows fail closed.
4. Provider output is strict and advisory: only id/title/rationale/confidence/evidence are accepted. Write/action payloads are rejected.
5. Every recommendation must cite 1-10 concrete source cells by row/member. Forge joins the authoritative observed value back from permission-visible source rows; provider cannot invent evidence values, rows or unselected members.
6. Provider/model version, source version and generated timestamp are retained for provenance.

## Capability maturity candidates

No global capability status is edited before merge/evidence convergence.

- `A01-009` Dashboard: stronger **Foundation / server-wired candidate** via first-class semantic composition + execution; persistence/builder/UI still dependency-bound.
- `A01-019` Executive cockpit: **Missing -> Foundation candidate** via trusted cockpit composition; presentation/browser evidence remains absent.
- `A02-006` Natural-language dashboard request: **Missing -> Foundation candidate** via strict audited proposal/tool boundary; model/provider/router wiring remains pending.
- `A02-015` Recommendation: **Missing -> Foundation candidate** via evidence-bound advisory provider seam; domain recommendations remain separate capabilities.
- `A02-013` Anomaly detection: exact main already has source + regression artifacts; capability-status reconciliation is needed separately rather than duplicate implementation.
- `A01-012` Saved filter/view: exact main already has owner-private semantic saved-view source + tests; shared persistence/sharing breadth is still below RC.
- `A02-018..020` Purchase/Stock/Production recommendation remain domain-owner dependencies. A15 deliberately does not invent finance/stock/manufacturing truth.
- `A02-021..024` AI action/write/preview/approval remain A9/domain/IAM dependencies; A15 does not create authoritative AI writes.

## Verification evidence

Regression artifacts authored on this branch:
- `server/tests/semantic-dashboard.test.mjs`
- `server/tests/semantic-ai-dashboard.test.mjs`
- `server/tests/semantic-recommendation.test.mjs`

Covered by source-level regression intent:
- trusted tenant injection;
- dashboard filter allowlists and layout invariants;
- all-widget permission preflight before data reads;
- permission-filtered dashboard discovery;
- strict AI dashboard proposal parsing;
- audit-before-read and denied/error completion;
- recommendation provider data-boundary isolation;
- evidence-row/member provenance;
- rejection of provider write/action fields.

Executable status:
- **NOT RUN / NOT CLAIMED**: server TypeScript build and Node regressions. Runtime has no Forge checkout/dependency tree; direct `git clone` failed because DNS could not resolve `github.com`. This is recorded as missing execution evidence, not reported as PASS.
- No migration, authoritative write schema, production data mutation, secret/DNS/provider change or deploy occurred.

## Dependency Requests

### DR-RC4-A15-01 — A9 / App Factory shared manifest ownership
- Need: first-class optional dashboard/semantic-insight registration/persistence/builder contract in app manifest/compiler so installed apps can ship dashboard definitions without hardcoding them in tenant-worker.
- Boundary: A15 does not edit shared app-registry/compiler ownership.
- Blocking: yes for reusable App Factory dashboard persistence/productization; no for A15 semantic contracts.

### DR-RC4-A15-02 — RC4-A6 / WS14 presentation
- Need: metadata-driven dashboard/executive-cockpit renderer and browser/device evidence consuming trusted dashboard summaries/plans.
- Boundary: do not fork shared React views from BI backend.
- Blocking: yes for `A01-009/A01-019` UI/RC promotion; no for server semantic composition.

### DR-RC4-A15-03 — A8/A2 provider and AI Gateway wiring
- Need: approved model/provider invocation adapter, spend/privacy policy and audit persistence for NL dashboard proposal generation and recommendation providers.
- Boundary: model output remains advisory and may not mutate business authority directly.
- Blocking: yes for provider/live AI evidence; no for deterministic parser/service contracts.

## Merge/deploy boundary

This branch changes non-UI semantic/backend behavior. Per Forge policy: open PR after audit, **stop before merge/deploy until explicit user approval**.
