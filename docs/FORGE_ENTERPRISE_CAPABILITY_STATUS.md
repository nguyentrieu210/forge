# Forge Enterprise Capability Status

> RC-01 capability truth baseline  
> Baseline: `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  
> Branch: `rc/w0-capability-status`  
> Date: 2026-08-03  
> Denominator: `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`

## Truth rules

This is an evidence baseline, not a merge scoreboard. Exact current-main source/migrations/tests win over prose. Merge state is source provenance only.

Required `docs/FORGE_RC_HARDENING_PLAN_20260803.md` is absent on the exact baseline; repository search also found no canonical `RC-000`, `RC-001`, `RC-004` definitions. `DR-RC01-001` records that dependency. The user-assigned RC-01 scope + Skill + North Star + Capability Map are used as the temporary task contract.

Maturity:
- **Missing**: no real path proven or no authoritative evidence found.
- **Foundation**: schema/API/metadata/planner/provider seam, but path/evidence incomplete.
- **Wired**: meaningful end-to-end/server path exists; promotion evidence is thin/incomplete.
- **RC**: declared scope has main path + invariants + focused regression evidence.
- **Hardened**: production-grade scope with failure/correction/security/reconciliation, UI/E2E where relevant, and exact release evidence for deployed claims.

For finance/stock/payroll, missing correction/reconciliation blocks Hardened and normally blocks RC. For UI/mobile, missing browser/mobile evidence blocks RC. Older production releases do not prove exact-current-main deployment.

## Baseline maturity report

| Maturity | Count | Share |
|---|---:|---:|
| Hardened | 0 | 0.00% |
| RC | 4 | 0.42% |
| Wired | 448 | 46.86% |
| Foundation | 345 | 36.09% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |

**Hardened = 0 by evidence.** Exact-current-main production/failure/reconciliation evidence is not sufficient to make a defensible Hardened claim. The four RC IDs are intentionally narrow: `I01-014`, `G02-001`, `VP01-007`, `VP01-008`.

## Evidence Index

Each registry row inherits one bundle. Every bundle covers **source / test / migration / permission / reconciliation-correction / UI / production**; `none/unproven` is evidence of absence, never PASS.

- `E-FIN`: src Finance/O2C/ERPNext/query + merged #367; test regressions exist but convergence head had 0 runs/statuses; mig `0042`, `0089..0098`; perm server DocPerm/org-security; recon correction/period paths exist but close + stock↔GL/full cross-ledger incomplete; UI generic metadata, no family browser proof; prod exact-current-main unproven.
- `E-VN`: src VN accounting/tax/e-invoice seams; tests source only/exact-head CI unproven; mig finance/VN chain; perm server; recon legal/source/provider long-tail incomplete; UI metadata; prod unproven.
- `E-CRM`: src CRM app/controllers + merged #321; `crm-revenue.test.mjs` authored, executable green not claimed; mig none; perm company/tenant/DocPerm; recon lifecycle correction exists but atomic conversion/merge/360 missing; UI metadata only; prod none.
- `E-PROC`: src canonical purchasing/allocation; focused tests source, exact execution thin; mig none/local dependent; perm canonical document path; recon partial/cancel exists, 3-way match/variance/landed-cost orchestration incomplete; UI partial/vertical; prod none.
- `E-STOCK`: src stock controllers/integrity + merged #307; focused regression source, full later run NOT RUN; mig none WS04; perm warehouse/company/tenant; recon reversal exists but stock↔GL repost/reconcile open; UI scanner/mobile partial; prod none.
- `E-COMMERCE`: src POS/logistics/social + merged #310; focused tests authored, exact-head run NOT RUN; mig none; perm actor/company/DocPerm; recon POS close/POD correction exist, refund/reservation/COD finance gaps; UI no dedicated production POS/offline E2E; prod none.
- `E-MFG`: src manufacturing/QMS + merged #404; many regressions authored, convergence head 0 runs/statuses; mig metadata/no WS05 SQL; perm bounded APIs; recon stock trace exists, finance actual-cost/repost/rework/subcontract gaps; UI metadata; prod none.
- `E-ASSET`: src exact-main ERPNext registry includes Asset, Depreciation, Movement, Maintenance, Disposal plus WS07 service/maintenance; tests not audited as one family suite; mig mixed; perm canonical; recon disposal/depreciation correction depth not promoted; UI metadata; prod unproven.
- `E-HCM`: src HRM/payroll + merged #414; Node/SQLite regression source, exact-head CI NOT RUN; mig `0099..0104`; perm server with sensitive-field follow-up debt; recon payroll/loan closure partial, Finance/loan-exit policy open; UI ESS/mobile specialized evidence incomplete; prod unproven.
- `E-SERVICE`: src projects/support/maintenance + merged #352; tests authored, exact checkout execution absent; mig package-specific; perm mutation assignment scope, READ row-scope DR; recon correction/cancel present, finance/stock dependencies; UI metadata/mobile partial; prod none.
- `E-WORKPLACE`: src workplace/DMS/CLM + merged #415; isolated SQLite integrity PASS, full build/tests NOT RUN; mig `0105..0109`; perm explicit share + notification read recheck; recon workflow/history exists, scheduler/provider gaps; UI generic; prod none.
- `E-APPFACTORY`: src app-registry/compiler/workflow/builder + merged #362; regressions source, final head 0 runs/statuses; mig `0088`; perm server permission authority; recon install/upgrade transactional but rollback/quorum/timer missing; UI builder exists, browser proof thin; prod none.
- `E-BI`: src semantic/query/report + merged #311; semantic tests authored, executable NOT RUN; mig none; perm authorize-before-query/trusted tenant; recon read/planning only; UI ReportView/export, builder depth incomplete; prod none.
- `E-INTEGRATION`: src integration-hub/outbox/jobs/social + merged #308; targeted tests source, full build NOT RUN; mig none; perm trusted tenant/target guards, secret vault delegated; recon idempotency/retry contracts exist but physical DLQ/replay wiring incomplete; UI admin metadata; prod none.
- `E-IAM`: src auth/session/permission/org-security/control-plane + merged #317; focused security regressions source, full exact-head CI absent; mig none; perm is the subject, deny-by-default; recon session epoch/audit exist, native step-up/MFA/SSO/privacy/SaaS gaps; UI not authority; prod unproven.
- `E-SRE`: src release/backup/PITR/rollback/observability + merged #320; isolated helper evidence 21/21 PASS, full repo NOT RUN; mig release-verification dependent; perm guarded operator confirmation; recon backup/integrity tooling exists but prod restore/rollback/reconcile drills unproven; UI release marker checks; prod older Alumdoor evidence only, not exact current main.
- `E-DX`: src CLI/generator/compiler/test tooling; tests fragmented/no single promotion suite; mig tooling varies; perm N/A or server-auth when executed; recon N/A; UI developer-only; prod none.
- `E-UI`: src shared MetaForge + merged WS14 slices; source check scripts, full build/browser NOT RUN; mig none; perm server-authoritative; recon offline/OCC conflict contract absent; UI responsive/installable Wired but browser/mobile proof missing; prod exact current main unproven.
- `E-MDM`: src canonical masters/metadata/kernel; broad source evidence but no RC-01 dedicated suite; mig app/meta; perm DocPerm/User Permission; recon duplicate/merge/steward/effective-date depth incomplete; UI metadata; prod unproven.
- `E-MIGRATION`: src migration package + Data Import + merged #313; targeted SQLite/strict-harness evidence and authored tests, full repo NOT RUN; mig durable journal lineage; perm import/create + canonical kernel; recon retry/reconcile contract exists, opening providers/content-hash crash-window open; UI mapping/correction pending; prod cutover not run.
- `E-ALUMDOOR`: src Alumdoor + merged #316; Golden Order isolated 7/7 PASS and byte-identical #295 historical validation; mig product path on main; perm callback/caller identity boundary; recon supplier settlement reversal + Golden Order verifier; UI production evidence belongs to historical 2.2.1; prod source 2.2.2 not claimed deployed.
- `E-UNKNOWN`: no authoritative current-main family implementation evidence established by RC-01; test/mig/perm/recon/UI/prod all unproven.

## Dependency Request

`DR-RC01-001`: add the missing canonical RC hardening plan or an explicit superseding RC task ledger. Blocking for cross-agent task-ID traceability, not for this user-specified RC-01 baseline.

## Capability Status Registry

Range syntax is inclusive. Example `F01-001..F01-016` expands to sixteen individual capability IDs. The validator expands every expression, assigns the row maturity/evidence to each individual ID, and requires **956 unique IDs exactly once**.

<!-- CAPABILITY_REGISTRY_START -->
### F01 (25)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `F01-001..F01-016` | `E-FIN` |
| Foundation | `F01-017..F01-025` | `E-FIN` |

### F02 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `F02-001..F02-012` | `E-FIN` |
| Foundation | `F02-013..F02-018` | `E-FIN` |

### F03 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `F03-001..F03-009` | `E-FIN` |
| Foundation | `F03-010..F03-013` | `E-FIN` |

### F04 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `F04-001..F04-010` | `E-FIN` |
| Foundation | `F04-011..F04-020` | `E-FIN` |

### F05 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `F05-001..F05-010` | `E-FIN` |
| Missing | `F05-011..F05-016` | `E-FIN` |

### F06 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `F06-001..F06-003` | `E-FIN` |
| Missing | `F06-004..F06-012` | `E-FIN` |

### F07 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `F07-001..F07-004` | `E-FIN` |
| Foundation | `F07-005..F07-009` | `E-FIN` |

### V01 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `V01-001..V01-007` | `E-VN` |
| Foundation | `V01-008` `V01-009` | `E-VN` |

### V02 (14)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `V02-001..V02-008` | `E-VN` |
| Missing | `V02-009..V02-014` | `E-VN` |

### V03 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `V03-001..V03-010` | `E-HCM` |

### V04 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `V04-001..V04-005` | `E-VN` |
| Missing | `V04-006..V04-010` | `E-VN` |

### C01 (21)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `C01-001` `C01-004..C01-006` `C01-008..C01-011` `C01-013` | `E-CRM` |
| Foundation | `C01-007` `C01-016` `C01-017` | `E-CRM` |
| Missing | `C01-002` `C01-003` `C01-012` `C01-014` `C01-015` `C01-018..C01-021` | `E-CRM` |

### C02 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `C02-001..C02-003` | `E-CRM` |
| Missing | `C02-004..C02-009` | `E-CRM` |

### C03 (24)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `C03-001..C03-020` | `E-CRM` |
| Foundation | `C03-021..C03-023` | `E-CRM` |
| Missing | `C03-024` | `E-CRM` |

### C04 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `C04-001` `C04-002` | `E-CRM` |
| Missing | `C04-003..C04-009` | `E-CRM` |

### P01 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `P01-002..P01-004` `P01-008` `P01-010..P01-014` | `E-PROC` |
| Foundation | `P01-001` `P01-007` `P01-009` `P01-015..P01-018` `P01-020` | `E-PROC` |
| Missing | `P01-005` `P01-006` `P01-019` | `E-PROC` |

### P02 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `P02-010` | `E-PROC` |
| Foundation | `P02-001` `P02-003` `P02-006` | `E-PROC` |
| Missing | `P02-002` `P02-004` `P02-005` `P02-007..P02-009` | `E-PROC` |

### W01 (32)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `W01-001..W01-020` `W01-022` `W01-025` | `E-STOCK` |
| Foundation | `W01-021` `W01-023` `W01-024` `W01-026..W01-031` | `E-STOCK` |
| Missing | `W01-032` | `E-STOCK` |

### W02 (14)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `W02-009` `W02-014` | `E-STOCK` |
| Foundation | `W02-001..W02-003` `W02-005..W02-008` `W02-010..W02-012` | `E-STOCK` |
| Missing | `W02-004` `W02-013` | `E-STOCK` |

### L01 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `L01-006` `L01-008` | `E-COMMERCE` |
| Foundation | `L01-001..L01-005` `L01-007` `L01-009..L01-016` | `E-COMMERCE` |

### M01 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `M01-001..M01-005` `M01-009..M01-012` | `E-MFG` |
| Foundation | `M01-006` | `E-MFG` |
| Missing | `M01-007` `M01-008` | `E-MFG` |

### M02 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `M02-001` `M02-003` `M02-004` `M02-007..M02-010` | `E-MFG` |
| Foundation | `M02-005` `M02-006` | `E-MFG` |
| Missing | `M02-002` | `E-MFG` |

### M03 (14)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `M03-001..M03-008` `M03-011` `M03-012` | `E-MFG` |
| Foundation | `M03-013` `M03-014` | `E-MFG` |
| Missing | `M03-009` `M03-010` | `E-MFG` |

### M04 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `M04-001..M04-003` | `E-MFG` |
| Foundation | `M04-004..M04-007` | `E-MFG` |
| Missing | `M04-008..M04-010` | `E-MFG` |

### Q01 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `Q01-001..Q01-010` | `E-MFG` |
| Foundation | `Q01-011..Q01-016` | `E-MFG` |

### E01 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `E01-004` `E01-006` `E01-007` `E01-010` `E01-011` `E01-016` | `E-ASSET` |
| Foundation | `E01-001..E01-003` `E01-005` `E01-008` `E01-015` | `E-ASSET` |
| Missing | `E01-009` `E01-012..E01-014` | `E-ASSET` |

### E02 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `E02-001..E02-010` `E02-013` `E02-014` `E02-016..E02-018` | `E-ASSET` |
| Foundation | `E02-011` `E02-012` `E02-015` | `E-ASSET` |

### H01 (8)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H01-001..H01-008` | `E-HCM` |

