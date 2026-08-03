# WS00–WS17 phase convergence record — 2026-08-03

Status: **PHASE CLOSED / CANONICAL DELTAS MERGED**  
Evidence priority: exact GitHub state > workstream handoff/status prose > `NEXT_TASKS.md` > project context > North Star.  
Policy: `skills/forge-enterprise-completion/SKILL.md` + `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md`.  
Code-convergence snapshot before this checkpoint merge: `main@9571f173a5e7fcb861cd2defa11952f5eb16a61d`.

## Phase-close result

The user explicitly approved non-UI merge/convergence for this phase. The seven previously review-gated convergence deltas are now merged into `main`.

| WS | Domain | Canonical merged PR | Merge result / migration |
|---|---|---|---|
| WS09 | BPM + App Factory | #362 | merged; `0088` |
| WS01 | Finance + VN compliance | #367 | merged; `0089..0098` |
| WS02 | CRM / Revenue 360 | #321 | merged; no tenant migration |
| WS16 | Logistics / POS / Social Commerce | #310 | merged; no tenant migration |
| WS05 | Manufacturing / MRP II / QMS | #404 | rebuilt on current main, exact 50-path delta; no tenant migration |
| WS06 | HCM + statutory payroll | #414 | rebuilt on current main, exact 82-path delta; `0099..0104` |
| WS15 | Workplace / DMS / Contract / Collaboration | #415 | rebuilt on current main, exact 35-path delta; `0105..0109` |

The original conflict-only review PRs were retained as historical evidence and closed as superseded:

- WS05 #380 → superseded by merged #404.
- WS06 #372 → superseded by merged #414.
- WS15 #377 → superseded by merged #415.

No source branch was deleted. Branch deletion remains destructive cleanup and was not required to close the phase.

## WS00–WS17 canonical phase state

| WS | Canonical state |
|---|---|
| WS00 | **MERGED** #306 |
| WS01 | **MERGED** #367 |
| WS02 | **MERGED** #321 |
| WS03 | **MERGED** #347; #342/#353 superseded |
| WS04 | **MERGED** #307 |
| WS05 | **MERGED** #404; #380 superseded |
| WS06 | **MERGED** #414; #372 superseded |
| WS07 | **MERGED** #352 |
| WS08 | **MERGED** #311 |
| WS09 | **MERGED** #362 |
| WS10 | **MERGED** #308 |
| WS11 | **MERGED** #317 |
| WS12 | **MERGED** #320 |
| WS13 | **MERGED** #313 |
| WS14 | **UI fast-path merged**; Alumdoor HR/Employee Lite overlays remain on main |
| WS15 | **MERGED** #415; #377 superseded |
| WS16 | **MERGED** #310 |
| WS17 | **MERGED** #316 plus later Alumdoor overlays |

Shared HRM remains a full shared application. Alumdoor continues to expose only Employee + Attendance at the shell/product layer; this phase does not reduce the shared HRM manifest.

## Migration map now merged

The convergence migration sequence is no longer a reservation. It is merged on main:

- `0088` — WS09 App Factory revision history.
- `0089..0098` — WS01 Finance / VN compliance.
- `0099..0104` — WS06 HCM / statutory payroll.
- `0105..0109` — WS15 Workplace / DMS / collaboration.

Parallel Alumdoor work used an older-numbered product migration path and did not collide with `0088..0109` during this phase-close audit.

## Exact final-head CI evidence

GitHub Actions PR workflow runs and combined commit statuses were queried after the final convergence heads were established.

| Canonical PR | Final review head | PR workflow runs | Combined statuses | Evidence state |
|---|---|---:|---:|---|
| #362 WS09 | `ff05c35313246419cc6df1463564523521782c24` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #367 WS01 | `e1e8a70a0122ffcbe5c13ff670d6805fefad681a` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #321 WS02 | `7135633163609b16ff453e0bf915a1b3180d369e` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #310 WS16 | `1e202f86912ef5499c16cbc656e80824932822b4` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #404 WS05 | `40844ba40cb172949f4347f5814adb53a97f55d2` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #414 WS06 | `d994cdd3b44772b1592d6e3384a8fdd1bee2206f` | 0 | 0 | **NOT RUN / UNPROVEN** |
| #415 WS15 | `3a77d568732a01ef1ad98951771f23020585ee33` | 0 | 0 | **NOT RUN / UNPROVEN** |

