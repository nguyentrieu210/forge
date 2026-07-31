# Alumdoor inventory, manufacturing and Item catalog audit

Date: 2026-07-31

Branch: `feat/inventory-manufacturing-item-catalog-20260731`

Base: `cd60f8c09c48105db84a82c12ad3b32d9f075064`

## Verdict

The current Item **schema is a strong foundation**, but the current repository evidence is **not enough to declare the live Item catalog ready for complete inventory and manufacturing operations**.

Practical readiness estimate:

- Item schema and classification: **8/10**
- General inventory flow: **6/10**
- Dimensioned aluminium inventory: **5/10**
- Basic manufacture through BOM + Work Order + Stock Entry: **5/10**
- Full production planning, traceability and control: **3/10**

The next branch should improve the existing model rather than replace it. The main work is data validation, lot/dimension traceability, production warehouse topology, BOM correctness and end-to-end controller tests.

## What is already sufficient

### Item classification

`Item` already models the main business decisions needed by stock and production:

- item nature: stock item, service or asset;
- material stage: raw material, consumable, semi-finished, finished good or traded good;
- supply type: purchase, manufacture or both;
- purchase, sales and manufacturing eligibility flags;
- inventory mode and measurement profile;
- stock, purchase and sales UOMs with conversion rows;
- variants, attributes, allowed colours, technical specification and manufacturer identity;
- default warehouse, inventory/COGS/income/expense accounts;
- reorder levels, standard BOM rate, FIFO valuation and batch/serial flags.

This is enough to avoid creating a second competing Item model.

### Seed master structure

The brief already seeds:

- common UOMs including piece, set, kilogram, metre, square metre, bar, roll and sheet;
- an Item Group tree for finished goods, raw materials, motors, rails, accessories and services;
- measurement profiles for normal goods, aluminium bars/sheets, glass/sheets, rolls, batch/serial and finished goods by area;
- warehouse root plus physical warehouses `K36` and `K12`;
- company inventory and COGS accounts.

### Inventory and manufacturing primitives

The metadata already exposes:

- Stock Entry with Material Receipt, Material Issue, Material Transfer and Manufacture purposes;
- BOM Item with quantity bases: fixed, height, width, area and sheet count;
- Work Order, Bill of Materials and Production Standard navigation;
- Aluminium Lot and Aluminium Cut for aluminium-specific stock;
- stock balance, stock ledger, work-order and production reports.

These primitives are enough for an incremental implementation.

## Why it is not ready yet

### P0: the live Item catalog has not been proven complete

The brief defines the shape, but this audit does not have an authoritative export of the live `alu` Item rows, BOMs, opening balances and lot balances. A form with many fields does not prove that nearly 300 records are classified correctly.

Before inventory or production rollout, export and validate every active Item against category-specific rules.

### P0: two Alumdoor briefs coexist

The repository contains both:

- `server/briefs/alumdoor.json` version `1.27.3`;
- `server/briefs/alumdoor-v2.json` version `2.0.34`.

The implementation branch must pin which brief is the authoritative production source before changing metadata. Changes must not be duplicated manually across two drifting files.

### P0: warehouse topology is too physical for production control

The seeded warehouses are a root plus `K36` and `K12`. Production needs explicit stock roles or mapped sublocations for at least:

- raw materials;
- work in progress;
- finished goods;
- quarantine / waiting for inspection;
- scrap and reusable offcuts.

These may map to physical warehouses, but the role must be explicit and server-validated. Otherwise a Manufacture Stock Entry can consume and produce into arbitrary locations while still looking valid.

### P0: generic Stock Entry loses dimensional traceability

`Stock Entry Item` currently carries item, quantity, source warehouse, target warehouse and valuation rate. It does not carry the aluminium/glass/roll dimensions and source lot identity used elsewhere:

- colour;
- length and width;
- piece/bar/sheet quantity;
- batch, serial or Aluminium Lot link;
- cut/offcut identity;
- quality status.

