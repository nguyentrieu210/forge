# RC4-A10 — CRM / Revenue

Status: IMPLEMENTED / PR PENDING  
Baseline: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Branch: `agent/rc4-10-crm-revenue`  
Risk: STANDARD, with read-only financial analytics sourced from canonical O2C/payment state

## Mission

Close CRM 360 and revenue-operation residuals beyond the already-proven O2C core: lead/opportunity/customer lifecycle, quotation/order handoff, due-date/commercial contract gaps, activities, segmentation, pipeline/reporting and correction paths.

## Repo audit result

The RC3 capability status document is stale relative to current `main`. Current code already contains the previously missing CRM directory, lead dedupe/scoring, sales teams/targets/commission, marketing/segmentation/consent/attribution, channel/field sales and canonical Quotation implementation from the merged WS02 convergence work.

Transaction Closure already owns the hardened Quotation → Sales Order mapping: submitted source, exact source-row identity, customer/company/currency invariants, conversion-factor provenance, cumulative quantity guard and amendment/revision lineage. A10 does not duplicate that authority.

A shared `Contract` already exists under Workplace / Contract Management. A10 does not fork it into a competing Sales Contract. Commercial contract and due-date integration is recorded as `DR-A10-01` in `A10-DEPENDENCY-REQUESTS.md`.

## Implemented on A10

### CRM Customer 360

Added a refreshable, server-authoritative read model:

- `CRM Customer 360`
- `CRM Customer 360 Currency`
- `CRM Customer 360 Activity`
- `CrmCustomer360Controller`

Behavior:

1. one immutable company/customer snapshot per tenant;
2. create/save recomputes from canonical documents and records explicit `as_of`;
3. draft-only snapshot — submit/cancel are rejected;
4. resolves converted leads, direct/converted-customer deals, organizations, contacts and activity timeline;
5. counts only submitted Quotation / Sales Order / Delivery Note / Sales Invoice / Payment Entry records for commercial facts;
6. open/won/lost deal counts plus open/overdue activity counts;
7. fixed-point six-decimal analytics with separate currency buckets — currencies are never summed together;
8. quoted, ordered, invoiced, outstanding and received values are sourced from existing canonical O2C/payment state; A10 writes no GL/payment authority;
9. Sales Invoice return values reduce invoiced value rather than creating an unsigned gross total;
10. event payloads expose identifiers/counts only and do not emit activity subject/email PII;
11. refresh after CRM correction updates timeline/counters without changing the customer identity.

## Evidence added

Source:

- `server/packages/clouderp-selling/src/crm-customer-360-controller.ts`
- `server/packages/clouderp-selling/src/crm-customer-360-types.ts`
- `server/packages/clouderp-selling/src/registry.ts`
- `server/packages/clouderp-selling/src/index.ts`

Metadata:

- `server/apps-src/crm/doctypes/crm-customer-360.json`
- `server/apps-src/crm/doctypes/crm-customer-360-currency.json`
- `server/apps-src/crm/doctypes/crm-customer-360-activity.json`

Regression fixture authored:

- `server/tests/crm-customer-360.test.mjs`
  - manifest packaging;
  - contact/organization/deal/activity rollup;
  - Quotation → Order → Delivery → Invoice → partial Payment rollup;
  - exact USD pipeline/quoted/ordered/invoiced/outstanding/received values;
  - separate EUR bucket proving no cross-currency collapse;
  - activity correction + snapshot refresh;
  - duplicate identity/identity-change/submit guards;
  - redacted event payload assertion.

## Tenant / permission audit

- All document discovery uses the tenant-scoped reader contract.
- Production D1 outstanding aggregation includes `tenant_id` in SQL.
- Existing `InMemoryMutationStore.getOutstandingMinor/getBaseOutstandingMinor` lacks the equivalent tenant predicate. This is a shared kernel parity issue and is recorded as `DR-A10-02`; A10 does not modify A9-owned storage behavior.
- Customer 360 metadata grants create/read/write/report/export to Sales User, with broader share capability for Sales Manager/System Manager. Computed fields are read-only and the controller ignores client-supplied computed values by rebuilding the snapshot.

## Validation truth

- Source/metadata/test evidence: AUTHORED.
- Local executable build/test evidence: NOT RUN / UNPROVEN in this agent session because no sanctioned repository checkout/runtime was available through the connector.
- PR CI evidence: pending PR creation; do not upgrade maturity based on authored tests alone.
- Production deploy evidence: NOT RUN.

## Dependencies

See `docs/agents/rc4/A10-DEPENDENCY-REQUESTS.md`:

- `DR-A10-01`: shared Commercial Contract / due-date bridge — A16 + A9.
- `DR-A10-02`: in-memory outstanding tenant parity — A9.

## Merge/deploy rule

This work is non-UI. It requires PR review and explicit user approval before merge/deploy. No production mutation is performed by A10.
