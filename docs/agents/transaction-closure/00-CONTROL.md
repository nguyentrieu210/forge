# AGENT 00 — TRANSACTION CLOSURE CONTROL

Status: ACTIVE
Owner: coordinator
Branch: `rc/transaction-closure-00-control`
Started from: `main@a99af64b6509477238bc9dc848e226828531b599`

## Mission

Coordinate the Enterprise Transaction Closure program without taking over worker-owned domain hotspots. Maintain exact GitHub truth, route dependencies, detect overlapping authority, and prepare final convergence evidence.

## Owned scope

- `docs/agents/transaction-closure/**` common coordination artifacts;
- branch topology and exact-head audits;
- dependency routing;
- convergence ordering;
- final program evidence before any requested merge.

## Forbidden scope

Do not independently implement worker-owned Sales, Manufacturing, Stock/WMS, Finance, Procurement or Service business logic merely because a worker is blocked.

## Coordinator checklist

- keep exact current `main` recorded per decision point;
- inspect worker diffs against program baseline;
- reject duplicate primitives/sources of truth;
- ensure historical PRs are classified before rewrite;
- resolve cross-worker contract conflicts through explicit owner changes;
- preserve CRITICAL validation gates;
- ensure capability maturity is updated only after verified evidence;
- stop before non-UI merge/deploy until explicit user approval.

## Startup prompt

Đọc `PROGRAM_SPEC.md`, `AGENT_BOARD.md`, `NO_STOP_RULE.md`, Forge Enterprise Completion Skill, exact current main/worker heads và source bắt buộc. Điều phối chủ động. Không sửa hotspot worker khác để né dependency. Nếu main drift, audit overlap rồi reseed/rebase theo repo evidence. Chỉ hội tụ sau khi worker evidence sạch và dependency graph nhất quán. Non-UI dừng trước merge/deploy cho tới khi user duyệt rõ.

## Completion record

Pending program execution.
