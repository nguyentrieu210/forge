# AI HANDOFF

Ngày cập nhật: **2026-08-04**.

Đây là handoff ngắn cho phiên tiếp theo. Không dùng file này thay exact GitHub state.

## Current checkpoint

- Repo: `nguyentrieu210/forge`.
- RC4 integrated closure đã merge qua PR `#627`.
- Verified merge checkpoint: `30346e08eabb7074f8623eeedae09efec25da072`.
- Final integrated run recorded by the merge: `30878142334` — SUCCESS.
- Capability truth: **H0 / RC66 / Wired406 / Foundation327 / Missing157 = 956**.
- Canonical evidence: `docs/agents/rc4/RC4_POST_INTEGRATION_FINAL.md`.

## What is next

Program sequence:

`R5 integrated hardening/productization -> R6 production certification -> Alumdoor controlled pilot -> GA`

Planning drafts exist in PR `#624` and launch prompts in PR `#626`; both were created before final RC4 integration and must re-audit/rebase exact current `main` before becoming canonical.

## Invariants to preserve

- Document/business writes go through canonical Document Kernel/aggregate path.
- GL/Payment Ledger and Stock Ledger remain single authoritative ledger families.
- Vertical apps consume shared domain authorities; do not copy HRM/CRM/Finance/Stock implementations into Alumdoor.
- Server-side permission/tenant boundary is authoritative.
- Money/legal rules use deterministic/effective-dated/source-bound semantics.
- Migration history is append-only; applied-state claims need environment evidence.
- Capability disable is not package uninstall and must not destroy historical data.
- Merge does not imply deployed; source/config does not imply provider/live proof.

## Production boundary

RC4 was engineering/evidence closure only. Do not claim current candidate production certification until R6 proves exact provider/recovery/migration/release/browser/load evidence.

Production migration, restore/PITR, DNS/secret/provider mutation, customer-data mutation and non-UI deploy require explicit authorization.

## Read order

1. exact GitHub `main` + relevant PR/branch;
2. `CURRENT_STATUS.md`;
3. `NEXT_TASKS.md`;
4. `PROJECT_CONTEXT.md`;
5. `docs/README.md`;
6. `skills/forge-enterprise-completion/SKILL.md`;
7. North Star/capability map and scope-specific contracts/evidence.
