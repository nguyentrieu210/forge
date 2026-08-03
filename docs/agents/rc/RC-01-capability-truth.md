# RC-01 — Capability Truth

Status: **REVIEW / PR GATE**  
Branch: `rc/w0-capability-status`  
Exact baseline: `main@3cd2b472068838d0b2b65aa098bbd0bc1a9a8830`  
Risk: documentation + validation tooling; **non-UI, no merge/deploy**

## Mission

Establish the exact 956-capability denominator, conservative maturity baseline, evidence index, executable completeness validator and top blocker queue without promoting RC/Hardened from merge/code presence alone.

## Mandatory reads

Read from exact baseline:
- `skills/forge-enterprise-completion/SKILL.md`
- `CURRENT_STATUS.md`
- `NEXT_TASKS.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`

Required but absent:
- `docs/FORGE_RC_HARDENING_PLAN_20260803.md` -> 404 on exact baseline.
- repository search also found no canonical `RC-000`, `RC-001`, `RC-004` definitions.

Recorded as `DR-RC01-001`; not blocking because the user-assigned RC-01 request supplies the acceptance contract.

## Exact-main evidence audited

- `docs/agents/WS00_17_CONVERGENCE_20260803.md`: canonical WS00-WS17 deltas merged; also records several final convergence heads with 0 workflow runs / 0 combined statuses.
- Workstream handoffs WS00..WS17 were used as evidence pointers only after comparing against current-main convergence.
- Current exact source was spot-checked where handoff ambiguity mattered, including the ERPNext controller registry for Asset/HRM/POS/logistics/manufacturing authorities.
- Old/unmerged PRs were used only as gap/evidence signals, never as current-main implementation truth.

## Outputs

1. `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
   - all 956 capability IDs represented through inclusive ID expressions;
   - every expression gets a maturity and evidence bundle;
   - evidence bundles cover source/test/migration/permission/reconciliation-correction/UI/production;
   - baseline maturity report;
   - Evidence Index;
   - Top-30 blockers/tasks;
   - Dependency Request for the missing RC plan.
2. `server/scripts/validate-enterprise-capability-status.mjs`
   - parses the canonical Capability Map;
   - expands registry ranges;
   - detects missing, unknown and duplicate IDs;
   - requires canonical denominator 956;
   - validates maturity counts against the report;
   - exits non-zero on mismatch.

## Baseline result

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 4 |
| Wired | 448 |
| Foundation | 345 |
| Missing | 159 |
| **Total** | **956** |

Narrow RC assignments:
- `I01-014` idempotency: explicit kernel/integration invariant evidence.
- `G02-001` audit trail: explicit kernel/security RC evidence.
- `VP01-007` supplier order/debt/FIFO allocation: current source plus exact-byte historical regression provenance.
- `VP01-008` supplier delivery reconciliation: current source plus correction/reconciliation evidence.

No Hardened capability is claimed. In particular, older Alumdoor production evidence does not prove exact-current-main deployment.

## Completeness proof

Generator-side + validator-equivalent execution:

```text
Capability map: 956 unique IDs
Capability status: 956 unique IDs
Missing from status: 0
Unknown in status: 0
Duplicate status IDs: 0
Maturity: Hardened=0 RC=4 Wired=448 Foundation=345 Missing=159
Capability status completeness: 956/956
```

The committed validator was exercised against the exact canonical family/ID denominator reconstructed from the Capability Map and returned the output above. Full repository checkout execution is unavailable in this connector environment, so no broader build/test PASS is invented.

## Key downgrade decisions

- WS convergence/merge does not imply RC.
- Final heads with 0 workflow runs/statuses remain source evidence only.
- Finance/stock/payroll without closed reconciliation/correction stay below Hardened and usually below RC.
- UI/PWA without browser/mobile proof stays below RC.
- Source package `alumdoor@2.2.2` is not called deployed because production evidence is for historical `2.2.1`.
- Candidate vertical packs remain Missing without pack-level implementation evidence.
- Provider-specific connectors are Missing/Foundation unless provider execution exists; a generic connector SDK does not magically become sixteen integrations.

## Dependency Request

### DR-RC01-001 — canonical RC hardening plan missing

Target: RC coordinator/control lane.  
Need: add `docs/FORGE_RC_HARDENING_PLAN_20260803.md` or a superseding canonical task ledger with RC IDs and acceptance criteria.  
Blocking RC-01 output: no.  
Blocking cross-agent task-ID traceability: yes.

## Merge/deploy boundary

This branch changes documentation and a validator only, but it is still non-UI work. RC-01 opens a PR and stops. **No merge, no deploy.**
