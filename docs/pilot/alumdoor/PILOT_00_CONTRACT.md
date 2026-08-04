# Alumdoor Controlled Pilot — Pilot-00 Contract

Status: **LOCKED**  
Verdict: **PILOT-00-LOCKED**  
Certified/deployed product SHA: `49315112a21182d2ce077b08a1fb9e26db07fd36`  
Pilot target: tenant `alu` at `https://alu.kairo.vn`

## 1. Purpose

Pilot-00 freezes the production identity, operating scope, data-entry boundary, reconciliation contract and stop/cutover rules before any real master/opening data is written for the controlled Alumdoor pilot.

Pilot-00 is governance/data-readiness work only. It does not import real customer data and does not declare business cutover.

## 2. Frozen release identity

The only product release authorized as the initial controlled-pilot baseline is:

| Identity | Frozen value |
|---|---|
| Source/release SHA | `49315112a21182d2ce077b08a1fb9e26db07fd36` |
| UI bundle hash | `838218167db020d8` |
| Alumdoor package | `2.2.3` |
| HRM package | `1.8.0` |
| VN Accounting package | `1.6.1` |
| Capability profile | `alumdoor-pilot@1` |
| Capability profile hash | `3e3124018aa3c7d233f0af8b81f751cd3e4a8329b94a2c9295956bc58ac8f7f8` |
| R6 evidence | `deploy-evidence/r6-final-production-certification-49315112a211.json` |
| R6 verdict | `PILOT-GO`, 23/23 evidence PASS |

`main` may advance with documentation/evidence commits without changing this product identity. A product-source change is a new release candidate and cannot silently replace this baseline.

## 3. Site and tenant scope

Initial pilot scope is exactly one certified target:

- tenant: `alu`;
- public origin: `https://alu.kairo.vn`;
- Gateway/tenant/app topology already certified by R6;
- no second tenant, alternate domain or shadow pilot database is considered a live pilot target;
- disposable databases may be used only for rehearsals/reconciliation and must never receive live tenant routing.

## 4. Pilot personas and user policy

Canonical pilot personas are:

| Persona | Pilot responsibility |
|---|---|
| `Giám đốc` | single business cutover approval role; final acceptance authority |
| `Chủ xưởng` | operational oversight across workshop/manufacturing/warehouse |
| `Kinh doanh` | customer, quotation and sales-order operation |
| `Thủ kho` | receipt, reservation, stock movement and controlled reconciliation operation |
| `Kế toán` | invoices, settlement, AR/AP/cash-bank/GL reconciliation in authorized scope |
| `Sản xuất` | production request, work order, cut-order and production movement operation |

Existing accounting/director aliases in Alumdoor metadata may map to these personas, but aliases must not expand privilege beyond the canonical persona.

User-account rules:

- pilot transactions use named accounts only;
- an explicit account allowlist with account -> persona/role mapping must be materialized before Pilot-02;
- privilege/role expansion after allowlist freeze is a pilot-contract change and must be reviewed before use;
- shared/generic accounts are not accepted as normal pilot operators;
- technical admin access is not business cutover approval.

The single accountable business approval role is `Giám đốc`. The exact named account holding that authority must be bound before Pilot-04 Cutover Decision.

## 5. Permitted transaction families

The pilot may exercise only canonical transaction families already covered by Alumdoor metadata/shared Forge authorities and R6 Golden Flow evidence.

### Sales / CRM

- Customer / Contact master maintenance;
- Quotation;
- Sales Order;
- Delivery Note;
- Sales Invoice;
- partial/final settlement through canonical payment/ledger contracts.

### Procurement

- Supplier master maintenance;
- Material Request;
- Request for Quotation;
- Supplier Quotation;
- Purchase Order;
- Purchase Receipt;
- Purchase Invoice where required by the accepted accounting path.

### Stock / warehouse

- stock reservation;
- canonical receipt/delivery/production stock movement;
- batch/lot/physical-measure evidence where applicable;
- Stock Reconciliation only for opening/correction use with source evidence and reason; it is not a shortcut for unexplained variance.

### Manufacturing / Alumdoor vertical

- Item/BOM/routing/work-center masters where applicable;
- Production Request;
- Work Order;
- Cut Order;
- brief-declared `alumdoor.*` calculation/cut/correction actions through public APIs under caller identity.

### Warranty / service

- Warranty Claim and source-document lineage tied to actual delivery evidence.

### Finance

- canonical Sales/Purchase Invoice, Payment Ledger/AR/AP/GL readback;
- cash/bank only through VN Accounting/shared Finance authority when in pilot scope;
- no Alumdoor shadow payable, cash or GL balance.

## 6. Prohibited operations inside normal pilot flow

The following are outside normal pilot operation and cannot be used to make reconciliation pass:

- direct tenant D1 writes or manual SQL corrections;
- direct writes to Stock Ledger, GL, Payment Ledger or fulfillment/allocation tables;
- vertical shadow Stock/Finance/HRM/CRM state;
- package/profile upgrade or capability-profile mutation without re-locking pilot identity;
- migration changes not present in the certified release;
- DNS/route/secret/provider mutation as a business-flow workaround;
- destructive PITR/restore or queue/state rewind as an ordinary correction path;
- manual balancing entries with no source-bound business reason.

