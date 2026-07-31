# BRD — Alumdoor Inventory, Manufacturing and Item Catalog

Status: **G1 Requirements draft**

Date: **2026-07-31**

Branch: `feat/inventory-manufacturing-item-catalog-20260731`

Authoritative metadata source: `server/briefs/alumdoor-v2.json` version `2.0.34`

Related audit: `server/docs/ALUMDOOR-INVENTORY-MANUFACTURING-ITEM-AUDIT.md`

## 0. Assumptions and open questions

| Assumption or question | Evidence/default | Risk if wrong | Decision |
|---|---|---|---|
| Which Alumdoor brief is authoritative? | `alumdoor-v2.json` is version `2.0.34`; `alumdoor.json` is version `1.27.3`. | Editing both creates drift and contradictory generated metadata. | `alumdoor-v2.json` is authoritative. The v1 brief is compatibility/reference only and must not receive parallel business changes. |
| Should physical dimensions create thousands of Item variants? | Current model keeps stable Item identity while dimensions, colour and lots belong to transactions and `Aluminium Lot`. | Variant explosion makes item selection unusable and mixes stable identity with shipment-specific facts. | Do not create Item variants for every colour/length/width/lot. Keep dimensions in canonical lot/transaction references. |
| What is the accounting source of truth? | Stock ledger and GL are written through DocumentKernel/Durable Object. | A separate lot table could disagree with stock quantity/value. | Stock ledger is authoritative for quantity/value. Lot/dimension ledgers are authoritative for physical identity and must be persisted atomically with stock mutations. |
| What warehouse model should production use? | Current seeds expose physical warehouses `K36` and `K12`. | Physical names alone cannot enforce raw material, WIP, finished goods, quarantine and scrap behavior. | Add explicit warehouse roles that may map to physical warehouses or subwarehouses. Server validates purpose against role. |
| How should BOM changes affect released Work Orders? | Current BOM definition is mutable metadata. | Editing a BOM could silently change the material contract of an active order. | BOMs/Production Standards require revision and effective dates. Work Order stores an immutable snapshot/revision reference at release. |
| Is negative stock ever acceptable? | Existing business rules reject insufficient stock for outgoing flows. | Allowing negative stock hides missing receipts and concurrent issue errors. | Negative stock remains disabled for production and normal stock. Explicit reconciliation is the only correction path. |
| Can production directly mutate D1 or lot tables? | Project architecture requires all writes through DocumentKernel and Durable Object. | Side writes break idempotency, audit and atomicity. | Every Item, stock, lot, BOM and Work Order mutation goes through the existing kernel/DO path. |
| Is this branch allowed to deploy production? | User approved requirements work, not production release. | Premature migration could corrupt live stock or manufacturing balances. | No production migration, deployment, secret change or tenant data mutation until G4 CI, G5 staging and separate explicit production approval. |
| How will live catalog evidence be handled? | Live `alu` Item/BOM/stock data may contain business-sensitive information. | Committing exports exposes operational data. | Raw/redacted exports stay outside Git. Repository records only schema-safe counts, checksums and validation categories. |

## 1. Problem

### P0 — Item records are structurally rich but operational completeness is unproven

The v2.0.34 Item model already contains material stage, supply type, purchase/sales/manufacturing flags, inventory mode, measurement profile, stock/purchase/sales UOM, conversions, warehouse/account defaults, reorder rows, variants and tracking flags. However, no exact live catalog audit proves that active `alu` Items are consistently classified.

Consequences:

1. A raw material may be marked as a saleable finished good.
2. A manufactured Item may have no active BOM.
3. A service may accidentally carry stock, warehouse or reorder behavior.
4. A transaction UOM may lack a valid conversion to stock UOM.
5. An Item may rely on missing warehouse/account fallbacks.

### P0 — Dimensioned materials can bypass their physical identity

`Aluminium Lot` captures profile, colour, generation, width, sheet count, weight and warehouse. Generic `Stock Entry Item` currently carries only Item, quantity, warehouses and valuation rate. A transfer, issue or manufacture entry can therefore move a quantity without preserving the colour, size or source lot that makes the material physically real.

