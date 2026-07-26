# Gate 2E S3–S6 — O2C Source-Exact Runtime Oracle: status

One command runs the whole pipeline:

```bash
npm run oracle:o2c
```

It verifies the source lock, extracts the O2C static closure (S3), specifies the
fixture matrix (S5), builds the CloudForge differential (S6), validates the
artifacts, and writes `docs/spec/source-exact/oracle/ORACLE_REPORT.json`. Runtime
capture (S4/S5) runs only against a pinned bench:

```bash
CLOUDFORGE_ORACLE_SITE=oracle.local npm run oracle:o2c:bench
```

## Claim levels

| Level | Status |
|---|---|
| SOURCE_INVENTORIED | ✅ |
| STATIC_EXTRACTED | ✅ (S3, O2C closure) |
| RUNTIME_RESOLVED | ✅ (S4 on a pinned bench; static == runtime for all 4 roots) |
| ORACLE_CAPTURED | ✅ **115/115 fixtures** captured on the pinned bench (groups A–M: core O2C + advanced tax, multi-currency, valuation, repost, batch/serial) |
| CLOUDFORGE_MAPPED | ✅ (S6, all 115 fixtures) |
| DIFFERENTIAL_PASS | ✅ **48/115** fixtures match CloudForge on every applicable dimension; 67 are `ORACLE_CAPTURED` with a classified divergence (of which 27 are `CLOUDFORGE_MISSING` features) |

**No blanket `parity: true` is claimed.** Each fixture carries its own classified
claim + gaps. Even the happy path is `ORACLE_CAPTURED` (not a full pass): its GL and
fulfilment numbers match, but CloudForge does not re-derive ERPNext's granular
`status` label, so `document` diverges. That is the point — behavior was compared,
not asserted from a green happy path.

### Runtime capture — full 71-fixture matrix (this run)

A disposable, commit-pinned bench was stood up on a Docker host (the local Windows
Docker engine is unavailable — see below — so a remote VPS engine was used). The
image `frappe/erpnext:v16.20.0` was **content-verified**: its `frappe 16.19.0` /
`erpnext 16.20.0` versions match, and its O2C controller/report source files hash
**byte-for-byte identical** to the SHA-verified local `source-lock` trees (`.git` is
stripped from the image, so content-hash substitutes for git-SHA). Results:

- **S4** `frappe_runtime_export` exported metadata for 13 O2C doctypes;
  **static == runtime** for every root (SO 171, DN 165, SI 234, PE 93 fields).
- **S5** `o2c_matrix_runner.py` (core A–H) + `o2c_advanced_runner.py` (advanced tax I
  + multi-currency J) seeded a synthetic company on a freshly-reinstalled site and ran
  **all 86 fixtures** against ERPNext's own controllers / `get_mapped_doc` mappers,
  each **rollback-isolated** for determinism → **86/86 captured, 0 handler failures**.
  Captured artifacts include exact error classes (`OverAllowanceError`,
  `NegativeStockError`, `LinkExistsError`, `MandatoryError`, `TimestampMismatchError`,
  `InvalidQtyError`, `UOMMustBeIntegerError`), GL/SLE/PLE ledgers, AR/Stock reports,
  rate-precision rounding, tax charge-types (inclusive, tax-on-tax, actual, per-qty,
  discounts), and multi-currency base-GL + FX gain/loss.
- **S6** each captured behavior was differential-mapped to CloudForge source by
  per-group agents and then **adversarially verified** (a skeptic tried to refute
  every `DIFFERENTIAL_PASS`). Result (after the status-derivation fix below):
  **46 DIFFERENTIAL_PASS / 40 ORACLE_CAPTURED / 9 CLOUDFORGE_MISSING**; CloudForge
  status: 69 implemented / 8 partial / 9 missing. Gaps (classified, never a single
  flag): 51 INTENTIONAL_ARCHITECTURE_DIFFERENCE, 21 BUSINESS_RULE_MISMATCH,
  15 ERROR_SEMANTICS_DIFFERENCE, 18 MISSING_FEATURE.
- **Advanced (I/J) findings**: multi-row tax passes (net-equivalent, single lumped
  tax account = intentional arch); **CLOUDFORGE_MISSING**: inclusive tax + round-off,
  tax-on-tax, actual/flat tax, per-quantity tax, document-level discount, and
  payment-side **FX gain/loss**. Multi-currency base-GL invoicing is `partial`.
