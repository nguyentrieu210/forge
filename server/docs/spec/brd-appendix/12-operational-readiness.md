# Operational Readiness Gate

Release production cần:

- SLO dashboard và alert theo tenant class.
- Backup/restore rehearsal thành công.
- Runbook D1 overload, Queue poison, DO hotspot, R2 outage, routing error.
- Secret rotation và incident access audit.
- Data retention/legal hold.
- Tenant suspend without data loss.
- Canary + rollback có schema compatibility.
- Cost guardrail per tenant.
- Reconciliation tự động: GL balance, stock balance, payroll GL, CRM sync, BI snapshot.