### H02 (11)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H02-001` `H02-003` `H02-004` `H02-006..H02-011` | `E-HCM` |
| Foundation | `H02-002` `H02-005` | `E-HCM` |

### H03 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H03-001..H03-009` | `E-HCM` |
| Foundation | `H03-010` | `E-HCM` |

### H04 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H04-001..H04-015` | `E-HCM` |

### H05 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H05-001..H05-017` | `E-HCM` |
| Foundation | `H05-018` | `E-HCM` |

### H06 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `H06-001..H06-012` | `E-HCM` |
| Missing | `H06-013` | `E-HCM` |

### J01 (23)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `J01-001` `J01-002` `J01-004..J01-008` `J01-010` `J01-021` `J01-022` | `E-SERVICE` |
| Foundation | `J01-003` `J01-009` `J01-023` | `E-SERVICE` |
| Missing | `J01-011..J01-020` | `E-SERVICE` |

### S01 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `S01-001..S01-003` `S01-006` `S01-013..S01-015` | `E-SERVICE` |
| Foundation | `S01-004` `S01-005` `S01-009` `S01-010` `S01-012` | `E-SERVICE` |
| Missing | `S01-007` `S01-008` `S01-011` | `E-SERVICE` |

### S02 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `S02-001..S02-004` `S02-009` `S02-012` | `E-SERVICE` |
| Foundation | `S02-008` `S02-010` `S02-011` | `E-SERVICE` |
| Missing | `S02-005..S02-007` `S02-013` | `E-SERVICE` |

