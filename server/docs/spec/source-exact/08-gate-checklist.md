# Source-Exact Gate Checklist

## Gate S0 — Baseline lock

- [ ] Official repository identified.
- [ ] Release tag recorded.
- [ ] Full commit SHA resolved and matched.
- [ ] License recorded.
- [ ] Archive SHA and tree fingerprint stored.

## Gate S1 — Inventory

- [ ] Every file inventoried.
- [ ] No undocumented exclusions.
- [ ] Root-tree fingerprint reproducible.
- [ ] Binary and oversized files listed rather than dropped.

## Gate S2 — Static extraction

- [ ] Every DocType JSON parsed losslessly.
- [ ] Every report/page/workspace/workflow artifact classified.
- [ ] Python AST pass completed.
- [ ] Hooks and whitelisted methods indexed.
- [ ] Client RPC/event/list/report registrations indexed.
- [ ] Dependency graph produced.
- [ ] Critical parse errors are zero or reviewed with runtime resolution evidence.

## Gate S3 — Runtime export

- [ ] Clean pinned site created.
- [ ] Installed apps and environment captured.
- [ ] Effective metadata exported.
- [ ] Effective hooks and controller classes exported.
- [ ] DB schema/indexes exported.
- [ ] UI/API/report registries exported.
- [ ] Source-only and runtime-only differences resolved.

## Gate S4 — Behavior ledger

- [ ] Every supported transaction has lifecycle cases.
- [ ] Permission and negative cases exist.
- [ ] Race/replay/failure cases exist.
- [ ] Accounting/stock matrices exist where relevant.
- [ ] Reports and reconciliation have canonical outputs.

## Gate S5 — Mapping and licensing

- [ ] Every source behavior has a disposition.
- [ ] Every direct port has provenance.
- [ ] Every architectural substitution has parity evidence.
- [ ] Deferred scope is user-visible and excluded from parity percentage.

## Gate S6 — Oracle green

- [ ] Pinned source execution is reproducible.
- [ ] CloudForge execution is reproducible.
- [ ] Normalized outputs match.
- [ ] Divergences are zero or reviewed waivers.
- [ ] Evidence hashes and logs are retained.

## Claim rule

Only Gate S0–S6 green for the declared scope permits `SOURCE_EXACT_BEHAVIORAL_PARITY`. Passing S0–S2 permits only `SOURCE_INVENTORY_AND_STATIC_SPEC_COMPLETE`.