Consequences:

1. Stock quantity may remain correct while available colour/size becomes false.
2. Two operators can consume the same lot through different surfaces.
3. Cancellation may restore generic stock but fail to restore the original physical lot.
4. Scrap and reusable offcuts can disappear into notes instead of remaining measurable inventory.

### P0 — Production lifecycle lacks proven immutable contracts

BOM Item supports fixed, height, width, area and sheet-count quantity bases, but the current evidence does not prove UOM conversion, revision snapshots, circular BOM rejection, partial issue/produce invariants or cancellation end to end.

Consequences:

1. Active Work Orders may change when BOM metadata changes.
2. Material can be over-issued or finished goods over-produced.
3. Partial production can leave Work Order balances inconsistent.
4. Cancellation can create negative stock or orphaned WIP.
5. Actual consumption and production variance cannot be trusted.

### P1 — Operators lack focused completion and error surfaces

The Item form is broad because it serves multiple item classes. Without category-aware visibility and completeness indicators, users can miss mandatory configuration or fill irrelevant fields. Humans do enjoy hiding critical facts across six tabs and then acting surprised later.

## 2. Goals

| Goal | Acceptance evidence |
|---|---|
| Make `alumdoor-v2.json` v2.0.34 the single business metadata source. | Build/brief validation uses v2; documentation and generator paths identify it as authoritative; no new business change is duplicated into v1. |
| Prove every active Item is valid for its category. | Dry-run audit returns total/pass/error counts, stable checksum and row-level error codes; fixture tests cover each category. |
| Preserve physical identity for aluminium, glass/sheets, rolls and batch/serial stock. | Every outgoing/transfer/manufacture movement references a canonical lot/dimension identity; stock and lot projections commit atomically. |
| Enforce warehouse roles in stock and manufacturing flows. | Server rejects purpose/warehouse combinations that violate raw material, WIP, finished, quarantine or scrap roles. |
| Make BOMs immutable for released production. | BOM revisions/effective dates exist; Work Order stores active revision and canonical snapshot checksum. |
| Support safe partial production. | Tests prove partial issue, partial manufacture, remaining quantity, over-consumption rejection, over-production rejection and idempotent retry. |
| Support exact reversal. | Cancel/reverse tests restore stock quantity, valuation, lot balances, WIP and Work Order progress to the prior committed state. |
| Provide operational reports. | Reports expose available stock, reserved/WIP, lot age, material shortage, actual vs standard, scrap/offcut and Work Order progress. |
| Keep UI understandable without weakening server security. | Item/BOM/Work Order forms show category-relevant fields and completeness errors; server remains authoritative for all validations and permissions. |

### Immutable rules

1. All writes pass through DocumentKernel and Durable Object.
2. D1 migrations are append-only.
3. Server permissions are authoritative; hidden UI is not a security boundary.
4. Fixed-point integer micros are used for ledger quantities, dimensions and monetary calculations where supported.
5. Generic stock quantity/value and physical lot/dimension balances must never commit separately.
6. A released Work Order never changes because a BOM is edited later.
7. A reversal references and negates original entries; it does not recalculate historical values from current metadata.
8. Production rollout cannot activate with unresolved catalog, BOM, stock or lot audit errors.

## 3. Actors

