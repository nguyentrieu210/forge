# CloudForge Mapping Contract

Every source artifact and behavior must have a disposition. Source discovery alone is not progress toward parity until it maps to implementation or an explicit waiver.

## Mapping record

Required fields:

```json
{
  "mapping_id": "MAP-ERP-SALES-INVOICE",
  "source": {
    "app": "erpnext",
    "commit": "40-char-sha",
    "paths": [],
    "hashes": []
  },
  "behavior_ids": [],
  "disposition": "PORT|REIMPLEMENT|DEFER|NOT_APPLICABLE|EXTERNAL_SERVICE|WAIVER",
  "cloudforge": {
    "packages": [],
    "symbols": [],
    "migrations": [],
    "routes": []
  },
  "license_profile": "CLEAN_ROOM|GPL_DERIVATIVE|MIT_PORT|INTERFACE_ONLY",
  "oracle_cases": [],
  "status": "MAPPED|IMPLEMENTED|ORACLE_GREEN|BLOCKED",
  "owner": "",
  "reviewers": [],
  "notes": ""
}
```

## Dispositions

- `PORT`: source logic/text is directly adapted; license obligations apply.
- `REIMPLEMENT`: behavior is independently implemented from observable contract and structural understanding.
- `DEFER`: intentionally outside the current product release; cannot count toward complete parity.
- `NOT_APPLICABLE`: source behavior has no meaning on the Cloudflare architecture; requires reviewer approval and substitute behavior where needed.
- `EXTERNAL_SERVICE`: delegated to a compatible external service with an integration contract.
- `WAIVER`: accepted divergence with impact, migration and user-facing documentation.

## Mapping granularity

One DocType-to-controller mapping is usually too coarse. Separate at least:

- metadata and naming;
- create/update validation;
- submit/cancel/amend;
- permissions;
- ledger posting;
- mapping to downstream documents;
- background jobs;
- reports;
- print/import/export;
- UI interactions;
- migration and reconciliation.

## Cloudflare-specific substitutions

When replacing Frappe runtime mechanisms, document the semantic substitute:

| Frappe behavior | CloudForge candidate | Required parity evidence |
|---|---|---|
| DB transaction | D1 batch + Durable Object coordination | atomicity/race/replay fixtures |
| background job | Queue consumer + outbox | delivery/retry/idempotency/dead-letter fixtures |
| realtime publish | event/outbox/websocket service | authorization/order/reconnect fixtures |
| file storage | R2 + signed access | permission/version/retention fixtures |
| cache/locks | KV/cache + Durable Object | invalidation and mutual-exclusion fixtures |
| naming series | allocator Durable Object | concurrency/idempotency/rollback fixtures |

Architecture can differ; observable business behavior and safety invariants must remain explicit.
