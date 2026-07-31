# CURRENT STATUS

Ngày cập nhật: **2026-08-01**.

## Repository

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Release base/default head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Inventory Slice D feature merge: `a7e6ef65b2352f596e285ea34d8e6438dff11a95` — PR #82.
- Production workflow fix merge: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628` — PR #130.
- Canonical queue: `EPIC_STATUS.md`.

## Inventory Slice D — MERGED

PR #82 đã merge authoritative physical-stock foundation:

- append-only physical-stock read model, không tạo stock book thứ hai;
- bounded D1 ledger reader;
- authenticated native/Frappe report và CSV export endpoints;
- tenant/company/warehouse/role permission scope;
- lineage explicit opt-in;
- cursor validation `422`;
- exact quantity/value/physical-count reconciliation;
- regression cho tenant isolation, export safety, D1 mapping và API boundary.

Exact feature head trước merge đã qua CI, PR Validation, Inventory/Manufacturing, Purchase, Sales và UI/browser/auth gates.

## Full-estate production release — SUCCESS

Ba production target liên quan đã được release và xác minh.

### Alumdoor app Worker

- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Workflow run: `30657418272` — **SUCCESS**.
- Release head: `e54de092fe8c4c68c21e43375de46b0d80f0a3ee`.
- Version ID: `cbd99611-daf3-4190-b1e4-fc2b4ce74227`.
- Deployment time: `2026-07-31T19:01:08.862Z`.
- Build, focused regression, strict Wrangler dry-run, deploy, provider script identity và bindings `PLATFORM`/`AI`: PASS.
- Artifact: `8803798231`, digest `sha256:0a8f6973a695f7701eda107d9e273a6420e50e913e0f441ee158904c8e590815`, expiry `2026-08-30T19:01:09Z`.

### Gateway / runtime UI

- Worker: `cloudforge-gateway`.
- Host chính: `https://alu.kairo.vn`.
- Workflow run: `30659230293` — **SUCCESS**.
- Release head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Version ID: `7a3c1130-4c7e-4089-96b9-9b6fcc7a2ca7`.
- Deployment time: `2026-07-31T19:30:29.196Z`.
- Lint, tests, typecheck, build, stage, dry-run, deploy và provider evidence: PASS.
- Smoke: `health=200`, `root=200`, `guest_boot=403`, exact release SHA xuất hiện trong HTML.
- Gateway deploy cũng cập nhật các custom domains được bind trong Wrangler: `edu.kairo.vn`, `hrm.kairo.vn`, `chotdon.kairo.vn`, `alu.kairo.vn`, `phanbon.kairo.vn`.
- Artifact: `8804509081`, digest `sha256:e1642270f1d8ee4b9b743dc1a22a7113dee1529c862c081369884bcb4a9a8710`, expiry `2026-08-30T19:30:30Z`.

### alu Tenant Worker

- Worker: `cloudforge-tenant-alu`.
- Dispatch namespace: `cloudforge-production`.
- Workflow run: `30659229116` — **SUCCESS**.
- Release head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Version ID: `c5db02b4-eee9-4da8-8c3f-f5a346b2230c`.
- Deployment time: `2026-07-31T19:30:37.983Z`.
- Build và focused physical-stock regressions: PASS.
- Pre-release backup: PASS và upload trước migration.
- Recorded tenant migration dry-run + confirmed execution: PASS.
- Deploy dry-run + confirmed execution: PASS.
- Smoke: `health=200`, `guest_boot=403`, unauthenticated physical-stock route `401`, không lộ dữ liệu.
- Release artifact: `8804512429`, digest `sha256:f31567541667e52e4696e6f90c8744bdfe7fe074e8031477009d35915325df09`, expiry `2026-08-30T19:30:39Z`.
- Backup artifact: `8804497476`, digest `sha256:9c3c78801e8d118261892e9016b1f2e2d2878df7b428be48df1f8052891007e3`, expiry `2026-08-14T19:30:00Z`.

## Production workflow incident và fix

Tenant/Gateway workflow ban đầu dùng `${{ runner.temp }}` ở job-level `env`, khiến GitHub fail trước khi tạo job. Không có secret, migration hoặc deploy nào chạy trong các lượt failure đó.

PR #130 sửa toàn bộ evidence/output paths sang `/tmp/...`, exact head `b5963939b9e63300a85f92814c632ec327492f83` đã qua:

- CI `30658970590`: SUCCESS;
- PR Validation `30658971326`: SUCCESS;
- Sales Feature CI `30658971431`: SUCCESS;
- Purchase Feature CI `30658970196`: SUCCESS;
- Inventory and Manufacturing CI `30658971107`: SUCCESS;
- UI Pull Request Validation `30658970422`: SUCCESS.

Sau merge `fd0a3e69...`, tenant và Gateway đều tạo job thật và release thành công.

## CI architecture

- `CI` là nơi duy nhất chạy full test + typecheck + build.
- `PR Validation` là policy/changed-file gate nhẹ.
- Sales/Purchase/Inventory và UI chỉ chạy focused gate đúng scope hoặc fast path.
- Release chỉ chạy từ merged SHA qua dedicated production workflow.

## Trạng thái nghiệp vụ

1. Sales-to-Production — `NEXT / CLEAN REBUILD`.
2. Purchase authenticated QA — `QUEUED / CLEAN REBUILD`.
3. Finance — `QUEUED / REBUILD`.
4. Daily ledger — `QUEUED`.
5. Warranty / Capacity — `QUEUED`.
6. End-to-end acceptance — `QUEUED`.

Toàn hệ thống chưa đạt end-to-end acceptance; Slice D backend foundation và ba target production liên quan đã release thành công.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- FIFO vẫn **disabled**.
- Tenant migration có backup và recovery artifact trước khi execute.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
