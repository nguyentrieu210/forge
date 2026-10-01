# R7-A Completion Record

## Current decision

`R7-A NOT CLOSED`.

This PR establishes R7-00 control evidence and a conservative exact-main baseline. It does not claim Frappe platform parity.

## Baseline facts

- Forge seed: `b702376ff8b2d4dfe0a53dc2759b71e9df3c99ab`.
- Frappe: `v16.19.0` @ `ba18090b141740e75d52aa97bfc525ff2f831f6c`.
- Denominator: 28 domains from `server/docs/spec/source-exact/frappe-framework-domain-ledger.json`.
- Existing source-exact infrastructure is retained as authority.
- Known client/server compatibility evidence exists, but it does not by itself close all 28 framework domains.

## R7-00 deliverables

- program contract;
- source lock binding;
- oracle contract;
- dependency ledger;
- machine-readable 28-domain parity matrix;
- fail-closed matrix verifier;
- certification mode that refuses closure while GAP/UNRESOLVED remains.

## Certification rule

Run from `server/`:

```bash
npm run r7:frappe:audit
npm run r7:frappe:certify
```

The first validates R7 control integrity and reports classification counts. The second must remain non-zero until all gaps/unresolved domains are closed or explicitly reviewed as intentional/out-of-scope with evidence.

## Next convergence order

Prioritize platform blockers that contaminate ERPNext comparison: metadata/document semantics, permissions, workflow, query/list API and async hooks. ERPNext business closure should consume the resulting verified platform contracts rather than compensate for platform ambiguity.
