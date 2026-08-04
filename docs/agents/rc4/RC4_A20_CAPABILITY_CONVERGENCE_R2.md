# RC4-A20 R2 — Capability Re-Convergence

- Date: **2026-08-04**
- Branch: `agent/rc4-20-capability-convergence-r2`
- Exact baseline: `main@269c690bda7abf90ea13225204352bdff908d63b`
- Risk: **STANDARD governance/evidence**
- Status: **CONVERGING — exact-head validation pending**

## Why R2 exists

A20 v1 snapshotted worker state too early. RC4-A6 later completed exact browser evidence and was merged to `main` in PR #598 at merge commit `834da8cf8fbf496f6c58cb0d8ba2119c40a6b66c`, followed by UI release-trigger PR #620. A20 #612 was then merged on top of that newer main while its manifest and canonical capability counts still described the older `1f0b089...` snapshot.

R2 therefore re-anchors convergence to exact current main and separates two questions that v1 conflated:

1. **Is worker evidence strong?**
2. **Is the implementation/evidence actually integrated into the convergence tree?**

Only the second class may change canonical main maturity.

## Maturity decision

R2 accepts one promotion:

| Capability | Before | After | Evidence |
|---|---|---|---|
| `U01-001` Responsive PWA | Wired | RC | A6 merged source + exact browser run `30871503111` / job `91874277369` |

Resulting counts:

| Maturity | A20 v1 | R2 | Delta |
|---|---:|---:|---:|
| Hardened | 0 | 0 | 0 |
| RC | 65 | 66 | +1 |
| Wired | 407 | 406 | -1 |
| Foundation | 327 | 327 | 0 |
| Missing | 157 | 157 | 0 |
| **Total** | **956** | **956** | **0** |

No Hardened claim is made. A6 itself states that exact production `/health` + `/release.json` SHA/hash evidence remains required for production truth.

## A6 acceptance evidence

PR #598 is merged on main. The decisive exact browser run executed source head `67b4e71fa245eec2a16e075b3a5c388de45ff7ed` and passed:

- demo build;
- 50 current-V2 browser checks with only project-inapplicable variants skipped;
- runtime build;
- 19 runtime/login/PWA checks.

Final branch head `6a6e7d8bdc0c543bd37d214415852f6fa67aa506` differs from the validated source head only in the removed temporary workflow plus A6 handoff/progress documentation. R2 validates that post-validation allowlist with Git history before accepting the promotion.

`U01-002` remains Wired because standalone installed-launch evidence is absent. `U01-003..007` and `U01-013` remain Missing. `U01-009..012` remain Wired pending physical/authorized device evidence.

## Updated worker convergence snapshot

The worker program is materially stronger than A20 v1:

- **A1** READY, exact IAM executable evidence; no new integrated promotion.
- **A2** BLOCKED on direct Cloudflare provider/recovery evidence.
- **A3** READY, exact migration/cutover runtime evidence; unmerged.
- **A4** BLOCKED; A19 still reproduces the VN statutory App Registry method-contract failure.
- **A5** independent replay passes, but legal numeric authority remains incomplete; unmerged.
- **A6** DONE, merged, exact browser evidence; `U01-001` accepted to RC.
- **A7** READY at `5d422009...`, run `30869504929` SUCCESS; unmerged so B01 candidates are not promoted.
- **A8** independent replay passes typed provider/DLQ lane; physical/provider evidence and merge remain open.
- **A9** READY at `32001d70...`, run `30870090636` SUCCESS; read-only GL aggregate seam is not yet integrated.
- **A10** BLOCKED by syntactically invalid Customer 360 regression in A19 replay.
- **A11** READY, exact supplier-governance evidence; unmerged.
- **A12** READY at `68f1ab9e...`, run `30869414261` SUCCESS; unmerged and source-targeted landed-cost valuation remains open.
- **A13** BLOCKED; URL shadowing was fixed at `5c9c47b...`, but exact A13 validation still fails on lane-owned issues.
- **A14** independent replay passes; unmerged and shared SLA/finance/row-policy/channel/offline dependencies remain.
- **A15** independent replay passes; unmerged dashboard/recommendation candidates remain below canonical promotion.
- **A16** READY at `26db2690...`, run `30869407232` SUCCESS; unmerged and shared scheduler/provider wiring remains.
- **A17** independent replay passes route authorization; unmerged with POS/stock/device dependencies.
- **A18** independent replay passes and local Golden Order suite is green; live authenticated production evidence remains absent.
- **A19** remains overall FAILURE at run `30871944096`. Its snapshot reports 13 PASS, A6 deferred and A4/A7/A10/A13 blocked; A7 subsequently produced a newer own-lane green head, so A19 is stale for A7.

## Governance correction

R2 changes the promotion contract:

- exact branch CI is evidence, but **not canonical maturity by itself**;
- `accepted_for_maturity=true` requires the worker merge commit and final lane head to be ancestors of convergence `HEAD`;
- direct evidence paths must exist in the integrated tree;
- if validation happened before final branch cleanup, every post-validation path must be explicitly allowlisted and Git-diff checked;
- branch-only READY lanes remain candidates until their implementation is merged/converged;
- A19 is required for cross-branch/final release confidence, but it is not a global veto over a capability already integrated into current main with its own exact capability-specific evidence.

This prevents both maturity inflation and the opposite failure mode where unrelated red lanes permanently block a fully proven current-main capability.

## Remaining highest-impact blockers

1. A4 statutory contract failure and consumption of A9 shared GL aggregate boundary.
2. A10 Customer 360 regression syntax failure.
3. A13 lane-owned TypeScript/QMS validation failures.
4. A2 direct non-production Cloudflare provider/recovery evidence.
5. A3 applied migration inventory + restore/PITR/cutover/opening-data reconciliation.
6. A12 source-targeted landed-cost valuation identity + Finance propagation.
7. A7/A9/A12/A16 integration into main after their non-UI merge gates are explicitly approved.
8. A19 replay on the actual future multi-branch converged candidate before final RC4 release GO.
9. Exact production UI release observation before any UI Hardened claim.

## Validation

R2 uses:

```bash
node server/scripts/rc4-a20-r2-materialize.mjs
node server/scripts/validate-enterprise-capability-status.mjs
node --check server/scripts/validate-rc4-capability-convergence.mjs
RC4_EXPECTED_MAIN_SHA=<PR_BASE_SHA> node server/scripts/validate-rc4-capability-convergence.mjs
```

The PR workflow materializes the deterministic status change, validates it, commits the generated canonical status back to the R2 branch, and reruns fail-closed on the exact resulting head.

## Merge / deploy boundary

R2 is non-UI governance/evidence plus canonical capability-status materialization. Open PR and collect exact-head validation. **Do not merge without explicit approval.** No production deployment is required by R2 itself.
