# Legacy Source-Exact / Parity Specification Corpus

Ngày phân loại lại: **2026-08-05**.

> **NOT CURRENT PRODUCT BRAND OR LIVE STATUS.**
>
> Current Forge state: `../../../CURRENT_STATUS.md`  
> Current architecture: `../../../docs/ARCHITECTURE.md`  
> Product naming: `../../../docs/BRAND_AND_NAMING.md`  
> Strategic target: `../../../docs/FORGE_ENTERPRISE_NORTH_STAR.md`

`server/docs/spec/**` is retained as a historical/source-exact/parity specification corpus. It contains earlier names such as **CloudForge, CloudERP, CloudHR, CloudCRM, CloudInsights and MetaForge** because scanners, oracle artifacts, source mappings and historical design records were produced under those names.

Those names do **not** define the current product model. Current umbrella product brand is **Forge**.

## Keep this corpus when

A file is still used for one or more of:

- source-exact mapping/parity evidence;
- oracle/scanner input/output;
- legal/license/source-lock evidence;
- regression/readiness tooling;
- durable architecture/business decisions not fully materialized elsewhere.

## Do not infer from this corpus

Do not use files here to infer:

- current branch/PR state;
- current release/deployment state;
- current product branding;
- current active task queue;
- current capability maturity;
- current pilot readiness.

For those questions, use `CURRENT_STATUS.md`, `NEXT_TASKS.md`, `PROJECT_CONTEXT.md` and `docs/README.md`.

## Naming rule

Do not mass-rewrite legacy names inside source-exact/oracle artifacts solely for branding. Exact historical identifiers may be part of hashes, scanners, mapping contracts or provenance.

If a file is promoted from this corpus into live product documentation, rewrite it to current **Forge** terminology and current authority boundaries first.
