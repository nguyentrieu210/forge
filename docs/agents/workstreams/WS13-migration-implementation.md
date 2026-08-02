# WS13 — Migration / Import / Implementation / Customer Success

Status: **REVIEW**  
Owner: **chatgpt-ws13**  
Branch: `agent/ent-13-migration-implementation`  
PR: **#313** (draft; non-UI CRITICAL merge gate)  
Product baseline: **Forge 0.2.0**  
Started from exact main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Last source-relevant main audit: WS00 kernel ports + WS10 integration-hub merged on current `main`; exact GitHub state still wins this snapshot.  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Tạo đường chuyển khách vào Forge và go-live có kiểm soát: source adapters, mapping/preview, duplicate/retry, opening data, incremental migration, reconciliation, setup/implementation checklist, training/support handoff và adoption evidence.

## Exact-state audit and drift handling

- Branch cũ chỉ chứa seed handoff nên đã reset sạch lên exact `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` trước implementation.
- Trong lúc WS13 chạy, `main` tiến lên bởi WS14, WS00 và WS10.
- WS00 source-relevant drift đã audit qua `docs/agents/workstreams/WS00-architecture-kernel.md` và `server/docs/spec/technical/kernel-domain-ports.md`: authoritative write vẫn là `MutationCommand -> coordinator/OCC -> DocumentKernel`; new code phải dùng port hẹp. `KernelMigrationApplyPort` của WS13 phù hợp ranh giới này và không cần sửa kernel.
- WS10 tạo conflict cơ học tại `server/package.json`; branch đã hợp nhất exact current-main `integration-hub --check` với WS13 `test-migration-run-journal.py`. Sau đó PR #313 trở lại `mergeable=true`.
- Main không có tenant migration `0043` tại lần audit cuối; WS13 dùng append-only `0043_migration_run_journal.sql`. Phải recheck exact main ngay trước merge vì parallel workstream có thể đổi migration head.

## Existing Forge evidence reused

### Current Data Import path

`server/packages/frappe-api/src/router.ts` đã có Frappe-compatible CSV preview/apply:

- permission `import`/`create` server-side;
- reject child DocType và unknown columns;
- row-by-row partial success;
- mọi authoritative write đi qua `buildCommand -> context.runCommand`;
- không bypass document kernel/lifecycle.

WS13 không tạo đường write cạnh tranh. Generic migration executor chỉ chuẩn bị/journal command, còn execution vẫn gọi canonical `runCommand` qua bridge.

### Kernel idempotency / receipt

- `server/packages/frappe-api/src/command.ts` tạo deterministic `command_id` khi target identity/version/payload đã biết.
- `server/packages/document-kernel/src/d1-store.ts` commit `mutation_receipts` cùng transaction với document/ledger effects.
- WS13 dùng receipt hiện có làm authoritative recovery evidence thay vì phát minh receipt business thứ hai.

### MISA / Excel evidence

- `client/apps/kho-vn/src/misa-mapping.ts` + verifier đã chứng minh mapping MISA AMIS trên receipt/delivery/transfer sample workbooks bằng normalized header, không map theo vị trí cột.
- `server/scripts/import-aluminium.mjs` cung cấp pattern dry-run/apply/retry từ import Excel thực tế. WS13 tái sử dụng pattern, không đưa script khách hàng vào core.
- Workbook decoding vẫn ở browser/CLI; server migration module chỉ sở hữu grid/header/row semantics để không kéo parser XLSX vào Cloudflare Worker.

### Setup / provisioning evidence

- App installer đã atomic/idempotent và sở hữu app metadata activation. WS13 không tạo setup-metadata store cạnh tranh.
- Existing business forms remain source of truth; implementation checklist trỏ tới capability/setup outcome, không duplicate form nghiệp vụ.

## Target architecture implemented

```text
source file/API
  -> source adapter / tabular normalizer
  -> mapping + validation preview
  -> deterministic MigrationPlan
  -> durable run + row reservation
  -> resolve stable target identity
  -> persist command_id + payload_hash
  -> canonical runCommand / DocumentKernel
  -> kernel mutation_receipt
  -> row outcome / retry recovery
  -> checkpoint
  -> exact reconciliation
  -> implementation/go-live/customer-success evidence
```

### Retry invariant

Authoritative create/update order:

1. resolve target name before execution;
2. persist `source row -> target name` reservation;
3. persist exact `command_id + payload_hash` with row status `applying`;
4. execute canonical kernel command;
5. persist final `imported/updated` outcome.