Committed tests and migration regressions are source evidence only. This record does not convert missing CI into a PASS claim.

## Reconciliation decisions made during merge

### WS05 current-main rebuild

PR #404 reconstructed the exact 50-path WS05 delta on a current-main ancestry. Shared `server/package.json` and ERPNext controller registry were explicitly reconciled so current Finance, Logistics, stock-integrity, App Factory and Alumdoor state remained intact while Manufacturing/QMS controllers and gates were added.

### WS06 current-main rebuild

PR #414 reconstructed the exact 82-path WS06 delta. Shared package and ERPNext registry state was explicitly unioned with the already-converged Finance/Logistics/Manufacturing state.

Employee Loan at separation remains intentionally **not auto-settled by WS06 without an explicit business policy**. The unresolved policy is therefore a future business Dependency Request, not a reason to invent behavior or block the safe baseline merge.

### WS15 current-main rebuild

PR #415 reconstructed the exact 35-path WS15 delta. `notification-runner.ts` and `services.ts` were re-audited three-way; current main still matched the pre-WS15 convergence snapshot for those paths, so the audited WS15 blobs were safe transplants. `server/package.json` preserved current gates and added only the WS15 SQL regressions plus Workplace pack gate.

Notification routing remains permission-scoped and is not treated as ACL authority.

## Dependency Requests carried forward

These do not reopen the closed convergence phase; they are follow-on product/integration decisions:

1. **WS06 business:** decide the company policy for outstanding Employee Loan at separation. Current code deliberately does not auto-settle it.
2. **WS05 business/integration:** define rework operating model and subcontract/demand-source orchestration without duplicating Inventory/Procurement/Finance authorities.
3. **WS15 platform/integration:** periodic scheduler jobs, generic OCR/extraction, and external e-sign/delivery provider/credential lifecycle.
4. **WS02 shared orchestration:** conversion/merge, provider messaging, Customer 360/funnel projections, Quotation→Sales Order orchestration and replayable sell-in projections remain shared boundaries.
5. **WS14 release evidence:** generic browser/E2E/deployment evidence remains evidence-driven; merge state alone is not deployment proof.

## Legacy / parallel PRs intentionally retained

These PRs were audited and were **not** ceremonially closed because they contain independent deltas not proven absorbed by the WS00–17 canonical queue:

- #278 accounting integrity hardening — KEEP / RECONCILE.
- #286 TT99 localization hardening — KEEP / RECONCILE.
- #267 bulk Stock Reconciliation — KEEP.
- #201 manufacturing actual costing — KEEP.
- #208 Plastic ERP Production Run — KEEP.
- #216 pricing matrix UI — KEEP.
- #295 Tiến Đạt purchase completion — KEEP.
- #199 Daily Detailed Ledger hardening — KEEP.

The follow-on UI Factory program (#381/#382/#387/#388/#389/#390/#391/#370 and related later work) is separate from this WS00–17 phase-close record and must not be classified as stale convergence debris.

## Production boundary

This phase-close operation merged and converged repository changes after explicit approval. It did **not** perform a production tenant migration, Cloudflare/Worker deployment, secret mutation, DNS operation, customer-data mutation, or branch deletion.

Production deployment remains a separate production/destructive gate and requires its own explicit approval plus release evidence.

## Final statement

WS00–WS17 convergence is closed at the repository level: canonical workstream deltas are on main, migration ranges `0088..0109` are merged, conflict-only PRs have been superseded, independent legacy deltas remain explicitly queued for later reconciliation, and CI truth is recorded as **NOT RUN / UNPROVEN** rather than inferred.
