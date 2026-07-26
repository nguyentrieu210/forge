# Migration & Reconciliation

Pipeline: source inventory → schema mapping → artifact mapping → dry-run → data transform → attachment copy → relationship rebuild → controller-derived projections → oracle/reconciliation → freeze/delta → cutover → monitor/rollback.

Mandatory evidence: counts and hashes; linked document integrity; trial balance; AR/AP outstanding; stock qty/value and stock-vs-GL; serial/batch custody; asset schedules; payroll totals and payroll-to-GL; CRM pipeline/activity/ERP links; Insights query/chart/dashboard result fixtures.
