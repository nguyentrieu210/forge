# WS13 — Migration / Import / Implementation / Customer Success

Status: **REVIEW**  
Owner: **chatgpt-ws13**  
Branch: `agent/ent-13-migration-implementation`  
PR: **#313** — `feat(ws13): add deterministic migration planning core` (draft)  
Product baseline: **Forge 0.2.0**  
Started from exact main: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Tạo đường chuyển khách vào Forge và go-live có kiểm soát: import wizard, mapping/validation/preview, opening data, migration adapters, reconciliation, setup wizard/checklist/training/support/adoption.

## Exact-state sync

- Branch cũ dựa trên seed stale và chỉ chứa handoff WS13, nên đã reset/rebase sạch lên exact `main@bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9` trước implementation.
- Trước khi mở PR #313, compare cho thấy WS13 `ahead_by=6`, `behind_by=0`; diff chỉ gồm workstream file, package migration mới và test riêng.
- Không production data mutation, schema migration, merge hoặc deploy.

## Phase A audit

### Existing import path

- `server/packages/frappe-api/src/router.ts` đã có Frappe-compatible CSV preview/apply.
- Preview kiểm import permission, parse CSV, reject child DocType và unknown columns.
- Apply kiểm `import` + `create`, xử lý row-by-row và mọi write đi qua `buildCommand -> context.runCommand`; không bypass document kernel/lifecycle.
- `buildCommand` tạo deterministic command ID khi target name đã biết.
- Gap quan trọng: row dùng autoname chưa có persisted `source-row -> target-name` receipt; retry có thể resolve tên khác trước khi kernel idempotency phát huy tác dụng.

### Installer / provisioning

- `server/packages/app-registry/src/installer.ts` đã idempotent với package giống nhau và atomic bằng D1 batch. WS13 phải reuse invariant này, không tạo setup metadata path cạnh tranh.
- Tenant migration vẫn tuần tự dưới `server/migrations/*` và `server/scripts/migrate-tenant.mjs`; không sửa migration đã chạy.

### Capability maturity

| Capability | Maturity | Evidence / gap |
|---|---|---|
| `IM01-001` Setup Wizard | Missing | chưa có canonical setup state/checkpoint |
| `IM01-008` Implementation checklist | Missing | chưa có implementation state |
| `IM01-009` Go-live checklist | Missing | chưa có readiness gate |
| `IM01-010` Demo/seed data | Foundation | local seed/app fixtures có sẵn, chưa thành customer orchestration |
| `IM02-001` CSV import | Wired | preview + kernel-backed row apply có sẵn |
| `IM02-002` Excel import | Missing | chưa có canonical WS13 adapter |
| `IM02-003` Mapping wizard | Foundation | deterministic mapping-plan primitive mới, chưa wire API/UI |
| `IM02-004` Validation preview | Wired | CSV parse/header validation + mapping invariants |
| `IM02-005` Duplicate handling | Missing | có policy contract, chưa có authoritative executor |
| `IM02-006` Error correction/retry | Foundation | row error isolation có; autoname retry receipt còn thiếu |
| `IM02-007` Opening balance import | Missing | cần WS01/WS04 canonical opening contracts |
| `IM02-008` Incremental migration | Missing | chưa có persisted cursor/checkpoint |
| `IM02-009` Post-migration reconciliation | Foundation | exact-metric primitive mới; domain providers còn thiếu |
| `IM02-010` Excel -> Forge template | Missing | chưa triển khai |
| `IM02-011` MISA adapter | Missing | chưa triển khai |
| `IM02-012` ERPNext adapter | Missing | chưa triển khai |
| `IM02-013` Odoo adapter | Missing | chưa triển khai |
| `IM02-014` FAST adapter | Missing | chưa triển khai |
| `IM02-015` Bravo adapter | Missing | chưa triển khai |
| `IM02-016` Legacy SQL/API | Foundation | source-kind contract có, connector/checkpoint chưa có |

### Legacy PR disposition

- `docs/agents/LEGACY_PR_INBOX.md` không có substantive PR do WS13 sở hữu chính.
- Search PR import/migration chỉ tìm thấy các fix domain/release; không có migration pipeline phù hợp để reuse/cherry-pick.
- PR #65/#91 chỉ là evidence rằng imported legacy naming cần normalize, không phải canonical WS13 implementation.

