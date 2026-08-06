# E2E-09 — Correction / Cancel / Retry / Idempotency

## Persona
The same permitted business operator who owns the source transaction, plus a permission-negative persona where applicable.

## Business job
Recover safely from a supported mistake, cancellation, return, retry or duplicate action without corrupting authoritative history or creating duplicate stock/finance/business effects.

## Preconditions
A source transaction created by an accepted upstream flow exists in a lifecycle state eligible for the selected correction/cancel/return path. Expected reversal/correction semantics and permission are declared.

## Operator steps
1. Open the authoritative source transaction through UI.
2. Verify its current lifecycle and downstream effects.
3. Execute the supported correction/cancel/return action through real controls.
4. Provide reason/reference when required.
5. Confirm the action.
6. Reopen source and correction records.
7. Verify status/history lineage.
8. Verify stock/finance/reservation/read-model reversal or adjustment expected by the domain.
9. Retry the same logical operation or simulate double-submit according to the supported contract.
10. Verify no duplicate authoritative effect occurs.
11. Run a permission-negative variant against an unauthorized persona.

## PASS
- correction/cancel/return uses supported lifecycle rather than silent history edit;
- source and correction lineage is visible;
- downstream authoritative effects reconcile;
- duplicate/retry is idempotent or fails safely according to contract;
- unauthorized actor is denied server-side;
- no unexplained browser/network/red errors.

## FAIL examples
Source record is silently overwritten, correction creates unexplained duplicate stock/payment, retry repeats the mutation, history loses original values, permission relies only on hidden UI controls, or operator is forced to edit database/config manually.

## Exit condition
The tested domain proves both forward operation and safe human recovery through browser UI while preserving authoritative audit/history.
