# PROJECT UI COVERAGE SUMMARY

Program: `backend-ui-reconciliation-20260811`  
Worker: `UI-REC-04 COVERAGE`  
Branch: `agent/ui-rec-04-project-coverage-20260811`  
Audit baseline: `main@cecb19c51855ab3e6a05ce84261d717c630c96b7` plus worker topology forked from `program/backend-ui-reconciliation-20260811@c4209b8318ac36110ca84094d905ce724ffae3d5`  
Status: `READY_FOR_ROUTING`  
Risk: audit/docs only; no runtime, schema, migration, merge or production mutation in this worker.

## 1. Executive conclusion

The project does **not** have a single uniform backend-to-UI coverage failure. Most first-party source apps already carry usable manifest/nav/report metadata. The dominant residual problem is **coverage consistency**:

1. one P0 operator-path defect exists in Procurement: the app declares the authoritative ERP Source-to-Pay transaction chain as external DocTypes but exposes only four procurement-specific master/selection DocTypes in its own navigation;
2. the generic runtime and server disagree on renderable Experience kinds, which filters valid `daily-ledger` and `alumdoor-operations` entries out of navigation;
3. first-party validation is fragmented: the Meta-v1 verifier and `app:check` pack list cover different app sets, while several real first-party apps rely only on dedicated tests;
4. Manufacturing/QMS and HRM have narrower discoverability questions that require owner-level confirmation/fix, not a new generic UI implementation;
5. the shared generic runtime still contains business-identity branches and hand-written vertical experiences. These are architectural debt, not justification for adding more special cases.

REC-04 therefore remains an **auditor/router**. It records concrete owner requests instead of editing NAV/FORMS/GRID/domain hotspots owned by other streams.

## 2. Evidence rules used

The sweep follows the program drift vocabulary (`OK`, `NAV_MISSING`, `FORM_INCOMPLETE`, `ACTION_UNWIRED`, `PERMISSION_MISMATCH`, `LEGACY_SPECIAL_CASE`, etc.) and treats exact source/schema/tests as stronger evidence than stale status prose.

Important runtime facts:

- the generic runtime builds the current app sidebar from `manifest.nav`; it deliberately skips workspaces belonging to the current app;
- `catalog_mode=hybrid` therefore does **not** make current-app external DocTypes automatically discoverable;
- server `SUPPORTED_EXPERIENCE_KINDS` includes `daily-ledger` and `alumdoor-operations`, while client `isRenderableExperience()` does not;
- the generic runtime still branches directly on several product-specific Experience kinds and on `manifest.id === "alumdoor"`.

## 3. Discovered first-party app classification

This table classifies the first-party source apps discovered through `app:check`, the Meta-v1 verifier, dedicated app-source tests and direct `apps-src/*/app.json` evidence. `OK` means no P0/P1 projection defect was proven by this sweep; it is not a production-certification claim.