## Phase B — first slice implemented

New package: `server/packages/migration/`.

Implemented:

1. source kinds: CSV/Excel/API/SQL/ERPNext/MISA/Odoo/FAST/Bravo/legacy;
2. duplicate policy contract: `error | skip | update`;
3. explicit source header -> target field mapping và ignored columns bằng `null`;
4. reject unknown/duplicate target mapping;
5. required target-field coverage check;
6. deterministic source fingerprint + plan ID;
7. deterministic per-row key/fingerprint và duplicate source-key rejection;
8. migration state machine với retry transitions;
9. exact string reconciliation metrics, không dùng float để đối soát tiền/số lượng.

State machine:

`draft -> validated -> applying -> applied -> reconciling -> completed`

Retry/correction paths:

- `applying -> failed -> applying`;
- `reconciling -> failed -> reconciling`;
- chỉ cho cancel trước authoritative completion.

Regression: `server/tests/migration-plan.test.mjs` bao phủ deterministic mapping/fingerprint, duplicate target map, duplicate source key, retry transition và reconciliation mismatch.

## Source -> target contract v0

Mỗi migration plan phải có:

- `source_id`, `source_kind`;
- ordered source headers + raw rows;
- explicit mapping, ignored columns = `null`;
- optional stable `key_field`;
- target DocType field contract;
- duplicate policy;
- immutable `source_fingerprint`, `plan_id`, per-row `fingerprint` trước apply.

Planner không write document. Authoritative apply vẫn phải đi qua server permission, lifecycle, domain invariants và ledger effects.

## Dependency requests

### DR-WS13-01 -> WS00 — BLOCKING

Cần generic persisted migration run + row receipt: `source_key`, `row_fingerprint`, `target_doctype`, `target_name`, command receipt, retry state. Đây là điều kiện để `IM02-006`/incremental migration lên Wired/RC và xử lý autoname an toàn.

### DR-WS13-02 -> WS01 / WS04 / WS06 — BLOCKING cho opening/reconcile

Mỗi domain phải cung cấp canonical opening-data validation/apply contract và exact reconciliation metrics; WS13 chỉ orchestration, không tự phát minh ledger invariant.

### DR-WS13-03 -> WS12 — BLOCKING production only

Cần production migration preflight/backup/rollback/evidence boundary: backup marker, migration run id, pre/post verification và rule rõ khi authoritative posting không thể rollback vật lý.

## Verification evidence

- Exact branch sync / ownership diff: PASS.
- Isolated TypeScript 5.8 strict compile của migration core với `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`: PASS.
- GitHub development status checks: không có, phù hợp policy build/deploy-only hiện tại.
- Full repository `pnpm --filter cloudforge run build` và `node --test server/tests/migration-plan.test.mjs`: **chưa có evidence trong session** vì execution shell không có full checkout/dependencies và không clone được GitHub qua DNS.
- PR #313 mở dạng **draft** để review contract; không merge/deploy tự động vì đây là CRITICAL backend/migration change.

## Next slices after review

1. Persist migration run + row receipts/checkpoints qua contract WS00.
2. Wire CSV preview/apply hiện tại vào migration plan mà giữ Frappe compatibility.
3. Implement authoritative duplicate executor (`error/skip/update`).
4. Add opening/master migration + domain reconciliation providers.
5. ERPNext adapter trước; MISA sau khi canonical field/opening contracts ổn định.
6. Setup/go-live checklist khi migration state đã first-class.

## Guard

Không import thẳng bypass business invariants. Migration phải restartable/idempotent, có dry-run/preview, reconciliation và production safety evidence phù hợp risk class.

## Handoff

Workstream: WS13  
Branch: `agent/ent-13-migration-implementation`  
PR: `#313` (draft)  
Owner: `chatgpt-ws13`  
Status: REVIEW  
Capabilities: `IM01-*`, `IM02-*`; first slice tập trung foundation cho `IM02-003`, `IM02-006`, `IM02-009`  
Changed zones: `server/packages/migration/**`, `server/tests/migration-plan.test.mjs`, workstream file  
Migration: none  
Production: untouched  
Merge/deploy: **STOP — requires full validation + dependency review + explicit user approval**  
Recommended merge order: sau WS00 review stable source-row identity/apply contract; trước adapter-specific work.
