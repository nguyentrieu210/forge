# R6 Final Production Certification — 2026-08-05

Verdict: **PILOT-GO**

## 1. Certified identity

- Repository: `nguyentrieu210/forge`
- Tenant: `alu`
- Pilot target: `https://alu.kairo.vn`
- Exact certified/deployed source SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`
- Release SHA observed from production: `49315112a21182d2ce077b08a1fb9e26db07fd36`
- UI bundle hash: `838218167db020d8`
- Canonical full production deploy run: `30952411424` — **SUCCESS**
- Final post-release certification run: `30952703083` — **SUCCESS**
- Authorization/orchestrator status: **PILOT-GO / evidence_23_of_23**

Machine authorities:

- `deploy-evidence/r6-final-production-certification-49315112a211.json`
- `deploy-evidence/r6-authorized-orchestrator-49315112a211.json`

## 2. Package and capability-profile identity

| Component | Certified identity |
|---|---|
| Alumdoor | `2.2.3` |
| HRM | `1.8.0` |
| VN Accounting | `1.6.1` |
| Capability profile | `alumdoor-pilot@1` |
| Profile content hash | `3e3124018aa3c7d233f0af8b81f751cd3e4a8329b94a2c9295956bc58ac8f7f8` |
| Profile valid | `true` |
| Blocked capabilities | none |

Installed package/profile observation and production release marker all matched the exact certified candidate.

## 3. Migration, backup and recovery evidence

- Expected migrations: `80`.
- Applied migrations: `80`.
- Pending migrations: `0`.
- Unknown migrations: `0`.
- Fresh backup manifest/checksum verification: **PASS**.
- Backup source size: `13,920,392` bytes.
- Local replay quick check: `ok`.
- Foreign-key violations: `0`.
- Tenant-scope violations: `0` for documents, doctype definitions and installed apps.
- Disposable remote D1 restore: **PASS**.
- Restored table count: `97`.
- Restored migration count: `80`.
- Source/restored reconciliation: **PASS** for documents, masters, installed apps, app revisions, migrations, stock, payment and GL metrics.
- D1 Time Travel support: observed by read-only current/target bookmark probes; destructive PITR was **not** executed during certification.

## 4. Release/provider/runtime evidence

Production health observation returned:

- `/health`: HTTP `200`;
- root: HTTP `200`;
- guest boot boundary: HTTP `403`;
- release endpoint: HTTP `200`;
- exact release SHA: match;
- bundle hash: match.

Provider observation found the required Gateway, tenant Worker, Alumdoor app Worker, dispatch namespace, bindings and observability state with no blocker.

Bounded live pressure evidence:

| Metric | Result |
|---|---:|
| Requests | 50 |
| Concurrency | 5 |
| Errors | 0 |
| Error rate | 0 |
| RPS | 141.85 |
| p50 | 21.84 ms |
| p95 | 78.08 ms |
| p99 | 97.82 ms |

This is certification smoke evidence, not a customer SLA/SLO declaration.

## 5. R6 evidence matrix

Every mandatory evidence item was bound to exact candidate `49315112a21182d2ce077b08a1fb9e26db07fd36`.

| ID | Scope | Result |
|---|---|---|
| R6-E01 | Source governance | PASS |
| R6-E02 | Provider inventory | PASS |
| R6-E03 | Health/auth boundary | PASS |
| R6-E04 | Exact release marker | PASS |
| R6-E05 | Observability | PASS |
| R6-E06 | Migration inventory | PASS |
| R6-E07 | Fresh backup | PASS |
| R6-E08 | Isolated replay | PASS |
| R6-E09 | Disposable remote restore | PASS |
| R6-E10 | PITR/rollback decision evidence | PASS |
| R6-E11 | Opening/source-restored reconciliation | PASS |
| R6-E12 | Auth/session/admin | PASS |
| R6-E13 | Tenant isolation | PASS |
| R6-E14 | Queue/retry/DLQ | PASS |
| R6-E15 | Recovery contract | PASS |
| R6-E16 | Bounded performance | PASS |
| R6-E17 | Telemetry/cost pressure | PASS |
| R6-E18 | Package/profile identity | PASS |
| R6-E19 | Authenticated Golden lineage | PASS |
| R6-E20 | Stock/Finance canonical readback | PASS |
| R6-E21 | Failure/idempotency | PASS |
| R6-E22 | Correction/settlement | PASS |
| R6-E23 | Warranty/service lineage | PASS |
| **Total** |  | **23/23 PASS** |

## 6. Source-fix lineage during certification

R6 rejected stale evidence whenever a source-changing fix was required. Final certification was rerun on the final exact candidate rather than inheriting older candidate evidence.

The final bounded fixes included:

- preserving canonical aggregate report field keys so app charts/reports use one public field identity;
- locking that behavior with query regression coverage;
- making canonical full-release worktree handling explicit and fail-closed;
- allowing `--allow-dirty` for mutation scripts only after exact-source reconciliation and deterministic generated-output guards.

Earlier blocked production-certification attempts remain diagnostic history only. They are not counted as evidence for the final candidate.

## 7. Scope and boundaries

`PILOT-GO` means the exact release is certified to enter **Alumdoor Controlled Pilot**.

It does not mean:

- real customer/master/opening-data migration is complete;
- parallel run is complete;
- cutover has business acceptance;
- hypercare is complete;
- Forge is GA.

Real production data import/write, business cutover, production restore/PITR, DNS/routes/secrets/provider mutation and destructive state operations remain explicit authorization boundaries.

Worker rollback remains distinct from D1/KV/R2/external-state recovery.

## 8. Final decision

There is no unresolved R6 P0/P1 blocker in controlled-pilot scope, all mandatory R6 evidence items pass on one exact candidate, and production release identity was observed directly.

**PILOT-GO**

Next program: **Alumdoor Controlled Pilot**. Active execution queue: `NEXT_TASKS.md`.