### R01 (17)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `R01-002` `R01-005` `R01-015` | `E-COMMERCE` |
| Foundation | `R01-001` `R01-003` `R01-004` `R01-006..R01-010` `R01-016` `R01-017` | `E-COMMERCE` |
| Missing | `R01-011..R01-014` | `E-COMMERCE` |

### R02 (19)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `R02-004..R02-009` `R02-013` `R02-018` | `E-COMMERCE` |
| Foundation | `R02-001..R02-003` `R02-011` `R02-012` `R02-014..R02-017` `R02-019` | `E-COMMERCE` |
| Missing | `R02-010` | `E-COMMERCE` |

### D01 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `D01-001` `D01-003..D01-007` `D01-011` `D01-012` `D01-014` `D01-016` | `E-WORKPLACE` |
| Foundation | `D01-002` `D01-008` `D01-009` `D01-013` `D01-015` | `E-WORKPLACE` |
| Missing | `D01-010` | `E-WORKPLACE` |

### D02 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `D02-001` `D02-003` `D02-004` `D02-006..D02-008` | `E-WORKPLACE` |
| Foundation | `D02-002` `D02-005` `D02-009..D02-013` | `E-WORKPLACE` |

### D03 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `D03-001..D03-006` `D03-008` `D03-009` `D03-011` `D03-012` | `E-WORKPLACE` |
| Foundation | `D03-007` `D03-010` `D03-013` | `E-WORKPLACE` |