If step 4 throws because response disappeared:

- first-primary kernel receipt exists and matches target/hash -> recover as committed success;
- no receipt -> only then mark failed/retryable;
- receipt mismatch -> invariant failure, never silent retry.

This closes the original autoname duplicate gap without changing document-kernel ownership.

## Implementation delivered

### 1. Deterministic migration core

`server/packages/migration/src/index.ts`

- source kinds: CSV/Excel/API/SQL/ERPNext/MISA/Odoo/FAST/Bravo/legacy;
- duplicate policy `error | skip | update`;
- explicit source -> target mapping and ignored columns;
- required-target coverage;
- source fingerprint, plan ID, row key/fingerprint;
- explicit run state machine;
- exact reconciliation comparison.

### 2. Source adapters / templates

- `adapters.ts`: Frappe/ERPNext normalization + verified MISA inventory mapping.
- `tabular.ts`: workbook-neutral CSV/Excel grid normalization.
- `template.ts`: import template + deterministic mapping suggestions + CSV template renderer.
- `frappe-source.ts`: stable incremental Frappe paging by `(modified, name)` tuple.
- `manifest.ts`: source-controlled migration manifests, dependency phases `master -> opening -> transaction`, secret-field rejection.

### 3. Duplicate / correction / retry

- `execution.ts`: duplicate decision, retry quarantine, gapless checkpoint contract.
- `correction.ts`: confirmed failed-row correction dataset/CSV with framework-owned `__source_row`, `__row_key`, `__error` protected from source payload overwrite.
- Missing outcomes are unresolved, not automatically failed.

### 4. Durable journal / recovery

Tenant migration: `server/migrations/tenant/0043_migration_run_journal.sql`.

Tables:

- `migration_runs`;
- `migration_row_receipts`;
- `migration_checkpoints`;
- `migration_reconciliation_metrics`.

`d1-journal.ts` provides:

- idempotent run creation by plan;
- run-state OCC transition;
- stable row reservation;
- preflight failure persistence and retry promotion;
- command identity persistence before apply;
- immutable/idempotent final row states;
- kernel receipt recovery;
- exact source+adapter checkpoints;
- reconciliation snapshot persistence;
- staged payload purge only after completion/cancellation.

`durable-orchestrator.ts` implements journal-first partial-success execution and retry/recovery.

`kernel-port.ts` keeps integration narrow: existing shared boundary only supplies lookup, authoritative autoname/command preparation and canonical `runCommand`.

### 5. Reconciliation / opening

- `reconcile.ts`: count, distinct-count and nested decimal-sum metrics; decimal addition uses BigInt scaling, not binary float.
- `opening.ts`: generic `OpeningMigrationProvider` preview/apply/reconcile contract.
- Finance/stock/HR owners retain period/effective-date, posting, ledger, correction/reversal and metric definitions.

### 6. Implementation / go-live / customer success

- `implementation.ts`: checklist lifecycle, dependency graph, readiness and deterministic evidence snapshot.
- `implementation-template.ts`: scope-driven checklist for explicitly enabled Finance/Stock/HR/Tax, migration and production safety. Không đoán mọi khách đều bật mọi domain.
- `customer-success.ts`: training evidence, role knowledge/runbook coverage, support-provider handoff, adoption thresholds and deterministic snapshot.
- WS13 references support/helpdesk providers; không dựng ticket engine cạnh tranh với service/helpdesk ownership.

### 7. Operator tooling

`server/scripts/forge-migration.mjs` is intentionally read-only:

- validate migration manifest;
- compute/reconcile source vs target metrics;
- no `apply` command.

Production mutation remains behind authoritative runtime + WS12 safety boundary.

## Capability maturity after WS13 autonomous pass

### IM01 — Setup / Implementation / Customer Success

