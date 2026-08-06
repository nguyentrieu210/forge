# E2E-06 — Warranty / Service

## Persona
Service User / nhân viên bảo hành-CSKH, non-admin.

## Business job
Receive a warranty/service request, bind it to the correct delivered/source document, progress the case through the supported lifecycle and verify history/readback.

## Preconditions
Service persona, customer, eligible delivered/source document, warranty/service policy where applicable and allowed status/assignment values are `READY`.

## Operator steps
1. Complete E2E-00 as Service User.
2. Open `Bảo hành`/Service workspace.
3. Start a warranty/service case.
4. Select customer and delivered/source document through real controls.
5. Enter issue/request details required by the declaration.
6. Save/submit the case.
7. Assign/progress through at least one meaningful lifecycle step.
8. Complete/close when the representative flow supports it.
9. Reopen the case.
10. Verify source-document lineage, customer, status and timeline/history.

## Required negative variants
- ineligible/wrong source document fails clearly;
- unauthorized persona cannot alter lifecycle;
- duplicate submit/retry does not duplicate the case/action.

## PASS
Case remains tied to the correct authoritative source document/customer, lifecycle transitions are valid, history is readable and there are no unexplained browser/network/red errors.

## Exit condition
A service operator can receive, progress and verify one representative case without developer intervention.
