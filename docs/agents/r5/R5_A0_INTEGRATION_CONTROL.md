# R5-00 — Integration Control

Date: **2026-08-04**  
Repository: `nguyentrieu210/forge`  
Branch: `agent/r5-00-integration-control`  
Exact execution baseline: `main@30346e08eabb7074f8623eeedae09efec25da072`

## 1. Verdict

**R5-00 = GO_WAVE_1.**

RC4 source integration is already complete on exact current `main`. The canonical closure is PR **#627**, whose post-integration candidate `41d34c8253b85848e435d71ad28124098976aeee` passed integrated run **30878142334** before the merge commit `30346e08eabb7074f8623eeedae09efec25da072` became current `main`.

Canonical capability truth on current `main` is exactly:

- Hardened: **0**
- RC: **66**
- Wired: **406**
- Foundation: **327**
- Missing: **157**
- Total: **956**

The critical integration conclusion is therefore:

> **There are zero RC4 worker branches left to integrate into R5.**

R5 must start from exact current `main`, not replay RC4 branches merely because they still exist. A19/A20-R2/A24-R2 are immutable supporting evidence/checkpoints, not merge sources after #627.

Machine-readable authority: `docs/agents/r5/R5_INTEGRATION_MANIFEST.json`.

## 2. Source hierarchy used

R5-00 audited in this order:

1. exact GitHub `main`, branches, PR state and final RC4 merge;
2. `skills/forge-enterprise-completion/SKILL.md`;
3. `CURRENT_STATUS.md` and `NEXT_TASKS.md`;
4. `docs/FORGE_ENTERPRISE_NORTH_STAR.md`;
5. `docs/FORGE_ENTERPRISE_CAPABILITY_MAP.md` and `docs/FORGE_ENTERPRISE_CAPABILITY_STATUS.md`;
6. RC4 A19/A20/A24 evidence and current RC4 PR history;
7. unmerged R5/R6 planning/launch documents as planning input only.

Exact code/migration/test/GitHub state wins over stale prose. The unmerged planning PRs **#624** and **#626** are not imported into this branch and are not treated as current-main authority.

## 3. RC4 A1–A24 final disposition

| Lane | Final worker/source head | PR | R5 disposition | Accepted evidence / note |
|---|---|---:|---|---|
| A1 IAM / Privacy | `47bb2b8` | #597 | already-main | lane run `30867988724`; final integrated run `30878142334` |
| A2 SRE / Provider | `6efa89b` | #596 | already-main | source/governance integrated; provider/live remains unverified |
| A3 Migration / Cutover | `792f7f3` | #599 | already-main | lane run `30868113636`; final integrated run |
| A4 Finance / VN | `068ca98` | #602 | already-main | final integrated run; migration `0113` canonical |
| A5 HCM / Payroll | `1baaf38` | #604 | already-main | final integrated run; unsupported statutory numeric rules remain fail-closed |
| A6 UI / Mobile / PWA | `6a6e7d8` | #598 | already-main | browser run `30871503111`; U01-001 promoted to RC; #620 is UI release marker history |
| A7 App Factory | `5d42200` | #606 | already-main | lane run `30869504929`; migration `0114` canonical |
| A8 Integration Hub | `b5c75c3` | #615 | already-main via reconciled integration | original delta must not be replayed; authoritative reconciliation is #625 head `221263e` after A7 registry overlap |
| A9 Kernel | `32001d7` | #619 | already-main | lane run `30870090636`; canonical read/kernel authority preserved |
| A10 CRM / Revenue | `00b0711` | #617 | already-main | Customer 360 integrated; final integrated run |
| A11 Procurement / P2P | `27c616c` | #600 | already-main | supplier lifecycle guards integrated |
| A12 Inventory / WMS | `68f1ab9` | #616 | already-main | lane run `30869414261`; targeted valuation identity remains bounded gap |
| A13 Manufacturing / QMS | `0822b92` | #603 | already-main | final integrated run; rework/subcontract/cost-variance boundaries remain explicit |
| A14 Project / Service / Field | `8ca102b` | #613 | already-main | final integrated run |
| A15 BI / Semantic / AI | `3c6db92` | #608 | already-main | final integrated run; provider/live proof remains separate |
| A16 Workplace / DMS | `26db269` | #614 | already-main | lane run `30869407232`; scheduler/provider/shared-schema dependencies remain bounded |
| A17 Logistics / POS / Commerce | `f250406` | #601 | already-main | final integrated run; POS/offline residuals remain bounded |
| A18 Alumdoor | `b3e428d` | #611 | already-main | read-only Golden Order hardening integrated; authenticated live proof belongs later certification |
| A19 Independent QA | `fea9813` | #605 | **evidence-only** | immutable pre-integration run `30875933640` passed A1-A18; merge source superseded by #627 |
| A20 Capability convergence R2 | `cb52ab6` | #622 | **evidence-only** | 956/956 + U01-001 checkpoint; final canonical materialization is #627 |
| A21 Migration governance | `fe473cc` | #607 | already-main | run `30868898863`; frozen historical collisions + append-only validator integrated |
| A22 Cross-ledger auditor | `e3df86a` | #609 | already-main | read-only auditor integrated and replayed in final gate |
| A23 Performance / Scale / Cost | `7d7aff6` | #618 | already-main | local 100k evidence + final integrated gate; provider-scale proof remains later evidence |
| A24 Release-confidence R2 | `351330b` | #623 | **evidence-only** | pre-integration run `30876567190`; final merge source superseded by #627 |

