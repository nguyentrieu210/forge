# RC4-A21 — Migration Numbering / Governance

Date: 2026-08-04  
Agent: **RC4-A21**  
Status: **RUNNING — implementation complete, exact-head PR validation pending**  
Branch: `agent/rc4-21-migration-governance`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **CRITICAL**

## Mission

Close migration-governance defects independently from A3 runtime migration/cutover implementation.

## Exact findings

- Exact seed contains two historical tenant migrations with the same numeric prefix:
  - `0110_rc020_finance_posting_period_integrity.sql`;
  - `0110_rc023_cash_bank_reconciliation.sql`.
- These files are potentially applied. Renaming either one without environment applied-state evidence would break filename identity used by D1 migration bookkeeping.
- `server/scripts/d1-migrate-remote.mjs` records full migration filenames in `d1_migrations`, but the historical table does not contain content checksums.
- A3 (`agent/rc4-03-migration-cutover`, PR #599) independently closes runtime import/cutover retry windows and explicitly preserves the duplicate historical filenames pending read-only environment inventory. A21 therefore owns future-only numbering/content governance and does not duplicate A3 runtime authority.

## Implementation

### 1. Frozen historical collision contract

`server/migrations/migration-governance.json` records the **exact two-member** `tenant/0110` collision.

The allowlist is closed, not prefix-wide: adding a third `0110_*` file or removing/renaming either historical member fails validation.

### 2. Exact repository sequence validator

`server/scripts/verify-migration-governance.mjs`:

- discovers all SQL migrations under `server/migrations/**`;
- requires deterministic four-digit migration filenames;
- rejects case-insensitive duplicate filenames;
- rejects any unapproved duplicate numeric prefix;
- verifies approved legacy collisions still contain exactly the frozen members;
- computes SHA-256 for every migration file;
- accepts `--base-ref <git-ref>` and enforces append-only migration history against that exact base:
  - existing SQL migration modify/delete/rename/copy is rejected;
  - a new migration must allocate a numeric prefix strictly greater than the base maximum for its migration directory.

This closes the exact-main sequencing defect without renaming potentially applied files.

### 3. Applied-state identity/checksum contract

The validator accepts `--applied-state <json>` with versioned records of:

```json
{
  "version": 1,
  "databases": [
    {
      "migrationDir": "tenant",
      "applied": [
        { "name": "0110_example.sql", "sha256": "<64 hex chars>" }
      ]
    }
  ]
}
```

For every applied identity it fails closed when:

- the filename is unsafe/invalid;
- the same applied identity appears twice;
- SHA-256 is absent or malformed;
- the applied file is missing from source;
- current source content no longer matches the recorded SHA-256.

No historical checksum is fabricated: environment adoption requires observed applied filenames plus source hashes at the time the inventory is captured.

### 4. Regression coverage

`server/tests/migration-governance.test.mjs` proves:

1. the exact historical `0110` pair is accepted but a third collision is rejected;
2. applied-state SHA-256 match succeeds and content drift fails;
3. append-only delta allows a new prefix above base max and rejects late-prefix insertion, modification and deletion.

Local isolated Node evidence before repository write: **3/3 PASS** plus `node --check` PASS for the validator.

### 5. Exact-head validation workflow

`.github/workflows/rc4-a21-validation.yml` checks the exact PR head with full git history and runs:

- repository migration snapshot validation;
- append-only delta validation against the exact PR base;
- focused migration-governance regressions.

## Replay / crash-window interpretation

A21 does not claim that SQL migrations become transactionally crash-proof merely because numbering is validated.

The governance invariant is narrower and deterministic:

- **before apply:** full filename + source content hash identifies the intended migration artifact;
- **after observed apply:** the same filename/hash pair must remain immutable;
- **after partial failure/response loss:** runtime recovery remains A3/A12 authority; A21 ensures retry cannot silently target a different migration file with a reused number or mutated content.

## Dependency Requests

### DR-RC4-A21-01 -> A3 / A12

Need: consume the A21 validator before migration/cutover release execution and pass an applied-state snapshot where environment evidence exists.

Contract:

- full migration filename remains execution identity;
- SHA-256 is immutable source-content evidence;
- no applied migration may be renamed/replaced to repair numbering;
- runtime journal/retry semantics remain A3 authority;
- release/cutover gating remains A12 authority.

Blocking A21 independent source governance: **no**.  
Blocking production-grade applied checksum enforcement: **yes**.

### DR-RC4-A21-02 -> environment owner

Need: read-only `d1_migrations` inventory from every relevant D1 environment before any historical filename remediation or checksum adoption statement.

Until that exists:

- preserve both historical `0110_*` files exactly;
- do not claim which collision member is applied in which environment;
- do not write or mutate production migration state.

## Forbidden / boundary respected

- No already-applied migration renamed or rewritten.
- No production migration executed.
- No customer data mutated.
- No domain-specific migration semantics changed.
- No runtime document/ledger authority changed.

## Merge / deploy boundary

This lane is **non-UI CRITICAL**.

- Implementation is on the worker branch.
- Open a draft PR and verify exact head.
- **Stop before merge/deploy until explicit user approval.**
