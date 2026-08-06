# METADATA INTELLIGENCE COMPLETION MATRIX — 2026-08-06

This is the post-implementation matrix for MDI-00..08. `FULL` means the active/canonical surface uses the common metadata authority. `COMPAT` means an older transport is still accepted but is not allowed to become a second authority.

| Capability | Form | ChildGrid | Rich AppAction row | Builder | Result |
|---|---|---|---|---|---|
| defaults / Today / Now | FULL | FULL | FULL | FULL | FULL |
| depends / mandatory / readonly | FULL | FULL | FULL via canonical bound field | authorable legacy conditions | FULL |
| Link / Dynamic Link | FULL | FULL | FULL | FULL | FULL |
| `link_filters` | FULL | FULL | FULL | FULL | FULL |
| `fetch_from` | FULL | FULL | FULL chained | FULL | FULL |
| stale async protection | FULL | FULL | FULL | N/A | FULL |
| operator override / dirty guard | FULL | FULL | FULL | FULL | FULL |
| `valueSource` | FULL contract | FULL contract | FULL bound contract | FULL | FULL |
| `editMode` | FULL | FULL | FULL bound contract | FULL | FULL |
| `surface` | FULL | list/quick policy | bound field | FULL | FULL |
| Business Context create defaults | FULL | FULL policy mapping | parent context supplied to action | N/A | FULL |
| target capability Link narrowing | FULL service | FULL service | FULL service | N/A | FULL |
| child columns | N/A | `viewPolicy.list -> in_list_view -> fallback` | declared order + canonical semantics | view policy remains canonical metadata | FULL |
| industry pricing/ATP/formula | server/vertical | not in generic renderer | not in generic renderer | N/A | VERTICAL AUTHORITY |
| generic client money computation | none | none | only explicitly declared action summary presentation | N/A | SERVER/DECLARATION AUTHORITY |
| business DocType-name routing | none in guarded Form | none | none in guarded rich action | N/A | BLOCKED BY CI GUARD |

## Compatibility surfaces

Two compatibility surfaces remain intentionally non-authoritative:

1. `ChildGridWithExtensions.tsx` is a re-export barrel only; it does not execute a second renderer.
2. Legacy `BulkTransaction:` AppAction transport remains accepted by `ActionScreen` for installed-package compatibility. New rich repeatable actions use first-class `input_tables` + `row_doctype` and canonical binding. The legacy transport is not a reason to add new business logic there.

## MDI-06 conclusion

No generic domain projection contract was added. Existing canonical metadata covers reusable behavior, while Alumdoor multi-source pricing/ATP/formula logic is already app/Worker/Experience-owned. A shared projection seam is deferred until a second reusable domain case proves it is required.

## Final gate

This matrix becomes `FINAL` only after the closure PR full R6 gate passes. Until then it is a candidate completion record.
