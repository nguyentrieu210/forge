# RC4-A19 — Independent Adversarial QA

Date: 2026-08-04  
Branch: `agent/rc4-19-independent-adversarial-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD evidence / CRITICAL inherited targets**  
Status: **NO-GO — 18/18 worker lanes now reviewable; A4/A6/A7/A10/A13 blocked**

## Mission

A19 independently attacks RC4 release-confidence claims. It owns QA/evidence only: adversarial validation, exact-head replay, stale-evidence detection, blocker findings and Dependency Requests. It does not silently fix another lane's runtime/schema/business authority and does not mutate production/provider state.

## Exact-head coverage

A19 now has immutable reviewable heads for **all A1-A18 lanes**. A9 was added after its final PR became available, and A6 was repinned after its head moved.

| Lane | PR | Immutable head | Independent disposition |
|---|---:|---|---|
| A1 IAM/privacy | #597 | `47bb2b8355af6ecc4abffde9d83cb0c8b7621479` | PASS |
| A2 SRE/provider/recovery | #596 | `6efa89b46548d6a958e04ffd8ea8c7dcdc9cd60a` | PASS source/governance; provider remains `unverified` |
| A3 migration/cutover | #599 | `792f7f311d52f3ed0882c284b1e3d9ff5f34b359` | PASS |
| A4 finance/VN statutory | #602 | `84f25a829bb7eb28ab8bce053dc336435b46e77f` | **BLOCKED** |
| A5 HCM/VN payroll | #604 | `1baaf38d92f5aa0d53cfd2260d5baade850be8dd` | PASS |
| A6 UI/mobile/PWA | #598 | `422cc5ce7460a9e326e77ccdc20dac5a36a412ca` | **BLOCKED** on exact-head browser accessibility gate |
| A7 App Factory | #606 | `e656c19d54450f1290ad44e8bba8819e650b42ef` | **BLOCKED** |
| A8 Integration/provider | #615 | `8e43a4e04818fc1d956c5173190f1794dfc802b8` | PASS |
| A9 Architecture/kernel | #619 | `32001d70a4ef87a5e14bd7df2dcc100cd0f8d243` | **PASS** independently in A19 run `30870548500` |
| A10 CRM/revenue | #617 | `d90085ba440f07c278e2e620a1409611b89ca9ab` | **BLOCKED** |
| A11 procurement/P2P | #600 | `27c616c2a77f08bb0284a0de4ea141637ce82462` | PASS |
| A12 Inventory/WMS | #616 | `0c63ae06c6ee0caccb75bc8f5341fff283f3a532` | PASS |
| A13 manufacturing/QMS | #603 | `5c9c47ba4e5092fd83c4752785047ad7e69be34c` | **BLOCKED** |
| A14 Project/service/field | #613 | `8ca102b3fbdf30cb2db0366ce32ac0b9102c732a` | PASS |
| A15 BI/semantic/AI | #608 | `3c6db92969d80aab92afdc9ef4f07db0cbe2565b` | PASS |
| A16 Workplace/DMS/collab | #614 | `9e24087161851a78376023f1210e50b4a2220590` | PASS runtime/authorization slice |
| A17 logistics/POS/commerce | #601 | `f2504064dbdf929ba6c03107eea624463943fce1` | PASS |
| A18 Alumdoor vertical | #611 | `b3e428d21b4be13337694fde9a78d77b37c8db93` | PASS |

Current tally: **13 PASS / 5 BLOCKED / 18 total**.

## Confirmed blockers

### A4 — VN statutory / App Registry contract

Exact head `84f25a82...` fails focused statutory replay because `commit.method = vn-accounting.tax.evaluate` is not a canonical plain method name. A19 will not change the shared App Registry contract from the QA lane.

### A6 — final browser evidence is red

A6 moved from the earlier A19-pinned head `00757226...` to final head `422cc5ce...`. The old green A19 runtime/PWA result is therefore stale.

A6's own exact-final-head workflow run `30870225543` installs/builds successfully, then runs 56 demo browser tests: **45 pass, 6 skip, 5 fail**. The five failures are serious axe `color-contrast` violations on:

- `/view/list`;
- `/view/form`;
- `/view/kanban`;
- `/view/calendar`;
- `/view/dashboard`.

Common failing UI includes the menu-search input (`Tìm trong danh mục…`); List also exposes status-chip contrast failures. Because the demo browser matrix is red, the worker workflow does not reach its runtime/PWA step.

A19 run `30870548500` was expanded to replay both the final-head demo browser matrix and the runtime/PWA matrix, rather than trusting the stale narrower old-head result.

**Decision:** final A6 head is not release-green until the accessibility failures are corrected and a new immutable head is replayed. This is UI evidence/runtime presentation authority owned by A6; A19 records the blocker rather than patching the worker lane.

### A7 — App Factory definition invariants

Exact head `e656c19d...` remains red on effective-window equality / validation-order behavior and revision-history evidence portability. A19 does not repair another lane's runtime/tests.

### A10 — Customer 360 test evidence does not parse

Exact head `d90085ba...` passes lane-owned TypeScript classification, but `server/tests/crm-customer-360.test.mjs` fails before execution with `SyntaxError: missing ) after argument list` around line 292.

### A13 — Manufacturing/QMS lane-owned TypeScript failures

Exact head `5c9c47ba...` has `exactOptionalPropertyTypes` failures in `manufacturing-mrp.ts` and `qms-controllers.ts`. Passing business regressions alone do not make the exact head release-green.

## A9 closure

A9 PR #619 final head `32001d70...` has its own successful kernel validation and now also passes A19 independent replay in run `30870548500`:

- exact immutable SHA assertion;
- lane-owned TypeScript classification;
- `rc4-kernel-gl-aggregate` regression;
- read-only General Ledger aggregate authority/export guard;
- SQL safety.

The former A9 Dependency Request is closed.

## Stale-evidence findings

A19 has now observed multiple worker-head moves during the same RC4 wave: A5, A11 and A6. Branch names, PR prose and older green runs are therefore insufficient release evidence; immutable exact-head replay is required.

## Dependency Requests

- **DR-RC4-A19-A4 -> A4:** resolve the canonical App Registry action-method contract mismatch and provide a new immutable head.
- **DR-RC4-A19-A6 -> A6:** fix serious browser color-contrast failures on the final head and provide a new immutable head for demo + runtime/PWA replay.
- **DR-RC4-A19-A7 -> A7:** repair App Factory definition/revision evidence failures and provide a new immutable head.
- **DR-RC4-A19-A10 -> A10:** repair syntactically invalid Customer 360 test evidence and provide a new immutable head.
- **DR-RC4-A19-A13 -> A13:** repair lane-owned TypeScript errors and provide a new immutable head.
- **DR-RC4-A19-CONVERGENCE -> RC4 convergence:** after blocking workers are repaired and converged, run a second exact-converged-head adversarial replay before maturity promotion.
- **DR-RC4-A19-MIGRATION -> migration/environment governance:** provide read-only applied `d1_migrations` inventory before historical migration filename remediation.
- **DR-RC4-A19-PROVIDER -> A2/environment owner:** provide non-production provider evidence before provider/recovery/replication-state promotion.

## Merge / deploy boundary

A19 changes QA workflow + evidence documentation only, but it is a **non-UI release-confidence lane**. Stop before merge/deploy pending explicit approval.

No production deploy, provider mutation, migration rename, schema/business-rule change, secret/DNS operation or customer-data mutation is authorized by A19.
