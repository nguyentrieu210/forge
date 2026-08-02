# WS13 — Migration / Import / Implementation / Customer Success

Status: **CLAIMED**  
Owner: **chatgpt-ws13**  
Branch: `agent/ent-13-migration-implementation`  
Product baseline: **Forge 0.2.0**  
Seed baseline: `862636e6239c91eab657c619d8c55345ed71a6d8`  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

Before implementation: compare exact current `main`; incorporate source-relevant changes. Operational/deploy-evidence-only head drift does not by itself redefine the product baseline.

## Mission

Tạo đường chuyển khách vào Forge và go-live có kiểm soát: import wizard, mapping/validation/preview, opening data, migration adapters, reconciliation, setup wizard/checklist/training/support/adoption.

## Own

import/migration orchestration, source mapping, staging/validation, duplicate handling, opening balances/data, incremental migration, post-migration reconciliation framework, adapters MISA/ERPNext/Odoo/FAST/Bravo/legacy theo demand, implementation/setup/go-live tooling.

## Phase A audit

Audit current CSV/import/export, app installer, metadata migration, tenant migrations, seed/demo/setup flows; liệt kê dữ liệu doanh nghiệp bắt buộc và reconciliation contract với từng domain. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

### Audit plan

1. Locate capability IDs `IM*` and current import/export/setup/migration seams.
2. Audit server routes, tenant migrations, installer/CLI paths, seed/demo/setup flows and existing tests.
3. Audit substantive legacy PRs touching import/migration/onboarding and classify disposition.
4. Define generic source -> staging -> validate -> preview -> apply -> reconcile state machine and idempotency/retry contract.
5. Implement the first independent vertical slice only inside WS13 ownership; record dependency requests instead of editing shared hotspots.

## Phase B priority

Generic import pipeline -> opening/master migration -> transaction migration -> reconciliation -> ERPNext/MISA adapters -> setup/go-live tooling.

## Dependencies

WS00 data contracts, WS01 finance opening/reconcile, WS04 stock opening, WS06 HR, WS11 tenant/security, WS12 backup/migration safety; mọi domain cung cấp canonical import contract.

## Guard

Không import thẳng bypass business invariants nếu dữ liệu cần authoritative posting. Migration phải restartable/idempotent và có dry-run/preview theo scope.

## First commit / handoff

Claim owner/head; cuối nhánh ghi source-target maps, migration state machine, reconciliation evidence, rollback/retry, tests, legacy PR disposition, dependencies, PR.
