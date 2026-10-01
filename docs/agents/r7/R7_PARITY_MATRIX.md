# R7-A Frappe 16 Parity Matrix — Human Summary

Machine authority: `R7_FRAPPE_PARITY_MATRIX.json`.

Current baseline is intentionally conservative. Existing code is not promoted to parity merely because a feature or test exists.

## Resolved dispositions in R7-00

| Domain | Disposition | Reason |
|---|---|---|
| FRAPPE-07 Database abstraction | INTENTIONAL_DIFFERENCE | Cloudflare D1/DO architecture replaces MariaDB/PostgreSQL abstraction; atomicity/race/replay semantics remain the contract |
| FRAPPE-14 Print and PDF | INTENTIONAL_DIFFERENCE | HTML+CSS print path is supported; binary Frappe PDF generation is explicitly unsupported on Workers |
| FRAPPE-17 Notifications and communications | GAP | Email intent exists, but no mail transport/Email queue delivery |
| FRAPPE-23 Website and portal | GAP | Current verification still identifies portal/website as foundation/incomplete |
| FRAPPE-28 Testing framework | OUT_OF_SCOPE | Upstream Python testing machinery is not a production client contract; Forge-native evidence remains mandatory |

All other domains remain UNRESOLVED until lane-specific exact-source/runtime/oracle evidence supports a disposition.

Do not convert UNRESOLVED to parity from source presence alone.
