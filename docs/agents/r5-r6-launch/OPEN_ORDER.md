# R5 / R6 — AGENT OPEN ORDER

Date: **2026-08-04**  
Operator intent: open agents manually in separate chats/branches while preserving exact ownership and dependency order.

## 1. R5 launch topology

R5 uses **9 agents total**, but only **6 are opened in the first execution wave**. The final three are downstream gates and must not start early.

### Wave 0 — open first

#### R5-00 — Integration Control

Branch: `agent/r5-00-integration-control`

Open this agent **first**.

Purpose:

- audit exact current `main`;
- inventory RC4 A1-A24 final heads/PRs and which are already integrated;
- identify stale/superseded branches;
- publish the R5 source-of-truth integration manifest;
- identify exact shared hotspots and dependency order;
- do not merge non-UI branches without explicit authorization.

R5-00 is coordination/governance. It must not become a mega-agent that edits every domain.

### Wave 1 — open after R5-00 has started

Open these **five agents in parallel**. They do not need to wait for R5-00 to finish; each must independently audit exact current `main` and consume R5-00 findings when available.

#### R5-01 — Package + Capability Profile

Branch: `agent/r5-01-package-capability-profile`

Owns:

- App Registry/App Factory package composition;
- package dependency resolution;
- tenant capability activation profile;
- capability disable semantics;
- Capability Profile Builder UI + server-validated metadata contract;
- install/upgrade/idempotent reinstall/profile activation tests.

This is the highest-priority new R5 productization lane because customer deployment must not require source edits.

#### R5-02 — Finance + HCM Reconciliation

Branch: `agent/r5-02-finance-hcm-reconciliation`

Owns:

- exact-main Finance/VN/HCM integration audit;
- payroll/GL/Payment Ledger reconciliation;
- correction/cancel/reversal regression;
- bounded statutory/legal gaps;
- pilot-scope finance readiness.

Do not create another GL/payroll authority.

#### R5-03 — Commercial + Supply Chain

Branch: `agent/r5-03-commercial-supply-chain`

Owns:

- CRM/Sales;
- Procurement/P2P;
- Inventory/WMS;
- cross-domain Customer/Supplier/Order/Receipt/Delivery lineage;
- stock/AR/AP integration needed by Alumdoor.

Do not create a second stock/reservation/valuation authority.

#### R5-04 — Manufacturing + Service

Branch: `agent/r5-04-manufacturing-service`

Owns:

- Manufacturing/MRP/QMS;
- Projects/Service/Field;
- Warranty/service lifecycle;
- Alumdoor production-to-delivery-to-warranty continuity.

Keep industry-specific behavior in Alumdoor only when it cannot be expressed through generic domain primitives.

#### R5-05 — Integration + BI + Workplace + Logistics

Branch: `agent/r5-05-integration-bi-workplace-logistics`

Owns:

- Integration Hub/provider-neutral contracts;
- DLQ/replay source/runtime semantics;
- BI/semantic/dashboard wiring;
- Workplace/DMS/collaboration residuals;
- Logistics/POS/commerce residuals used by pilot.

Provider/live proof is R6, not R5.

### Wave 2 — open only after Wave 1 produces concrete candidate PRs

#### R5-06 — Package/Migration Rehearsal

Branch: `agent/r5-06-package-migration-rehearsal`

Open when R5-01..05 have stable candidate heads/PRs or their relevant changes are on an approved integration candidate.

Owns disposable/non-production rehearsal:

- fresh tenant bootstrap;
- package install ordering;
- upgrade/idempotent reinstall;
- capability activate/deactivate;
- migration/checksum sequencing;
- import/reconciliation fixtures;
- failed-upgrade recovery semantics.

R5-06 must consume canonical authorities; it must not patch around domain failures except in its own test/rehearsal harness.

### Wave 3 — open only after one integrated candidate exists

#### R5-07 — Independent Integrated QA

Branch: `agent/r5-07-independent-integrated-qa`

Precondition: one exact R5 candidate SHA exists.

Owns independent replay of:

- critical unit/integration gates;
- IAM/session/tenant negative tests;
- package/profile contract;
- Sales/Purchase/Stock/Manufacturing/Finance/Service golden flows;
- cross-ledger reconciliation;
- browser/mobile/PWA smoke;
- migration validator;
- regression against accepted RC4 evidence.

It must not count branch-local worker evidence as integrated PASS.

### Wave 4 — open last

#### R5-08 — Final Convergence

Branch: `agent/r5-08-final-convergence`

Preconditions:

- R5-01..06 have final dispositions;
- R5-07 has independently replayed the exact integrated candidate.

Owns:

- deterministic final convergence;
- exact R5 release-candidate SHA;
- 956-capability rematerialization;
- exact Alumdoor Pilot Capability Set;
- explicit P0/P1 blocker list;
- final verdict `R5-GO` or `R5-NO-GO`.

