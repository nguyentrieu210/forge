# RC4-A21 — Migration Numbering / Governance

Status: **BOOTSTRAPPED**  
Branch: `agent/rc4-21-migration-governance`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL**

## Mission

Close migration-governance defects independently from A3 runtime migration/cutover implementation.

## Own

- migration numbering and uniqueness governance;
- applied-state-aware identity/checksum contract;
- replay/crash-window verification tooling;
- append-only migration audit and validator evidence.

## Priority

1. duplicate `0110_*` prefixes;
2. immutable migration file identity/content hash;
3. deterministic handling after partial failure;
4. exact-main migration sequence validator;
5. compatibility with A3 durable migration journal and A12 release safety.

## Forbidden

- do not rewrite already-applied migrations;
- do not run production migrations;
- do not mutate customer data;
- do not own domain-specific migration semantics.

## Output

PR with governance/tooling/tests and Dependency Requests. Stop before merge/deploy for explicit approval.