| App / domain | Evidence surface | Classification | Priority | Routing note |
|---|---|---|---:|---|
| `crm` / CRM & Revenue | rich manifest nav, reports, AppScreens, explicit ERP Customer/Sales Order/Sales Invoice routes | `OK` + gate fragmentation | P1 gate | add to centralized first-party coverage gate; do not duplicate CRM screens |
| `procurement` / Source-to-Pay | external `Supplier`, RFQ, Supplier Quotation, PO, Receipt, Invoice, Payment Entry; nav exposes only Supplier Qualification/Rating/Contract/Selection | `NAV_MISSING` | **P0** | Procurement/domain UI owner must expose core operator transaction paths with permission gates |
| `projects` / Project & PSA | portfolio/template/capacity/project/task/timesheet/change/acceptance nav + control reports | `OK` + gate mismatch | P1 gate | Meta verifier covers it but `app:check` does not pack-check it |
| `support` / Helpdesk | ticket/queue/CSAT/team/SLA/knowledge nav + reports | `OK` + gate mismatch | P1 gate | Meta verifier covers it but `app:check` does not pack-check it |
| `maintenance` / Service & Warranty | request/warranty/service order/contract/technician nav + reports | `OK` + gate mismatch | P1 gate | Meta verifier covers it but `app:check` does not pack-check it |
| `hrm` / HCM & Payroll | broad org/recruiting/lifecycle/leave/attendance/payroll/performance nav; Salary Component remains external ERP authority | `REACHABILITY_REVIEW` | P1 | confirm Salary Component is reachable from Salary Structure workflow; add explicit path only if ordinary payroll maintainers need it |
| `vn-accounting` / Finance VN | accounting policy/period/TT99/tax actions/VAT/e-invoice/budget/cash/payroll accounting paths | `OK` | — | no immediate projection blocker proven in manifest sweep |
| `manufacturing-qms` / MRP/QMS | routing/capacity/downtime/QMS/CAPA/calibration nav; Work Order/Job Card/Operation/Workstation are external authority | `NAV_MISSING` risk | P1 | domain owner must decide compositional vs standalone contract; if standalone, expose core execution routes |
| `plastic-erp` / manufacturing vertical | explicitly exposes Production Plan, Work Order and Quality Inspection routes alongside vertical masters | `OK` | — | reference pattern for Manufacturing/QMS operator reachability |
| `workplace` / DMS & collaboration | task/calendar/meeting/request approvals/docs/contracts/obligations nav + reports | `OK` + verifier omission | P1 gate | pack-checked but omitted from Meta-v1 verifier set |
| `erp-organization-security` | org/security/SoD/approval/delegation nav + reports | `OK` | — | current manifest is coherent |
| `integration-hub` | Integration Subscription route with role gate | `OK` + verifier omission | P1 gate | pack-checked but omitted from Meta-v1 verifier set |
| `app-factory` | App Factory Definition, Meta v1, platform-owned DocType external | `OK` + verifier omission | P1 gate | pack-checked but omitted from Meta-v1 verifier set despite Meta v1 |
| `visits` | Visit Note | `OK` | — | intentionally narrow app |
| `logistics` | Delivery Trip/POD/Freight/contract/carrier/vehicle/driver; Delivery Note external | `OK` + gate fragmentation | P1 gate | dedicated source test exists but not centralized in `app:check`/Meta verifier set |
| `social-commerce` | profile + `social-commerce:dashboard` custom Experience | `LEGACY_SPECIAL_CASE` | P2 | operationally reachable, but renderer lives in generic runtime bundle |
| `alumdoor-attendance` | HRM external authority + AlumDoor custom fields/experiences | `IN_PROGRESS` + `LEGACY_SPECIAL_CASE` | P1/P2 | UI-REC-03 is already fixing form projection; do not duplicate. Custom Experience renderer remains shared-runtime debt |
| AlumDoor main vertical | generated brief, reports/actions/experiences, Sales/Inventory/Manufacturing surfaces | `OWNED_BY_UI_REC_02_03` | — | REC-04 only records cross-app/runtime drift; no sidebar/form edits here |

### Platform ERP core surfaces

Selling/Buying/Stock/Accounts/Manufacturing canonical transaction DocTypes also exist in the platform business suite without necessarily being standalone `apps-src` packages. REC-04 classifies their **projection only where an installed first-party app claims them as an external operator dependency**. It does not create a duplicate business authority or a second app merely to make a menu.

## 4. Prioritized backlog

### P0

#### REC4-P0-01 — Procurement core Source-to-Pay transaction paths are not discoverable

**Capability:** NS-03 Procurement 360 / ordinary Source-to-Pay operator flow.  
**App:** `procurement`.  
**DocTypes:** `Supplier`, `Request for Quotation`, `Supplier Quotation`, `Purchase Order`, `Purchase Receipt`, `Purchase Invoice`, `Payment Entry`.  
**Surface:** sidebar/navigation/operator entry path.  
**Classification:** `NAV_MISSING`.  
**Evidence:** `procurement/app.json` declares the transaction chain as external authorities but nav contains only `Supplier Qualification`, `Supplier Rating`, `Supplier Contract`, `Supplier Selection`. The generic runtime skips the current app's catalog workspace and appends only `manifest.nav`, so `hybrid` does not fill the missing paths. The dedicated procurement source test currently locks the four-entry nav as expected behavior, proving the gap is encoded rather than accidental parser loss.

