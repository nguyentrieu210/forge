# RC3 A0 Finalization Request

Date: 2026-08-04

This marker requests deterministic A0 final convergence after A1-A5 evidence has been accepted into the RC3 control branch.

Materialized canonical status commit: `fa2dbd689345f31144808892cb836e35bbc37a80`.
A0 exact-head no-op validation passed on `7110808d59cbe4efdbcbf2172aeb8eb24556325d` via run `30865705519`.
This control-branch marker triggers the final validation after A0 has merged into the program control branch.

Required gate:
- generator must be idempotent on the already-materialized canonical state;
- validate exactly 956/956 capability IDs with zero missing/unknown/duplicates;
- maturity must remain Hardened=0 / RC=65 / Wired=407 / Foundation=327 / Missing=157;
- reconcile CURRENT_STATUS.md and NEXT_TASKS.md;
- keep Hardened at zero unless production-grade evidence exists;
- do not rename potentially applied duplicate-prefix migrations without applied-state evidence;
- no production/provider mutation or deployment.
