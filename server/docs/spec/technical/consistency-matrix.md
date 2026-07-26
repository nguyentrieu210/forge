# Consistency Matrix

| Use case | Store/path | Consistency requirement |
|---|---|---|
| Save then reload same session | D1 Sessions bookmark | Read-your-own-writes. |
| Public/master-data list | Read replica, unconstrained session | Eventual freshness acceptable with version header. |
| Submit financial voucher | Aggregate DO + primary D1 batch | Serialized command + atomic ledger. |
| Stock reservation | Inventory DO + D1 | Strong coordination per item/warehouse/dimension. |
| Notification delivery | Outbox + Queue | At-least-once transport, exactly-once effect by key. |
| Realtime presence | DO room | Ephemeral presence; not canonical. |
| BI refresh | Snapshot/bookmark | Reproducible `as_of`; no silent mixed snapshot. |
| Cross-shard report | Shard generation manifest | Bounded-staleness or explicit period-close snapshot. |
| Cache | Cache/KV | Never authorization or canonical ledger source. |