**Required remediation:** add explicit role-gated operator routes for the core Source-to-Pay chain, or an equivalent app-owned screen that makes the same authoritative DocTypes reachable. Do not create shadow purchasing DocTypes and do not auto-expose every external dependency.

**Owner:** Procurement/domain UI owner, assigned by reconciliation coordinator.  
**REC-04 action:** Dependency Request only.

### P1

#### REC4-P1-01 — First-party validation coverage is fragmented

`server/scripts/verify-first-party-meta.mjs` verifies:

`maintenance, projects, support, visits, hrm, vn-accounting, erp-organization-security, manufacturing-qms`

while `server/package.json` `app:check` pack-checks:

`visits, hrm, vn-accounting, erp-organization-security, integration-hub, app-factory, manufacturing-qms, workplace`.

Consequences:

- `maintenance/projects/support` get Meta checks but no pack check in the central command;
- `integration-hub/app-factory/workplace` get pack checks but no Meta-v1 verifier coverage;
- additional real first-party apps such as `crm`, `procurement`, `logistics`, `social-commerce`, `plastic-erp`, `alumdoor-attendance` rely on dedicated tests and are not represented by one central coverage inventory.

**Classification:** coverage/gate drift.  
**Owner:** UI-REC-05 QA.  
**Required remediation:** one machine-readable first-party source registry consumed by pack, Meta-v1 verification and the reconciliation coverage gate; app-specific tests remain additive, not the inventory mechanism.

#### REC4-P1-02 — Server/client Experience allowlists disagree

Server supports `approval`, `calendar`, `social-commerce`, `daily-ledger`, `alumdoor-operations`, `alumdoor-attendance`, `action`, `screen`.

Client `isRenderableExperience()` accepts `approval`, `calendar`, `social-commerce`, `alumdoor-attendance`, plus declared `action`/`screen`; it does **not** accept `daily-ledger` or `alumdoor-operations`. The AlumDoor V2 generator emits both omitted kinds. Therefore valid manifest entries are filtered out before sidebar construction even though `ExperienceScreen` can render them when reached directly.

**Classification:** `NAV_MISSING` / contract drift.  
**Owner:** shared runtime owner/coordinator.  
**Required remediation:** eliminate duplicated allowlists or derive client renderability from one shared contract; add a regression proving every server-supported Experience that has a renderer survives nav construction.

#### REC4-P1-03 — Manufacturing/QMS core execution reachability is ambiguous

`manufacturing-qms` owns routing/capacity/QMS metadata but declares `Operation`, `Workstation`, `Work Order`, `Job Card`, `Quality Inspection`, `Asset` as external ERP authority. Only Quality Inspection is explicitly routed from this app. In contrast, `plastic-erp` explicitly routes Production Plan, Work Order and Quality Inspection.

**Classification:** `NAV_MISSING` risk, pending owner contract.  
**Owner:** Manufacturing/QMS domain owner.  
**Required remediation:** declare whether the app is intentionally QMS-only/compositional. If it is an operator Manufacturing app, expose Work Order/Job Card and setup routes with role gates; if not, document/install dependency on the owning Manufacturing workspace so a standalone install cannot imply unavailable execution.

#### REC4-P1-04 — HRM Salary Component ordinary-maintainer reachability needs proof

HRM exposes Salary Structure and Salary Structure Assignment but keeps `Salary Component` as external ERP authority and does not declare a direct nav entry. This may be valid if users maintain components only through a linked workflow, but that reachability is not proven by the manifest itself.

