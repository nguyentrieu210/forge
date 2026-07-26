# Oracle & Test Strategy

For each critical fixture run upstream pinned app and CloudForge with equivalent inputs, user/role, date/timezone/currency and compare observable outputs: document fields/status, errors, ledgers, links, reports, printed totals, events and permissions. Differences need compatibility rule, not snapshot blessing.

Test pyramid: pure unit; schema/controller contract; D1 integration; Worker/service binding; product pack fixtures; cross-suite reconciliation; Playwright MetaForge; load/SLO; adversarial permission/security; migration rehearsal.
