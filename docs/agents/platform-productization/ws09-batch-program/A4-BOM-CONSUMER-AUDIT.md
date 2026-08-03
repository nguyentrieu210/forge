# A4 — BOM Batch Consumer Audit

Date: 2026-08-04
Branch: `agent/ws09-batch-04-bom`
Program baseline: `8259d9bac1d2098d9e66195cb22e14072cd75139`
A4 bootstrap head: `d0a366cde0472baef7d8cbdea68862be4ab8c8cb`
Risk: **STANDARD**

## 1. Scope truth

A4 owns the Manufacturing/BOM consumer only. It must not invent the shared BatchAction/BatchTransaction contract or executor while A1/A2 are still bootstrap-only.

Current upstream worker state at this audit:

- A1 PR `#548`, head `e1dd7b4b69296d4916c0a5172ece92aac3cf23d7`: bootstrap/handoff only; no accepted shared contract yet.
- A2 PR `#549`, head `c8e151d90211baa1fcc828ac1f4d6082c77b9d90`: bootstrap/handoff only; no accepted executor yet.

Therefore this branch continues only independent WS05 work until those shared heads are available.

## 2. Existing canonical BOM authority

### Version/lifecycle authority

`server/packages/clouderp-erpnext/src/manufacturing-lifecycle.ts` already owns:

- `Draft | Active | Retired` BOM lifecycle;
- positive integer revision;
- effective-from/effective-to validation;
- submitted BOM must be `Active`;
- canonical Item/UOM normalization;
- deterministic BOM row IDs when missing;
- revision collision guard;
- overlapping Active effective-interval guard;
- circular BOM guard;
- immutable checksum used by Work Order snapshotting.

A4 must not reproduce any of those rules in the generic batch layer.

### Existing bulk Draft authority

`server/packages/clouderp-erpnext/src/manufacturing-bom-bulk.ts` already owns the BOM-specific spreadsheet-style mapping:

- one parent + child rows;
- maximum 500 component rows;
- fixed-point quantity/conversion normalization;
- direct self-consumption guard;
- deterministic row order/`ROW-n` identity;
- Draft-only canonical document shape;
- stable semantic fingerprint;
- replay matching that tolerates controller-expanded computed/default fields without ignoring caller business changes.

`server/apps/tenant-worker/src/manufacturing-bom-bulk-api.ts` already owns the bounded server route:

- authenticated trusted tenant context;
- create + read permission checks;
- side-effect-free preview;
- canonical revision lookup;
- exact readable Draft replay without second write;
- fail-closed same-revision conflict;
- actual create delegated to the ordinary canonical BOM resource path;
- D1 bookmark propagation.

The Tenant Worker binding scans matching tenant BOM revisions and fails closed if any matching revision is outside the actor's read scope.

## 3. Consumer semantics to preserve when A1/A2 land

The A4 adapter must express these vertical semantics without changing the shared primitive:

1. **Operation**: create one BOM Draft candidate from one parent row plus ordered child rows.
2. **Preview**: call/reuse the pure BOM draft builder/fingerprint path; no document write, no stock/GL/cost side effect.
3. **Commit**: delegate to the canonical BOM resource/controller path only.
4. **Idempotency**: shared executor idempotency is authoritative for batch replay; BOM keeps its business-key replay guard as defense-in-depth for lost-response retry.
5. **Ordering**: parent operations are ordered by shared executor; child row order remains the caller's canonical BOM row order and is fingerprinted.
6. **Version collision**: more than one matching company/item/revision is an explicit failure; one Active/submitted revision is never overwritten.
7. **Correction**: batch create is Draft-only. Existing Active/submitted BOM history is not mutated by this consumer. Correction/versioning must continue through the canonical BOM/document lifecycle, normally by a new Draft/revision or the existing explicit amend/cancel path where allowed.
8. **Permissions**: shared executor must pass trusted actor/tenant context; BOM create/read permissions and document read scope remain server-authoritative.
9. **Side effects**: this A4 scope does not submit BOM, create Work Orders, post Stock Ledger, post GL, or alter costing authority.

## 4. Independent regression added on A4

`server/tests/manufacturing-bom-bulk-api.test.mjs` now additionally locks:

- ambiguous duplicate records for the same company/item/revision fail before write;
- an Active revision with otherwise matching business payload is never silently overwritten.

These cases complement the already-existing evidence for preview purity, exact Draft replay, conflicting payload failure, canonical Draft creation, D1 bookmark propagation, and client tenant-selector rejection.

Executable test status in this session: **UNPROVEN**. The available environment has no repository checkout/dependencies and direct GitHub clone DNS resolution failed, so A4 does not claim PASS from source inspection alone.

## 5. Dependency Request

Dependency Request
From: A4
To: A1/A2
Need: accepted shared BatchAction/BatchTransaction contract plus executor/domain-callback seam that A4 can consume without defining a second shared primitive.
Why owner belongs there: A1 owns shared metadata/result semantics; A2 owns generic execution/idempotency/audit orchestration.
Blocked scope: final BOM adapter registration into the shared primitive; shared retry/idempotency integration test; combined result-envelope assertion.
Independent work remaining: yes — exact BOM lifecycle audit, version/correction rules, fixtures/regression, permission/tenant evidence, consumer mapping plan.
Evidence: `manufacturing-lifecycle.ts`, `manufacturing-bom-bulk.ts`, `manufacturing-bom-bulk-api.ts`, `manufacturing-bom-bulk*.test.mjs`, this audit document.

## 6. Integration checklist once dependency resolves

- consume exact accepted A1 types instead of copying them;
- consume exact accepted A2 executor/domain callback seam;
- expose BOM-specific declaration/adapter only under WS05 ownership;
- map one batch item to one canonical BOM Draft operation;
- prove preview produces no writes;
- prove shared idempotency key + BOM business replay cannot duplicate Drafts;
- prove same revision collision remains explicit;
- prove Active revision cannot be overwritten;
- prove actor/tenant permission context reaches BOM authority unchanged;
- run focused BOM tests plus manufacturing package gates appropriate to the changed files;
- record exact A1/A2 heads consumed in `A4-HANDOFF.md`.

## 7. Maturity recommendation

No capability promotion from this audit alone. Existing BOM parent/child/version capability evidence remains as previously recorded by WS05; shared batch productization is not yet `Wired` for BOM until the A1/A2 primitive is actually consumed and executable integration evidence exists.
