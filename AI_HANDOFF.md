# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Current release/default head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Đọc theo thứ tự: `EPIC_STATUS.md` → `CURRENT_STATUS.md` → `NEXT_TASKS.md` → `DELIVERY_POLICY.md`.
- GitHub là nguồn sự thật cho code, CI, release run và artifact.

## Inventory Slice D foundation — MERGED

- PR #82 merge SHA: `a7e6ef65b2352f596e285ea34d8e6438dff11a95`.
- Physical-stock read model đọc append-only ledger; không tạo balance book thứ hai.
- D1 reader fail closed trên tenant/company leak, malformed snapshot, overflow và source cap.
- Native/Frappe endpoints có authenticated tenant injection, CSRF/trusted identity và User Permission scope.
- CSV có BOM, formula-injection protection và export permission snapshot.
- Invalid cursor trả `422`; lineage chỉ explicit opt-in.
- Tenant-worker wrapper giữ router cũ trong `index-core.ts` và intercept đúng physical-stock routes.

## Full-estate production release — SUCCESS

### Alumdoor app Worker

- Run `30657418272`: SUCCESS.
- Release head: `e54de092fe8c4c68c21e43375de46b0d80f0a3ee`.
- Worker: `cloudforge-app-alumdoor`.
- Namespace: `cloudforge-production`.
- Version: `cbd99611-daf3-4190-b1e4-fc2b4ce74227`.
- Deployment time: `2026-07-31T19:01:08.862Z`.
- Build, focused regression, dry-run, deploy, provider identity và `PLATFORM`/`AI` bindings: PASS.
- Artifact `8803798231`, digest `sha256:0a8f6973a695f7701eda107d9e273a6420e50e913e0f441ee158904c8e590815`.

### Gateway / runtime UI

- Run `30659230293`: SUCCESS.
- Release head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Worker: `cloudforge-gateway`.
- Version: `7a3c1130-4c7e-4089-96b9-9b6fcc7a2ca7`.
- Deployment time: `2026-07-31T19:30:29.196Z`.
- Runtime lint/test/typecheck/build, stage, dry-run, deploy và provider evidence: PASS.
- Smoke: health/root `200`, guest boot `403`, exact release SHA visible in HTML.
- Custom domains trong release: `edu.kairo.vn`, `hrm.kairo.vn`, `chotdon.kairo.vn`, `alu.kairo.vn`, `phanbon.kairo.vn`.
- Artifact `8804509081`, digest `sha256:e1642270f1d8ee4b9b743dc1a22a7113dee1529c862c081369884bcb4a9a8710`.

### alu Tenant Worker

- Run `30659229116`: SUCCESS.
- Release head: `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`.
- Worker: `cloudforge-tenant-alu`.
- Namespace: `cloudforge-production`.
- Version: `c5db02b4-eee9-4da8-8c3f-f5a346b2230c`.
- Deployment time: `2026-07-31T19:30:37.983Z`.
- Build, physical-stock regressions, backup, recorded migration, dry-run/deploy và provider evidence: PASS.
- Smoke: health `200`, guest boot `403`, unauthenticated physical-stock `401`.
- Release artifact `8804512429`, digest `sha256:f31567541667e52e4696e6f90c8744bdfe7fe074e8031477009d35915325df09`.
- Pre-release backup artifact `8804497476`, digest `sha256:9c3c78801e8d118261892e9016b1f2e2d2878df7b428be48df1f8052891007e3`.

## Production workflow fix

Tenant và Gateway ban đầu fail trước khi tạo job vì dùng `${{ runner.temp }}` ở job-level `env`. Không có secret, migration hoặc deploy nào chạy trong các failure rỗng.

PR #130:

- exact head `b5963939b9e63300a85f92814c632ec327492f83`;
- merge `fd0a3e697a25dc3907c5e7aa751a593ad8c01628`;
- chuyển evidence/output paths sang `/tmp/...`;
- CI `30658970590`, PR Validation `30658971326`, Sales `30658971431`, Purchase `30658970196`, Inventory `30658971107`, UI `30658970422`: SUCCESS.

Sau merge, tenant và Gateway tạo job thật và release thành công.

## CI architecture hiện hành

1. `CI` là full test + typecheck + build duy nhất.
2. `PR Validation` chỉ policy/changed-file gate.
3. Feature/UI workflows chạy focused scope hoặc fast path.
4. Production release chạy từ exact merged SHA qua dedicated workflow.
5. Cấm workflow `*once*`, transport/sync workflow và hidden trigger.

## Canonical queue

1. **Sales-to-Production** — next clean rebuild.
2. **Purchase authenticated QA** — clean rebuild sau Sales.
3. **Finance** — rebuild.
4. **Daily ledger**.
5. **Warranty / Capacity**.
6. **End-to-end acceptance**.

Không reopen PR #103, #107, #119, #122 hoặc temporary inspector #128.

## Việc tiếp theo

- Tạo một Sales-to-Production branch từ exact current default.
- Chỉ mang source/test thật; không mang trigger/workflow vận chuyển.
- Chạy `door-formulas`, `sales-production-flow`, Unicode pricing và build trước push.
- Một PR canonical, khóa exact head khi CI chạy.
- Release production chỉ từ merged SHA nếu target thay đổi.

## Safety

- Không sửa production secret hoặc DNS.
- Không xóa Cloudflare resource.
- FIFO vẫn **disabled**.
- Migration production phải có backup/recovery trước execute.
- Không commit `.env`, `server/work/`, `tmp`, backup, credential hoặc generated evidence.