### Integration queue

**Requires RC4 integration now:** none.

**Do not replay:**

- `agent/rc4-19-independent-adversarial-qa` / #605;
- `agent/rc4-20-capability-convergence-r2` / #622;
- stale A24 R1 `agent/rc4-24-release-confidence-qa` / #610;
- A24 R2 `agent/rc4-24-release-confidence-qa-r2` / #623;
- temporary A6 probe `probe/rc4-a6-production-evidence` / #621;
- original A8 worker delta over current main; use already-integrated reconciliation #625 as authority.

## 4. Authority collision audit

### 4.1 App Factory ↔ Integration Hub registry

RC4 exposed a real shared-hotspot conflict: A7 added App Factory registration while A8 also touched the shared `AggregateCoordinator` composition. PR **#625** reconciled this by preserving A7 and composing Integration Hub registration over it.

R5 rule:

- **R5-01** owns App Registry/App Factory package + capability-profile authority.
- **R5-05** consumes that registry/profile authority.
- If R5-05 needs the same controller registry/profile contract, it raises a Dependency Request to R5-01 instead of independently rewriting the hotspot.

### 4.2 Migration numbering / applied state

A21 froze historical collision sets **0030 / 0031 / 0032 / 0110** without renaming potentially applied migrations. Current RC4 additions include:

- `0113_vn_vat_account_mapping_guard_hardening.sql`;
- `0114_app_factory_approval_runtime.sql`.

GitHub code search at this audit found no `0115_*` hit, but this is **not** a reservation. Every R5 schema owner must rerun the exact-current migration sequence validator before allocating a number. R5-06 must validate the composed full-filename + SHA applied-state sequence. Never rename potentially applied historical files.

### 4.3 Landed cost / Stock ↔ GL

The remaining landed-cost boundary crosses Procurement/Inventory/Finance:

- R5-03 owns stock/valuation and supply-chain authority;
- R5-02 owns GL/Payment Ledger and financial reconciliation;
- neither may create a shadow ledger in order to close the other lane.

If receipt-targeted valuation identity or historical COGS/GL propagation needs a new shared contract, record it explicitly and continue unrelated work.

### 4.4 Manufacturing ↔ Inventory ↔ Finance

R5-04 consumes canonical R5-03 stock/procurement and R5-02 finance semantics. It may add orchestration/evidence in its owned domain but must not create competing stock, WIP, costing or GL authority.

### 4.5 Provider/live boundary

RC4 final truth explicitly leaves Cloudflare/provider/live state unverified. R5 may close source/runtime semantics, but provider mutation and certification remain R6/approved-environment work. Do not convert source presence into provider PASS.

## 5. Exact dependency graph — R5-01..R5-06

```text
                         ┌──────────────────────────────┐
                         │ R5-01 Package/Profile       │
                         │ shared metadata authority   │
                         └──────────────┬───────────────┘
                                        │ profile/manifest consumers
                                        v
                         ┌──────────────────────────────┐
                         │ R5-05 Integration/BI/       │
                         │ Workplace/Logistics         │
                         └──────────────────────────────┘

┌─────────────────────┐       bounded reconciliation       ┌─────────────────────┐
│ R5-02 Finance/HCM   │<──────────────────────────────────>│ R5-03 Commercial/   │
│ GL/Payment authority│   landed-cost / AR/AP / stock      │ Supply Chain        │
└──────────┬──────────┘                                    └──────────┬──────────┘
           │ finance/cost evidence                                    │ stock/procurement
           └──────────────────────┐        ┌───────────────────────────┘
                                  v        v
                         ┌──────────────────────────────┐
                         │ R5-04 Manufacturing/Service  │
                         └──────────────────────────────┘

R5-01 ─┐
R5-02 ─┤
R5-03 ─┼────────> R5-06 Package/Migration Rehearsal
R5-04 ─┤          only after stable final dispositions/candidate heads
R5-05 ─┘
```

