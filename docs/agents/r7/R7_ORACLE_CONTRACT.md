# R7-A Oracle Contract

## Principle

Static source describes candidate behavior; the pinned Frappe 16 runtime is the arbiter when behavior depends on merged metadata, installed-app order, database state, session state, hooks, permissions or dynamic dispatch.

## Required fixture shape

Every new R7 fixture must carry at least:

```json
{
  "fixture_id": "R7-FRAPPE-...",
  "frappe_sha": "ba18090b141740e75d52aa97bfc525ff2f831f6c",
  "domain_id": "FRAPPE-...",
  "initial_state": {},
  "actor": {"roles": []},
  "operation": {},
  "expected": {
    "response": {},
    "document_state": {},
    "side_effects": [],
    "error": null
  }
}
```

Normalize nondeterministic timestamps/IDs only when they are not part of the contract. Never normalize away state transitions, authorization decisions, numeric values, ledger effects, version tokens or error classes when those are under comparison.

## Differential outcomes

A fixture may resolve a domain to exact parity, semantic parity, Forge superset, intentional difference or a gap. Capturing upstream output alone is `ORACLE_CAPTURED`, not parity.

## Clean-room boundary

Use upstream source and runtime to determine observable behavior. Prefer behavior/spec/fixture -> independent Forge implementation. Do not translate upstream implementation line-by-line into proprietary code without an explicit compatible licensing profile.

## Existing infrastructure

R7 reuses:

- `server/docs/spec/source-exact/`;
- `server/docs/spec/tools/oracle-bench/`;
- source/runtime traceability contracts;
- existing differential artifacts where their baseline SHA matches.

Evidence from another upstream SHA or another Forge commit is historical until reproduced or reviewed for applicability.
