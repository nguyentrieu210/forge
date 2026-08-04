# Forge Repository North Star Audit — 2026-08-05

Status: **repository/documentation/brand/security-hygiene rebaseline audit**.  
Scope: repo-wide product positioning, documentation authority, stale snapshots, brand naming and obvious one-off residue.  
Strategic source: `FORGE_ENTERPRISE_NORTH_STAR.md`.  
Live truth: exact GitHub state + `CURRENT_STATUS.md` + `NEXT_TASKS.md`.

## 1. North Star conclusion

Forge is no longer accurately described as two products (`CloudForge` backend + `MetaForge` frontend) or as an “ERP compatible with Frappe”.

Current product model is one platform:

> **Forge — enterprise operating platform metadata-driven, multi-tenant and Cloudflare-native, combining platform kernel, ERP/domain packages, App Factory and vertical apps.**

Frappe/ERPNext remains a compatibility/benchmark/reference source. `@metaforge/*`, `metaforge.api.*` and `cloudforge-*` remain technical identifiers where changing them would create unnecessary compatibility/runtime risk.

Canonical naming policy: `BRAND_AND_NAMING.md`.

## 2. Audit findings

### A. Critical authority drift

The following entrypoints were materially behind current live state and North Star positioning:

- root `README.md` — centered RC4 and “ERP tương thích Frappe”;
- `PROJECT_CONTEXT.md` — treated CloudForge/MetaForge as product layers and R5/R6 as future sequence;
- `docs/ROADMAP.md` — carried old P0–P3 queue and pre-R5 framing;
- `docs/ARCHITECTURE.md` — mixed bootstrap-era language (`MỚI`, Pha 4–5, old app-boundary conclusions) with durable architecture;
- `client/README.md` — described independent MetaForge RC/Frappe-v16 product state;
- `server/README.md` — described independent CloudForge v1.0.0 RC state.

Disposition: **rewritten/rebaselined** against current architecture and North Star.

### B. High-confidence stale snapshots

Files no longer current authority and already recoverable through Git/PR history:

- `SOURCES.md` — one-time local `C:\MetaForge` / `C:\CloudForge` consolidation note;
- `server/STATUS.md` — historical CloudForge v1.0.0 component status snapshot;
- `docs/DEPLOY_STATUS_CHOTDON.md` — point-in-time deployment status for an older environment.

Disposition: **deleted** from the live repo documentation graph.

### C. Brand drift

Observed brand families:

- Forge — current platform/product brand;
- MetaForge — historical frontend brand + current technical namespace;
- CloudForge — historical backend brand + current worker/resource identifiers;
- Kairo — old UI/marketing label and current deployed hostname namespace;
- Alumdoor — active reference vertical.

Disposition:

- product-facing platform brand => **Forge**;
- Alumdoor => keep vertical identity;
- MetaForge/CloudForge => keep only as technical compatibility identifiers or historical evidence;
- Kairo => keep only where it is an exact environment/domain identifier unless a separate product contract says otherwise.

HRM product-facing copy was changed from `Kairo Nhân sự` to `Forge Nhân sự` while `@metaforge/*` package imports remain unchanged.

### D. Historical evidence vs live docs

Final convergence, release, migration, legal/source-lock and recovery evidence must remain. Worker handoffs, branch snapshots, stale candidate manifests and point-in-time status files should not remain in the live authority graph when final records supersede them.

This follows the retention policy in `docs/README.md`.

### E. Legacy source-exact/spec corpus

`server/docs/spec/**` contains many earlier product-family names. This corpus also contains scanner/oracle/source-exact/parity contracts and therefore must not be mass-rewritten for branding.

Disposition: retain the corpus, add `server/docs/spec/README.md` that classifies it as **historical/source-exact/parity evidence, not current brand or live status**.

### F. Security hygiene finding

A set of one-off browser lab/debug scripts under `client/e2e-forge/` contained a hard-coded account credential while targeting the live Alumdoor host.

Disposition in this branch:

- delete the seven credential-bearing one-off scripts;
- keep `diagnose.mjs`, which uses environment variables/local development defaults and remains a reusable diagnostic;
- do not rewrite legitimate E2E suites merely because they use password input selectors.

**Security Dependency Request:** if the exposed account credential was ever real/current, rotate or revoke it. Repository deletion does not remove secrets from Git history. History rewriting/purge is destructive repository maintenance and requires a separate explicit operation.

## 3. Changes included in this rebaseline

### Update/rewrite

- `README.md`;
- `PROJECT_CONTEXT.md`;
- `docs/ROADMAP.md`;
- `docs/ARCHITECTURE.md`;
- `client/README.md`;
- `server/README.md`;
- `CURRENT_STATUS.md`;
- `AI_HANDOFF.md`;
- `docs/README.md`;
- HRM user-facing name/title/manifest from `Kairo Nhân sự` to `Forge Nhân sự`.

### Add

- `docs/BRAND_AND_NAMING.md`;
- this audit record;
- `server/docs/spec/README.md` classification entrypoint.

### Delete

- `SOURCES.md`;
- `server/STATUS.md`;
- `docs/DEPLOY_STATUS_CHOTDON.md`;
- seven credential-bearing one-off scripts under `client/e2e-forge/`;
- prior superseded coordination artifacts already removed by the same hygiene branch.

## 4. Explicit non-goals

This rebaseline does **not**:

- rename package scopes such as `@metaforge/*`;
- rename `metaforge.api.*` methods;
- rename Cloudflare workers/resources such as `cloudforge-*`;
- rename deployed `kairo.vn` domains;
- rewrite migration history;
- delete final release/certification/convergence/legal/source-exact evidence;
- change authoritative ERP/business behavior;
- rotate live credentials or rewrite Git history.

Those operations require a separate compatibility, migration, security or production program if justified.

## 5. Documentation authority after rebaseline

Read order:

1. exact GitHub `main`, active branch/PR and code/test/migration evidence;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md`;
5. `docs/README.md`;
6. `docs/BRAND_AND_NAMING.md`;
7. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
8. scope-specific architecture/business/release evidence.

No historical component README/status/spec snapshot may override this order.

## 6. Residual audit queue

Not every occurrence of legacy strings should be mechanically changed. Remaining occurrences are classified as:

- **KEEP — technical contract:** package/API/worker/resource identifiers, import paths, exact deployed hostnames, test fixtures tied to exact identifiers;
- **KEEP — historical/source-exact evidence:** final audit/release records and parity/oracle artifacts that accurately describe the historical identity at that time;
- **UPDATE — user-facing copy:** active app title, landing copy, README, current operational docs;
- **DELETE — stale snapshot:** one-off status/handoff/deploy/debug notes superseded by durable authority.

Known user-facing residual: active Social Commerce landing still contains historical `Kairo Social Commerce` copy. It should be changed to Forge-aligned naming in a focused UI copy change; it is not mass-edited together with technical identifiers.

Future cleanup must use this classification instead of global search-and-replace.
