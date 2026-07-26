# Document Runtime Contract

## Lifecycle
`load/new → defaults → setup/onload → field events → validate → before_save → transaction → after_save/outbox → refresh`.

## Unit of Work
- Resolve schema and document version.
- Read existing parent/children with row permission.
- Apply patch and child diff using stable IDs.
- Run typed validators and product controllers.
- Produce document rows, ledgers, audit version and outbox events.
- Commit in one D1 batch transaction; no email/webhook inside transaction.

## Submit/cancel/amend
- `docstatus 0→1`, `1→2`; submitted updates limited by schema/action.
- Cancel posts deterministic reversal and updates linked status.
- Amend creates new draft linked to cancelled/original chain.

## Concurrency
- `version`/`If-Match`; mismatch returns typed conflict with server/client diff.
- Durable Object only for coordination needing serialization; D1 remains canonical.
