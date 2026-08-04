# RC4-A20 — Capability Convergence

- Status: **R2 READY — materialized convergence green; final owner-authored exact-head rerun**
- Branch: `agent/rc4-20-capability-convergence-r2`
- Exact seed: `main@269c690bda7abf90ea13225204352bdff908d63b`
- Risk: **STANDARD governance/evidence**

## Why R2

A20 v1 used a stale `main@1f0b089...` worker snapshot. RC4-A6 subsequently completed browser evidence and was merged into main before A20 #612, so the merged capability registry understated current-main truth.

R2 re-audits A1-A19 and makes canonical maturity depend on **integrated convergence-tree evidence**, not merely a green worker branch.

## R2 maturity result

One promotion is accepted:

- `U01-001 Responsive PWA`: **Wired -> RC** from merged A6 PR #598 and exact browser run `30871503111` / job `91874277369`.

Candidate counts:

- Hardened: `0`;
- RC: `66`;
- Wired: `406`;
- Foundation: `327`;
- Missing: `157`;
- Total: `956`.

No Hardened promotion is accepted. `U01-002` remains Wired; offline `U01-003..007` and Push `U01-013` remain Missing.

## Updated worker truth

- A7, A9, A12 and A16 now have exact-head green validation and are recorded READY.
- A8, A14, A15, A17 and A18 have independent A19 PASS evidence.
- A4, A10 and A13 remain substantive blockers.
- A19 overall remains red and its A7 snapshot is stale because A7 fixed its lane after the A19 pin.
- Except A6, those implementations remain unmerged, so R2 does not promote their branch-only candidates into canonical main maturity.

## Delivered / updated

- `server/scripts/rc4-a20-r2-materialize.mjs` — deterministic current-main status materializer;
- `docs/agents/rc4/RC4_A20_EVIDENCE_MANIFEST.json` — schema v2 current evidence snapshot;
- `server/scripts/validate-rc4-capability-convergence.mjs` — now requires integrated-tree ancestry for any maturity promotion;
- `docs/agents/rc4/RC4_A20_CAPABILITY_CONVERGENCE_R2.md` — detailed R2 convergence record;
- R2 exact-head workflow materializes and commits the canonical status before final validation.

## Validation checkpoint

R2 workflow run `30872704358` materialized canonical status and then revalidated the generated commit in the same checkout:

- capability denominator `956/956`;
- missing/unknown/duplicate IDs `0/0/0`;
- Evidence Index `22/22`;
- worker lanes `19/19`;
- integrated maturity lanes `1`;
- maturity changes `1`;
- final counts `Hardened=0 / RC=66 / Wired=406 / Foundation=327 / Missing=157`;
- diff hygiene PASS.

The generated status commit was authored by `github-actions[bot]`, causing follow-up workflow events to require action rather than execute automatically. This owner-authored handoff checkpoint intentionally creates a normal final-head PR event so exact-head gates can rerun without treating bot-trigger suppression as acceptance evidence.

## Promotion contract

A capability promotion must now have:

- exact worker head and validated head;
- executable workflow provenance;
- explicit capability IDs and direct evidence paths;
- implementation integrated into convergence `HEAD`;
- merge commit and final lane head proven as Git ancestors;
- explicit allowlist for any post-validation cleanup drift;
- canonical Evidence Index reference and exact maturity arithmetic.

A19 remains a cross-branch/final release-confidence gate, not a global veto over an isolated capability already merged into current main with complete capability-specific evidence.

## Output boundary

R2 convergence PR is ready after exact-head gates. This is non-UI governance/evidence work: **stop before merge unless explicitly approved**. No production deploy is required by R2 itself.
