# R7-A Dependency Ledger

## Active dependencies

| ID | Producer | Consumer | Need | State |
|---|---|---|---|---|
| R7-DR-001 | R7-00 | all lanes | exact 28-domain denominator + machine verifier | CLOSED IN THIS PR |
| R7-DR-002 | source-exact/oracle | R7-01..10 | Frappe 16 runtime captures for domains not already covered by existing evidence | OPEN |
| R7-DR-003 | R7-03 | R7-06/R7-09 | permission-query semantics and user-permission differential | OPEN |
| R7-DR-004 | R7-08 | R7-04/R7-09 | scheduler/realtime/background delivery semantics closed by FRAPPE-10/11 authorities | CLOSED |
| R7-DR-005 | R7-06 | R7-09 | prepared-report/list/dashboard runtime differential | OPEN |
| R7-DR-006 | R7-07 | R7-01/R7-18-equivalent app composition scope | customization/install/upgrade differential | OPEN |

## Routing rule

A lane that discovers a shared primitive gap records a dependency here rather than creating a parallel implementation in its own package. Domain owners remain those defined by `SENTRUX_MAP.md` and the exact import graph.
