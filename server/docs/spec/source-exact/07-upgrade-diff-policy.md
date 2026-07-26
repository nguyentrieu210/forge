# Upstream Upgrade and Diff Policy

## Never move the baseline silently

Changing a branch name or tag in documentation does not upgrade parity. An upgrade is a new evidence set.

## Upgrade procedure

1. Add the new tag and full commit as a candidate lock.
2. Acquire and hash the new source tree.
3. Generate source-exact output with the same extractor schema.
4. Diff manifests by source path/hash and semantic artifact identity.
5. Classify added, removed, renamed and changed artifacts.
6. For changed DocTypes, produce field/permission/state/action diffs.
7. For changed Python modules, produce symbol/decorator/call/SQL/dependency diffs.
8. Invalidate mappings and oracle cases that reference changed source hashes.
9. Execute affected differential fixtures.
10. Review migrations/patches and data repair implications.
11. Promote the lock only after gates pass.

## Diff severity

- `STRUCTURAL_LOW`: labels/help/layout-only changes without runtime effect, reviewed.
- `CONTRACT_MEDIUM`: API, field, permission, report filter or workflow changes.
- `ACCOUNTING_HIGH`: GL, stock valuation, tax, currency, outstanding or immutable-ledger behavior.
- `SECURITY_HIGH`: auth, permission, guest API, file access, query or template safety.
- `MIGRATION_HIGH`: schema/patch behavior affecting stored data.

High-severity changes invalidate related production-readiness evidence automatically.