- **Valuation (K) findings**: ERPNext FIFO/Moving Average/LIFO layer consumption
  captured exactly (COGS 1600 / 1650 / 1700 for the same 10@100+10@120 → deliver 15).
  CloudForge is **CLOUDFORGE_MISSING**: it has no valuation engine (valuation_rate is
  a client-supplied delivery-line input, method-agnostic) and posts **no COGS /
  Stock-in-Hand GL on delivery**. Delivery cancel (reverseStock) and the negative-stock
  guard are `DIFFERENTIAL_PASS`.
- **Repost (M) finding (significant)**: pinned ERPNext v16.20.0 does **not**
  retroactively re-value an already-posted outgoing delivery when a backdated incoming
  layer is inserted — the historical COGS/valuation are preserved and only the on-hand
  Bin absorbs the net (verified 5 ways: manual RIV, in_test inline repost,
  recreate_stock_ledgers). CloudForge has no repost/backdated mechanism at all
  (**CLOUDFORGE_MISSING**), so this is a design input, not yet a divergence.
- **Batch/Serial (L) findings**: batch-specific COGS, `BatchNegativeStockError` on
  over-delivery, expired-batch delivery **not blocked** (advisory), serial
  uniqueness + already-delivered rejection, serial cancel → status back to Active.
  CloudForge has no Serial-and-Batch-Bundle model (**CLOUDFORGE_MISSING**).
  Together, K/M/L are the oracle-backed "what to build next" list for advanced stock.

Artifacts: `oracle/runtime/o2c-matrix-capture.json` (all 71 captures, synthetic,
secret-scanned), `oracle/differential/<fixture>.json` (per-fixture comparison +
adversarial verdict), `oracle/differential/differential-report.json`. Reproduce with
`npm run oracle:o2c` (capture-aware: it folds the committed capture and never
downgrades it; the offline path stays `BLOCKED_NO_BENCH` on a machine with no bench).

### Top differential findings

