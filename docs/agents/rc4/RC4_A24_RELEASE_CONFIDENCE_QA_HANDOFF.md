# RC4-A24 — Final Release-Confidence QA

Status: **BOOTSTRAPPED**  
Branch: `agent/rc4-24-release-confidence-qa`  
Seed: `main@1f0b08934101640ca15b2379b5dd7ca3ef018e33`  
Risk: **STANDARD evidence/governance**

## Mission

Act as the final independent gate before RC4 convergence. Verify exact candidate heads, builds/tests, browser evidence, migration safety, provider evidence boundaries and release claims.

## Own

- final exact-head validation matrix;
- cross-PR drift and stale evidence detection;
- build/test/browser/provider evidence ledger;
- release blocker ranking;
- go/no-go recommendation to control branch.

## Required checks

1. every candidate branch compared to exact current control/main;
2. no unresolved shared-hotspot collision;
3. migration sequence/identity accepted by A21;
4. adversarial findings from A19 dispositioned;
5. reconciliation findings from A22 dispositioned;
6. performance findings from A23 dispositioned;
7. capability convergence from A20 structurally valid;
8. no production/provider claim without direct evidence.

## Forbidden

- do not implement domain fixes to make QA green;
- no production deploy/provider mutation;
- no capability promotion from branch existence or stale CI.

## Output

Final QA PR/report to the RC4 control branch. Merge/deploy stays behind explicit user approval for non-UI changes.
