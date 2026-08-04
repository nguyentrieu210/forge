# R6-04 — Alumdoor Exact-Release Golden Flow

Date: 2026-08-04
Branch: `agent/r6-04-alumdoor-golden-flow`
Locked source candidate: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`
R6-00 control: PR #640
R6-01 release/provider dependency: PR #642
R6-04 evidence PR: #644
Risk: CRITICAL certification/evidence; non-UI

## Mission

Prove that the Alumdoor reference vertical operates on the exact R6 candidate while consuming canonical Sales, Procurement, Stock, Manufacturing, Finance and Warranty/Service authorities. R6-04 is an evidence lane, not an implementation lane.

The branch is intentionally rooted at the exact R6-00 locked source candidate. Its delta is limited to R6-04 test/evidence tooling, workflow and documentation; it does not change runtime, schema, migrations or business authority and therefore does not create a new release candidate.

## Locked identity

Expected identity from R6-00:

- source SHA: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`;
- tenant: `alu`;
- pilot target: `https://alu.kairo.vn`;
- Alumdoor `2.2.3`;
- HRM `1.8.0`;
- VN Accounting `1.6.1`;
- Manufacturing QMS `1.1.0`;
- Maintenance `1.5.1`;
- active capability profile identity must be observed from target state, including canonical `capability_profile_revisions.content_hash`.

## Exact-candidate source evidence

R6-04 source evidence was executed against a branch rooted at the locked candidate with no runtime/business-authority delta. Supporting regressions passed:

- capability profile, App Registry and R6-04 observer guards: **53/53 PASS**;
- Sales O2C and Procurement P2P/correction: **39/39 PASS**;
- Manufacturing, Warranty/Service and same-order Golden Order lineage: **36/36 PASS**;
- canonical cross-ledger auditor self-test: **PASS**;
- Alumdoor package compile/dry-run: **PASS**, `alumdoor@2.2.3`, 74 doctypes, 1 workflow, 11 roles, 57 fixtures, 79 nav entries;
- vertical shadow-authority guard: **PASS** — Alumdoor Worker has no direct D1 authority and no direct Stock/GL/Payment ledger SQL.

These are deterministic supporting evidence only. They are not promoted to `PRODUCTION_LIKE_OBSERVED`.

The locked candidate also has pre-existing strict TypeScript build debt outside R6-04, mainly under `clouderp-selling` CRM/Quotation controllers and one `frappe-model` validation boundary using `exactOptionalPropertyTypes`. R6-04 emits the existing dist for evidence execution but does not relabel the strict repository build as PASS and does not modify shared Selling/Model contracts.

## Pilot-target read-only observation

Read-only observation on 2026-08-04 returned:

- `GET /health`: HTTP 200;
- guest boot probe: HTTP 403 as expected;
- `GET /release.json`: HTTP 200;
- locked expected release SHA: `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`;
- observed live release SHA: `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2`;
- observed bundle hash: `0f569841cc0ff19c`.

The pilot target therefore is **not running the exact locked R6 candidate**. R6-01 independently observed the same release mismatch. That alone prevents R6-E18 from proving exact-release package/profile identity and prevents E19-E23 from being certified as fresh exact-candidate production-like evidence.

The R6-04 observer remains read-only: release/package/profile GETs plus a remote D1 `SELECT` for active capability-profile identity. It performs no business-document mutation, app install, migration, provider change or D1 write.

## Evidence matrix

| ID | Required level | Status | Reason |
|---|---|---|---|
| R6-E18 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | pilot release SHA is `cf5dd0da…`, not locked `4149af7c…`; exact package/profile identity cannot certify the locked candidate while target release is stale |
| R6-E19 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | exact candidate is not on the pilot target and no approved writable production-like exact-candidate environment exists for a fresh authenticated Golden Flow |
| R6-E20 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | depends on fresh E19 lineage; local canonical-ledger regressions cannot substitute for environment-bound Stock/AR/Payment/GL readback |
| R6-E21 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | retry/duplicate and invalid-action evidence requires an approved writable exact-candidate production-like environment |
| R6-E22 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | correction plus partial/equivalent receivable transition must be executed against approved exact-candidate production-like state |
| R6-E23 | `PRODUCTION_LIKE_OBSERVED` | `BLOCKED` | warranty/service must bind to the delivered document from the fresh E19 exact-candidate lineage |

Historical production Golden Order evidence and local regressions remain useful provenance but cannot satisfy a new exact-candidate production-like evidence requirement.

## Dependency Requests

### DR-R6-04-01 — writable production-like Golden Flow environment

Owner: R6 program / environment owner
Status: OPEN

Provide an approved production-like writable environment running the exact locked candidate and exact active Alumdoor profile for fresh R6-E19 through R6-E23 execution. It must permit disposable/test business documents and canonical correction/retry paths without touching real customer state.

Alternative: explicitly authorize Golden Flow writes against real pilot customer state. Existing production credentials, a production deployment or read access do **not** imply write authorization.

### DR-R6-04-02 — exact release convergence

Owner: R6-01 / release owner
Status: OPEN

Converge the pilot target to the exact locked candidate and close provider/release blockers before R6-04 exact-release certification is rerun. Current observation is `cf5dd0da5b0154374a4ce371d7b122cd059a0bb2` versus locked `4149af7c3e49b25fb1f43a50b62f99d7c04e6488`.

R6-01 additionally reports a missing tenant `BROWSER` binding and Alumdoor app observability not observed. Those are provider/release-owned findings; R6-04 does not mutate provider configuration or deploy production to make its own evidence green.

### DR-R6-04-03 — locked-candidate strict build path

Owner: R6 program / Selling-Model owners
Status: OPEN

Prove the official release build path for the locked candidate or repair the pre-existing `exactOptionalPropertyTypes` debt and relock the candidate. The strict repository TypeScript build currently reports errors in shared `clouderp-selling` CRM/Quotation controllers and `frappe-model` validation code. R6-04 does not change those shared contracts from an evidence lane.

## Safety boundary

No production deployment, migration, restore/PITR, DNS/secret/provider mutation or customer-data write was performed by R6-04. The existing full ALU release workflow was not invoked by this lane.

This is non-UI certification work. PR #644 remains draft and must stop before merge/deploy pending explicit approval.

## Current lane verdict

`R6-04-BLOCKED: pilot target is not on the exact locked candidate; E19-E23 also lack approved writable production-like exact-candidate execution state.`
