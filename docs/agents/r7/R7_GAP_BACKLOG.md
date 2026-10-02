# R7-A Gap Backlog

Generated from `R7_FRAPPE_PARITY_MATRIX.json`. Current denominator: 28 domains, 3 GAP, 0 UNRESOLVED. Audit completion does not imply platform certification.

## FRAPPE-19-MIGRATIONS-AND-PATCHES — Migrations and patches

- Wrangler remote SQL and journal completion remain separate transport operations: exact-content reservation, immutable receipt and explicit evidenced reconciliation now prevent blind replay, but provider transport atomicity/crash recovery evidence remains unproven.
- Workers-for-Platforms tenant/app provider rollback evidence remains unproven; no production/provider mutation was performed.

## FRAPPE-23-WEBSITE-AND-PORTAL — Website and portal

- Portal delete and authenticated single-entry creation require atomic kernel delete/uniqueness contracts; these operations explicitly return 501 rather than performing racy unversioned writes.
- Nested/dynamic/template website routing, role-filtered Portal Settings/menu behavior and pinned differential runtime evidence remain open.

## FRAPPE-26-INTEGRATIONS — Integrations

- Pinned Frappe Connected App backend/service-account token acquisition, discovery/revocation scope and source/runtime differential evidence are not yet closed by the bounded authorization-code/refresh/disconnect implementation.
- Generic webhook document-event mapping/condition/header contract against pinned Frappe still requires differential review; trusted-config outbound runtime and durable queue tests do not establish all upstream semantics.

No production migration, provider mutation or customer-data work was performed.
