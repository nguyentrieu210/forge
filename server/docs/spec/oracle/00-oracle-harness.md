# Oracle Harness

## Principle

Run the same canonical fixture against pinned upstream site and CloudForge. Normalize only unstable values explicitly listed (timestamps, generated IDs when mapped, ordering where source does not guarantee order).

## Capture

- request/command;
- response/error code;
- document before/after;
- child rows and derived status;
- GL/SLE/Payment Ledger;
- related document progress/outstanding;
- emitted notification/webhook/job intent;
- permission-visible fields;
- query/report result;
- source tag/SHA and CloudForge release.

## Comparator

Difference classes:

- `SCHEMA_DIFF`
- `VALUE_DIFF`
- `LEDGER_DIFF`
- `STATUS_DIFF`
- `PERMISSION_DIFF`
- `ERROR_DIFF`
- `SIDE_EFFECT_DIFF`
- `PERFORMANCE_REGRESSION`

Critical fixture passes only with zero unexplained functional diff. Approved intentional differences require waiver with product rationale and migration impact.