## 7. Frozen source-extraction and cutoff rule

Before Pilot-01 may import any real data, one immutable import batch manifest must be created with:

- `pilot_batch_id`;
- `source_system`;
- explicit `cutoff_at` as RFC3339 UTC;
- local display timestamp in `Asia/Ho_Chi_Minh`;
- `extract_at`;
- source file names;
- SHA-256 for every source file;
- row counts and source totals by dataset;
- mapping-contract version;
- extractor/operator identity;
- accepted exception list, if any.

Rules:

1. There is no implicit or floating cutoff time.
2. The source snapshot is immutable after hashing.
3. Transactions created after `cutoff_at` belong to a separate delta set.
4. Re-extraction creates a new `pilot_batch_id`; it does not overwrite an accepted batch.
5. Import previews must reconcile to the source manifest before production write authorization.
6. Original source values and normalized target values remain traceable by source key.

## 8. Master/opening-data mapping lock

The machine-readable contract is `PILOT_DATA_MAPPING_V1.json`.

Pilot-01 may populate values but may not silently change:

- dataset identity;
- canonical target object;
- required source key/provenance fields;
- quantity/money axis semantics;
- duplicate/conflict rules;
- reconciliation dimensions.

A mapping-contract change requires a new version and fresh dry-run evidence.

## 9. Daily reconciliation contract

Default tolerance is **zero unexplained variance**.

| Dimension | Acceptance rule |
|---|---|
| Release/package/profile | exact identity match |
| Document count/status | exact by source key/type/status after allowed timing boundary |
| Stock quantity | exact like-for-like canonical quantity axis at stored precision |
| Stock value | exact canonical valuation amount at stored precision |
| AR | exact VND minor-unit balance by customer/reference |
| AP | exact VND minor-unit balance by supplier/reference |
| Cash/bank | exact VND minor-unit balance when included in scope |
| Revenue | exact VND minor-unit amount for compared posting population |
| COGS | exact VND minor-unit amount for compared posting population |
| Manufacturing/WIP | exact accepted quantity/value dimensions used by the source comparison |
| GL | debit = credit and exact compared balance by account/dimension |
| Exceptions | every non-zero/unmatched item has owner, root cause, disposition and recheck evidence |

Do not compare unlike physical axes. For example, theoretical weight and measured actual weight are different evidence classes unless the source contract explicitly declares them comparable.

No discrepancy is hidden by changing a tolerance after observing the result.

## 10. Stop criteria

Pilot activity stops and new business writes are frozen for investigation when any of these is observed:

- deployed release SHA, bundle, package or profile no longer matches the locked pilot identity;
- auth/session/permission or tenant-isolation failure;
- unknown/pending migration appears on the active target;
- canonical Stock/AR/AP/payment/GL reconciliation has an unexplained non-zero variance;
- duplicate/idempotency protection fails and could double-post business state;
- mapping collision, lost source lineage or wrong tenant assignment is detected;
- a flow requires direct D1/ledger write or another authority bypass to continue;
- a P0/P1 pilot blocker is opened and not dispositioned;
- backup/recovery evidence required for a planned cutover is not fresh/verified.

A performance anomaly without correctness impact is investigated against the R6 baseline; no customer SLA is invented by this contract.

## 11. Correction, rollback and forward-fix rules

- Business/data corrections use canonical cancel/return/reconciliation/correction documents with reason and source lineage.
- Direct database repair is not an accepted normal correction mechanism.
- A product-source fix creates a new candidate SHA. Affected R6/pilot evidence must rerun before that release is used for pilot traffic.
- Package/profile changes require pilot identity re-lock and rerun of affected package/profile/Golden Flow evidence.
- Worker/source rollback can restore code behavior only; it does not roll back D1/KV/R2/queue/external business state.
- Data restore/PITR is a separate destructive/recovery decision and requires its own explicit authorization and reconciliation plan.
- If a safe forward-fix preserves business data, forward-fix is preferred over pretending code rollback reversed posted state.

## 12. Cutover acceptance contract

Pilot-04 may issue a cutover GO only when all are true:

1. the exact pilot identity is still locked and observed;
2. Pilot-01 opening/master data is accepted and reconciled;
3. Pilot-02 representative transactions pass on approved accounts/data;
4. Pilot-03 parallel-run reconciliation period has no unresolved P0/P1 and no unexplained ledger variance;
5. fresh backup/recovery evidence exists for the cutover window;
6. cutoff/delta procedure is deterministic and source-bound;
7. the named account holding `Giám đốc` business-approver authority explicitly accepts cutover.

Technical deploy success alone cannot approve cutover.

## 13. Pilot-00 completion

Pilot-00 is complete when this contract, the machine lock and the mapping contract are merged to `main` and the active queue advances to Pilot-01.

No production customer/master/opening data is written by this phase.

**PILOT-00-LOCKED**