| Actor | Job | Data scope | Allowed | Forbidden |
|---|---|---|---|---|
| Chủ xưởng | Own configuration and approve exceptional corrections. | All Alumdoor Items, warehouses, BOMs, Work Orders and stock. | Configure masters; approve BOM/revision; submit/cancel/reconcile; approve exceptional override with reason. | Bypass kernel, erase ledger history, silently change released Work Order snapshots. |
| Thủ kho | Receive, transfer, issue, count and reconcile physical stock. | Warehouses and lots assigned to operations. | Create/submit stock movements; scan/select lots; count stock; initiate reconciliation; view Work Order demand. | Change BOM formulas, manufacturing accounting rules or released production quantity. |
| Sản xuất | Plan and execute Work Orders. | Active production orders, required materials, WIP and output. | Create/release permitted Work Orders; request/issue materials; record operations; produce partial output; record scrap/offcut and QC. | Change valuation/accounts; issue unapproved materials; consume unavailable/incorrect lots; exceed released quantity. |
| Kế toán | Control valuation and accounting consequences. | All stock value, WIP, finished goods and variances. | Read all stock/production; approve valuation-sensitive reconciliation; configure valid account mappings; audit cancellation and variance. | Alter physical lot facts without an inventory correction document. |
| Kinh doanh | See sellable Items and availability needed for promises. | Finished goods and selected availability summaries. | Read saleable Item data, availability and Work Order progress tied to orders. | Mutate stock, lots, BOMs or production execution. |
| System/Worker | Execute authoritative validation and atomic persistence. | Tenant-scoped data only. | Validate, plan, serialize, persist, emit audit/outbox and reject conflicts. | Trust browser-computed balances, infer missing lot identity, or commit partial projections. |

## 4. Entities and contracts

### 4.1 Item

Stable identity for a material, product, traded good, service or asset.

Required contract:

- `item_code`: unique, rename through safe rename flow only;
- `item_nature`: `Hàng tồn kho`, `Dịch vụ`, `Tài sản`;
- `material_stage`: raw material, consumable, semi-finished, finished or traded;
- `supply_type`: purchased, manufactured or both;
- purchase/sales/manufacturing eligibility flags;
- `inventory_mode` and `measurement_profile` consistent with stock UOM;
- transaction UOM conversions to stock UOM;
- warehouse/account defaults or valid Item Group/company fallback;
- optional colour/specification/variant/manufacturer identity;
- batch/serial/reorder configuration only when meaningful.

Category rules:

- Services cannot hold stock, warehouse, batch, serial or reorder settings.
- Manufactured/semi-finished Items require manufacturing eligibility and an active BOM/Production Standard before release.
- Purchased raw materials require purchase eligibility and valid receiving UOM conversion.
- Disabled Items cannot be selected for new documents but historical references remain readable.

### 4.2 Measurement Profile

Defines the physical dimensions and tracking required for an inventory mode.

Contract:

- stable profile name and inventory mode;
- stock UOM;
- required colour/condition/length/width/piece/bundle flags;
- theoretical weight/effective width/scrap threshold where applicable;
- incompatible profiles cannot be assigned to an Item.

### 4.3 Warehouse and Warehouse Role

Warehouse keeps physical hierarchy; role defines allowed operational purpose.

Minimum roles:

- `RAW_MATERIAL`;
- `WIP`;
- `FINISHED_GOODS`;
- `QUARANTINE`;
- `SCRAP_OFFCUT`;
- optional `GENERAL` for non-production stock.

A warehouse may have one primary role and explicit permitted secondary purposes. Role changes after activity require migration/reconciliation evidence.

### 4.4 Canonical Stock Identity

For normal goods:

`tenant + company + item + warehouse + stock_uom`

For dimensioned/tracked goods, extend with required attributes:

`measurement_profile + colour + condition + length + width + piece_qty basis + batch/serial/lot identity`

The server constructs canonical identity. Browser-provided hashes are ignored.

### 4.5 Physical Lot

Represents physically distinguishable stock and links every movement to source evidence.

Required fields:

- Item and measurement profile;
- warehouse and warehouse role at the time of movement;
- colour, condition, dimensions and piece/bar/sheet count as required;
- remaining stock quantity and physical quantity;
- quality state;
- source receipt/reconciliation/production document and row;
- original lot for split, cut, return or reversal;
- created/committed sequence and immutable audit identity.

### 4.6 BOM / Production Standard

A versioned production recipe.

Required contract:

- finished Item;
- revision number and status (`Draft`, `Active`, `Retired`);
- effective-from/effective-to timestamps;
- output quantity and UOM;
- material rows with Item, quantity, UOM, conversion, quantity basis and source warehouse role;
- optional operation/routing and expected scrap/by-product;
- canonical snapshot checksum;
- no circular dependency;
- only one active revision per finished Item and effective interval unless explicitly scoped by variant/specification.

