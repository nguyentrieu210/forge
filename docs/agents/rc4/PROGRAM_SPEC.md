# RC4 Enterprise Residual Program

Status: BOOTSTRAPPED
Baseline: main@1f0b08934101640ca15b2379b5dd7ca3ef018e33
Control branch: program/rc4-enterprise-residual-20260804

Goal: close residual enterprise release-confidence gaps after RC3 without rebuilding already-proven primitives.

Rules:
- Exact GitHub state wins stale prose.
- Read skills/forge-enterprise-completion/SKILL.md, CURRENT_STATUS.md, NEXT_TASKS.md, North Star, capability map/status, then the owned workstream file.
- Reuse current source and merged evidence; do not replay stale workstream implementation blindly.
- Shared hotspot changes go to their owner via Dependency Request.
- Non-UI/backend/schema/migration/legal/security work: branch + PR + exact-head evidence, stop before merge/deploy for user approval.
- UI-only FAST work may follow the project's verified fast-path.
- No production mutation, secret/DNS change, customer-data migration, restore/PITR or provider destructive action merely to improve evidence.

Workers:
A1 IAM/privacy; A2 SRE/provider/recovery; A3 migration/cutover; A4 finance/VN statutory; A5 HCM/payroll statutory; A6 UI/mobile/offline; A7 App Factory residual; A8 integration/provider; A9 architecture/kernel; A10 CRM/revenue; A11 procurement/P2P; A12 inventory/WMS; A13 manufacturing/QMS; A14 project/service/field; A15 BI/semantic/AI; A16 workplace/DMS/collaboration; A17 logistics/POS/commerce; A18 Alumdoor reference vertical.

Convergence order defaults to shared foundations first: A9 + A1/A2, then A7/A8/A6, then domain lanes, then A18. Independent PRs may be reviewed earlier if they do not alter shared contracts.
