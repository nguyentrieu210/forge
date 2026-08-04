# Forge — nền ERP tương thích Frappe chạy trên Cloudflare

**Forge product baseline: `0.2.0` — Enterprise Parallel Baseline.** Version source không đồng nghĩa production deploy.

Forge hợp nhất CloudForge backend và MetaForge frontend thành một nền ERP/enterprise operating platform metadata-driven, multi-tenant trên Cloudflare, với app package/domain authority và vertical apps như Alumdoor.

| Thư mục | Vai trò |
|---|---|
| `server/` | Kernel/backend, Workers, D1/DO/Queues/R2, ERP domains và Frappe-shaped API |
| `client/` | MetaForge React runtime/builder, metadata-driven list/form/report/app surfaces |
| `docs/` | architecture, product contracts, capability truth, evidence và operations docs |
| `skills/` | execution policy cho agent |

## Đọc trước khi làm

**README không phải live status.** Thứ tự canonical:

1. `CURRENT_STATUS.md` — trạng thái verified gần nhất.
2. `NEXT_TASKS.md` — active queue.
3. `PROJECT_CONTEXT.md` — architecture/source-of-truth hiện hành.
4. `AI_HANDOFF.md` — handoff cô đọng.
5. `docs/README.md` — documentation index + retention policy.
6. `RUNBOOK.md` và `DELIVERY_POLICY.md` — operational/merge/deploy boundary.
7. `skills/forge-enterprise-completion/SKILL.md` — cách audit/implement/verify.
8. `docs/FORGE_ENTERPRISE_NORTH_STAR.md` + capability map/status — strategic target và maturity truth.
9. `docs/agents/PARALLEL_EXECUTION_PROTOCOL.md` khi task cần multi-agent/program execution.

Exact GitHub state, code, migrations và tests luôn thắng snapshot prose cũ.

## Current checkpoint

RC4 integrated engineering/evidence closure đã merge qua PR `#627`. Canonical final record:

`docs/agents/rc4/RC4_POST_INTEGRATION_FINAL.md`

Current capability materialization sau RC4:

- Hardened: 0
- RC: 66
- Wired: 406
- Foundation: 327
- Missing: 157
- Total: 956

RC4 closure không đồng nghĩa exact next candidate đã production-certified. Active direction nằm trong `NEXT_TASKS.md`.

## Kiến trúc chính

Forge giữ các nguyên tắc:

- authoritative business writes đi qua Document Kernel / aggregate serialization;
- server-side tenant/permission enforcement là security authority;
- GL/Payment Ledger và Stock Ledger không bị fork theo app/vertical;
- migrations append-only và applied-state-aware;
- frontend dùng shared metadata-driven runtime;
- first-party apps được install/upgrade qua App Registry/App Factory;
- vertical apps compose domain capabilities thay vì copy domain code.

Tài liệu nền:

- `docs/ARCHITECTURE.md`
- `docs/API_SURFACE.md`
- `docs/APP_FACTORY.md`
- `docs/FORGE_ENTERPRISE_NORTH_STAR.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/VERSIONING.md`
- `docs/VALIDATION_GATES.md`

## Chạy local

```bash
corepack enable
pnpm install
pnpm run typecheck
pnpm run test
```

Chạy gate theo blast radius; không suy PASS từ việc source tồn tại hoặc PR merge.

## Production boundary

Không tự hiểu yêu cầu sửa code là authorization deploy production. Production migration, restore/PITR, secrets/DNS/provider mutation, customer-data mutation và non-UI deploy chỉ thực hiện khi có authorization rõ theo `RUNBOOK.md` và `DELIVERY_POLICY.md`.

## Compatibility source

Frappe/ERPNext upstream được source-lock trong repo cho compatibility/parity audit. Forge là implementation riêng; benchmark không thay thế current code/evidence.