| Capability | Maturity | Evidence / remaining gap |
|---|---|---|
| `IM01-001` Setup Wizard | Foundation | scope/readiness model exists; shared UI/runtime wiring belongs frontend workstream |
| `IM01-002` Company setup | Foundation | checklist orchestration; authoritative Company form remains domain/core path |
| `IM01-003` Accounting setup | Foundation | scope gate exists; finance setup owned by WS01 |
| `IM01-004` Warehouse setup | Foundation | scope gate exists; warehouse setup owned by WS04 |
| `IM01-005` HR setup | Foundation | scope gate exists; HR setup owned by WS06 |
| `IM01-006` Tax/localization setup | Foundation | scope gate exists; statutory/localization owned by WS01/WS10 as applicable |
| `IM01-007` Guided tour | Missing | shared UI concern; no WS13-local implementation justified |
| `IM01-008` Implementation checklist | Foundation | deterministic lifecycle/dependencies/readiness/snapshot; no shared API/UI persistence wiring yet |
| `IM01-009` Go-live checklist | Foundation | production safety + training + reconciliation dependency graph exists |
| `IM01-010` Demo/seed data | Foundation | existing seed/app fixtures; no competing seed engine created |
| `IM01-011` Training content/evidence | Foundation | training requirement/evidence contract implemented; content remains app/domain-owned |
| `IM01-012` Help Center | Foundation | external help reference contract; presentation/content not owned by WS13 |
| `IM01-013` Knowledge Base | Foundation | role-aware knowledge/runbook references implemented |
| `IM01-014` Customer support flow | Foundation | explicit support-provider/channel/escalation handoff; no duplicate helpdesk |
| `IM01-015` Adoption analytics | Foundation | active-actor/successful-action thresholds + readiness snapshot |

### IM02 — Import / Migration

| Capability | Maturity | Evidence / remaining gap |
|---|---|---|
| `IM02-001` CSV import | Wired | existing Frappe preview + kernel-backed row apply; WS13 durable wiring pending shared API seam |
| `IM02-002` Excel import | Foundation | workbook-neutral grid adapter; existing client decoder can feed it; shared UI wiring pending |
| `IM02-003` Mapping wizard | Foundation | template + suggestion + explicit plan mapping; UI pending WS14 |
| `IM02-004` Validation preview | Wired | existing CSV preview + WS13 mapping/opening validation contracts |
| `IM02-005` Duplicate handling | Foundation | explicit policy + durable executor; existing Data Import route not wired yet |
| `IM02-006` Error correction/retry | Foundation | durable target/command journal + kernel-receipt recovery + correction CSV; API wiring pending |
| `IM02-007` Opening balance/data import | Foundation | domain-safe provider contract; concrete finance/stock/HR providers pending |
| `IM02-008` Incremental migration | Foundation | stable Frappe cursor + persisted gapless checkpoint; connector runtime wiring pending |
| `IM02-009` Post-migration reconciliation | Foundation | exact metric engine + persisted snapshots + read-only CLI; domain metrics pending |
| `IM02-010` Excel -> Forge template | Foundation | workbook-neutral template + CSV renderer; XLSX presentation renderer/UI pending |
| `IM02-011` MISA -> Forge adapter | Foundation | verified header-based receipt/delivery/transfer transformation; runtime integration pending |
| `IM02-012` ERPNext -> Forge adapter | Foundation | Frappe row normalization + stable incremental source contract; live connector integration pending |
| `IM02-013` Odoo -> Forge adapter | Missing | no repo/customer demand evidence to justify speculative adapter |
| `IM02-014` FAST -> Forge adapter | Missing | no repo/customer demand evidence |
| `IM02-015` Bravo -> Forge adapter | Missing | no repo/customer demand evidence |
| `IM02-016` Legacy SQL/API migration | Foundation | generic manifest/source/tabular/API contracts; source-specific connector remains demand-driven |

No capability is labelled RC/Hardened without runtime integration + full verification evidence.

## Dependency requests

### DR-WS13-01 -> WS00 / shared Frappe API seam

- Need: wire current Data Import endpoints to `D1MigrationJournal + KernelMigrationApplyPort + executeDurableMigrationPlan` while preserving Frappe wire compatibility.
- Generic reason: router/API boundary is shared; WS13 already owns migration policy/journal/retry logic.
- Contract: shared layer supplies existing permission check, lookup, authoritative `resolveNewName/buildCommand`, OCC update command and `runCommand` callbacks.
- Blocking: yes for end-to-end runtime `IM02-005/006/008` to become Wired/RC.
- Blocking WS13-independent work: **no**.
- Temporary path: existing CSV import remains kernel-safe but does not yet use WS13 durable journal.

### DR-WS13-02 -> WS01 / WS04 / WS06

- Need: concrete `OpeningMigrationProvider` implementations and authoritative reconciliation metric specs for finance, stock and HR/payroll.
- Generic reason: WS13 must not duplicate ledger/period/correction rules.
- Blocking: yes for real opening-data cutover and Hardened reconciliation.
- Blocking generic migration core: **no**.

### DR-WS13-03 -> WS12

- Need: production backup/preflight/rollback/release evidence contract.
- Contract target: backup marker + run ID + pre/post checks + explicit rollback/reversal rule after authoritative posting.
- Blocking: **production cutover only**.

