# WS09 — BPM + Low-code App Factory

Status: **CLAIMED**  
Owner: **GPT-5.6 Thinking / WS09**  
Branch: `agent/ent-09-bpm-app-factory`  
Product baseline: **Forge 0.2.0**  
Started from: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`  
Canonical board: `main:docs/agents/AGENT_BOARD.md`

## Mission

Biến metadata/app-registry/builder hiện có thành moat chính: workflow/BPM và App Factory đủ để domain mới chủ yếu khai metadata + rules + integration thay vì fork runtime.

## Own

`server/packages/app-registry/**`, manifest/compiler/install/upgrade contracts, workflow/BPM primitives, action/rule/formula/report/dashboard/print/role-permission builder contracts, client builder package phối hợp WS14.

## Audit plan

1. Audit exact `main` manifest/compiler/install/upgrade/workflow surface và tests trong scope.
2. Audit substantive legacy PR/branch liên quan AppAction/Bulk Transaction/App Factory và phân loại `reuse / cherry-pick / superseded / reject`.
3. Map `B01-*` / `B02-*` maturity bằng code + test evidence.
4. Khóa contract ưu tiên số 1: first-class `AppAction` input-table, giữ backward compatibility scalar fields.
5. Không sửa shared React runtime/core/views của WS14; nếu renderer cần primitive mới, ghi dependency request thay vì đạp hotspot của người khác.
6. Sau audit chuyển `ACTIVE`, implement thin vertical slice trong vùng WS09 và mở PR; backend/schema/business contract không tự merge/deploy.

## Phase A audit

Audit app manifest/install/migrate path, compiler, workflow subset, ProcessContainer/API gap, builders hiện có, dependency/versioning/rollback và điểm app đang phải hard-code. Audit substantive legacy PR trong scope và phân loại `reuse / cherry-pick / superseded / reject`.

## Phase B priority

Workflow sequential/parallel/conditional/delegation/escalation/timer -> AppAction/input-table -> formula/rule builder -> report/dashboard builder -> app version/dependency/upgrade/rollback -> marketplace/catalog contract.

## Dependencies

WS00 kernel/contracts, WS11 permission, WS14 shared builder UI, mọi domain branch là consumer/evidence.

## Guard

Không nhét business rule ngành vào shared compiler. Nếu pattern chỉ dùng một vertical, giữ ở vertical cho tới khi có bằng chứng tái sử dụng.

## Current evidence

- `main` exact baseline at claim: `bbe3494bcfbb8a3ce09a5ff4bbb839dfcf9e47e9`.
- Branch cũ đã diverged `ahead 3 / behind 18`; phần riêng chỉ là workstream seed file, nên branch được đưa về exact current `main` trước claim để không triển khai trên baseline stale.
- `CURRENT_STATUS.md` và `NEXT_TASKS.md` đều ghi first-class AppAction input-table là backlog active do WS09 sở hữu.
- Server manifest hiện có scalar `AppActionField[]`, preview/commit, permission gate và optional `result_table`; chưa có row/input-table contract.
- Brief compiler hiện chỉ compile `action.fields` dạng scalar; chưa có table input primitive.

## First commit / handoff

Claim owner/head; cuối nhánh ghi capability IDs, manifest/API contracts, backward compatibility, tests, legacy PR disposition, dependency impacts và PR.
