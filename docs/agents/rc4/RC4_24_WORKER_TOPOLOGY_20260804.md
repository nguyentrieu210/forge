# RC4 — 24 Worker Topology

Status: **BOOTSTRAPPED / PROGRAM CONTROL**  
Control branch: `program/rc4-enterprise-residual-20260804`  
Current main seed for A19-A24: `1f0b08934101640ca15b2379b5dd7ca3ef018e33`

## Worker topology

A1-A18 remain the primary implementation/domain lanes already assigned in RC4.

Additional independent lanes:

| Agent | Branch | Mission | Ownership boundary |
|---|---|---|---|
| A19 | `agent/rc4-19-independent-adversarial-qa` | adversarial QA | tests/evidence only; domain fixes routed to owner |
| A20 | `agent/rc4-20-capability-convergence` | 956-capability convergence | status/evidence/tooling only |
| A21 | `agent/rc4-21-migration-governance` | migration numbering/identity/checksum | migration governance; no production migration |
| A22 | `agent/rc4-22-cross-ledger-reconciliation` | cross-ledger reconciliation | read-only checks/specs; no ledger mutation |
| A23 | `agent/rc4-23-performance-scale-cost` | performance/scale/cost | bounded tests; no unsafe production stress |
| A24 | `agent/rc4-24-release-confidence-qa` | final independent RC4 QA | final evidence/go-no-go; no domain implementation |

## Dependency order

- A19/A21/A22/A23 may run independently while A1-A18 implement.
- A20 converges maturity only from accepted direct evidence; it must not infer readiness from branch/PR existence.
- A24 runs final candidate QA after worker evidence is available and consumes A19/A20/A21/A22/A23 outputs.

## Shared-hotspot rule

A19-A24 must not silently patch authoritative runtime owned by A1-A18. Findings become Dependency Requests to the correct owner. A21 may own migration-governance validators/contracts but does not rewrite applied migrations. A22 never creates compensating ledger entries. A23 remote/provider tests remain explicitly gated.

## Merge/deploy boundary

RC4 contains non-UI/CRITICAL work. Worker PRs and control convergence may be prepared, but non-UI merge/deploy and production/provider/data mutation require explicit user approval. UI-only fast-path remains scoped to genuinely UI-only changes after blast-radius verification.