Therefore generic transfer, issue and manufacture flows can bypass the dimensional truth maintained by Aluminium Lot. The branch must either extend Stock Entry Item with canonical dimension/lot references or force dimensioned materials through dedicated actions that write the same stock ledger atomically.

### P0: BOM quantities are not yet fully authoritative

`BOM Item.uom` is currently free text and the BOM row does not visibly carry a validated conversion factor to the Item stock UOM. Before production, the server must reject:

- unknown UOMs;
- ambiguous or missing conversion factors;
- raw materials not enabled for manufacturing;
- finished goods without manufacture supply type;
- circular BOMs;
- duplicate effective BOMs;
- negative or zero yields;
- BOM quantities that cannot be represented in stock micros.

BOMs also need revision/effective-date handling so old Work Orders keep the formula they were released with.

### P0: manufacturing lifecycle needs end-to-end proof

The branch must prove these flows in the kernel and D1 transaction, not only in metadata:

1. Create and submit a Work Order from a Sales Order or production request.
2. Reserve or identify required materials.
3. Partially issue materials without exceeding the active BOM allowance.
4. Record aluminium lot/cut consumption and reusable offcuts.
5. Partially manufacture finished goods.
6. Reject over-consumption and over-production.
7. Cancel/reverse issue and manufacture entries without leaving negative stock or orphaned lot balances.
8. Close the Work Order only when material and output invariants are satisfied.

### P1: missing production-control concepts

For full production rather than simple stock conversion, add or confirm support for:

- operations and routing;
- workstation/team responsibility;
- planned and actual start/end times;
- capacity and queue priority;
- quality checkpoints;
- scrap, by-products and rework;
- subcontracted operations;
- BOM revision and production variance reporting.

These can be phased after the inventory ledger and basic manufacture path are correct.

## Required Item validation matrix

### Raw materials

Required:

- `item_nature = Hàng tồn kho`;
- `material_stage = Nguyên vật liệu` or `Vật tư tiêu hao`;
- purchase/manufacturing eligibility set correctly;
- stock UOM and all transaction conversions valid;
- inventory mode and measurement profile consistent;
- default warehouse/account or a valid Item Group/company fallback;
- allowed colours/specification where applicable.

### Semi-finished and finished goods

Required:

- `material_stage = Bán thành phẩm` or `Thành phẩm`;
- `supply_type = Tự sản xuất` or `Mua hoặc sản xuất`;
- `include_item_in_manufacturing = 1`;
- active BOM or Production Standard;
- output stock UOM and target warehouse role;
- sales eligibility only when the item may be delivered directly.

### Services and charges

Required:

- `item_nature = Dịch vụ`;
- stock and manufacturing disabled;
- no warehouse, batch, serial or reorder configuration;
- sales/purchase eligibility set according to the service.

## Delivery plan for this branch

### Slice A: audit and validators

- Pin the authoritative Alumdoor brief.
- Add a dry-run Item/BOM/warehouse audit script.
- Export a redacted live catalog snapshot outside Git.
- Produce counts and row-level errors without modifying production.
- Add server validators for Item category invariants and UOM conversion integrity.

### Slice B: inventory completeness

- Define warehouse roles.
- Complete Stock Entry lot/dimension traceability.
- Add stock reconciliation and opening-balance validation.
- Cover transfer, issue, return, cancel and concurrent stock mutations.

### Slice C: manufacturing completeness

- Version BOMs and validate material/output UOMs.
- Complete Work Order partial issue/produce/cancel lifecycle.
- Integrate Aluminium Lot/Cut consumption and offcuts.
- Add production variance, WIP and finished-goods reports.

### Slice D: UI, QA and release

- Compact Item forms by category and hide irrelevant fields without changing server authority.
- Add Item completeness indicators and validation messages.
- Run unit, SQL, worker concurrency, typecheck, build and Browser QA.
- Stage with a catalog export and test Work Order before any production deployment.

## Deployment safety

This branch must not deploy production, migrate `alu`, modify Cloudflare secrets or change FIFO rollout state until its own CI, staging and catalog-audit gates pass.