R5-08 must not fix large domain defects itself. Route them back to the owning lane, then rerun affected gates.

---

## 2. R5 opening order — operator checklist

Use this order:

1. **Open R5-00 first.**
2. Immediately after R5-00 is running, open **R5-01, R5-02, R5-03, R5-04, R5-05** in parallel.
3. Review/approve non-UI merges only when each worker has exact-head evidence and a clean dependency story.
4. Once a coherent integrated candidate exists, open **R5-06** for package/migration rehearsal.
5. Once rehearsal and integrated candidate are stable, open **R5-07** independent QA.
6. Only after R5-07 verdict, open **R5-08** final convergence.
7. If R5-08 = `R5-GO`, freeze the exact R5 candidate and start R6. If `R5-NO-GO`, reopen only the bounded owner lane named by the blocker.

### Do not do this

- Do not open R5-07 before an integrated SHA exists.
- Do not open R5-08 before independent QA.
- Do not open a second agent on the same shared hotspot.
- Do not ask every agent to “fix anything you see”; keep ownership bounded.
- Do not merge all worker branches into one staging branch blindly; use exact dependency order and rerun affected gates.

---

# 3. R6 launch topology

R6 starts **only after R5-GO** and an immutable R5 candidate is selected.

R6 uses **5 agents**.

### R6 Wave 0

#### R6-00 — Release Lock / Certification Coordinator

Branch: `agent/r6-00-release-lock`

Open first.

Owns:

- freeze exact R5 SHA;
- package/profile versions;
- bundle hash/release manifest;
- certification evidence index;
- environment/safety boundary;
- cross-agent evidence provenance.

No production mutation merely to populate the checklist.

### R6 Wave 1 — open in parallel after R6-00

#### R6-01 — Provider + Recovery

Branch: `agent/r6-01-provider-recovery`

Owns Cloudflare observed state, backup/restore/PITR/rollback, queue/DLQ/monitoring and provider recovery evidence.

Any destructive/provider mutation requires the explicit production/non-production operation gate defined by repo policy.

#### R6-02 — Migration + Data + Reconciliation

Branch: `agent/r6-02-migration-data-reconciliation`

Owns applied migration inventory, production-like rehearsal, opening data/import reconciliation, cutover/rollback data plan and cross-ledger reconciliation.

#### R6-03 — Alumdoor Golden Flow + Security + Performance

Branch: `agent/r6-03-alumdoor-golden-flow`

Owns exact-release authenticated Alumdoor flows, negative permission tests, representative browser/mobile performance and correction/reversal cases.

This agent must use the selected Alumdoor Pilot Capability Set, not the global 956-capability set.

### R6 Wave 2 — open last

#### R6-04 — Final Production Certification

Branch: `agent/r6-04-final-certification`

Open only when R6-01..03 have final evidence on the same exact release candidate.

Output exactly one verdict:

- `PILOT-GO`; or
- `PILOT-NO-GO` with exact blocking evidence.

Do not use “mostly ready”.

---

# 4. After R6 — Alumdoor pilot execution

Do **not** open another horizontal agent wave.

Use a small pilot team:

1. **Pilot-00 Data/Cutover** — mapping, opening balances, freeze/delta import, rollback packet.
2. **Pilot-01 Operations/Reconciliation** — parallel run, stock/AR/AP/cash/GL reconciliation, support log.
3. **Pilot-02 Exit QA** — independent Pilot Exit assessment.

Recommended sequence:

`Scope freeze -> data rehearsal -> dry run -> parallel run -> cutover -> hypercare -> Pilot Exit`.

---

# 5. Merge order guidance for R5

Exact order must be decided from current dependency graph, but default precedence is:

1. shared platform/kernel/IAM/migration prerequisites already accepted;
2. App Factory/package/profile shared contract;
3. Finance/HCM and shared accounting contracts;
4. CRM/Sales/Procurement/Inventory;
5. Manufacturing/Service;
6. Integration/BI/Workplace/Logistics;
7. package/migration rehearsal assets;
8. integrated QA evidence;
9. final convergence/status docs.

If a domain PR consumes a shared contract not yet on main, keep the domain PR gated or stack only long enough to validate; do not permanently fork the shared contract into the domain branch.

# 6. Dependency Request format

Every blocker must be recorded as:

```text
DR-R5-<owner>-<n>
Target owner:
Need:
Why shared:
Blocking scope:
Non-blocking work that continues:
Evidence:
```

A local blocker never justifies stopping unrelated work.

# 7. Definition of launch success

The operator should be able to open agents from `AGENT_PROMPTS.md` without adding technical interpretation. Each agent must know:

- exact ownership;
- branch name;
- prerequisite state;
- what to read;
- what not to touch;
- evidence required;
- whether it may merge/deploy;
- what handoff it must leave for the next wave.