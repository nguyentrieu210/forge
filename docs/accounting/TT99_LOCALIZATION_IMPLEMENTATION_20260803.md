# TT99 localization implementation — 2026-08-03

## Scope delivered

- TT99 account mapping by company and effective date.
- Versioned TT99 voucher, statutory book and financial statement templates.
- TT99 transition record with deterministic mapping hash, preview/balance evidence and zero-exception gate before submit.
- Versioned tax rulesets separated from TT99 accounting policy.
- E-invoice evidence records linked to Sales Invoice, legal rule and tax ruleset.
- Four-eyes workflows for account mapping, voucher/book/BCTC templates and tax rulesets.
- Navigation to core accounting ledgers/reports without creating a competing GL.
- D1 guards for invalid effective ranges, overlapping published definitions, unverified tax rulesets, incomplete TT99 transitions, duplicate e-invoice numbers and missing e-invoice evidence.
- Dedicated metadata and SQLite regression coverage.

## Legal boundary

TT99/2025/TT-BTC is treated as the accounting regime for vouchers, accounts, books and financial statements from fiscal years beginning on/after 2026-01-01. Tax obligations and e-invoice rules remain separate, versioned legal domains and must point to the applicable `VN Legal Rule`; no tax rate or tax liability is hardcoded merely because a company uses TT99.

## Source-of-truth boundary

- `gl_entries` and the existing Accounts controllers remain the authoritative financial ledger.
- TT99 masters are configuration/reporting/localization metadata only.
- Published effective definitions are guarded at the database boundary.
- E-invoice records are evidence/lineage; provider/tax-authority integration must populate hashes/status before submission.

## Validation status

- GitHub diff confirms the expected accounting files are present on the branch.
- Concurrent `main` changes after the branch point affect deploy workflows/evidence only, not accounting files.
- No GitHub status checks are registered for the current head under the repository's build/deploy-only Actions policy.
- The local execution environment could not clone GitHub because DNS resolution is unavailable, so the newly added executable regressions still require execution in a repository checkout before merge/deploy.
