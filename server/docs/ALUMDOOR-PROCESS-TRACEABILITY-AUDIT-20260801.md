# Alumdoor process traceability audit

Date: **2026-08-01**

Status: **G0/G1 audit — end-to-end business acceptance not reached**

Source requirement: `25.7 QUY TRÌNH.docx`, supplied by the project owner for this audit.

Repository baseline:

- repository: `nguyentrieu210/forge`;
- default branch: `hotfix/alumdoor-print-list-delete`;
- audited default head: `f27d4c6efe37a0cca91e3f1672a199d33b09cbab`;
- authoritative Alumdoor metadata: `server/briefs/alumdoor-v2.json` version `2.0.34`;
- generator: `server/scripts/build-alumdoor-v2-brief.mjs`;
- no Cloudflare deployment, production secret, DNS, D1, KV or tenant-data mutation was performed by this audit.

## 1. Executive verdict

Forge has a strong technical foundation for documents, permissions, stock ledger, physical inventory identity, BOM revision, Work Order snapshots, purchasing and sales. It does **not yet implement or prove the complete operational flow described in `25.7 QUY TRÌNH.docx`**.

The current repository is best described as:

- **platform foundation: strong**;
- **inventory/manufacturing backend core: substantial**;
- **Alumdoor formula and cut logic: substantial but not complete for every business branch**;
- **cross-department orchestration, daily accounting snapshot, production scheduling, painting and defect workflows: partial or unproven**;
- **operator UI, reports and authenticated end-to-end acceptance: incomplete**.

This audit therefore rejects any claim that the whole process is complete. Individual slices have high-quality reviews, but slice quality is not the same as a complete user journey.

## 2. Requirement-to-evidence matrix

Status legend:

- **PASS** — source and acceptance evidence cover the requirement.
- **PARTIAL** — foundation or a subset exists, but the full workflow or acceptance evidence is missing.
- **MISSING** — no matching implementation evidence was found on the audited default head.
- **DECISION** — business clarification is required before implementation can be considered correct.