### B01 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `B01-001..B01-004` `B01-008` | `E-APPFACTORY` |
| Foundation | `B01-006` `B01-007` `B01-012..B01-015` `B01-018` | `E-APPFACTORY` |
| Missing | `B01-005` `B01-009..B01-011` `B01-016` `B01-017` | `E-APPFACTORY` |

### B02 (23)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `B02-001..B02-005` `B02-016` | `E-APPFACTORY` |
| Foundation | `B02-007..B02-013` `B02-017..B02-023` | `E-APPFACTORY` |
| Missing | `B02-006` `B02-014` `B02-015` | `E-APPFACTORY` |

### A01 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `A01-001..A01-004` `A01-015` | `E-BI` |
| Foundation | `A01-005..A01-014` `A01-017` `A01-018` `A01-020` | `E-BI` |
| Missing | `A01-016` `A01-019` | `E-BI` |

### A02 (25)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `A02-001` `A02-002` | `E-BI` |
| Foundation | `A02-003..A02-005` `A02-007..A02-012` `A02-014` `A02-016` `A02-017` `A02-025` | `E-BI` |
| Missing | `A02-006` `A02-013` `A02-015` `A02-018..A02-024` | `E-BI` |

### I01 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | `I01-014` | `E-INTEGRATION` |
| Wired | `I01-001` `I01-009..I01-012` | `E-INTEGRATION` |
| Foundation | `I01-002..I01-008` `I01-013` `I01-015` | `E-INTEGRATION` |

