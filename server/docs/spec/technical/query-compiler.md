# Query Compiler & Performance Contract

- Input is typed Filter/Join/Aggregate/Order AST.
- Policy compiler injects row predicates and field projections before plan.
- Planner maps promoted columns, JSON extraction, indexes, read models or async prepared job.
- Budget considers estimated rows, unindexed predicates, joins, group cardinality, result size and CPU.
- Queries exceeding interactive budget return `QUERY_REQUIRES_PREPARED_MODE` with remediation.
- Telemetry drives index advisor; production promotion requires approval/migration/rollback.
- D1 Sessions bookmarks preserve read-after-write on replicas.
- Cache keys include tenant, source release, schema version, ACL fingerprint, query hash and parameters.
