# RC4-A19 — Independent Adversarial QA

Status: **BOOTSTRAPPED**  
Branch: `agent/rc4-19-independent-adversarial-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD/CRITICAL evidence depending on target**

## Mission

Independently attack release-confidence claims from A1-A18. Focus on invariants, permission, tenant isolation, retries, concurrency, correction/reversal, stale-evidence and exact-head drift.

## Own

- adversarial tests and validators;
- independent evidence review;
- blocker findings and Dependency Requests;
- exact-head QA reports.

## Forbidden

- do not become owner of domain runtime, schema or business rules;
- do not fix another lane's authoritative implementation silently;
- do not promote maturity from documentation alone;
- no production/provider mutation.

## Priority

1. tenant/user/role boundary attacks;
2. duplicate/retry/idempotency/concurrency cases;
3. cancel/reversal/correction invariants;
4. cross-lane stale evidence;
5. exact-current-main executable verification.

## Output

Open PR with QA evidence, failing cases and dependency requests. Non-UI merge/deploy requires explicit approval.