| Requirement from 25.7 process | Current repository evidence | Status | Gap / required acceptance |
|---|---|---:|---|
| Three controlled operating areas: shared tracking, material stock, restricted detailed ledger | Modules, DocTypes and reports exist, but there is no proved three-workspace operating model matching the requested ownership and update flow | PARTIAL | Define ERP equivalents for the three files and prove navigation, permissions and daily workflow |
| Sales creates order, accounting receives and tracks it centrally | `Quotation`, `Sales Order`, quote-to-order action, pricing and availability exist | PARTIAL | No authoritative central order/export tracking surface with all required columns, commands and statuses |
| One source order distributes to internal cash, purchasing, production order, painting, production schedule and defects | Generic hooks, validators and document lifecycle exist | MISSING | Add and test an idempotent orchestration contract from order to all required downstream records |
| Production order split by product group and by voucher | Door types and Work Order/BOM foundations exist | PARTIAL | No proved Sales Order-to-type-specific production-order split, including one voucher producing multiple production orders |
| Daily production schedule with delivery date, production date, department, time and overtime | Work Order supports planned/actual lifecycle concepts | MISSING | Add a production schedule read model/UI and capacity calculation against 8-hour resources |
| Raw colour/condition automatically enters painting detail | `Item Color.finish` and physical condition values include raw/painted/error concepts | PARTIAL | No submitted-order/production hook and no painting queue lifecycle were found |
| Defect list linked back to originating order/voucher | `Warranty Claim` exists with customer, supplier, issue description and statuses | PARTIAL | `issue_cause` is free text; four controlled causes, one-year eligibility, responsibility confirmation and accounting effects are not enforced |
| Supplier defect can reduce supplier debt while replacement is pending | Warranty record has `debt_offset_on`; Purchase/FIFO and accounting foundations exist | PARTIAL | No authoritative posting/hold lifecycle tied to Warranty Claim was proved |
| Daily auto-generated stock issue slips grouped by month/day/customer/voucher | Delivery Note, Stock Entry and print support exist | PARTIAL | Literal folder/file generation is not proved; an approved ERP report/print replacement and acceptance test are required |
| Stock issue updates customer debt and deducts material norms | Delivery Note and Sales Invoice use authoritative stock/accounting controllers; BOM/Work Order consumption exists | PARTIAL | End-to-end order → issue → invoice/debt → material-standard journey is not authenticated and proved |
| Separate customer debt detail | Core ledgers exist; finance aging work is still an open draft PR | PARTIAL | Party Statement, Debt Summary, allocation completion, navigation and authenticated UI are not on default |
| Daily detailed ledger snapshot, editable only by general accountant, chief accountant and director | Versioning, permissions and immutable ledgers exist generally | MISSING | No update command, daily snapshot entity, freeze rule or exact role matrix matching the requirement was found |
| Aluminium stock by size/colour/condition and safe cutting/return | Canonical physical identity, warehouse roles, reservations, Cut Order apply/reverse/return and lineage exist | PASS | Operator explorer/report is still draft Slice D; production acceptance remains pending |
| Germany leaf formula and profile-specific divisors | `slats.ts` implements profile-specific divisors, 0.13 allowance and documented rounding decisions | PASS | Keep regression fixtures for every production profile and owner-approved ambiguity decisions |
| Australia formula `(height / 0.465) + offset` with 0/0.3/0.7/1 rounding | `australianSlatCount` implements offsets 2/1.5/1.3 and first-decimal step rounding | PASS | Add full order-template and production-output acceptance, not only arithmetic tests |
| AL70 / solid Australia manual-pull formula and split one-/two-layer leaves | AL70 divisor and no-subtract decision exist in `slats.ts` | PARTIAL | Lock/vent-row allocation, ray-specific deductions, three-bottom-leaf selection and full production document are not proved end-to-end |
| Super-long door formula | A policy exists but generator comments explicitly mark the Germany-like policy as temporary | DECISION | Owner must approve the actual formula before production acceptance |
| Partial orders for only inner/head/bottom leaves | The source requirement asks how accounting should adjust | DECISION | Define item/order structure, stock/BOM behavior and pricing for partial components |
| Authenticated purchasing journey | Backend Purchase/FIFO work exists; PR #103 adds the missing authenticated lifecycle QA | PARTIAL | PR #103 is still draft/open and not merged on the audited default |
| Physical-stock explorer, WIP, shortage, variance, scrap/offcut and Work Order progress reports | PR #82 contains read-model/report foundations | PARTIAL | PR #82 explicitly remains draft because endpoint/UI/operational reports are incomplete |

## 3. Formula review

### 3.1 Covered and evidence-backed

`server/apps-src/alumdoor-worker/src/slats.ts` covers:

- the `0.13 m` head allowance;
- profile-specific divisors;
- the owner-side decision that AL70 does not subtract one leaf;
- Australia offsets `2`, `1.5`, `1.3`;
- the Australia first-decimal rounding bands `0`, `0.3`, `0.7`, `1`.

`server/apps-src/alumdoor-worker/src/door-formulas.ts` centralizes width deductions and shared sales/production/purchase geometry through `Cutting Policy`.

### 3.2 Still requiring owner approval or complete acceptance

1. The source wording for Germany rounding is internally inconsistent. The code records an explicit interpretation. That interpretation must remain an approved business decision, not an accidental implementation detail.
2. `Cửa Siêu Trường` currently uses a temporary Germany-like policy in the generator.
3. Partial component orders need a formal model.
4. AL70 lock, vent rows and one-/two-layer allocation need full document-level acceptance.
5. Painting trigger semantics must distinguish colour master finish from physical stock condition and production operation state.

## 4. Process and delivery compliance audit