**Classification:** `REACHABILITY_REVIEW` (do not call P0 without UI-REC-01 truth/flow evidence).  
**Owner:** HRM/domain UI owner with UI-REC-01 evidence.  
**Required remediation:** prove linked reachability for payroll maintainers, or add an explicit role-gated route.

### P2

#### REC4-P2-01 — Business identity leakage in generic runtime

The generic runtime imports and branches on `SocialCommerce`, `DailyDetailedLedger`, `AlumdoorOperationsCenter`, `AlumdoorAttendanceKiosk`, `AlumdoorAttendanceOperations`, and sets a mobile app href using `manifest.id === "alumdoor"`.

**Classification:** `LEGACY_SPECIAL_CASE`.  
**Risk:** every new vertical is tempted to add another branch to the supposedly generic bundle; product-specific behavior becomes deploy-coupled instead of metadata/install-coupled.

**Recommendation:**

1. use `AppScreen`/`AppAction` for screens expressible through generic blocks/actions;
2. keep only genuinely platform-generic Experience renderers in the shared runtime;
3. for irreducibly custom UI, use an explicit extension boundary rather than another `if (kind === "customer-x")` branch;
4. remove exact app-id shell behavior by moving the mobile link to declarative client metadata or a generic manifest action/link contract.

## 5. Duplicate primitive / special-case inventory

| Location/pattern | Type | Finding | Disposition |
|---|---|---|---|
| server `SUPPORTED_EXPERIENCE_KINDS` vs client `isRenderableExperience()` | duplicate contract | two allowlists already drifted | P1: consolidate/derive from one contract |
| `ExperienceScreen` branches for `social-commerce`, `daily-ledger`, `alumdoor-operations`, `alumdoor-attendance` | vertical renderer in generic runtime | business-specific renderers compile into shared bundle | P2: migrate expressible screens to AppScreen/AppAction; define extension boundary for the rest |
| `manifest.id === "alumdoor"` mobile href | exact app identity branch | shell behavior cannot be installed as data | P2: declarative manifest link/action metadata |
| Procurement external transaction chain without nav contract | missing projection declaration | backend authority exists but app has no operator route | P0: explicit manifest navigation, not new CRUD primitive |
| scattered app lists in `verify-first-party-meta.mjs`, `package.json`, dedicated tests | duplicate inventory | no single source of truth for first-party coverage | P1: central app-source registry for QA tooling |

No evidence supports creating a second Form, List, Grid, purchasing engine, payroll engine, stock engine or pricing engine. The residual fixes are declarations, shared contract alignment and QA inventory.

## 6. Dependency Requests

### DR-REC4-01 — UI-REC-01 truth matrix

Dependency Request  
Owner: UI-REC-01 TRUTH  
Need: machine-readable backend/schema/meta/nav/form/list/action/permission surface matrix for the current reconciliation baseline, including installed first-party app identity.  
Why: REC-04 can prove source-level gaps independently, but exact closure/counts and `OK` certification require the canonical matrix owned by REC-01.  
Blocked scope: exact project-wide row counts and final severity confirmation for conditional cases such as HRM Salary Component reachability.  
Can continue independently: yes.  
Next independent work: publish source-app coverage findings and route proven P0/P1 defects.

### DR-REC4-02 — Procurement operator navigation

Dependency Request  
Owner: Procurement/domain UI owner via reconciliation coordinator  
Need: explicit role-gated operator paths for Supplier/RFQ/Supplier Quotation/Purchase Order/Purchase Receipt/Purchase Invoice/Payment Entry, or an equivalent authoritative app-owned Source-to-Pay screen.  
Why: Procurement owns business composition; REC-04 must not create shadow purchasing surfaces or edit another owner's hotspot.  
Blocked scope: P0 Procurement UI closure.  
Can continue independently: yes.  
Next independent work: retain P0 evidence and hand to UI-REC-05 for eventual browser verification.

### DR-REC4-03 — Experience contract alignment

