# CURRENT STATUS

Ngày cập nhật: **2026-08-04**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, merge và release. Code/migration/test/exact GitHub thắng prose lịch sử.

## Repository snapshot

- Repository: `nguyentrieu210/forge`.
- Default/canonical branch: `main`.
- Exact main tại lần sync này: `64060ae1f08e8b6922828d4d27d8185073cf6697`.
- Forge baseline: **0.2.0 — Enterprise Parallel Baseline**.
- RC Hardening Wave 0 và Batch 1A Finance + Inventory implementation đã hội tụ vào `main`.
- UI V3 foundation PR `#453` cũng đã merge sau Batch 1A; đây là UI-only và không đổi Finance/Inventory authority.

## Enterprise maturity baseline

Canonical registry: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.

RC-01 đã kiểm đủ **956/956 capability ID**:

| Maturity | Count | Share |
|---|---:|---:|
| Hardened | 0 | 0.00% |
| RC | 4 | 0.42% |
| Wired | 448 | 46.86% |
| Foundation | 345 | 36.09% |
| Missing | 159 | 16.63% |
| **Total** | **956** | **100.00%** |

Đây là baseline RC-01, không tự động tăng chỉ vì Batch 1A đã merge. Capability Status phải được promotion bằng evidence theo Validation Gates.

## DONE — RC Hardening Wave 0

- RC-01 Capability Truth: PR `#434` merged.
- RC-02 Release/SRE: PR `#431` merged.
- RC-03 executable FAST/STANDARD/CRITICAL gates: PR `#433` merged.
- RC-04 Kernel/Auth: replacement PR `#435` merged.
- RC-05 IAM/Tenant/Offline contract: replacement PR `#436` merged.

Wave 0 đóng capability truth, release topology, validation policy, mutation/auth/IAM boundaries và offline shared contract. Offline write/sync implementation vẫn không được coi là hoàn tất chỉ vì contract đã freeze.

## DONE — Batch 1A Finance + Inventory Authority implementation convergence

Canonical convergence record:

- `docs/agents/rc/RC_BATCH1A_CONVERGENCE_20260804.md`

Merge order và checkpoints:

1. RC-020 F01 posting/period/reversal — PR `#443` -> `fce4758addcc4296512e423fea4753c96f7cca0e`.
2. RC-024/025 W01 reconciliation/backdate/repost/valuation — PR `#441` -> `7626576feb67a4428e3c9bbfd41ad40e1f0c4641`.
3. RC-021 F02 AR/customer reconciliation — PR `#440` -> `81a4deb26a66588f4e2fc0ef0f509e54808f4446`.
4. RC-022 F03 AP/supplier reconciliation — PR `#439` -> `bc0083cb6db177273f31cd475f2fa9d2d1443d99`.
5. RC-023 F04 Cash/Bank — replacement PR `#461` -> `de94b10821c917a104c7e291d588665bd2c94355`.

### Frozen Finance authority

- `gl_entries` là canonical accounting ledger/balance authority.
- Canonical controllers + DocumentKernel/D1 mutation path là write authority.
- Hard/Soft accounting-period close được server enforce; GL insertion có universal backstop.
- Raw GL UPDATE/DELETE bị chặn; correction dùng append/reversal.
- Payment Entry / Payment Allocation + Payment Ledger là AR/AP settlement authority.
- AR/AP reconciliation là read/control comparison với GL, không tạo shadow ledger.
- Bank Transaction chỉ là statement/feed evidence.
- Bank Reconciliation là append-only reversible control state.
- Journal Entry là generic internal transfer authority.
- Warehouse Cash vẫn subordinate to GL.

### Frozen Inventory authority

- `stock_ledger_entries` là canonical stock authority.
- Stock Reconciliation correction đảo exact submitted revision theo append-only behavior.
- Serial/Batch usage được release/reverse cùng correction khi applicable.
- Repost Item Valuation cancellation đảo exact Stock Ledger + GL revision, không tái tính chứng từ lịch sử bằng valuation code mới.
- Procurement/Manufacturing/WMS phải consume stock authority này; không direct-write shadow stock/cost state.

### Evidence truth

- RC-021 đã rerun exact post-sync focused CRITICAL workflow `30837831262` = **success** trước merge.
- RC-020/022/023/024/025 vẫn có evidence gaps ở exact-head CI/production tùy lane; merge state không tự promote RC/Hardened.
- Không lane Batch 1A nào được gọi Hardened từ merge này.
- Không production deploy, production migration, restore/PITR, secret/DNS hay customer-data mutation được coordinator thực hiện.

## Authority freeze gate

**Finance + Inventory shared authority đã đủ rõ để mở Batch 1B ERP Core implementation.**

Các domain phía trên phải consume authority đã freeze:

- Procurement không tạo payable/stock authority riêng.
- CRM/O2C không tạo receivable/paid-amount authority riêng.
- Payroll đi qua canonical Finance/GL contract.
- Manufacturing không tạo stock/cost ledger cạnh tranh.
- QMS không direct-write stock/financial truth ngoài controller contract.

## Active next program

1. Batch 1B ERP Core: `RC-030..038`.
2. Enterprise Depth: `RC-040..045`.
3. App Factory + AI moat: `RC-046..047`.
4. Alumdoor reference vertical proof/hardening: `RC-050..054`.

Không mở horizontal feature breadth ngẫu nhiên nếu nó bypass authority/evidence gates.

## Release / production truth

- Canonical release workflow: `.github/workflows/alu-build-deploy.yml`.
- Merge state không phải deploy proof.
- Production claim cần exact release SHA + health/release marker/evidence tương ứng.
- Batch 1A merge không đồng nghĩa production đã migrate/deploy.

## Alumdoor direction

- Alumdoor là reference vertical, không fork Forge core.
- Mobile ưu tiên sales/receivables/delivery.
- Shared HRM vẫn full; product shell chỉ expose surface cần thiết.
- Warehouse Cash là generic VN Accounting primitive, không phải financial authority riêng của Alumdoor.

## Guardrails

- Không sửa production secrets/DNS hoặc mutate customer data khi chưa có yêu cầu rõ.
- Không commit credential/token/backup/generated runtime artifact không thuộc source control.
- UI-only theo fast path hiện hành; backend/schema/migration/security/accounting/stock/payroll/ops theo risk gate và approval boundary.