- **SO/DN/SI status labels — FIXED this session** (was the highest-severity gap,
  `E-STATUS-RECALC`): CloudForge now re-derives the granular ERPNext workflow labels
  ("To Deliver", "To Bill", "Partly Paid", "Completed") server-side on every read
  (`packages/document-kernel/src/status.ts` → both stores' `hydrateDerived`). 11
  fixtures flipped to `DIFFERENTIAL_PASS` after the fix. See the fix note below.
- **Delivery Note perpetual-inventory GL** (intentional, `B-*`): ERPNext posts COGS /
  Stock-In-Hand GL at delivery; CloudForge carries the value on the stock ledger
  (`stock_value_difference`) and posts no DN GL. Stock movement + fulfilment match.
- **Amendment flow missing** (`A-AMEND`): no `amended_from` / versioned-revision flow.
- **GL account decomposition differs** (intentional): ERPNext posts a single Debtors
  line + Round Off; CloudForge posts fixed-point RECEIVABLE/INCOME/tax lines. Net GL
  is equivalent.
- **Error classes differ but reject equivalently**: ERPNext raises typed internal
  errors; CloudForge raises `REFERENCE_VALIDATION_FAILED`/validation errors. Both
  reject the same bad inputs (invalid item, zero/negative qty, over-delivery,
  over-payment, insufficient stock, cancel-with-downstream).

### Incidental CloudForge bug found + fixed (with regression test)

The differential surfaced a **client-trust bug** (independent of ERPNext parity):
`SalesOrderController.normalize` copied client-supplied `delivered_percentage` /
`billed_percentage` (`input.x ?? "0.00"`), and `status()` derives `"Completed"` from
them — so a client could submit a zero-delivery order claiming `100/100` and forge a
persisted `"Completed"` status (the label is never re-derived on read). Fixed by
forcing both server-derived fields to `"0.00"` at normalize (packages/clouderp-selling/src/controllers.ts),
with a regression test (`tests/o2c.test.mjs` — "client-supplied delivered/billed
percentages cannot forge a Completed Sales Order"). This upholds CloudForge's
"no client-controlled server-derived state" invariant.

**Granular O2C status derivation (completeness gap, fixed this session).** The
highest-severity finding — status labels frozen at submit — was closed by deriving
them server-side from actual fulfilment/billing/payment state on every read:
new pure helper `packages/document-kernel/src/status.ts` (`deriveO2CStatus`), wired
into both stores' `hydrateDerived` and the controllers' mutation-time `status()`
(single source of truth). Transitions now match the oracle: SO
To Deliver and Bill → To Deliver / To Bill / Completed; DN → To Bill; SI Unpaid →
Partly Paid → Paid. Oracle-backed tests added (`tests/o2c.test.mjs`: a pure-function
matrix + a full SO→DN→SI→PE transition walk). Regression: 51 node + workerd 17/3
green. This lifted `DIFFERENTIAL_PASS` from 33→46 (of 86); the differential for the
22 status-touching fixtures was re-run against the fixed code.

## Source lock (acceptance #1)

`verify_source_lock.py` recomputes the fetcher's tree fingerprint and matches it,
the resolved commit, and the file count against `source-lock.json` +
`.acquisition.json`:

- Frappe **v16.19.0** `ba18090b141740e75d52aa97bfc525ff2f831f6c` — 3303 files, tree hash verified.
- ERPNext **v16.20.0** `ff46d20b259a2d65a7ded959df9f9a42991a3562` — 4826 files, tree hash verified.

## Runtime host

The **local Windows** Docker engine cannot be started (details below), so the S4/S5
capture above was run against a **remote Docker host** where a disposable pinned
bench was provisioned and torn down. The local-engine limitation is unchanged and
documented for reproducibility.

A live pinned Frappe/ERPNext bench cannot be stood up on the local Windows host:

- Frappe/ERPNext bench does not run natively on Windows.
- No general-purpose Linux/WSL distro is present (only the special `docker-desktop` WSL distro).
- `bench`, `mariadb`/`mysql`, `redis-server` are all absent from PATH.
- Docker is installed but the engine service (`com.docker.service`) is **stopped** and cannot be started without elevation (both engine pipes absent).

Therefore S4 (runtime export), S5 (behavioral oracle capture) and the ERPNext
side of S6 are **BLOCKED** and their outputs are **not fabricated**. The drivers
that will produce them are shipped and gated:

- `frappe_runtime_export.py` — bench-side runtime metadata export (S4).
- `o2c_fixture_runner.py` — bench-side seed + replay + capture (S5); refuses to run unless the installed app commits equal the lock.

**Engine bring-up attempted (2026-07-24), all failed without admin elevation:**
`Start-Service com.docker.service` → access denied; `docker desktop start` →
reports "already running" but the engine never comes up; a 2-minute readiness poll
→ dockerd never starts inside the `docker-desktop` WSL distro (`dockerd` binary is
absent there); the named pipes appear but there is nothing behind them. The engine
is launched only by the privileged `com.docker.service`, which is Stopped and
cannot be started from this non-interactive, non-elevated shell.

**Remediation (single command once an engine exists):**
`bash docs/spec/tools/oracle-bench/provision_oracle_bench.sh` builds a disposable
bench pinned to the two commits (fails closed unless the installed HEADs equal the
lock), then `CLOUDFORGE_ORACLE_SITE=oracle.localhost npm run oracle:o2c:bench` runs
S4 export + S5 capture + S6 differential. The only thing CloudForge CI cannot do is
start the Docker engine (needs elevation on this host).

## S3 — static O2C closure (generated, gitignored, regenerable)

`docs/spec/source-exact/generated/o2c/`: 24 closure doctypes (4 roots + 16 child
tables + 4 ledger doctypes), 24 controllers (primary class + bases + lifecycle +
ledger entry points + whitelisted methods + get_mapped_doc mappers), doc_events
hooks (frappe + erpnext, filtered to the closure), 2 reports, 62 files hashed, 67
boundary masters. Gaps classified: DYNAMIC_EVAL_REQUIRED / RUNTIME_REQUIRED /
OUT_OF_SCOPE — none dropped silently.

## S5 — fixture matrix

71 fixtures across groups A–H (Sales Order, Delivery Note, Sales Invoice, Payment
Entry, cross-document lifecycle, reports, numeric/boundary, concurrency
candidates). All `oracle_status: NOT_CAPTURED` pending a bench.

## S6 — CloudForge differential

71 fixtures mapped to CloudForge source/test references: 63 implemented, 7 partial,
1 missing. Gaps (classified, never a single flag): 2 MISSING_FEATURE,
4 INTENTIONAL_ARCHITECTURE_DIFFERENCE, 2 BUSINESS_RULE_MISMATCH,
1 ROUNDING_MISMATCH, 1 ERROR_SEMANTICS_DIFFERENCE — 6 known (true by construction),
4 candidate_pending_oracle (confirm against the captured oracle). Every ERPNext
comparison is `not_comparable` until the oracle is captured.

## Data safety

All fixture seed data is synthetic (`_OC-*`); no real party/account/item. Runtime
export redacts secrets; no site config or database dump is committed.
