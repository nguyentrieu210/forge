# Behavioral Oracle and Differential Testing

## Unit of parity

Parity is tracked by **behavior case**, not by file or method count. A behavior case defines:

- preconditions and role;
- input documents/requests;
- command sequence;
- expected success or failure;
- normalized document state;
- GL, stock, payment and other ledger effects;
- generated child/linked documents;
- status and outstanding/fulfilment projections;
- report output;
- notifications/jobs/outbox effects where relevant;
- acceptable divergences.

## Required fixture families

For each submittable transaction:

1. create draft;
2. update draft;
3. validation failures;
4. submit;
5. duplicate/replay;
6. stale-version conflict;
7. cancel;
8. amend;
9. return/reversal if supported;
10. permissions and existence-oracle checks;
11. concurrent over-allocation/over-delivery/over-payment race;
12. background-job failure and recovery;
13. reporting/reconciliation after mutation.

For accounting and stock, add matrices for:

- company/base/transaction currency;
- exchange-rate gain/loss;
- precision and rounding;
- inclusive/exclusive taxes;
- discounts before/after tax;
- withholding;
- advances and partial allocations;
- serial/batch and valuation method;
- backdated entry and immutable ledger;
- accounting period lock;
- cost center/project/accounting dimensions;
- regional tax behavior.

## Normalization

Do not compare unstable values directly. Normalize:

- generated names through a fixture mapping;
- timestamps to logical event order where exact time is irrelevant;
- unordered rows by semantic key;
- decimals to declared precision without converting to binary float;
- translated messages to stable error code plus selected-language text;
- database-specific query ordering only when the source contract does not specify order.

## Differential result

Each run emits:

```json
{
  "case_id": "ERP-SI-SUBMIT-001",
  "source_commit": "...",
  "cloudforge_commit": "...",
  "source_result_hash": "...",
  "cloudforge_result_hash": "...",
  "status": "MATCH|DIVERGED|WAIVED|BLOCKED",
  "diffs": [],
  "evidence": []
}
```

## No fake oracle

A fixture written only from reading source is a specification example, not oracle evidence. Oracle evidence must come from execution on the pinned source system or from an upstream test whose setup and assertions are reproducibly executed against the same commit.
