# AI HANDOFF

Ngày cập nhật: **2026-08-05**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- RC4: **DONE**.
- R5: **DONE / R5-GO** via PR `#638`.
- R6 Production Certification: **DONE / PILOT-GO**.
- Exact certified/deployed R6 source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`.
- Canonical full production deploy run: `30952411424` — SUCCESS.
- Final certification run: `30952703083` — SUCCESS.
- Final evidence: `deploy-evidence/r6-final-production-certification-49315112a211.json` — **R6-E01..R6-E23 = 23/23 PASS**.
- Release marker: SHA `49315112a21182d2ce077b08a1fb9e26db07fd36`, bundle `838218167db020d8`.
- Installed pilot packages: Alumdoor `2.2.3`, HRM `1.8.0`, VN Accounting `1.6.1`.
- Active profile: `alumdoor-pilot@1`, valid, no blocked capabilities.
- Migration state: **80/80 applied, zero pending/unknown**.
- Capability truth remains **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956** unless a newer materialized convergence record changes it.

## What is next

Active sequence:

`R6 PILOT-GO -> Alumdoor Controlled Pilot -> Pilot Exit Gate -> Accepted Production Reference -> GA`

Use `NEXT_TASKS.md` as the active pilot queue. Do not reopen R6 agent waves unless a future source-changing defect invalidates exact release evidence.

## Controlled-pilot priorities

1. freeze certified software/profile baseline and pilot contract;
2. prepare deterministic master/opening-data mappings and dry-run reconciliation;
3. import/write real production data only under explicit authorization;
4. run representative transactions;
5. parallel run against the operational source;
6. reconcile Stock/AR/AP/payment/revenue/COGS/manufacturing/GL daily;
7. obtain explicit cutover acceptance;
8. hypercare and Pilot Exit Gate.

## Invariants to preserve

- Document/business writes go through canonical Document Kernel/aggregate path.
- GL/Payment Ledger and Stock Ledger remain single authoritative ledger families.
- Vertical apps consume shared domain authorities; do not copy HRM/CRM/Finance/Stock implementations into Alumdoor.
- Server-side permission/tenant boundary is authoritative.
- Money/legal rules use deterministic/effective-dated/source-bound semantics.
- Migration history is append-only; applied-state claims need environment evidence.
- Capability disable is not package uninstall and must not destroy historical data.
- Merge does not imply deployed; source/config does not imply provider/live proof.
- R6 evidence is exact-SHA bound; future source changes require affected production evidence rerun.

## Production boundary

R6 authorization has been consumed for the certified release/certification sequence. Controlled-pilot customer/master/opening-data mutation, production cutover, DNS/route/secret/provider mutation, production restore/PITR and destructive state operations remain explicit authorization boundaries.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md`;
5. `docs/README.md`;
6. `docs/agents/r6/R6_FINAL_CERTIFICATION_20260805.md` for R6 closure provenance;
7. `skills/forge-enterprise-completion/SKILL.md`;
8. North Star/capability map and scope-specific contracts/evidence.