### 4.7 Work Order

Immutable released production contract.

Required contract:

- finished Item and requested output quantity;
- company and target warehouse role;
- sales order/production request reference when applicable;
- BOM/Production Standard revision and snapshot checksum;
- planned and actual timing;
- statuses: Draft, Released, In Progress, Completed, Cancelled;
- issued, consumed, produced, scrapped and remaining quantities;
- operation/team/workstation references when enabled;
- command/revision identity for idempotency and concurrency.

### 4.8 Stock Entry and Stock Entry Item

Stock document for receipt, issue, transfer, manufacture and reversal.

Every dimensioned/tracked row must carry or resolve:

- canonical physical lot identity;
- source lot and destination lot for transfers/splits;
- required colour/dimensions/piece count;
- source and target warehouse roles;
- Work Order and BOM material row when used by production;
- original entry reference for reversal;
- valuation information derived server-side.

### 4.9 Production Operation, QC, Scrap and Offcut

Phaseable entities used when full routing is enabled.

- Operation: expected sequence, team/workstation, expected time.
- Execution: actual start/end, operator and result.
- QC: checkpoint, measurement, pass/fail and disposition.
- Scrap: non-reusable loss with reason and valuation treatment.
- Offcut/by-product: reusable output stored as a new physical lot with source lineage.

## 5. Workflows

### 5.1 Catalog audit

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Chủ xưởng / Engineer | CLI dry-run | Read metadata or redacted export without mutation. | Scope, source checksum and record counts. |
| 2 | System | Audit planner | Validate Item category, UOM, profile, warehouse, account and BOM invariants. | Error codes grouped by severity and entity. |
| 3 | System | Report | Produce deterministic checksum and unresolved count. | Reviewable report without business-sensitive row contents in Git. |
| 4 | Owner | GitHub/operations | Correct source metadata or live records through normal APIs. | Reduced error count on next dry-run. |
| 5 | System | Gate | Require zero Critical/High errors before staging production flow. | G2/G3 may proceed for validated scope. |

Failure branches:

| Failure | Required behavior |
|---|---|
| Export cannot be read | Fail without partial report; do not write production. |
| Unknown Item category | Mark unresolved; never infer from Item name alone. |
| Missing UOM conversion | Block documents that would use the ambiguous UOM. |
| Duplicate active BOM | Block Work Order release until resolved. |
| Sensitive data detected in output path | Refuse to write into repository paths. |

### 5.2 Receive and transfer dimensioned material

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Thủ kho | Purchase Receipt / Stock Receipt | Select Item, warehouse, colour, dimensions and physical count. | Preview canonical identity and expected quantity/value. |
| 2 | System | Kernel/DO | Validate Item/profile/UOM/warehouse role and available source evidence. | Clear validation errors before submit. |
| 3 | System | Atomic mutation | Write document, stock ledger, physical lot projection, valuation and audit receipt. | Submitted document and traceable lot. |
| 4 | Thủ kho | Transfer | Select source lot and destination warehouse. | Remaining source and destination lot preview. |
| 5 | System | Atomic mutation | Decrease source and create/increase destination identity without changing total quantity/value except allowed valuation rules. | Transfer completed with lineage. |

Failure branches:

- insufficient source lot balance: reject;
- colour/dimension missing for required profile: reject;
- destination warehouse role incompatible: reject;
- concurrent stale lot revision: retry only with same command ID, then return conflict;
- reversal after downstream consumption: reject or require reversing downstream documents first.

### 5.3 Release Work Order

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Sản xuất | Work Order | Choose finished Item, quantity, date and source demand. | Active BOM revision preview. |
| 2 | System | Planner | Resolve exactly one effective BOM and compute material requirements in stock UOM micros. | Required material list and shortage summary. |
| 3 | System | Validator | Check finished Item manufacturing flags, BOM validity, warehouse roles and permissions. | Release allowed or exact blocker. |
| 4 | System | Kernel/DO | Store immutable BOM snapshot/checksum and released quantities. | Work Order status `Released`. |

