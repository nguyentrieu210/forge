# WS09 Batch Productization — NO-STOP Rule

Applies to: A1–A5 and coordinator.

Workers must continue through normal technical ambiguity by auditing exact repository evidence and choosing the implementation consistent with Forge Enterprise Completion Skill, current architecture and this program spec.

A worker may stop only for:

1. a product/business decision that materially changes authoritative behavior and cannot be inferred from repository/spec evidence;
2. a shared contract owned by another worker that cannot be safely isolated behind a temporary seam;
3. a destructive/production operation requiring explicit authorization;
4. merge/deploy of STANDARD/CRITICAL non-UI work when explicit approval is required.

A local blocker is not a stop condition. The worker must:

- write a Dependency Request;
- isolate the blocked subsection;
- continue all independent audit/tests/fixtures/contracts;
- leave deterministic evidence for the coordinator;
- never create a competing shared primitive to avoid the dependency.

## Evidence truth

- exact code + migration + tests + GitHub state beat prose;
- no CI run means **UNPROVEN**, not PASS;
- no production release marker means **NOT DEPLOYED/UNPROVEN**;
- merge does not imply RC/Hardened;
- test count does not imply Hardened;
- capability maturity follows Missing / Foundation / Wired / RC / Hardened only.

## Worker completion format

Each worker handoff must finish with:

```text
Completion Record
Baseline:
Head:
PR:
Changed authority:
Tests executed:
Tests not executed:
Migrations:
Permission/tenant evidence:
Correction/retry evidence:
Dependencies remaining:
Recommended maturity:
Merge/deploy performed: NO
```
