# Gate 2E — O2C Oracle Evidence Bundle (A–M, 115 fixtures)

Self-contained, in-repo (outside the disposable bench container). All capture data is
synthetic (`_OM-*`), secret-scanned, and rollback- or fresh-item-isolated.

## Headline
- **115 fixtures** captured on a commit-pinned Frappe/ERPNext bench (frappe v16.19.0 /
  erpnext v16.20.0, content-verified).
- **48 DIFFERENTIAL_PASS** (match CloudForge on every applicable dimension) /
  **67 ORACLE_CAPTURED** (classified divergence; 27 are `CLOUDFORGE_MISSING` features).
- No blanket `parity: true`. Each fixture carries its own claim + classified gaps.

## Fixture groups
| Group | Area | Fixtures |
|---|---|---|
| A–H | Core O2C (SO/DN/SI/PE, lifecycle, reports, numeric, concurrency) | 71 |
| I | Advanced tax (charge-types, inclusive, discount) | 9 |
| J | Multi-currency (base GL, FX gain/loss) | 6 |
| K | Valuation (FIFO / Moving Average / LIFO, COGS) | 11 |
| M | Repost / backdated stock | 6 |
| L | Batch + Serial (Serial-and-Batch-Bundle) | 12 |

## Immutable snapshots (SHA-256 bundle fingerprints)
| Label | Fixtures | Pass | bundle_sha256 |
|---|---|---|---|
| `AJ-86`   | 86  | 46 | `ff77c657a6c37da2874c6c9bf16034026164e09e21e7b250cf7acebf92121365` |
| `ABCM-115`| 115 | 48 | `8583d90d3e4cc364e530ace7c2b252cb1b39a75774f1a00c446dc2ff0d5b35d8` |

Source references are additionally anchored by `oracle/CLOUDFORGE_SOURCE_HASHES.json`
(SHA-256 + line count of every CloudForge file the differential cites — 18 files).

Each `oracle/snapshots/<label>/manifest.json` lists every evidence file with its
individual SHA-256; the bundle hash is the hash of the sorted `path:sha256` lines.

## Artifact paths (committed)
- Capture: `oracle/runtime/o2c-matrix-capture.json` (all 115 captures + per-fixture summary)
- Differential: `oracle/differential/<fixture-id>.json` (115) + `differential-report.json`
- Fixture specs: `oracle/fixtures/O2C-*.json` (115) + `fixture-matrix.json`
- Report: `oracle/ORACLE_REPORT.json` (claim levels, counts)
- Environment: `oracle/ENVIRONMENT.json` (image digest + rebuild command)
- Static (S3): `generated/o2c/` (gitignored, regenerable from locked source)

## Capture runners (reproducible)
`docs/spec/tools/o2c_{matrix,advanced,valuation,repost,batchserial}_runner.py`
→ bench modules `frappe.{matrix,adv,val,rpst,bs}_o2c`. Drivers gated on the source lock.

## Environment fingerprint
- Image: `frappe/erpnext@sha256:0515daf0d095172776f3acf7f122d48d62c5e8d8d8e67b527c2594610d207431` (tag v16.20.0)
- Apps: frappe 16.19.0 / erpnext 16.20.0 · db mariadb:11.8 · cache redis:7-alpine
- Source lock: frappe `ba18090…`, erpnext `ff46d20…` (content-verified)

## Reproduce
- Offline / fold committed capture: `npm run oracle:o2c` (capture-aware, non-destructive).
- From scratch: see `oracle/ENVIRONMENT.json` → `rebuild.steps`, then run the 5 runners.

## Replay determinism
The site was **reinstalled to a pristine state** and all 5 runners re-ran end-to-end:
**115/115 fixtures re-captured, 0 failures**. A behavioral-signature comparison (all
numeric + categorical invariants, ignoring auto-generated names) against the prior
capture matched **111/115** across two independent runs. The 4 differences
(`O2C-M-*` repost) were in **absolute Bin quantity only** — COGS/valuation-rate were
identical — and were caused by accumulated committed stock in the earlier *non-reset*
M capture (repost commits, so rollback cannot isolate). The clean reset-site run was
adopted as the canonical committed capture, so the committed M data now equals the
deterministic reset-site result. Rollback-isolated groups (A–J, K, L) are deterministic
by construction and matched exactly.

## Notable findings (see GATE2E_ORACLE_STATUS.md for full list)
- **CloudForge fixes landed this session** (real bugs found via the differential):
  client-supplied `delivered_percentage`/`billed_percentage` forgery closed; granular
  O2C status labels now derived server-side (lifted 33→46 pass in A–J).
- **Valuation (K)**: CloudForge has no FIFO/MAVG/LIFO engine (valuation_rate is client
  input) and posts no delivery COGS GL → `CLOUDFORGE_MISSING`.
- **Repost (M)**: pinned ERPNext preserves already-posted outgoing COGS on a backdated
  incoming insert (verified 5 ways); only the on-hand Bin absorbs it. CloudForge has no
  repost mechanism.
- **Batch/Serial (L)**: expired-batch delivery is not blocked (advisory);
  `BatchNegativeStockError` on over-delivery; serial cancel → Active. CloudForge has no
  Serial-and-Batch-Bundle model.
- **`A-INVALID-ITEM` — DECIDED (documented, not aligned)**: CloudForge validates
  master-data existence at `submit` — the posting gate — not at create/save, uniformly
  across all four O2C controllers. A draft may reference a not-yet-created item; submit
  rejects it and nothing posts. This is an intentional lightweight-draft design, not a
  bug — documented in `controllers.ts` + a characterization test in `tests/o2c.test.mjs`
  ("master-data existence is validated at submit, not create"), and classified
  `INTENTIONAL_ARCHITECTURE_DIFFERENCE`. (ERPNext validates Link fields at insert.)
