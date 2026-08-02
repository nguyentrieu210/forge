# WS10 — Integration Hub / Connector Platform

Status: **CLAIMED**  
Owner: **chatgpt-ws10**  
Branch: `agent/ent-10-integration-hub`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Claimed from exact main head: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Chuẩn hóa API/event/connector platform để Forge nối bank, e-invoice, tax, BHXH, payment, shipping, email/SMS/Zalo/social/marketplace/Google/Microsoft mà không viết integration kiểu mỗi app một cục.

## Own

REST/API key/OAuth/service-account seam, webhook/event subscriptions, connector SDK, mapping/transformation, queues/retry/DLQ/idempotency, external sync cursor/status/error model và integration observability contract.

## Phase A audit

Audit router/API, outbox, queues/jobs, social ingress, app hooks, provider queue/e-invoice seam, retry/idempotency và secret/config boundary. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

Connector contract -> event subscription -> retry/DLQ -> mapping/transformation -> OAuth/service account -> provider adapters theo nhu cầu thật.

## Dependencies

WS00 event/contracts, WS11 credentials/security, WS12 queue/observability, WS01 legal/e-invoice/bank domain, WS16 commerce/social.

## Guard

Không hard-code secret/provider credential. External callback phải tenant-bound, signed/verified, idempotent và auditable.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, connector lifecycle, security assumptions, retry semantics, tests, legacy PR disposition, blockers, PR.