### DR-WS13-04 -> WS14 / domain UI owners

- Need: shared Data Import/MISA screens consume canonical WS13 mapping/preview/correction contracts instead of retaining client-local migration logic.
- Blocking backend/core: **no**.

## Legacy PR disposition

- No substantive legacy PR with WS13 as primary owner was identified.
- PR #65/#91 are useful evidence about imported legacy naming/Unicode but are domain fixes, not a migration pipeline to reuse.
- Disposition: **no legacy migration PR reused/cherry-picked**.

## Verification evidence

### PASS

- Exact ownership/source audit against Skill/North Star/Capability Map/Protocol.
- Existing import path confirmed kernel-backed; no WS13 direct business-table write introduced.
- Current WS00 kernel-port contract audited; WS13 bridge remains compatible with canonical command/coordinator path.
- WS10 `server/package.json` conflict reconciled; PR #313 returned `mergeable=true`.
- Latest `0043_migration_run_journal.sql` targeted SQLite replay: **PASS** for schema creation, `applying` command-ID guard, exact `source_id + adapter` checkpoint and tenant-scoped journal constraints.
- Earlier isolated TypeScript 5.8 strict harness for initial migration core: **PASS**.
- Latest code received manual `exactOptionalPropertyTypes` audit/fixes for durable outcomes and deterministic snapshot helpers.

### NOT RUN

- Full repository `pnpm install --frozen-lockfile`, `pnpm --filter cloudforge run build`, full `server/tests/migration-*.test.mjs`, worker tests and complete `test:sql` suite: **NOT RUN** because this execution environment cannot obtain a full repository checkout/archive from GitHub.
- Development GitHub CI: repository policy currently uses Actions for build/deploy rather than ordinary development CI; no current dev status checks provide replacement evidence.

The missing full-checkout evidence is recorded as NOT RUN per execution policy; it does not justify inventing a PASS or stopping independent implementation early.

## Tests added

- `server/tests/migration-plan.test.mjs`
- `server/tests/migration-orchestration.test.mjs`
- `server/tests/migration-manifest-reconcile.test.mjs`
- `server/tests/migration-orchestrator.test.mjs`
- `server/tests/migration-frappe-source.test.mjs`
- `server/tests/migration-implementation-template.test.mjs`
- `server/tests/migration-tabular.test.mjs`
- `server/tests/migration-customer-success.test.mjs`
- `server/tests/migration-durable-orchestrator.test.mjs`
- `server/tests/migration-kernel-port.test.mjs`
- `server/tests/migration-opening.test.mjs`
- `server/tests/migration-correction.test.mjs`
- `server/scripts/test-migration-run-journal.py`

`server/package.json` includes the new SQL regression in `test:sql` while preserving current-main WS10 `integration-hub --check`.

## Risks / guards

Risk class: **CRITICAL**.

- No import writes business documents directly to D1.
- Permission/domain lifecycle remain server-side in authoritative path.
- Migration journal is orchestration evidence, not business source of truth.
- Unknown/unresolved outcomes are not blindly replayed.
- Money/qty reconciliation does not aggregate with binary float.
- Source-controlled manifest rejects secret-like fields.
- Migration is append-only schema; no already-applied migration modified.
- No production migration, secret/DNS change or customer-data mutation performed.

## Remaining work that cannot be completed inside WS13 ownership alone

1. Shared Frappe API wiring from existing Data Import route to durable WS13 executor (`DR-WS13-01`).
2. Finance/stock/HR opening providers and domain metric definitions (`DR-WS13-02`).
3. Production cutover safety/evidence (`DR-WS13-03`).
4. Shared import UI consumption (`DR-WS13-04`).
5. Odoo/FAST/Bravo adapters remain demand-driven rather than speculative.

Independent WS13 implementation is exhausted at this boundary.

## Handoff

Workstream: WS13  
Branch: `agent/ent-13-migration-implementation`  
PR: `#313` (draft)  
Owner: `chatgpt-ws13`  
Status: **REVIEW**  
Changed zones: `server/packages/migration/**`, tenant migration `0043`, migration tests/scripts, `server/package.json`, this handoff  
Production: untouched  
Merge/deploy: **STOP — non-UI CRITICAL change requires explicit user approval**  
Recommended integration order: shared API wiring after WS00 kernel baseline; domain opening providers after WS01/WS04/WS06 contracts; production cutover only after WS12 evidence boundary.