Failure branches:

- no effective BOM: reject;
- multiple effective BOMs: reject;
- circular BOM or invalid conversion: reject;
- disabled Item or incompatible supply type: reject;
- requested output non-positive or not representable: reject.

### 5.4 Partial material issue

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Sản xuất / Thủ kho | Work Order issue action | Select required rows and physical lots. | Preview allowed, issued and remaining quantities. |
| 2 | System | Planner | Cap issue by released BOM requirement plus explicit tolerance policy. | No silent over-consumption. |
| 3 | System | Atomic mutation | Write Stock Entry, lot decreases, WIP increases and Work Order progress. | Partial issue committed. |
| 4 | System | Report | Recompute shortages and remaining issue. | Updated Work Order material status. |

Failure branches:

- wrong Item/lot/specification: reject;
- insufficient physical or generic balance: reject;
- over-issue: reject unless an authorized variance action with reason exists;
- concurrent issue: only one revision wins; loser receives conflict.

### 5.5 Partial manufacture

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Sản xuất | Manufacture action | Enter produced quantity, consumed quantities, scrap/offcuts and QC result. | Preview expected vs actual. |
| 2 | System | Validator | Ensure produced quantity does not exceed released remainder and required material has been issued/consumed. | Exact variance warnings/errors. |
| 3 | System | Atomic mutation | Consume WIP/material, create finished stock, create scrap/offcut lots, update Work Order progress and valuation. | Partial finished goods available in valid target warehouse. |
| 4 | System | Lifecycle | Complete only when output and material invariants are satisfied. | Work Order remains In Progress or becomes Completed. |

Failure branches:

- failed QC: output goes to quarantine, not finished-goods availability;
- over-production: reject;
- missing material issue: reject unless backflush policy is explicitly configured and atomic;
- invalid scrap/offcut dimensions: reject;
- valuation cannot be derived: reject whole mutation.

### 5.6 Cancel and reverse

| Step | Actor | Surface | System action | Visible result |
|---:|---|---|---|---|
| 1 | Authorized actor | Document action | Provide reason and select original committed document. | Reversal preview. |
| 2 | System | Dependency check | Find downstream movements, lot splits, finished deliveries and accounting use. | Blocking dependency list or allowed reversal. |
| 3 | System | Atomic mutation | Append reversal entries using original identity, quantities and values. | Stock, lot, WIP and Work Order progress restored. |
| 4 | System | Audit | Link reversal to original command/document. | Complete immutable timeline. |

The system never deletes submitted stock or production ledger rows.

### 5.7 Stock reconciliation

1. Thủ kho records counted quantity and lot/dimension facts.
2. System calculates delta against authoritative stock and lot projections.
3. Material differences require reason; valuation-sensitive differences require Kế toán/Chủ xưởng approval.
4. Reconciliation commits append-only adjustment entries.
5. Reports show before, counted, delta, approver and reason.

## 6. Permission/action matrix

| Action | Chủ xưởng | Thủ kho | Sản xuất | Kế toán | Kinh doanh |
|---|---:|---:|---:|---:|---:|
| Read Item/UOM/profile/warehouse | Yes | Yes | Yes | Yes | Limited |
| Create/update Item draft | Yes | Limited stock fields | Limited manufacturing fields | Limited account fields | No |
| Activate/disable Item | Yes | No | No | No | No |
| Create/approve BOM revision | Yes | Read | Create draft | Read | No |
| Release Work Order | Yes | Read | Yes | Read | No |
| Issue/transfer material | Yes | Yes | Yes within Work Order | Read | No |
| Record production/QC/scrap | Yes | Supporting | Yes | Read | No |
| Submit reconciliation | Yes | Initiate | Initiate WIP only | Approve valuation-sensitive | No |
| Cancel/reverse submitted stock | Yes | With permission/reason | Work Order scope with permission/reason | With accounting authority | No |
| Manual variance override | Yes with reason | No | No | Co-approve when valuation changes | No |
| Read availability/progress | Yes | Yes | Yes | Yes | Finished/saleable scope |

