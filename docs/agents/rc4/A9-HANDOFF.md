# RC4-A9 — Architecture / Kernel

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Branch: agent/rc4-09-architecture-kernel
Risk: CRITICAL

Mission: own shared platform/kernel contracts needed by residual RC4 lanes. Focus on authoritative document/ledger read-write boundaries, tenant/OCC/idempotency invariants, shared ports and contract gaps explicitly requested by other lanes.

Read first: enterprise completion skill, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, docs/agents/workstreams/WS00-architecture-kernel.md.

Do not absorb domain logic from Finance/Stock/Manufacturing/IAM/App Factory. Other lanes must send Dependency Requests for shared primitives. Prefer minimal generic ports over domain-specific shortcuts.

Evidence: exact-head source/test/migration/permission/invariant proof. Non-UI CRITICAL: open PR and stop before merge/deploy pending user approval. No production mutation.