Dependency Request  
Owner: shared runtime owner / reconciliation coordinator  
Need: align client renderable Experience kinds with server manifest support; specifically cover `daily-ledger` and `alumdoor-operations`, preferably from one shared contract.  
Why: valid server/brief metadata is currently filtered out by client navigation.  
Blocked scope: P1 navigation closure for these Experiences.  
Can continue independently: yes.  
Next independent work: inventory remaining product-identity branches without editing runtime.

### DR-REC4-04 — Unified first-party coverage gate

Dependency Request  
Owner: UI-REC-05 QA  
Need: a static gate that discovers/loads the canonical first-party app-source registry and runs pack + Meta-v1/surface checks across the same app set.  
Why: current central scripts encode different source arrays and leave several apps to isolated tests.  
Blocked scope: reproducible project-wide coverage gate.  
Can continue independently: yes.  
Next independent work: provide this summary as expected coverage inventory.

### DR-REC4-05 — Manufacturing/QMS composition contract

Dependency Request  
Owner: Manufacturing/QMS domain owner  
Need: declare and test whether Work Order/Job Card/Operation/Workstation are reachable operator surfaces of `manufacturing-qms` or intentionally supplied by another installed workspace.  
Why: app manifest currently advertises a Manufacturing domain but only Quality Inspection among core external execution DocTypes is routed.  
Blocked scope: final P1 classification.  
Can continue independently: yes.  
Next independent work: use `plastic-erp` as a positive explicit-route reference, not as a shared authority.

### DR-REC4-06 — Grid convergence

Dependency Request  
Owner: GRID program / UI-REC-05 QA  
Need: exact Grid candidate and child-table parity evidence before certifying Sales/Purchase/Inventory/Payroll line-entry surfaces.  
Why: REC-04/REC-03 may validate metadata reachability but Grid smart interaction belongs to the separate Grid workstream.  
Blocked scope: final child-table operator parity.  
Can continue independently: yes.  
Next independent work: all non-Grid coverage routing is complete.

## 7. Shared primitive recommendation

### Keep

- canonical metadata-driven `DoctypeWorkspace`/List/Form/Grid architecture;
- AppScreen/AppAction as the default composed operational UI contract;
- external DocTypes as references to the owning platform authority, not copies;
- server-authoritative permissions, formulas, stock/accounting/payroll transitions.

### Add or consolidate

1. **First-party app-source registry** — one data file/module consumed by pack checks, Meta verification and project coverage tooling.
2. **Single Experience-kind contract** — server parser and client renderer must not maintain separate manually copied allowlists.
3. **Explicit external-surface intent** — an external dependency used by an operator flow should be explicitly marked/routed (`nav`, app-owned screen, or a documented `linked_only/internal` intent). Do **not** auto-expose every external DocType.
4. **Declarative app links/actions** — shell links such as mobile entrypoints belong in manifest metadata, not `manifest.id` branches.

### Do not add

- another purchasing CRUD model;
- another manufacturing execution model;
- another payroll or accounting calculation path in React;
- another vertical-specific branch in the generic shell;
- a generic rule that blindly exposes all external DocTypes.

## 8. Convergence / QA handoff

UI-REC-05 should eventually verify on one exact convergence candidate:

1. Procurement app sidebar reaches the authoritative RFQ → Supplier Quotation → PO → Receipt → Invoice → Payment flow under representative Purchase roles;
2. every server-supported, manifest-declared Experience with a shipped renderer survives navigation filtering;
3. centralized first-party app coverage includes the full registry and fails if an app is omitted from pack/Meta checks;
4. Manufacturing/QMS operator execution path matches the owner-declared composition contract;
5. HRM payroll setup can reach Salary Component where the role/workflow requires maintenance;
6. Grid candidate proves child-table parity separately.

## 9. Worker stop condition

REC-04's independent audit/routing work is complete at this point. Remaining closure requires owner outputs from UI-REC-01, Procurement, shared runtime, Manufacturing/QMS, Grid and UI-REC-05. No merge/deploy is authorized or required by this worker.