| Forge operating rule | Finding | Status |
|---|---|---:|
| Read `FORGE.md` and `.forge/manifest.json` first | Both files are absent on the audited default head | FAIL |
| GitHub is source of truth | Repository, branch, PRs, source and CI evidence were read from GitHub | PASS |
| Do not rely on old chat status | Audit used current default head and current PR state | PASS |
| Exact-head CI before claiming verified | Current default head `f27d4c...` has no workflow run or combined status returned by GitHub | FAIL / UNKNOWN |
| Do not bypass missing CI | This audit does not claim current default green | PASS |
| Use task branch and draft PR | Audit is recorded on `docs/alumdoor-process-audit-20260801` | PASS |
| No production deployment or secret changes without explicit instruction | None performed | PASS |
| Update canonical handoff documents | Included in this audit branch | PASS |

Additional repository hygiene risks:

1. The repository default branch is still named `hotfix/alumdoor-print-list-delete`.
2. Multiple old, conflicted, backup and superseded PRs remain open.
3. Current handoff documents were dominated by the latest Sales Unicode release and did not expose whole-process completeness.
4. High-scoring slice reviews can be mistaken for whole-product completion unless this traceability matrix remains authoritative.

## 5. Required business decisions

The owner must approve these before G1 can close for the whole process:

1. **Three-file mapping:** represent them as three ERP workspaces/modules and reports, or preserve literal spreadsheet/file generation.
2. **Production capacity unit:** 8 hours per department, worker, team, workstation or machine.
3. **Daily ledger freeze:** exact roles allowed to amend a snapshot and whether amendments replace values or create adjustment entries.
4. **Supplier defect accounting:** immediate payable offset, provisional hold, or offset only after supplier acceptance.
5. **Germany rounding:** confirm the interpretation documented in `slats.ts`.
6. **Super-long door:** approve its real formula and test cases.
7. **Partial leaf orders:** approve the commercial, BOM, stock and production representation.
8. **Painting trigger:** define whether `THÔ` is a colour finish, lot condition, production operation requirement, or a combination with precedence rules.

## 6. Prioritized completion plan

### P0 — establish an authoritative whole-process contract

1. Install the versioned Forge pack through an onboarding PR so `FORGE.md` and `.forge/manifest.json` exist.
2. Promote this traceability audit into an owner-approved BRD/acceptance contract.
3. Resolve the eight business decisions above.
4. Add a machine-readable acceptance matrix or focused test inventory so requirements cannot disappear behind module-level status.

### P0 — close the central operational workflow

1. Add central order/export tracking with the required columns and status/action fields.
2. Implement idempotent Sales Order orchestration into production requests/orders, painting queue and defect references.
3. Implement the daily detailed-ledger snapshot/freeze/amendment workflow with exact role permissions.
4. Implement controlled defect causes and warranty/accounting state transitions.

### P1 — finish production operations

1. Production schedule and 8-hour capacity/overtime calculation.
2. Product-group split and type-specific production document layouts.
3. Complete AL70/manual-pull and partial-component cases.
4. Painting queue lifecycle.
5. Merge and finish Slice D stock/WIP/shortage/variance/scrap/offcut reports and operator UI.

### P1 — finish authenticated acceptance

1. Merge/complete authenticated Purchase lifecycle QA from PR #103 after exact-head CI.
2. Add authenticated Sales Order → Work Order → stock issue/manufacture → Delivery Note/Invoice journey.
3. Add desktop/mobile acceptance for production and warranty workflows.

### P2 — finance and reporting

1. Rebuild/retarget the Finance AR/AP work from PR #15 onto current default.
2. Complete Payment Allocation, Party Statement, Debt Summary and report navigation.
3. Decide and implement the ERP replacement for daily/month/customer folder-style print output.

## 7. Definition of whole-process done

The Alumdoor process is complete only when all of the following are true on one exact head SHA:

1. Every row in the requirement matrix is PASS or an explicitly approved out-of-scope item.
2. Source order data flows through production, stock, delivery, debt, painting and defect handling without manual duplicate entry.
3. All formulas have owner-approved fixtures and automated regression tests.
4. Permissions prove shared-accounting access and restricted post-snapshot amendment.
5. Desktop and mobile authenticated journeys pass for Sales, Purchase, Inventory, Manufacturing, Warranty and Finance.
6. Required GitHub checks are green for the exact PR head.
7. Staging smoke proves the full operator journey.
8. Production merge/deployment occurs only after separate explicit approval.
