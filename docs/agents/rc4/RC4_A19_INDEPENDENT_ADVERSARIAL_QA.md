# RC4-A19 — Independent Adversarial QA

Date: 2026-08-04  
Branch: `agent/rc4-19-independent-adversarial-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD evidence / CRITICAL inherited targets**  
Status: **RUNNING — independent exact-head replay active; A4/A7/A13 blockers confirmed; no maturity promotion**

## Mission

A19 independently attacks RC4 release-confidence claims. It owns QA/evidence only: adversarial validation, exact-head replay, stale-evidence detection, blocker findings and Dependency Requests. It does not silently fix another lane's runtime/schema/business authority and does not mutate production/provider state.

Priority: tenant/user/role isolation; retry/idempotency/concurrency; cancel/reversal/correction; stale evidence/exact-head drift; exact-current-main structural truth.

## Exact worker heads pinned at this checkpoint

| Lane | PR | Immutable head | A19 disposition entering replay |
|---|---:|---|---|
| A1 IAM/privacy | #597 | `47bb2b8355af6ecc4abffde9d83cb0c8b7621479` | worker exact-head PASS; independently replay |
| A2 SRE/provider/recovery | #596 | `6efa89b46548d6a958e04ffd8ea8c7dcdc9cd60a` | provider remains `unverified`; assert non-claim |
| A3 migration/cutover | #599 | `792f7f311d52f3ed0882c284b1e3d9ff5f34b359` | worker exact-head PASS; replay retry/journal |
| A4 finance/VN statutory | #602 | `84f25a829bb7eb28ab8bce053dc336435b46e77f` | A19 replay FAIL on App Registry manifest action contract |
| A5 HCM/VN payroll | #604 | `1baaf38d92f5aa0d53cfd2260d5baade850be8dd` | independently replay |
| A6 UI/mobile/PWA | #598 | `007572266465b9fb4944929f382162166740884b` | first A19 attempt invalid due harness build order; corrected rerun required |
| A7 App Factory | #606 | `e656c19d54450f1290ad44e8bba8819e650b42ef` | worker + A19 replay FAIL on definition invariants |
| A11 procurement/P2P | #600 | `27c616c2a77f08bb0284a0de4ea141637ce82462` | worker head moved after first A19 pin; repinned |
| A13 manufacturing/QMS | #603 | `5c9c47ba4e5092fd83c4752785047ad7e69be34c` | worker + A19 TypeScript authority FAIL; reject release-green claim |
| A15 BI/semantic/AI | #608 | `3c6db92969d80aab92afdc9ef4f07db0cbe2565b` | independently replay |
| A17 logistics/POS/commerce | #601 | `f2504064dbdf929ba6c03107eea624463943fce1` | independently replay route permissions |
| A18 Alumdoor vertical | #611 | `b3e428d21b4be13337694fde9a78d77b37c8db93` | independently replay exact source tests |

A8, A9, A10, A12, A14 and A16 had no independently reviewable final PR/head at this checkpoint. A19 makes no acceptance claim for them.

## Independent gate

Workflow: `.github/workflows/rc4-a19-independent-adversarial-qa.yml`.

It pins immutable worker SHAs and independently executes:

- **A1:** MFA/login/session revalidation, disabled/deleted-user rejection, live-role/session epoch, recent-auth and security boundaries, IAM migration replay.
- **A3:** durable migration plan/orchestrator, duplicate/retry/idempotency and migration journal replay.
- **A4:** VAT mapping fail-closed behavior, legal evidence, statutory pack/service and ordered VAT migration replay.
- **A5:** 2026 PIT source lock, Salary Slip submit/cancel reversal, Payroll Entry reconciliation and statutory regressions.
- **A7:** App Factory approval runtime, BPM approval/timer, OCC/SoD/delegation/idempotency, revision/rollback tests and SQL validation.
- **A11:** supplier lifecycle permission/cancel integrity, P2P closure/correction and landed-cost regression.
- **A13:** manufacturing transaction/cost/capacity + QMS lifecycle/cancellation plus lane-owned TypeScript error classification.
- **A15:** semantic dashboard, audited AI dashboard request and evidence-bound recommendation permission/data-boundary regressions.
- **A17:** Social Commerce route authorization source contract.
- **A18:** Alumdoor Golden Order read-only verifier syntax + exact regression suite.
- **A6:** real Chromium V2 desktop/tablet/mobile/PWA matrix.
- **A2:** Cloudflare governance validator and hard assertion that remote provider observation remains `unverified` without live evidence.

A19 also runs capability-registry structure validation, repository SQL validation, Cloudflare governance validation, A19 diff-authority guard and duplicate migration-prefix observation on its own exact head.

## Confirmed findings

### F-A19-001 — stale evidence is already occurring during RC4

A5 moved from `4310d2af...` to `1baaf38d...`, and A11 moved from `a157f4aa...` to `27c616c2...` after A19's initial pin. A19 repinned both. This proves branch names and earlier CI/head descriptions cannot be accepted as immutable release evidence.

### F-A19-002 — A13 is not release-green

Worker run `30868433145` failed. Manufacturing regressions passed **57/57** and QMS regressions passed **21/21**, but exact-head TypeScript contains A13-owned errors in:

- `server/packages/clouderp-erpnext/src/manufacturing-mrp.ts` — `exactOptionalPropertyTypes` violations around optional warehouse/dimension data;
- `server/packages/clouderp-erpnext/src/qms-controllers.ts` — `exactOptionalPropertyTypes` violations around NCR/CAPA optional fields.

The same worker run's first-party metadata gate also exposed HRM/VN-accounting defects from other lanes. Those cross-lane defects must not be misattributed to A13, but the A13-owned TypeScript errors are independently blocking.

**Decision:** reject any release-green claim for A13 head `5c9c47ba...`; do not silently repair A13 from A19.

### F-A19-003 — worker execution evidence is non-uniform

A1/A3 have focused exact-head PASS. A4/A17 lacked accepted focused execution at initial audit time. A5/A15 initially reported tests as NOT RUN. A6 lacked browser execution. A18 had isolated test evidence but no full repository execution. A19 therefore replays instead of inheriting prose.

### F-A19-004 — provider evidence remains correctly non-claimed

A2 keeps Cloudflare remote observation `unverified`. Repository source/config is not production/provider proof.

### F-A19-005 — migration applied-state boundary remains mandatory

A3 correctly refuses to rename historical duplicate `0110_*` files without applied-state evidence. A7 adds `0114` because A4 occupies `0113`; convergence still requires numbering/applied-state governance before release.

### F-A19-006 — browser evidence does not create offline authority

A6 responsive/PWA evidence can support presentation/device confidence but cannot prove offline queue, OCC/conflict resolution, offline encryption or authoritative disconnected writes.

### F-A19-007 — global TypeScript debt and lane-owned TypeScript debt are different

A19 does not fail a lane merely because unrelated repository TypeScript debt exists. It does fail when errors intersect that lane's authoritative files, as currently observed for A13.

### F-A19-008 — A4 statutory head violates the current App Registry action contract

A19 exact-head replay for A4 `84f25a82...` ran nine focused statutory/VAT/legal-evidence tests: six passed and three failed. All three failures converge on the same manifest validation boundary:

`actions[0].commit.method is not a plain method name: vn-accounting.tax.evaluate`

The current App Registry parser requires `commit.method` to be a plain method name. A4's dotted method therefore prevents the policy/statutory manifest from validating even though the VAT service and legal-evidence tests around it remain green.

**Decision:** A4 is not release-green at this head. A19 will not change the shared App Registry contract or patch A4's manifest. If dotted dispatch is intentional, A4 must raise a shared-contract Dependency Request; otherwise A4 should conform its manifest to the canonical contract and provide a new immutable head.

### F-A19-009 — A7 exact head is red on App Factory definition invariants

A7's own workflow run `30868711471` fails its `Approval, timer and definition regressions` step with **31/33** passing. A19 independently reproduces those two failures and broadens the slice to **40/44** passing:

- an unchanged effective window is rejected as if `definition_json` changed;
- active-definition immutability reaches an approval-timer stage-key validation before the expected retire/replace invariant;
- two revision-history assertions additionally fail under Node SQLite because returned rows have a null prototype despite equal visible values.

The first two are worker-reproduced App Factory behavior/invariant failures. The revision-history pair may be test portability/normalization defects, but they still prevent exact-head evidence from being green.

**Decision:** reject release-green for A7 head `e656c19d...`; do not repair A7 runtime/tests from A19.

### F-A19-010 — A6 first A19 failure was a QA harness build-order defect, not product evidence

A19 initially invoked `pnpm --dir client/apps/runtime run build` directly. The runtime depends on workspace packages such as `@metaforge/core`, `@metaforge/ui`, `@metaforge/shell`, `@metaforge/views`, `@metaforge/controls` and `@metaforge/adapter-frappe`; building the leaf package without its workspace dependency graph produced module-resolution failures before Playwright ran.

**Action:** A19 corrects its own gate to build the runtime together with its workspace dependencies before Chromium execution. No A6 product disposition is made from the invalid first attempt.

## Dependency Requests

- **DR-RC4-A19-001 -> A8/A9/A10/A12/A14/A16:** provide final PR + immutable head + executable evidence; A19 will repin/replay.
- **DR-RC4-A19-002 -> A13:** repair lane-owned TypeScript errors in `manufacturing-mrp.ts` and `qms-controllers.ts`; provide new immutable head for independent replay.
- **DR-RC4-A19-003 -> RC4 coordinator/convergence:** after accepted workers converge, run a second exact-converged-head A19 replay before maturity promotion.
- **DR-RC4-A19-004 -> migration/environment governance:** provide read-only applied `d1_migrations` inventory before historical filename remediation.
- **DR-RC4-A19-005 -> A2/environment owner:** provide non-production Cloudflare evidence for provider/recovery/replication claims; source configuration alone is insufficient.
- **DR-RC4-A19-006 -> A4:** conform `commit.method` to the canonical plain-method App Registry contract, or explicitly request a shared-contract decision if dotted dispatch is a required business/runtime contract; provide a new immutable head.
- **DR-RC4-A19-007 -> A7:** repair the active-definition equality/validation-order regressions and normalize or make revision-history assertions robust to SQLite row prototypes; provide a new immutable head.

## Merge / deploy boundary

A19 changes QA workflow + evidence documentation only, but it is a **non-UI release-confidence lane**. Stop before merge/deploy pending explicit approval.

No production deploy, provider mutation, migration rename, schema/business-rule change, secret/DNS operation or customer-data mutation is authorized by A19.
