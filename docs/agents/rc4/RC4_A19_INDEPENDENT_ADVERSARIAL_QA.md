# RC4-A19 — Independent Adversarial QA

Date: 2026-08-04  
Branch: `agent/rc4-19-independent-adversarial-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD evidence / CRITICAL inherited targets**  
Status: **RUNNING — pinned independent replay gate active; blocker findings recorded; no maturity promotion**

## 1. Mission

Independently attack RC4 release-confidence claims. A19 owns QA/evidence only: adversarial validation, exact-head replay, stale-evidence detection, blocker findings and Dependency Requests. It does not silently fix another lane's runtime/schema/business authority and does not mutate production/provider state.

Priority order:

1. tenant/user/role boundaries;
2. retries, duplicate requests, idempotency and crash-window recovery;
3. cancellation/reversal/correction invariants;
4. stale evidence and exact-head drift;
5. exact-current-main structural truth.

## 2. Exact RC4 worker state consumed

At this checkpoint A19 found nine worker PRs that are independently consumable as evidence targets. A failed worker PR is still consumable for adversarial rejection; it is not accepted merely because a PR exists.

| Lane | PR | Exact head pinned by A19 | Independent status before/found by A19 |
|---|---:|---|---|
| A1 IAM/privacy | #597 | `47bb2b8355af6ecc4abffde9d83cb0c8b7621479` | Worker exact-head workflow PASS; A19 replays auth/session/role/security slice |
| A2 SRE/provider/recovery | #596 | `6efa89b46548d6a958e04ffd8ea8c7dcdc9cd60a` | Docs/evidence only; provider truth remains `unverified` |
| A3 migration/cutover | #599 | `792f7f311d52f3ed0882c284b1e3d9ff5f34b359` | Worker exact-head workflow PASS; A19 replays durable/retry/journal slice |
| A4 finance/VN statutory | #602 | `84f25a829bb7eb28ab8bce053dc336435b46e77f` | No accepted exact focused Node CI at audit time; A19 supplies pinned replay |
| A5 HCM/VN payroll | #604 | `4310d2afbb9ee048b80161cfb2b0464e6fa49644` | Worker explicitly reports executable suite NOT RUN; A19 supplies pinned payroll/reversal/reconciliation replay |
| A6 UI/mobile/offline | #598 | `007572266465b9fb4944929f382162166740884b` | Browser matrix authored but not executed by worker shell; A19 runs Chromium matrix |
| A11 procurement/P2P | #600 | `a157f4aab5d5a5a0ee867bee77aedbe4af812436` | Worker validation was in progress when first audited; A19 independently replays permission/cancel/correction slice |
| A13 manufacturing/QMS | #603 | `5c9c47ba4e5092fd83c4752785047ad7e69be34c` | Worker workflow **FAIL**: business regressions pass, but exact-head authority has TypeScript errors and metadata gate fails |
| A17 logistics/POS/commerce | #601 | `f2504064dbdf929ba6c03107eea624463943fce1` | Default workflows observed skipped; A19 independently replays route permission contract |

### Not independently consumable yet

A7, A8, A9, A10, A12, A14, A15, A16 and A18 did not have an independently reviewable final PR at this checkpoint. A19 makes **no acceptance or rejection claim** for those lanes yet.

## 3. Adversarial gate added

Workflow: `.github/workflows/rc4-a19-independent-adversarial-qa.yml`

The gate deliberately does not trust branch names or PR prose. It pins worker heads by immutable SHA and re-executes a cross-cutting slice.

### A1 — identity / tenant-user-role boundary

- password + MFA integration;
- session registration and revalidation;
- disabled/deleted user rejection;
- live role refresh / session epoch revocation;
- recent-auth and trusted authentication context;
- network/security policy regressions;
- MFA/session migration replay.

### A3 — duplicate/retry/idempotency/crash window

- durable migration plan/orchestrator;
- retry and journal behavior;
- kernel-port write delegation;
- migration run journal replay;
- SQL validation.

### A4 — statutory fail-closed / legal evidence

- VAT account mapping policy;
- legal-rule evidence binding;
- statutory pack behavior;
- VAT service behavior;
- ordered VAT migration replay.

A19 does not treat these as legal certification or production filing evidence.

### A5 — payroll statutory / reversal / reconciliation

- 2026 PIT source-lock regression vectors;
- payroll correction/reconciliation;
- Salary Slip submit/cancel ledger reversal;
- Payroll Entry net-pay reconciliation and tenant-scoped source behavior;
- existing statutory payroll regressions.

A19 does not convert a regression fixture into a production legal-rule seed and does not infer BHXH/BHYT/BHTN numeric authority where the source lock remains incomplete.

### A11 — cancellation / correction / permission

- supplier lifecycle permission boundary;
- contract release/cancellation integrity;
- P2P closure and correction boundary;
- landed-cost regression guard.

A19 does not take ownership of procurement runtime fixes if a case fails.

### A13 — manufacturing/QMS lifecycle

- manufacturing transaction closure and cost evidence;
- capacity API;
- QMS plan/NCR/RCA/CAPA lifecycle and parent cancellation guards;
- explicit TypeScript authority-error classification.

A13 worker run already proves 57 manufacturing and 21 QMS tests can pass while the exact head still has TypeScript errors in `manufacturing-mrp.ts` and `qms-controllers.ts`. A19 treats that as a real release-confidence blocker, not as a green lane.

### A17 — route authorization

- independent Social Commerce route-class permission source contract.

A17 still depends on canonical finance/stock/mobile owners for partial payment, reservation/return and offline/device semantics.

### A6 — browser/mobile/PWA evidence

- exact pinned V2 runtime build;
- Chromium Playwright execution across desktop/tablet/Pixel/360px/reduced-motion-dark projects;
- PWA installability contract without inventing offline write authority.

### A2 — provider/source separation

- Cloudflare governance validator;
- hard rejection if repository evidence silently changes `remote_observation.status` away from `unverified` without provider evidence.

## 4. Exact-main structural truth guards

A19 also validates on its own PR head:

- canonical enterprise capability status validator;
- repository SQL verifier;
- Cloudflare governance validator;
- A19 diff authority boundary: docs + QA workflow only;
- duplicate tenant-migration prefix observation.

The duplicate migration prefix check is intentionally observational. A19 will not rename potentially applied migrations without applied-state evidence.

## 5. Findings

### F-A19-001 — worker CI is not uniform

A1 and A3 supplied exact-head green focused workflows. A4 and A17 had only skipped default workflows at the observed heads. A5 explicitly reported its authored tests as **NOT RUN**. A6 explicitly lacked executed browser evidence from its worker environment. A11 was still executing when first audited.

**Action:** A19 supplies one independent pinned gate rather than copying worker prose into the release record.

### F-A19-002 — A13 is not release-green despite green business regressions

Exact A13 worker run `30868433145` failed. Its manufacturing regression step passed **57/57** and its QMS step passed **21/21**, but the emitted exact-head TypeScript log contains errors in A13-owned authority:

- `server/packages/clouderp-erpnext/src/manufacturing-mrp.ts` — `exactOptionalPropertyTypes` violations around optional warehouse/dimension data;
- `server/packages/clouderp-erpnext/src/qms-controllers.ts` — `exactOptionalPropertyTypes` violations for NCR/CAPA optional fields.

The same worker run also failed the first-party metadata gate because of repository-wide HRM/VN-accounting metadata defects visible on the A13 head. Those cross-lane defects must not be misattributed to A13, but the A13-owned TypeScript defects are independently blocking.

**Decision:** reject any claim that A13 exact head is release-green. Do not silently fix A13 from A19.

### F-A19-003 — provider evidence remains correctly non-claimed

A2 keeps Cloudflare remote observation `unverified`. This is correct. Repository source/config must not be promoted into D1 replication, recovery, WAF/Access, AI Gateway, Browser Run or current-production PASS without provider/live proof.

### F-A19-004 — A3 correctly preserves migration applied-state boundary

A3 does not silently rename historical duplicate `0110_*` migration filenames. A19 agrees with this boundary. Any sequencing remediation needs applied-state inventory before mutation.

### F-A19-005 — A6 browser evidence is necessary but does not unlock offline authority

Passing responsive/PWA browser tests can support current V2 presentation/device confidence. It does not by itself prove offline queue, OCC/conflict resolution, offline encryption or authoritative disconnected writes.

### F-A19-006 — repository-wide TypeScript remains a separate debt class

Several worker gates intentionally classify changed-authority TypeScript errors instead of claiming a globally green server build. A19 preserves that distinction. Global TypeScript debt is not automatically a lane blocker; an error intersecting that lane's authoritative files is.

## 6. Dependency Requests

### DR-RC4-A19-001 — unfinished worker heads

**Owners:** A7-A10, A12, A14-A16, A18  
Provide final PR + exact immutable head + authoritative scope + executable evidence. A19 will repin and replay rather than accept bootstrap state.

### DR-RC4-A19-002 — A13 owned TypeScript repair

**Owner:** A13  
Repair exact-head TypeScript errors in `manufacturing-mrp.ts` and `qms-controllers.ts`, then provide a new immutable head. A19 will independently repin/replay. Cross-lane metadata failures should remain assigned to their owning lanes rather than patched in A13.

### DR-RC4-A19-003 — current-main convergence candidate

**Owner:** RC4 coordinator / capability convergence  
A19's first gate validates independent worker heads. After accepted worker changes are converged, A19 requires a second exact-converged-head replay before any RC4 maturity promotion.

### DR-RC4-A19-004 — migration applied-state inventory

**Owner:** environment / migration governance  
Provide read-only applied `d1_migrations` evidence before any duplicate-prefix filename remediation. No production mutation is authorized by A19.

### DR-RC4-A19-005 — provider/non-production evidence

**Owner:** A2 / environment owner  
Provide non-production Cloudflare account evidence for recovery/replication/provider-state claims. Source configuration alone is insufficient.

## 7. Merge / deploy boundary

A19 changes QA workflow + evidence documentation only, but it is still a **non-UI release-confidence lane**. Open PR, collect exact-head CI, then stop before merge/deploy pending explicit approval.

No production deploy, provider mutation, migration rename, schema change, business-rule change, secret/DNS operation or customer-data mutation is authorized.
