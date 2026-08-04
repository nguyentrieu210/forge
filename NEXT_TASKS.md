# NEXT TASKS

Ngày cập nhật: **2026-08-04**.

Đây là **active queue** của Forge. Lịch sử đã hoàn thành nằm trong Git/PR/convergence evidence, không lặp lại ở đây.

## 0. Immediate coordination

1. Hoàn tất documentation cleanup và merge sau khi được duyệt.
2. Re-audit/rebase draft R5 planning PRs `#624` và `#626` lên exact current `main` sau cleanup.
3. Không mở thêm RC4 worker lane. RC4 đã đóng qua PR `#627`.

## 1. R5 — Integrated hardening / productization

Mục tiêu: biến integrated RC4 tree thành một release candidate có thể triển khai lặp lại cho khách mà không cần sửa source riêng từng tenant.

### Wave 0 — Integration control

- Audit exact current `main` và branch/PR còn mở.
- Khóa integration manifest và dependency order.
- Phân loại mọi residual là `integrate / already-main / defer / pilot-blocker`.
- Chống duplicate authority và stale branch replay.

### Wave 1 — chạy song song

- **R5-01 Package + Capability Profile**: package lifecycle, dependency resolver, activation/deactivation semantics, profile metadata/UI contract.
- **R5-02 Finance + HCM**: statutory/reconciliation/correction residuals cần cho pilot.
- **R5-03 Commercial + Supply Chain**: CRM/Sales/Procurement/Inventory integrated behavior.
- **R5-04 Manufacturing + Service**: Manufacturing/QMS/Project/Service/Warranty integration.
- **R5-05 Integration + BI + Workplace + Logistics**: shared provider-neutral seams, semantic/workplace/commerce integration.

R5 không triển khai toàn bộ 157 Missing capabilities. Chỉ mở capability nếu nó là pilot blocker hoặc shared safety/authority dependency.

### Wave 2 — Package/migration rehearsal

- fresh tenant bootstrap;
- dependency install order;
- install/upgrade/idempotent reinstall;
- capability activate/deactivate without data destruction;
- migration numbering/checksum/applied-state verification;
- failed-upgrade recovery semantics;
- import/reconciliation on disposable/non-production data.

### Wave 3 — Independent integrated QA

Trên **một exact candidate head**:

- IAM/session/tenant/permission;
- App Factory/package/profile;
- O2C/P2P/Inventory/Manufacturing/Finance/HCM/Service;
- cross-ledger reconciliation;
- migration governance;
- browser/mobile/PWA smoke;
- representative performance gates.

### Wave 4 — R5 final convergence

Output bắt buộc:

- immutable R5 candidate SHA;
- exact integrated evidence;
- materialized 956-capability status;
- exact Alumdoor Pilot Capability Set;
- `R5-GO` hoặc `R5-NO-GO`.

## 2. R6 — Production certification

Chỉ bắt đầu khi R5-GO.

1. Lock exact R5 candidate/release/package/profile versions.
2. Observe Cloudflare desired-vs-observed state for resources actually used.
3. Run approved backup/restore/PITR/rollback drill.
4. Read target applied migration inventory and rehearse cutover on production-like snapshot.
5. Prove exact release SHA/hash after build/deploy pipeline in approved environment.
6. Measure representative p95/p99/error/load/cost without uncontrolled production stress.
7. Run security/provider recovery acceptance.
8. Run authenticated Alumdoor Golden Flow + correction paths.
9. Emit `PILOT-GO` or `PILOT-NO-GO`.

## 3. Alumdoor controlled pilot

Chỉ bắt đầu sau `PILOT-GO`.

1. Freeze `Alumdoor Production Profile` and scope.
2. Map/import master + opening data and reconcile totals.
3. Dry run representative real-world transactions and failure/correction cases.
4. Parallel run against current operational source for at least one meaningful operating cycle.
5. Reconcile Stock, AR/AP, payments, revenue/COGS, manufacturing movements and GL.
6. Cutover: freeze old writes -> backup -> delta import -> reconcile -> smoke -> Forge write authority.
7. Hypercare with P0/P1 triage and daily reconciliation.
8. Pilot Exit Gate -> `Accepted Production Reference` -> GA/commercial rollout.

## 4. Standing boundaries

- Global capability score is not a reason to reopen a blanket implementation wave.
- Vertical apps consume shared authorities; no copied HRM/CRM/Finance/Stock implementation inside Alumdoor.
- Capability disable != package uninstall.
- Production/provider evidence must be observed directly; source presence is insufficient.
- Non-UI merge/deploy, production migration, restore/PITR, DNS/secret/provider mutation and customer-data mutation remain explicit authorization boundaries.

## 5. Documentation discipline

Use `docs/README.md` as the documentation map. Do not resurrect deleted board/handoff files from history unless a specific historical audit requires them.
