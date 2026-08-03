# NEXT TASKS

Ngày cập nhật: **2026-08-03**.

## Trạng thái hiện tại

**RC Hardening Wave 0 đã hoàn tất và hội tụ vào `main`.**

Đã đóng:
- RC-01 Capability Truth: 956/956 registry + Evidence Index + validator + baseline.
- RC-02 Release/SRE topology + stale workflow cleanup + backup/restore evidence contract.
- RC-03 executable FAST/STANDARD/CRITICAL validation gates.
- RC-04 Kernel/Auth failure/retry hardening.
- RC-05 IAM/Tenant app lifecycle hardening + offline sync contract freeze.

Không reopen PR/branch lịch sử làm canonical backlog. Task mới phải bắt đầu từ exact current `main`.

## Chương trình canonical

- Execution blueprint: `docs/FORGE_RC_HARDENING_PLAN_20260803.md`.
- Capability truth: `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`.
- Validation policy: `docs/VALIDATION_GATES.md` + `validation/rc-gates.json`.
- Agent lanes/prompts Wave 0: `docs/agents/RC_AGENT_LANES_20260803.md`.
- **Agent lanes/prompts Batch 1A Finance + Inventory: `docs/agents/RC_BATCH1A_AGENT_LANES_20260803.md`.**

Baseline maturity:

```text
Total: 956
Hardened: 0
RC: 4
Wired: 448
Foundation: 345
Missing: 159
```

## Batch tiếp theo — Finance + Inventory Authorities

Mở tối đa 5 worker, nhưng batch này chỉ cần các lane có dependency hợp lệ. Không mở thêm agent để trang trí GitHub.

Prompt/ownership canonical của 5 worker nằm tại `docs/agents/RC_BATCH1A_AGENT_LANES_20260803.md`.

### Lane Finance

#### RC-020 — F01 period/posting/reversal

Audit/harden:
- posting period guard;
- hard/soft close semantics;
- submit/cancel/backdate;
- reversal/correction;
- tenant/company/branch scope;
- immutable ledger/audit behavior.

Risk: **CRITICAL**.

#### RC-021 — F02 AR allocation/reconciliation

Audit/harden:
- invoice/payment authority;
- partial allocation;
- over/under allocation guards;
- credit/return/correction;
- receivable aging and GL reconciliation.

Risk: **CRITICAL**.

#### RC-022 — F03 AP allocation/reconciliation

Audit/harden:
- supplier invoice/payment authority;
- partial payment/return/correction;
- payable aging;
- GL reconciliation.

Risk: **CRITICAL**.

#### RC-023 — F04 Cash/Bank reconciliation

Audit/harden:
- cash/bank authority;
- transfer/reversal;
- reconciliation lifecycle;
- statement/import boundaries;
- GL consistency.

Risk: **CRITICAL**.

### Lane Inventory

#### RC-024 — W01 Stock reconciliation/correction

Audit/harden:
- stock reconciliation authority;
- cycle/count correction;
- batch/serial where applicable;
- permission/warehouse/company/tenant scope;
- finance reconciliation when valuation changes.

Risk: **CRITICAL**.

#### RC-025 — W01 backdate/repost/valuation

Audit/harden:
- backdated stock mutation;
- repost ordering;
- valuation adjustment;
- correction/reversal;
- stock ledger ↔ GL reconciliation.

Risk: **CRITICAL**.

## Authority freeze gate

Không mở Procurement/CRM/HCM/Manufacturing RC expansion cho tới khi Finance/Inventory shared authority contract liên quan đủ rõ để domain phía trên không tự phát minh posting/stock behavior.

Sau authority freeze, chạy song song:

- `RC-030` Procurement RFQ -> PO.
- `RC-031` PO -> Receipt -> Invoice -> Payment partial/correction.
- `RC-032` CRM core.
- `RC-033` O2C partial/correction.
- `RC-034` HCM lifecycle/time.
- `RC-035` Payroll -> GL.
- `RC-036` BOM/MRP.
- `RC-037` Shopfloor/cost.
- `RC-038` QMS NCR/RCA/CAPA.

## Rules cho mọi RC task mới

1. Đọc exact current `main`, Skill, North Star, Capability Status và RC Hardening Plan.
2. Gắn capability ID cụ thể.
3. Audit current code/tests/migrations/evidence trước khi viết mới.
4. Branch mới dạng `rc/<wave>-<domain>-<slice>`.
5. Historical code chỉ `reuse/cherry-pick` sau exact diff; không reopen PR cũ tự động.
6. Maturity promotion phải theo evidence gate, không theo merge/code existence.
7. Finance/stock/payroll/security/migration là CRITICAL khi chạm authority/invariant.
8. Bị block cục bộ thì ghi Dependency Request và tiếp tục phần độc lập.
9. Chỉ dừng hỏi user khi cần business decision không suy ra được, shared contract không thể tách, destructive/production operation, hoặc merge/deploy non-UI.

## Later waves

Sau ERP Core RC:

- `RC-040` WMS.
- `RC-041` Project/PSA.
- `RC-042` Service/Field Service.
- `RC-043` Semantic BI.
- `RC-044` Integration Foundation.
- `RC-045` Workplace/DMS/Notifications.
- `RC-046` App Factory builders/runtime.
- `RC-047` AI typed tool/preview/approval path.
- `RC-050..054` Alumdoor reference vertical current-main proof + production hardening.

## Canonical references

- `CURRENT_STATUS.md`
- `AI_HANDOFF.md`
- `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`
- `docs/FORGE_RC_HARDENING_PLAN_20260803.md`
- `docs/VALIDATION_GATES.md`
- `docs/FORGE_OFFLINE_SYNC_CONTRACT.md`
- `docs/agents/RC_AGENT_LANES_20260803.md`
- `docs/agents/RC_BATCH1A_AGENT_LANES_20260803.md`

Không biến tài liệu lịch sử thành backlog sống lại. Repo đã chịu đủ khảo cổ trong một ngày rồi.
