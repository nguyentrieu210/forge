# CURRENT STATUS

Ngày cập nhật: **2026-08-04**.

GitHub là nguồn sự thật cho exact `main`, branch, PR, workflow run, merge và production evidence. File này chỉ giữ **live verified state**, không giữ lịch sử dài.

## 1. Repository checkpoint

- Repository: `nguyentrieu210/forge`.
- Default branch: `main`.
- Product baseline: **Forge 0.2.0 — Enterprise Parallel Baseline**.
- Current verified engineering checkpoint: **RC4 integrated closure merged via PR #627**.
- Merge checkpoint: `main@30346e08eabb7074f8623eeedae09efec25da072`.
- Final integrated validation run recorded by the merge: `30878142334` — **SUCCESS**.
- Canonical RC4 evidence: `docs/agents/rc4/RC4_POST_INTEGRATION_FINAL.md`.

## 2. Capability truth

Canonical denominator remains exactly **956 capabilities**:

| Maturity | Count |
|---|---:|
| Hardened | 0 |
| RC | 66 |
| Wired | 406 |
| Foundation | 327 |
| Missing | 157 |
| **Total** | **956** |

The accepted RC4 promotion is `U01-001 Responsive PWA: Wired -> RC`. Integration alone does not justify additional promotion.

## 3. RC4 status

**RC4 is DONE at the integrated engineering/evidence boundary.**

Integrated and final-gated scope includes:

- A1-A18 domain/platform lanes;
- A21 migration governance;
- A22 independent cross-ledger reconciliation;
- A23 performance/scale/cost evidence;
- exact integrated regressions across IAM, migration, Finance/VN statutory, HCM/payroll, App Factory, Integration Hub, CRM, Procurement, Inventory/WMS, Manufacturing/QMS, Projects/Service, BI/AI, Workplace, Commerce and Alumdoor.

Do not reopen RC4 as another horizontal feature wave. Historical RC3/RC4 worker branches and pre-integration PRs are provenance, not active implementation authority.

## 4. Production/provider truth

RC4 closure does **not** claim current production certification.

Still unverified or separately gated where applicable:

- Cloudflare desired-vs-observed provider state for the exact future release candidate;
- production-like backup/restore/PITR/rollback drill for that candidate;
- read-only applied migration inventory before cutover claims;
- representative provider/browser/load evidence;
- authenticated exact-release Alumdoor Golden Flow for the pilot candidate.

Existing historical ALU production releases remain useful operational evidence, but they do not prove that a future R5/R6 candidate is deployed.

## 5. Current architecture authorities

- Document/business writes: canonical Document Kernel / Durable Object path.
- Tenant/query store: D1 under current repository migration governance.
- Money authority: canonical GL + Payment Ledger contracts; no shadow finance ledger.
- Stock authority: canonical Stock Ledger/valuation contracts; no vertical stock ledger fork.
- Permission: server-side tenant/role/DocPerm/owner/share/user-permission enforcement.
- App lifecycle: App Registry / App Factory install/upgrade contracts.
- Frontend: shared metadata-driven MetaForge runtime; verticals do not fork the shared runtime.
- Alumdoor: reference vertical consuming generic Finance/CRM/Procurement/Stock/Manufacturing/HR authorities.

## 6. Next program

The next program is:

`RC4 DONE -> R5 integrated hardening/productization -> R6 production certification -> Alumdoor controlled pilot -> GA`

Draft planning PRs currently exist:

- `#624` — R5/R6/Alumdoor pilot program.
- `#626` — agent launch order and copy-paste prompts.

Both were authored before final RC4 post-integration merge and therefore must re-audit/rebase against exact current `main` before being treated as canonical.

## 7. Known boundaries that matter next

- Do **not** implement all 157 Missing capabilities merely to raise the global score; only pilot-critical/shared-safety gaps block release.
- Package installation and capability activation must remain separate concepts; disabling a capability must not silently uninstall a package or erase history.
- Provider/live capability cannot be promoted from source/config evidence alone.
- Production migration, restore/PITR, secrets/DNS/provider mutation and non-UI deploy remain explicit authorization boundaries.
- Vietnam statutory rules without complete effective-dated official-source evidence remain fail-closed or explicitly bounded.

## 8. Documentation authority

Start at `docs/README.md` for the documentation map and retention rules. Old agent boards, prompts and handoffs are not live authority even when Git history preserves them.
