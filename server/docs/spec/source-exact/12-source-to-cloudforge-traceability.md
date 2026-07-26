# Source-to-CloudForge Traceability Contract

This document defines the record chain required to turn pinned Frappe/ERPNext source into implementable CloudForge specifications.

## Trace chain

```text
source-lock entry
  -> acquisition receipt
  -> file manifest item
  -> parsed artifact record
  -> runtime resolved artifact
  -> behavior case
  -> CloudForge implementation mapping
  -> differential result
  -> reviewed coverage decision
```

Every link carries the upstream app, tag, full commit SHA, source path, source SHA-256 and generator version. Generated records without that identity are non-authoritative.

## Required identifiers

- `source_artifact_id`: stable ID derived from app + commit + path + content hash.
- `runtime_artifact_id`: stable ID derived from site export + source baseline + record identity.
- `behavior_case_id`: stable human-readable case ID with immutable fixture hash.
- `cloudforge_mapping_id`: link to package/file/symbol/migration/report or waiver.
- `evidence_id`: hash-addressed test output, snapshot or reviewed document.

## Mapping states

| State | Meaning |
|---|---|
| `UNRESOLVED` | Upstream artifact known but no CloudForge decision exists. |
| `IMPLEMENTED` | Mapped implementation exists and evidence is attached. |
| `PARTIAL` | Some behaviors implemented; missing cases are enumerated. |
| `DEFERRED` | Explicitly outside current release, with dependency and target gate. |
| `NON_PORTABLE` | Relies on environment/service that CloudForge cannot copy directly. |
| `WAIVED` | Deliberately excluded after review; rationale and user impact required. |
| `SUPERSEDED` | Replaced by another mapping with migration evidence. |

`DEFERRED`, `NON_PORTABLE` and `WAIVED` never count as behavioral parity unless the published product scope explicitly excludes that behavior.

## Behavior case minimum schema

Each case records:

- preconditions and fixture identities;
- actor, roles, user permissions and tenant/company context;
- request/command and exact input values;
- expected success or exact public error class;
- expected document state and version;
- expected child rows and derived totals;
- expected GL, stock, payment and other ledger deltas;
- expected status/outstanding/fulfilment projections;
- expected report rows where affected;
- expected notifications/jobs/outbox events;
- replay behavior using the same idempotency key;
- conflict behavior using stale version;
- cancellation/amendment behavior when applicable;
- upstream output hash and CloudForge output hash;
- normalized differences and reviewer disposition.

## Dynamic behavior rule

Static parsing must flag rather than guess when it encounters:

- computed DocType names;
- dynamic imports;
- SQL assembled from runtime strings;
- hook targets built dynamically;
- callable values from site configuration;
- monkey patches;
- server/client scripts stored in the database;
- region/domain-dependent overrides;
- external API responses;
- time, locale or database-engine-dependent behavior.

Every flag becomes a runtime-export or trace task. A parser that silently invents a value fails the gate.

## Change propagation

When the locked source baseline changes:

1. acquire and verify the new full commit;
2. regenerate manifests and indexes;
3. compute path, hash and semantic diffs;
4. invalidate runtime exports whose source dependencies changed;
5. invalidate affected mapping reviews and behavior cases;
6. rerun differential suites;
7. publish accepted, changed, deferred and regressed behavior lists;
8. only then update the baseline marked production-compatible.

## Publication rule

Generated source dossiers may quote only the minimum code needed for traceability. Full upstream source remains in its licensed checkout. CloudForge documentation stores hashes, paths, normalized structures, behavior descriptions and small reviewed excerpts, preserving license and provenance obligations.