Server actions must enforce tenant, role, document status, revision and reason. Client buttons merely reflect these rules.

## 7. Interaction surfaces

### Owned product surfaces

- Metadata-driven Item, Measurement Profile, Warehouse, BOM, Work Order and Stock Entry forms.
- Dedicated lot/dimension selector and movement preview.
- Work Order requirement, issue, production, QC, scrap/offcut and variance panels.
- Reports for stock, lot age, WIP, shortage, progress and variance.
- Audit CLI/script for catalog and BOM validation.

### External/provider surfaces

- GitHub branch, commits, CI checks and pull request.
- Cloudflare staging deployment and logs.
- Tenant `alu` browser smoke environment.

No separate dashboard/control-plane application is introduced.

## 8. Out of scope

For the first release of this branch:

1. Automatic production scheduling optimization across machines.
2. IoT/PLC machine integration.
3. Payroll or labor costing.
4. Advanced finite-capacity MRP.
5. Supplier subcontracting settlement unless required by an existing live workflow.
6. Replacing the shared metadata-driven runtime.
7. Rewriting Item identity around colour/dimension variants.
8. Production deployment, migration or secret changes before separate approval.
9. Enabling or modifying Purchase Receipt FIFO rollout owned by PR #14.

Operation/routing, workstation capacity, subcontracting and detailed labor may follow after basic inventory and manufacture invariants pass staging.

## 9. Decisions and gates

### Source and branch policy

- Authoritative brief: `server/briefs/alumdoor-v2.json` v2.0.34.
- Working branch: `feat/inventory-manufacturing-item-catalog-20260731`.
- Default branch remains `hotfix/alumdoor-print-list-delete`.
- Rebase after PR #14 merges because procurement and stock contracts may overlap.
- Do not push implementation directly to default branch.

### Delivery gates

- **G0 Scope:** complete.
- **G1 Requirements:** this BRD must be approved before implementation planning.
- **G2 Plan:** identify exact modules/files, migrations, invariants, tests and rollback.
- **G3 Verification:** focused tests followed by repository-required test/typecheck/build.
- **G4 CI:** required checks green for exact PR head SHA.
- **G5 Staging:** terminal deployment success and smoke for catalog audit, stock and production journeys.
- Production requires a separate explicit instruction after staging.

### Release blockers

- Any Critical/High catalog audit error.
- Missing or ambiguous UOM conversion.
- Duplicate/circular active BOM.
- Stock and physical lot projections not committed atomically.
- Negative stock or stale revision race not covered by tests.
- Work Order snapshot absent or mutable.
- Cancel/reversal cannot restore original state.
- Exact-head CI missing, cancelled or red.
- Staging smoke missing.

### Recovery

- Metadata/code rollback through Git revert before production.
- Append-only migration recovery through forward correction, never editing a deployed migration.
- Runtime feature flags/activation default off for any new ledger path until audit and staging pass.
- Tenant backup before any production migration or activation.

## 10. Product identity

- **Name:** Alumdoor Inventory and Manufacturing Completion
- **Slug:** `alumdoor-inventory-manufacturing`
- **Deliverable type:** major module enhancement inside the existing Forge SaaS ERP
- **Target users:** Chủ xưởng, Thủ kho, Sản xuất, Kế toán and limited Kinh doanh readers
- **Repository:** `nguyentrieu210/forge`
- **Distribution:** existing Alumdoor brief/app package and shared CloudForge/MetaForge runtime
- **Environment model:** GitHub branch/PR → exact-head CI → Cloudflare staging → separately approved production

## G1 acceptance checklist

- [x] Product shape and affected actors are identified.
- [x] `alumdoor-v2.json` v2.0.34 is selected as authoritative.
- [x] Item, warehouse, physical lot, BOM, Work Order and Stock Entry contracts are defined.
- [x] Main workflows include failure branches.
- [x] Permission/action matrix is explicit.
- [x] Out-of-scope and destructive boundaries are explicit.
- [x] Acceptance evidence and release blockers are measurable.
- [ ] User approves this BRD, opening G2 technical planning.
