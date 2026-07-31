# AI HANDOFF

Ngày cập nhật: **2026-08-01**.

## Dự án và Git

- Repository: `nguyentrieu210/forge`.
- Default branch: `hotfix/alumdoor-print-list-delete`.
- Audited default head: `f27d4c6efe37a0cca91e3f1672a199d33b09cbab`.
- Working branch: `docs/alumdoor-process-audit-20260801`.
- Audit source: owner-supplied `25.7 QUY TRÌNH.docx`.
- Audit report: `server/docs/ALUMDOOR-PROCESS-TRACEABILITY-AUDIT-20260801.md`.
- GitHub là nguồn sự thật cho source, PR, CI và release evidence.

## Đọc đầu tiên khi tiếp tục

1. `server/docs/ALUMDOOR-PROCESS-TRACEABILITY-AUDIT-20260801.md`
2. `CURRENT_STATUS.md`
3. `NEXT_TASKS.md`
4. `PROJECT_CONTEXT.md`
5. `ARCHITECTURE.md`
6. Current default head, current open PRs and exact-head CI state on GitHub

## Whole-process verdict

**Forge chưa đạt toàn bộ quy trình 25.7 end-to-end.**

Đã có nền tảng mạnh:

- metadata-driven documents và permissions;
- stock/accounting ledgers;
- canonical physical stock identity và warehouse roles;
- versioned BOM và immutable Work Order snapshot;
- manufacturing progress, offcut/scrap và exact reversal;
- Purchase/FIFO safety;
- Sales pricing/availability;
- Alumdoor slat, door formula và aluminium cutting logic.

Nhưng còn thiếu hoặc chưa chứng minh:

- central order/export tracking đủ cột/lệnh/trạng thái;
- Sales Order orchestration sang production schedule/order, painting và defects;
- production capacity/overtime;
- daily detailed-ledger snapshot/freeze/restricted amendment;
- controlled four-cause warranty/defect lifecycle và accounting effects;
- complete customer debt/report journey;
- authenticated operator UI/reports for inventory/manufacturing;
- whole-process staging acceptance.

Không được dùng review score của từng slice để tuyên bố cả sản phẩm complete.

## Important evidence

### Formulas

- `server/apps-src/alumdoor-worker/src/slats.ts` implements:
  - `0.13 m` allowance;
  - profile divisors;
  - AL70 no-subtract decision;
  - Australia offsets `2 / 1.5 / 1.3`;
  - Australia rounding `0 / 0.3 / 0.7 / 1`.
- `server/apps-src/alumdoor-worker/src/door-formulas.ts` centralizes width/purchase/sales/production geometry through `Cutting Policy`.
- `Cửa Siêu Trường` still has a temporary Germany-like policy in `server/scripts/build-alumdoor-v2-brief.mjs`.

### Inventory / manufacturing

- PR `#49` merged physical identity and warehouse roles.
- PR `#50` merged versioned BOM and Work Order snapshot.
- PR `#82` remains open draft because endpoint/UI/operational reports are incomplete.

### Purchase

- Purchase/FIFO backend and safety gates exist.
- FIFO remains disabled.
- PR `#103` remains draft/open for authenticated PO → Receipt lifecycle QA.

### Finance

- PR `#15` remains open draft, stale/conflicted and is not on default.
- It explicitly does not complete Payment Allocation, Party Statement, Debt Summary, Advance Balance or report navigation/UI.

### Warranty

- `Warranty Claim` exists, but `issue_cause` is free-text `Data`.
- Four controlled causes, one-year motor/battery eligibility, responsibility confirmation and accounting transitions are not proved.

## Process compliance findings

- `FORGE.md` and `.forge/manifest.json` are absent on default. Use `forge-onboard`; install the pack through a separate draft PR.
- Current default head `f27d4c...` returned no workflow run/combined status. Do not claim current default CI green.
- Default branch is still named as a hotfix branch.
- Multiple old/conflicted/backup/superseded PRs remain open and need triage.
- No production deploy, secret/DNS change, migration or tenant mutation was performed by this audit.

## Gate

Whole-process scope is at **G0/G1**.

Before implementation, the owner must approve:

1. ERP workspace/report mapping for the three requested files.
2. Capacity unit behind the 8-hour day.
3. Daily snapshot amendment roles and adjustment semantics.
4. Supplier-defect debt offset timing.
5. Germany rounding interpretation.
6. Actual Super-long door formula.
7. Partial leaf-only order representation.
8. Meaning and precedence of `THÔ`.

## Highest-priority next work

1. Open/finish the Forge onboarding PR.
2. Get owner approval on the audit/BRD decisions.
3. Design central order orchestration and daily immutable detailed ledger.
4. Design controlled defects/warranty lifecycle.
5. Finish production schedule/capacity and Slice D operator reports.
6. Complete authenticated Sales and Purchase acceptance.
7. Rebuild finance/customer-debt work onto current default.

## Existing Sales Unicode release evidence

- Feature merge SHA: `a48524b93489c92296c57fc5f223e41d505de7aa`.
- Worker: `cloudforge-app-alumdoor`.
- Dispatch namespace: `cloudforge-production`.
- Release run `30651057535`: SUCCESS.
- Release job `91224118455`: SUCCESS.
- Cloudflare Version ID: `734fd53b-94ce-401d-86e8-ca4cd0ffee2e`.
- Authenticated Sales smoke is still required.

## Safety

- Do not deploy Cloudflare without explicit instruction.
- Do not merge without a new explicit instruction.
- Do not change production secrets/DNS.
- Do not activate FIFO.
- Do not commit `.env`, `server/work/`, `tmp`, backups or generated evidence.