### Execution semantics

- **R5-01..R5-05 run in parallel.** None should wait globally on another lane when its independent work can continue.
- R5-01 is the first authority for package/profile composition when another lane needs that contract.
- R5-02 and R5-03 interact only at precise reconciliation/valuation seams; they are not globally serialized.
- R5-04 consumes R5-02/R5-03 authorities for integrated cost/stock evidence, but can close independent manufacturing/service slices meanwhile.
- R5-05 consumes R5-01 profile/manifest authority when productizing dashboards/integrations/workplace/logistics; provider/live proof is not an R5 prerequisite.
- **R5-06 hard-waits on stable dispositions or candidate heads from all R5-01..R5-05.** It rehearses the composed candidate and does not patch domain failures around the owner.
- R5-07 must not start until one exact integrated R5 candidate SHA exists.

## 6. Dependency Requests

### DR-R5-00-01 — Applied migration inventory

**Owner:** R5-06 / environment owner  
Use read-only applied `d1_migrations` inventory plus A21 full-filename+SHA validation before any historical migration remediation or production-cutover claim.

**Block scope:** not blocking Wave 1 source work.

### DR-R5-00-02 — Vietnam statutory numeric source lock

**Owner:** R5-02  
Keep BHXH/BHYT/BHTN automation fail-closed unless clause-level official-source rates, bases, caps, categories and transition rules are source-locked for the exact effective period.

**Block scope:** only statutory automation claims requiring those rules.

### DR-R5-00-03 — Receipt-targeted landed cost

**Owner:** R5-03 + R5-02  
Close or explicitly defer receipt-targeted landed-cost valuation identity plus historical COGS/GL propagation without creating shadow Stock/GL authority.

**Block scope:** landed-cost integrated correctness only.

### DR-R5-00-04 — Provider/live certification

**Owner:** R6 provider/recovery  
Prove Cloudflare/provider resources, recovery, remote drift, AI Gateway, Browser Run and other provider-bound evidence only in approved environments.

**Block scope:** not blocking R5 source/runtime convergence.

### DR-R5-00-05 — Manufacturing rework operating model

**Owner:** R5-04 / product owner only if pilot requires it  
Resolve the rework operating model only if Alumdoor pilot scope needs it; otherwise record it outside the pilot boundary rather than inventing semantics.

**Block scope:** rework only.

### DR-R5-00-06 — Shared App Factory/Integration registry

**Owner:** R5-01; R5-05 is consumer  
Preserve the reconciled controller composition from #625. Any package/profile/registry overlap routes to R5-01.

**Block scope:** overlapping shared-registry edits only.

## 7. R5 merge/rehearsal order

R5-00 does not merge R5 implementation work. The safe order is:

1. open/run **R5-01..R5-05 in parallel** from exact current main;
2. let each lane produce an exact-head candidate and bounded Dependency Requests;
3. when an overlapping shared contract exists, integrate the owner first and refresh the consumer rather than blind-merging both branches;
4. once stable approved candidate heads exist for R5-01..R5-05, compose the R5 candidate in conflict-safe order;
5. run **R5-06** against that exact composed candidate;
6. only after one immutable candidate exists, open R5-07 independent QA;
7. final R5 convergence belongs to R5-08 after independent QA.

Any backend/schema/migration/business-rule merge remains explicitly gated by user authorization under the repository Skill.

## 8. Safety / actions performed by R5-00

Performed:

- moved `agent/r5-00-integration-control` forward to exact current `main@30346e08eabb7074f8623eeedae09efec25da072` before writing R5-00 artifacts;
- audited current RC4 branches/PRs and final integrated state;
- produced the machine-readable integration manifest;
- published authority hotspots, dependency graph, merge/rehearsal order and Dependency Requests.

Not performed:

- no RC4 branch replay;
- no domain/runtime/schema/migration change;
- no provider mutation;
- no production migration/deploy;
- no DNS/secret/customer-data mutation;
- no merge to `main`.

R5-00 is governance/docs-only and must stop at its PR gate.