### I02 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `I02-011` | `E-INTEGRATION` |
| Foundation | `I02-001..I02-003` `I02-006` `I02-008..I02-010` | `E-INTEGRATION` |
| Missing | `I02-004` `I02-005` `I02-007` `I02-012..I02-016` | `E-INTEGRATION` |

### G01 (18)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `G01-001..G01-010` `G01-016` `G01-017` | `E-IAM` |
| Foundation | `G01-018` | `E-IAM` |
| Missing | `G01-011..G01-015` | `E-IAM` |

### G02 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | `G02-001` | `E-IAM` |
| Wired | `G02-002` `G02-007` | `E-IAM` |
| Foundation | `G02-003..G02-006` `G02-008` `G02-009` | `E-IAM` |

### T01 (20)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `T01-001..T01-005` `T01-012` `T01-013` | `E-IAM` |
| Foundation | `T01-006..T01-011` `T01-015..T01-018` | `E-IAM` |
| Missing | `T01-014` `T01-019` `T01-020` | `E-IAM` |

### O01 (21)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `O01-001..O01-005` `O01-008` `O01-009` `O01-011` `O01-013` `O01-014` `O01-017..O01-020` | `E-SRE` |
| Foundation | `O01-006` `O01-007` `O01-010` `O01-012` `O01-015` `O01-016` `O01-021` | `E-SRE` |

### X01 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `X01-001..X01-009` | `E-DX` |
| Foundation | `X01-010..X01-015` | `E-DX` |

### N01 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `N01-001..N01-010` | `E-WORKPLACE` |

### N02 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `N02-001` `N02-010..N02-012` | `E-WORKPLACE` |
| Foundation | `N02-002` `N02-007..N02-009` | `E-WORKPLACE` |
| Missing | `N02-003..N02-006` | `E-WORKPLACE` |

### N03 (9)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `N03-001` `N03-004` `N03-007` `N03-008` | `E-WORKPLACE` |
| Foundation | `N03-002` `N03-003` `N03-005` `N03-006` `N03-009` | `E-WORKPLACE` |

### U01 (13)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `U01-001` `U01-002` | `E-UI` |
| Foundation | `U01-008..U01-013` | `E-UI` |
| Missing | `U01-003..U01-007` | `E-UI` |

### U02 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `U02-001..U02-009` | `E-UI` |
| Foundation | `U02-010..U02-012` | `E-UI` |

