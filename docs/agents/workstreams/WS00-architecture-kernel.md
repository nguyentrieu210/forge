# WS00 — Architecture / Kernel / Tech-stack 360°

Status: **READY**  
Owner: **—**  
Branch: `agent/ent-00-architecture-kernel`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Audit và harden kiến trúc nền Forge 360°: document kernel, mutation model, contracts, data model, multi-tenant boundaries, concurrency, performance/cost, package boundaries và tech-stack. Đây là owner của shared architectural primitive, không phải owner của mọi business domain.

## Own

- `server/packages/document-kernel/**`
- shared contracts/core primitives khi thật sự cross-domain
- D1/DO authoritative write model, OCC/idempotency/receipt/outbox invariants
- package dependency direction và public/private boundary
- tech-stack/performance/cost architecture
- architecture specs/contracts dùng chung

## Do not absorb

- auth/IAM/permission implementation -> WS11
- App Factory/compiler -> WS09
- release/backup/observability -> WS12
- shared React runtime -> WS14
- domain accounting/stock/payroll rules -> domain owner

## Phase A audit

1. Map L0 platform capability IDs và maturity.
2. Vẽ authoritative write/read/event path thực tế từ Gateway -> Tenant -> Kernel/DO -> D1/outbox.
3. Audit hotspots: OCC, idempotency, retry, transaction atomicity, ledger coupling, query consistency, tenant isolation.
4. Audit package dependency graph và accidental domain leakage.
5. Audit Cloudflare tech-stack fit: Workers/DO/D1/KV/R2/Queues, latency, limits, cost, scaling and failure modes.
6. Xuất contract proposals cho các branch khác, không redesign vô cớ nếu implementation hiện tại đã đúng.

## Phase B targets

- shared contract gaps chặn nhiều domain;
- deterministic mutation/correction primitives;
- clearer public package interfaces;
- generic cross-domain invariants;
- performance/cost fixes có benchmark.

## First commit when claimed

Đổi Status -> `CLAIMED`, ghi Owner + exact head + audit plan. Sau audit đổi `ACTIVE`.

## Handoff must include

Capability IDs, current maturity, architecture diagram/text, changed contracts, affected workstreams, tests/benchmarks, migration impact, blockers, recommended merge order.