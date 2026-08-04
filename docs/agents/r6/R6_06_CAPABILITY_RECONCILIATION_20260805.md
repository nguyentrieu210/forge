# R6-06 Actual Source/Live Capability Reconciliation — 2026-08-05

Status: EXECUTED / BLOCKED  
Method: current source + current CI + direct live/provider observation only  
Historical R6-00..R6-05 reports: non-authoritative for this execution

## 1. Actual conclusion

Forge's current source/release-confidence path is substantially green, but the exact runtime candidate is **not deployed** and therefore there is no truthful exact post-R6 capability recount yet.

The exact runtime candidate assessed is:

`9062e5a47d255d4b75ba16de6585b0c61f908573`

The latest direct release attempt is canonical run `30950504466`.

That run:

- checked out exact candidate `9062e5a...` — PASS;
- installed locked dependencies — PASS;
- built CloudForge — PASS;
- built MetaForge including HRM/runtime/Kho — PASS;
- staged the exact release bundle — PASS;
- then failed the generated-worktree safety guard on:
  `client/apps/kho/dist-mobile/alumdoor-app-192.png`;
- migration planning/backup/migration — NOT RUN in this attempt;
- tenant Worker deploy — NOT RUN;
- Alumdoor app Worker deploy — NOT RUN;
- Gateway deploy — NOT RUN;
- exact production convergence — NOT RUN;
- post-release certification — NOT RUN.

The direct orchestrator record for this exact candidate is `BLOCKED`, deploy run `30950504466`, certification run `null`.

This is a release-build/generated-artifact allowlist defect. It is not evidence that Finance, Stock, HRM, migration data or accounting reconciliation failed.

## 2. Current direct source/CI state

Current release-confidence CI immediately preceding the production attempt is green.

R6 Pass Convergence run `30950266897` completed successfully. Its source-safety job passed:

- full CloudForge production build;
- canonical report aggregate checks;
- full MetaForge production build;
- migration/restore/PITR safety tests;
- workerd ERP lifecycle;
- auth / CSRF / tenant isolation;
- tenant provisioning;
- R6 Golden Flow;
- release-safety authority;
- observability source contract;
- queue safety;
- Alumdoor package dry-run/composition;
- diff hygiene.

This proves strong current-source release confidence. It does **not** prove that the same source is deployed.

## 3. Current direct live/provider state

Read-only observation at `2026-08-04T20:58Z` showed provider state healthy:

- Gateway bindings: PASS, no missing bindings;
- tenant Worker: readable;
- tenant bindings: PASS, including `BROWSER`, D1, R2, Queue, AI and dispatch namespace;
- Gateway observability: enabled with logs/traces;
- tenant observability: enabled with logs/traces;
- Alumdoor app Worker: readable;
- Alumdoor app bindings: PASS;
- Alumdoor app observability: enabled with logs/traces;
- provider blockers: none.

Direct runtime identity observation showed:

| Item | Actual observed value |
|---|---|
| Live release HTTP | 200 |
| Live release SHA | `86958c8bb79dda5d7615078535ece35af280f45b` |
| Exact candidate | `9062e5a47d255d4b75ba16de6585b0c61f908573` |
| Exact SHA match | **NO** |
| Live bundle hash | `ccd4004197f51940` |
| Alumdoor | `2.2.3` |
| HRM | `1.8.0` |
| VN Accounting | `1.6.1` |
| capability-profile schema | present |
| active capability profile identity | **not observed** |

Therefore the direct live blockers are:

- production does not run the exact candidate;
- active capability-profile identity is not currently observed.

## 4. Actual-state matrix

```text
Source/build gates       PASS
Security/tenant gates    PASS
Golden Flow source test  PASS
Provider/bindings        PASS
Observability live       PASS
Package identity         PASS
Exact production SHA     FAIL   (live 86958c8... != candidate 9062e5a...)
Active profile identity  UNKNOWN/BLOCKED
Latest deploy attempt    FAIL   (generated artifact outside allowlist)
Migration in latest run  NOT_RUN
Post-release certify     NOT_RUN
```

## 5. Capability accounting

The existing canonical registry currently contains this previous baseline:

```text
Hardened       0
RC            66
Wired        406
Foundation   327
Missing      157
Total        956
```

**These are baseline registry numbers, not a newly proven post-R6 recount.**

This execution does not repeat them as an `After` result because no current per-ID evidence reconciliation across all 956 IDs has been completed and the exact runtime candidate did not reach production.

Current truthful capability result:

```text
POST-R6 FIVE-WAY RECOUNT = NOT RECONCILED
NEW CURRENT-SHA HARDENED PROMOTIONS = 0 PROVEN
```

Current source-side CI can support RC/release-confidence evidence for specific tested slices, but R6-06 will not guess which of the 956 IDs should move without a per-ID evidence mapping.

## 6. What is actually fixed vs still blocked

Actually healthy now:

- full source builds;
- security/tenant isolation source integration;
- Golden Flow source integration;
- provider bindings including Browser;
- Gateway/tenant/Alumdoor observability;
- expected installed app versions.

Actually blocked now:

- full-release generated-worktree allowlist does not include at least `client/apps/kho/dist-mobile/alumdoor-app-192.png` generated by the exact build;
- candidate `9062e5a...` therefore never reached migration/deploy;
- live production remains on `86958c8...`;
- active capability profile is not observed;
- an exact current-production capability maturity recount is therefore not claimable.

## 7. Unblock condition

R6-06 can produce a real post-R6 five-way result only after direct evidence shows:

1. the canonical full-release generated-artifact guard accepts exactly the intended generated build outputs and rejects everything else;
2. one exact candidate completes deployment;
3. direct release observation reports that exact deployed SHA;
4. required package/profile/data identities are directly observable;
5. per-ID evidence is mapped to all proposed maturity changes;
6. the 956-ID validator passes after any status edits.

No R6-00..R6-05 prose is needed to establish these facts.

R6-06-BLOCKED: exact candidate 9062e5a47d255d4b75ba16de6585b0c61f908573 failed the current full-release generated-worktree guard before migration/deployment; live production remains on 86958c8bb79dda5d7615078535ece35af280f45b and active capability-profile identity is unobserved, so a truthful post-R6 956-ID maturity recount is not yet available.