### MD01 (21)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `MD01-001..MD01-016` | `E-MDM` |
| Foundation | `MD01-017..MD01-021` | `E-MDM` |

### MD02 (10)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `MD02-001..MD02-010` | `E-MDM` |

### IM01 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| Foundation | `IM01-001..IM01-006` `IM01-008..IM01-015` | `E-MIGRATION` |
| Missing | `IM01-007` | `E-MIGRATION` |

### IM02 (16)
| Maturity | ID expression | Evidence |
|---|---|---|
| Wired | `IM02-001` `IM02-004` | `E-MIGRATION` |
| Foundation | `IM02-002` `IM02-003` `IM02-005..IM02-012` `IM02-016` | `E-MIGRATION` |
| Missing | `IM02-013..IM02-015` | `E-MIGRATION` |

### VP01 (15)
| Maturity | ID expression | Evidence |
|---|---|---|
| RC | `VP01-007` `VP01-008` | `E-ALUMDOOR` |
| Wired | `VP01-001..VP01-006` `VP01-009..VP01-012` | `E-ALUMDOOR` |
| Foundation | `VP01-013..VP01-015` | `E-ALUMDOOR` |

### VP02 (12)
| Maturity | ID expression | Evidence |
|---|---|---|
| Missing | `VP02-001..VP02-012` | `E-UNKNOWN` |

<!-- CAPABILITY_REGISTRY_END -->

## Completeness proof

Run `node server/scripts/validate-enterprise-capability-status.mjs`.

Required output:
```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Capability status completeness: 956/956
```

RC-01 generator-side assertion against the exact Capability Map family denominator: `956 expanded / 956 unique / 0 duplicate / 0 missing / 0 unknown`.

## Top-30 blockers / next tasks

1. Publish missing RC hardening plan / task-ID contract.
2. Deterministic FAST/STANDARD/CRITICAL exact-head validation lanes.
3. Exact-current-main `/health` + `/release.json` + worker/release identity proof.
4. Canonical workflow topology: non-UI commits must not trigger UI-only deploy.
5. Close current-main backup verification / restore-drill gaps before DR promotion.
6. Migration applied-content checksum + crash-window/replay safety.
7. Finance close/open/reopen + period lock truth.
8. Finance cross-ledger reconciliation: GL/stock/AP/AR/payment/payroll.
9. Consolidation/intercompany/elimination depth (`F06`).
10. FX revaluation + realized/unrealized correction.
11. VN e-invoice/tax provider + legal-source closure.
12. Payroll official numeric fixture promotion.
13. Payroll→GL/payment reconciliation + Employee Loan correction/separation policy.
14. Generic stock reservation lifecycle.
15. Stock backdate/repost→Finance reconciliation.
16. Persisted WMS task + permission-safe scanner/mobile wiring.
17. Procurement three-way match + quantity/price variance + hold.
18. Supplier approved-list/rating/quality/contract/blanket/portal.
19. CRM atomic conversion + Contact/Organization + Customer 360.
20. CRM duplicate/merge/scoring/forecast/team/quota/commission/marketing.
21. Recurring subscription billing/renewal orchestration.
22. Manufacturing rework policy + subcontract/demand orchestration.
23. Manufacturing actual-cost posting + variance reconciliation.
24. IAM privileged-step-up parity across native + Frappe surfaces.
25. MFA/OIDC/SAML/SSO/SCIM.
26. Sensitive Employee field/permlevel exact-main hardening.
27. Credential vault/rotation/revocation/audited use.
28. Integration Hub physical delivery persistence + DLQ inspect/quarantine/replay/metrics.
29. Offline cache/write/sync/OCC/conflict/revoke-purge contract.
30. Browser/mobile/UI promotion evidence, including base ChildGrid and Matrix named-source/action bridge.

## Interpretation

Forge is implementation-heavy and evidence-light: most capabilities are Wired/Foundation, but exact-head validation, reconciliation, browser/mobile proof, and exact-current-main production evidence lag behind. The shortest path to higher maturity is to close shared evidence gates first, then fill true Missing capability gaps. Merge count is not a maturity model.
